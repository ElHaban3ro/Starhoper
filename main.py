import argparse
import asyncio
import json
import math
import os
import shutil
import signal
import subprocess
import time
from pathlib import Path

import websockets
from websockets.asyncio.server import serve

from maps import Coords, IMU
from modules import profiles, sequences
from modules.alarms import Alarms
from modules.config_runtime import current as cfg
from modules.config_schema import SCHEMA
from modules.dashboard_server import DashboardServer
from modules.landing import Landing
from modules.log_buffer import install_tee
from modules.pilot import PilotInput
from modules.recorder import Recorder
from modules.sequencer import Sequencer
from modules.stabilization import Stabilization
from modules.step_tester import StepTester
from modules.velocity_estimator import VelocityEstimator


class Controller:
    """Orchestrates Unity ws + dashboard ws/http + telemetry broadcast."""

    def __init__(self, unity_port: int = 3030,
                 dash_ws_port: int = 3031,
                 dash_http_port: int | None = 3032):
        self.unity_port = unity_port
        self.dash_ws_port = dash_ws_port
        self.dash_http_port = dash_http_port

        self.stabilization = Stabilization()
        self.pilot = PilotInput()
        self.recorder = Recorder()
        self.alarms = Alarms()
        self.step_tester = StepTester()
        self.landing = Landing()
        self.sequencer = Sequencer()
        self.velocity = VelocityEstimator()
        self._last_tick_t: float | None = None
        self._prev_armed = False

        self.dashboard = DashboardServer(command_handler=self._handle_command)

        self._last_telemetry: dict = {}
        self._unity_connected = False

    # ---------- Unity side ----------

    async def _unity_handler(self, websocket: websockets.ServerConnection):
        self._unity_connected = True
        self.stabilization.reset()
        print(f'Unity client connected from {websocket.remote_address}.')
        try:
            async for message in websocket:
                msg = json.loads(message)
                imu_data = IMU(
                    euler_angles=Coords(**msg['eulerAngles']),
                    acceleration=Coords(**msg['acceleration']),
                    angular_velocity=Coords(**msg['gyro']),
                    magnetic_field=Coords(**msg['magnet'])
                )
                tilt = float(msg.get('tilt', 0.0))
                sonars_raw = msg.get('sonars') or {}
                sonars = {}
                for k in ('down', 'front', 'back', 'left', 'right'):
                    s = sonars_raw.get(k) or {}
                    r = s.get('reading') or {}
                    sonars[k] = {
                        "distance": float(r.get('distance', -1.0)),
                        "valid": bool(r.get('valid', False)),
                        "status": str(r.get('status', 'init')),
                    }

                # Inertial velocity estimator: integrate world-frame accel
                # between ticks. Reset on arm→disarm transition (drone on
                # ground has v=0, clears accumulated drift).
                now_tick = time.monotonic()
                if self._last_tick_t is None:
                    dt_tick = 0.02
                else:
                    dt_tick = max(1e-4, now_tick - self._last_tick_t)
                self._last_tick_t = now_tick
                if not self.stabilization.armed:
                    self.velocity.reset()
                else:
                    self.velocity.update(imu_data.acceleration.vector, dt_tick)

                # Step tester may override setpoints.
                pitch_sp = self.pilot.pitch_setpoint
                roll_sp = self.pilot.roll_setpoint
                if self.step_tester.active:
                    pitch_sp = self.step_tester.pitch_setpoint()
                    roll_sp = self.step_tester.roll_setpoint()
                elif (cfg.BRAKE_ENABLED
                      and pitch_sp == 0.0 and roll_sp == 0.0
                      and self.stabilization.armed):
                    # Auto-brake: project estimated world velocity into body
                    # frame and command opposing tilt to decelerate.
                    yaw_deg = float(imu_data.euler_angles.vector[2])
                    v_forward, v_right = self.velocity.body_frame(yaw_deg)
                    if math.hypot(v_forward, v_right) > cfg.BRAKE_MIN_SPEED:
                        cap = cfg.BRAKE_TILT_MAX
                        pitch_sp = max(-cap, min(cap, -cfg.BRAKE_GAIN * v_forward))
                        roll_sp = max(-cap, min(cap, -cfg.BRAKE_GAIN * v_right))

                throttle = self.pilot.throttle
                yaw_input = self.pilot.yaw_input

                # Sequencer (runs before landing so it can trigger it).
                seq_cmd = self.sequencer.update(
                    landing_state=self.landing.state,
                    current_yaw_deg=float(imu_data.euler_angles.vector[2]),
                    sonars=sonars,
                )
                if seq_cmd:
                    if seq_cmd.get("trigger_arm"):
                        if not self.stabilization.armed:
                            self.stabilization.armed = True
                            self.stabilization.reset()
                            self.dashboard.broadcast(
                                {"type": "armed_state", "armed": True}
                            )
                    if seq_cmd.get("force_disarm") and self.stabilization.armed:
                        self.landing.cancel()
                        self.stabilization.armed = False
                        self.dashboard.broadcast(
                            {"type": "armed_state", "armed": False}
                        )
                    if seq_cmd.get("trigger_landing") and not self.landing.active:
                        self.stabilization.armed = True
                        self.stabilization.reset()
                        self.landing.start()
                        self.dashboard.broadcast(
                            {"type": "armed_state", "armed": True}
                        )
                        self.dashboard.broadcast(
                            {"type": "landing_state", **self.landing.snapshot()}
                        )
                    if "throttle" in seq_cmd:
                        throttle = seq_cmd["throttle"]
                    if "pitch_sp" in seq_cmd:
                        pitch_sp = seq_cmd["pitch_sp"]
                    if "roll_sp" in seq_cmd:
                        roll_sp = seq_cmd["roll_sp"]
                    if "yaw_input" in seq_cmd:
                        yaw_input = seq_cmd["yaw_input"]

                # Auto-landing override (backend state machine).
                land_cmd = self.landing.update(sonars)
                force_motors_min = False
                if land_cmd:
                    if land_cmd.get("force_disarm") and self.stabilization.armed:
                        self.stabilization.armed = False
                        self.dashboard.broadcast(
                            {"type": "armed_state", "armed": False}
                        )
                        self.dashboard.broadcast(
                            {"type": "landing_state", **self.landing.snapshot()}
                        )
                    throttle = land_cmd.get("throttle", throttle)
                    pitch_sp = land_cmd.get("pitch_sp", pitch_sp)
                    roll_sp = land_cmd.get("roll_sp", roll_sp)
                    force_motors_min = land_cmd.get("force_motors_min", False)

                force = self.stabilization.update_orientation(
                    imu_data, throttle, tilt,
                    pitch_sp, roll_sp, yaw_input,
                )
                if force_motors_min:
                    from modules.config_runtime import current as _cfg
                    force = {k: float(_cfg.MOTOR_MIN) for k in ('m1', 'm2', 'm3', 'm4')}
                await websocket.send(json.dumps(force))

                # Step tester captures response; may finish and emit result.
                step_result = self.step_tester.record(
                    self.stabilization.euler.tolist()
                )
                if step_result is not None:
                    self.dashboard.broadcast(
                        {"type": "step_result", **step_result}
                    )

                # Telemetry snapshot.
                snap = self._snapshot(imu_data, tilt, force, pitch_sp, roll_sp, sonars)
                self._last_telemetry = snap
                self.dashboard.broadcast(snap)

                # Recorder.
                self.recorder.write(snap)

                # Alarms.
                motor_sat = self.stabilization.motor_saturated()
                events = self.alarms.evaluate(
                    snap["t"], tilt, motor_sat,
                    self.stabilization.last_failsafe,
                )
                for ev in events:
                    self.dashboard.broadcast({"type": "alarm", **ev})
        finally:
            self._unity_connected = False
            print('Unity client disconnected.')

    async def _unity_server(self):
        async with serve(self._unity_handler, "0.0.0.0", self.unity_port):
            print(f'Unity WS started on ws://0.0.0.0:{self.unity_port}')
            await asyncio.Future()

    # ---------- telemetry snapshot ----------

    def _snapshot(self, imu_data: IMU, tilt: float, force: dict,
                  pitch_sp: float, roll_sp: float, sonars: dict) -> dict:
        st = self.stabilization
        return {
            "type": "telemetry",
            "t": time.monotonic(),
            "euler": list(imu_data.euler_angles.vector),
            "gyro": list(imu_data.angular_velocity.vector),
            "accel": list(imu_data.acceleration.vector),
            "tilt": tilt,
            "sonar": sonars['down'],
            "sonars": sonars,
            "motors": {
                **force,
                "sat": st.motor_saturated(),
            },
            "pilot": {
                "throttle": self.pilot.throttle,
                "pitch_sp": pitch_sp,
                "roll_sp": roll_sp,
                "yaw_in": self.pilot.yaw_input,
                "keys": self.pilot.active_keys(),
            },
            "pid_split": {
                "p": st.last_p.tolist(),
                "i": st.last_i.tolist(),
                "d": st.last_d.tolist(),
                "err": st.last_error.tolist(),
            },
            "failsafe": st.last_failsafe,
            "armed": st.armed,
            "landing": self.landing.snapshot(),
            "sequencer": self.sequencer.snapshot(),
            "connected_unity": True,
            "recording": self.recorder.active,
            "recording_file": self.recorder.filename,
        }

    # ---------- command routing ----------

    def _handle_command(self, msg: dict) -> dict | None:
        t = msg.get("type")
        if t == "hello":
            return {
                "type": "hello",
                "schema": SCHEMA,
                "config": cfg.to_dict(),
                "profiles": profiles.list_profiles(),
                "sequences": sequences.list_sequences(),
                "alarm_rules": self.alarms.rules_snapshot(),
                "active_alarms": self.alarms.snapshot(),
                "armed": self.stabilization.armed,
                "recording": self.recorder.active,
                "sequencer": self.sequencer.snapshot(),
            }
        if t == "set_param":
            key = msg["key"]
            value = msg["value"]
            cfg.apply({key: value})
            return {"type": "param_applied", "key": key,
                    "value": cfg.to_dict().get(key)}
        if t == "list_profiles":
            return {"type": "profile_list",
                    "profiles": profiles.list_profiles()}
        if t == "apply_profile":
            name = msg["name"]
            profiles.apply(name)
            return {"type": "profile_applied", "name": name,
                    "config": cfg.to_dict()}
        if t == "save_profile":
            name = msg["name"]
            data = msg.get("data") or cfg.to_dict()
            profiles.save(name, data, readonly=False)
            return {"type": "profile_list",
                    "profiles": profiles.list_profiles()}
        if t == "delete_profile":
            profiles.delete(msg["name"])
            return {"type": "profile_list",
                    "profiles": profiles.list_profiles()}
        if t == "emergency_stop" or t == "disarm":
            self.landing.cancel()
            self.stabilization.armed = False
            return {"type": "armed_state", "armed": False}
        if t == "arm":
            self.landing.cancel()
            self.stabilization.armed = True
            self.stabilization.reset()
            return {"type": "armed_state", "armed": True}
        if t == "reset_integral":
            self.stabilization.reset()
            return {"type": "integral_reset"}
        if t == "pilot_input":
            self.pilot.set_state(
                throttle=float(msg.get("throttle", 0.0)),
                pitch=float(msg.get("pitch", 0.0)),
                roll=float(msg.get("roll", 0.0)),
                yaw=float(msg.get("yaw", 0.0)),
            )
            return None  # too frequent to ack
        if t == "start_recording":
            self.recorder.start(msg.get("filename", "session"))
            return {"type": "recording_state",
                    "active": True, "filename": self.recorder.filename}
        if t == "stop_recording":
            path = self.recorder.stop()
            return {"type": "recording_state",
                    "active": False, "filename": path}
        if t == "run_step_test":
            self.step_tester.start(
                axis=msg.get("axis", "pitch"),
                amplitude_deg=float(msg.get("amplitude_deg", 15.0)),
                duration_s=float(msg.get("duration_s", 3.0)),
            )
            return {"type": "step_started",
                    "axis": self.step_tester.axis,
                    "amplitude_deg": self.step_tester.amplitude_deg,
                    "duration_s": self.step_tester.duration_s}
        if t == "set_alarm":
            self.alarms.set_rule(
                msg["rule"],
                enabled=msg.get("enabled"),
                threshold=msg.get("threshold"),
            )
            return {"type": "alarm_rules",
                    "rules": self.alarms.rules_snapshot()}
        if t == "start_landing":
            # Auto-arm so motors can fire during APPROACH. Otherwise a
            # disarmed/e-stopped drone would free-fall without braking.
            self.stabilization.armed = True
            self.stabilization.reset()
            self.landing.start()
            self.dashboard.broadcast({"type": "armed_state", "armed": True})
            return {"type": "landing_state", **self.landing.snapshot()}
        if t == "start_controlled_descent":
            # Toggle: if a controlled-descent is already running, cancel it
            # (pilot regains manual throttle). Same gamepad button drives
            # both start and stop. Other active sequences are left alone
            # to avoid clobbering a user-run multi-stage flight.
            if self.sequencer.active:
                idx = self.sequencer.current_idx
                stages = self.sequencer.stages
                stage = stages[idx] if 0 <= idx < len(stages) else None
                if (stage and stage.get("type") == "landing"
                        and stage.get("controlled")):
                    self.sequencer.cancel()
                    return {"type": "sequencer_state",
                            **self.sequencer.snapshot()}
                return {"type": "sequencer_state",
                        **self.sequencer.snapshot()}
            # Gentle-descent: throttle held at LANDING_THROTTLE, motors
            # auto-disarm when any sonar reports touchdown. Same path as
            # the sequencer's "landing controlled" stage type.
            self.sequencer.load([
                {"type": "landing", "controlled": True,
                 "pitch_deg": 0.0, "roll_deg": 0.0},
            ])
            self.sequencer.loop = False
            if not self.stabilization.armed:
                self.stabilization.armed = True
                self.stabilization.reset()
                self.dashboard.broadcast(
                    {"type": "armed_state", "armed": True}
                )
            self.sequencer.start()
            return {"type": "sequencer_state", **self.sequencer.snapshot()}
        if t == "cancel_landing":
            self.landing.cancel()
            return {"type": "landing_state", **self.landing.snapshot()}
        if t == "list_sequences":
            return {"type": "sequence_list",
                    "sequences": sequences.list_sequences()}
        if t == "save_sequence":
            name = msg["name"]
            raw_stages = msg.get("stages", [])
            clean = sequences.sanitize_stages(raw_stages)
            sequences.save(name, clean)
            # Keep in-memory sequencer in sync so subsequent hello/refresh
            # returns the same stages the user just persisted.
            self.sequencer.load(clean)
            return {"type": "sequence_saved",
                    "name": name,
                    "stages": clean,
                    "sequences": sequences.list_sequences()}
        if t == "load_sequence":
            data = sequences.load(msg["name"])
            self.sequencer.load(data.get("stages", []))
            return {"type": "sequence_loaded",
                    "name": data.get("name"),
                    "stages": data.get("stages", [])}
        if t == "set_sequence":
            # Set current in-memory stages without saving to disk.
            # Ack-only: don't echo snapshot (would steal input focus on
            # every keystroke in the dashboard sequencer editor).
            self.sequencer.load(
                sequences.sanitize_stages(msg.get("stages", []))
            )
            return None
        if t == "delete_sequence":
            sequences.delete(msg["name"])
            return {"type": "sequence_list",
                    "sequences": sequences.list_sequences()}
        if t == "run_sequence":
            # Optionally accept a fresh stage list in the same message.
            if "stages" in msg:
                self.sequencer.load(sequences.sanitize_stages(msg["stages"]))
            # Loop toggle.
            self.sequencer.loop = bool(msg.get("loop", False))
            # Auto-arm so throttle/attitude stages actually reach the motors.
            if not self.stabilization.armed:
                self.stabilization.armed = True
                self.stabilization.reset()
                self.dashboard.broadcast(
                    {"type": "armed_state", "armed": True}
                )
            self.sequencer.start()
            return {"type": "sequencer_state", **self.sequencer.snapshot()}
        if t == "stop_sequence":
            self.sequencer.cancel()
            # Stop is a safety action — disarm so motors go dead immediately.
            if self.stabilization.armed:
                self.landing.cancel()
                self.stabilization.armed = False
                self.dashboard.broadcast(
                    {"type": "armed_state", "armed": False}
                )
            return {"type": "sequencer_state", **self.sequencer.snapshot()}
        if t == "get_log":
            from modules.log_buffer import log_buffer
            return {"type": "log_snapshot", "lines": log_buffer.snapshot()}
        return {"type": "error", "message": f"unknown command: {t}"}

    # ---------- entrypoint ----------

    async def run(self):
        profiles.ensure_dir()
        profiles.bootstrap_presets()
        sequences.ensure_dir()
        # Pilot input now comes exclusively from the dashboard UI over WS.
        await asyncio.gather(
            self._unity_server(),
            self.dashboard.run(self.dash_ws_port, self.dash_http_port),
        )


def _spawn_vite_dev() -> subprocess.Popen | None:
    """Spawn `npm run dev` inside dashboard/ and return the process.

    Stdout/stderr are inherited so Vite logs interleave with main.py output.
    Returns None if npm is unavailable or dashboard dir is missing.
    """
    dash_dir = Path(__file__).resolve().parent / "dashboard"
    if not (dash_dir / "package.json").is_file():
        print(f"[dev] {dash_dir}/package.json not found — cannot start Vite.")
        return None
    npm = shutil.which("npm")
    if npm is None:
        print("[dev] npm not found on PATH — cannot start Vite.")
        return None
    # Auto-install if node_modules is missing.
    if not (dash_dir / "node_modules").is_dir():
        print("[dev] installing dashboard deps (first run)…")
        subprocess.run([npm, "install"], cwd=dash_dir, check=True)
    print("[dev] starting Vite dev server (npm run dev)…")
    # New session so we can kill the whole process group on shutdown.
    popen_kwargs = {"cwd": str(dash_dir)}
    if os.name == "posix":
        popen_kwargs["start_new_session"] = True
    return subprocess.Popen([npm, "run", "dev"], **popen_kwargs)


def _kill_vite(proc: subprocess.Popen) -> None:
    if proc.poll() is not None:
        return
    try:
        if os.name == "posix":
            os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
        else:
            proc.terminate()
        proc.wait(timeout=5)
    except Exception:
        try:
            proc.kill()
        except Exception:
            pass


def main():
    parser = argparse.ArgumentParser(description="StarHoper controller")
    parser.add_argument(
        "--dev",
        action="store_true",
        help="Also spawn the dashboard Vite dev server (http://localhost:5173).",
    )
    args = parser.parse_args()

    install_tee()

    vite_proc: subprocess.Popen | None = None
    dash_http_port: int | None = 3032
    if args.dev:
        vite_proc = _spawn_vite_dev()
        if vite_proc:
            dash_http_port = None  # free :3032 for Vite
            print("[dev] dashboard → http://localhost:3032  (WS on :3031)")

    controller = Controller(dash_http_port=dash_http_port)
    try:
        asyncio.run(controller.run())
    except KeyboardInterrupt:
        print('shutting down.')
    finally:
        if vite_proc is not None:
            _kill_vite(vite_proc)


if __name__ == "__main__":
    main()
