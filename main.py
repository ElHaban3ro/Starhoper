import asyncio
import json
import time

import websockets
from websockets.asyncio.server import serve

from maps import Coords, IMU
from modules import profiles
from modules.alarms import Alarms
from modules.config_runtime import current as cfg
from modules.config_schema import SCHEMA
from modules.dashboard_server import DashboardServer
from modules.log_buffer import install_tee
from modules.pilot import PilotInput
from modules.recorder import Recorder
from modules.stabilization import Stabilization
from modules.step_tester import StepTester


class Controller:
    """Orchestrates Unity ws + dashboard ws/http + telemetry broadcast."""

    def __init__(self, unity_port: int = 3030,
                 dash_ws_port: int = 3031, dash_http_port: int = 3032):
        self.unity_port = unity_port
        self.dash_ws_port = dash_ws_port
        self.dash_http_port = dash_http_port

        self.stabilization = Stabilization()
        self.pilot = PilotInput()
        self.recorder = Recorder()
        self.alarms = Alarms()
        self.step_tester = StepTester()

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

                # Step tester may override setpoints.
                pitch_sp = self.pilot.pitch_setpoint
                roll_sp = self.pilot.roll_setpoint
                if self.step_tester.active:
                    pitch_sp = self.step_tester.pitch_setpoint()
                    roll_sp = self.step_tester.roll_setpoint()

                force = self.stabilization.update_orientation(
                    imu_data, self.pilot.throttle, tilt,
                    pitch_sp, roll_sp, self.pilot.yaw_input,
                )
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
                snap = self._snapshot(imu_data, tilt, force, pitch_sp, roll_sp)
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
                  pitch_sp: float, roll_sp: float) -> dict:
        st = self.stabilization
        return {
            "type": "telemetry",
            "t": time.monotonic(),
            "euler": list(imu_data.euler_angles.vector),
            "gyro": list(imu_data.angular_velocity.vector),
            "accel": list(imu_data.acceleration.vector),
            "tilt": tilt,
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
                "alarm_rules": self.alarms.rules_snapshot(),
                "active_alarms": self.alarms.snapshot(),
                "armed": self.stabilization.armed,
                "recording": self.recorder.active,
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
        if t == "emergency_stop":
            self.stabilization.armed = False
            return {"type": "armed_state", "armed": False}
        if t == "arm":
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
        if t == "get_log":
            from modules.log_buffer import log_buffer
            return {"type": "log_snapshot", "lines": log_buffer.snapshot()}
        return {"type": "error", "message": f"unknown command: {t}"}

    # ---------- entrypoint ----------

    async def run(self):
        profiles.ensure_dir()
        profiles.bootstrap_presets()
        # Pilot input now comes exclusively from the dashboard UI over WS.
        await asyncio.gather(
            self._unity_server(),
            self.dashboard.run(self.dash_ws_port, self.dash_http_port),
        )


def main():
    install_tee()
    controller = Controller()
    try:
        asyncio.run(controller.run())
    except KeyboardInterrupt:
        print('shutting down.')


if __name__ == "__main__":
    main()
