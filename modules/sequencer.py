"""Stage sequencer — chains timed overrides in order.

Stages supported:
    throttle  {duration_s, value}           hold throttle for N seconds
    attitude  {duration_s, pitch_deg, roll_deg}   hold tilt setpoint
    wait      {duration_s}                  no-op for N seconds (previous
                                            stage's values persist since the
                                            sequencer just stops emitting)
    arm                                     instantaneous: arm drone
    disarm                                  instantaneous: disarm drone
    landing                                 trigger start_landing, BLOCK
                                            until landing.state == 'idle'

Same override contract as Landing: `update()` returns a dict with any of
{throttle, pitch_sp, roll_sp, force_disarm, trigger_arm, trigger_landing}.
The main loop applies these BEFORE Landing, so Sequencer can arm/disarm
and delegate the landing sequence to the Landing module.
"""

from __future__ import annotations

import time

from modules.config_runtime import current as cfg
from modules.sequences import HEADING_DIRECTIONS


def _wrap_180(angle: float) -> float:
    return (angle + 180.0) % 360.0 - 180.0


def _min_valid_sonar(sonars: dict) -> tuple[float, bool, bool]:
    """Return (min_distance, any_valid, any_dead_zone) across all sensors."""
    valid_dists = []
    any_dead_zone = False
    for s in (sonars or {}).values():
        if s.get("valid"):
            valid_dists.append(float(s.get("distance", -1.0)))
        if str(s.get("status", "")) == "dead_zone":
            any_dead_zone = True
    if not valid_dists:
        return (float("inf"), False, any_dead_zone)
    return (min(valid_dists), True, any_dead_zone)


class Sequencer:
    IDLE = "idle"
    RUNNING = "running"
    WAITING_LANDING = "waiting_landing"

    def __init__(self):
        self.stages: list[dict] = []
        self.state = self.IDLE
        self.current_idx = -1
        self._stage_started_t: float | None = None
        self._last_throttle: float | None = None
        self._last_pitch: float | None = None
        self._last_roll: float | None = None
        self.loop: bool = False

    @property
    def active(self) -> bool:
        return self.state != self.IDLE

    def load(self, stages: list[dict]):
        """Replace the active stage list. Safe while idle or running."""
        self.stages = list(stages)

    def start(self):
        if not self.stages:
            return
        self.state = self.RUNNING
        self.current_idx = 0
        self._stage_started_t = None
        self._last_throttle = None
        self._last_pitch = None
        self._last_roll = None

    def cancel(self):
        self.state = self.IDLE
        self.current_idx = -1
        self._stage_started_t = None
        self._last_throttle = None
        self._last_pitch = None
        self._last_roll = None

    def update(self, now: float | None = None,
               landing_state: str = "idle",
               current_yaw_deg: float = 0.0,
               sonars: dict | None = None) -> dict | None:
        """Tick the sequencer. Returns override dict or None."""
        if self.state == self.IDLE:
            return None
        if now is None:
            now = time.monotonic()

        if self.current_idx < 0 or self.current_idx >= len(self.stages):
            self.cancel()
            return None

        stage = self.stages[self.current_idx]
        stype = stage.get("type")

        # Initialize the stage clock on first tick in this stage.
        if self._stage_started_t is None:
            self._stage_started_t = now

            # Instantaneous / trigger stages fire once then advance.
            if stype == "arm":
                self._advance()
                return {"trigger_arm": True}
            if stype == "disarm":
                return self._advance_with({"force_disarm": True})
            if stype == "landing":
                # Controlled descent stays in RUNNING (sequencer manages it
                # directly). Regular landing hands off to the Landing module.
                if stage.get("controlled"):
                    self.state = self.RUNNING  # managed by sequencer ticks
                    return self._controlled_landing_out(stage, current_yaw_deg)
                self.state = self.WAITING_LANDING
                out = {"trigger_landing": True}
                direction = str(stage.get("direction", ""))
                if direction in HEADING_DIRECTIONS:
                    error = _wrap_180(HEADING_DIRECTIONS[direction] - current_yaw_deg)
                    out["yaw_input"] = max(-1.0, min(1.0, error / 30.0))
                return out

        elapsed = now - self._stage_started_t

        if self.state == self.WAITING_LANDING:
            # Landing module handles throttle/attitude itself — sequencer
            # just waits. Advance once landing returns to idle.
            if landing_state == "idle":
                self._advance()
                return None
            # Keep yawing toward the requested heading while landing runs.
            direction = str(stage.get("direction", ""))
            if direction in HEADING_DIRECTIONS:
                error = _wrap_180(HEADING_DIRECTIONS[direction] - current_yaw_deg)
                return {"yaw_input": max(-1.0, min(1.0, error / 30.0))}
            return None

        if stype == "throttle":
            duration = float(stage.get("duration_s", 0.0))
            value = float(stage.get("value", 0.0))
            pitch = float(stage.get("pitch_deg", 0.0))
            roll = float(stage.get("roll_deg", 0.0))
            self._last_throttle = value
            self._last_pitch = pitch
            self._last_roll = roll
            out = {"throttle": value, "pitch_sp": pitch, "roll_sp": roll}
            # Optional cardinal heading — same P controller as heading stage.
            direction = str(stage.get("direction", ""))
            if direction in HEADING_DIRECTIONS:
                error = _wrap_180(HEADING_DIRECTIONS[direction] - current_yaw_deg)
                out["yaw_input"] = max(-1.0, min(1.0, error / 30.0))
            if elapsed >= duration:
                self._advance()
            return out

        if stype == "attitude":
            duration = float(stage.get("duration_s", 0.0))
            p = float(stage.get("pitch_deg", 0.0))
            r = float(stage.get("roll_deg", 0.0))
            self._last_pitch = p
            self._last_roll = r
            if elapsed >= duration:
                self._advance()
            return {"pitch_sp": p, "roll_sp": r}

        if stype == "landing" and stage.get("controlled"):
            # Sequencer-managed descent: negative throttle + explicit
            # pitch/roll (+ optional yaw) until any sonar reports touchdown.
            min_d, any_valid, any_dead = _min_valid_sonar(sonars)
            touched = (any_valid and min_d <= cfg.LANDING_TOUCHDOWN_ALT_M) or any_dead
            if touched:
                self._advance()
                return {"force_disarm": True}
            return self._controlled_landing_out(stage, current_yaw_deg)

        if stype == "heading":
            duration = float(stage.get("duration_s", 0.0))
            direction = str(stage.get("direction", "N"))
            target = HEADING_DIRECTIONS.get(direction, 0.0)
            error = _wrap_180(target - current_yaw_deg)
            # Simple P controller: saturate yaw_input at ±1 until within
            # ~30° of target, then taper linearly.
            yaw_cmd = max(-1.0, min(1.0, error / 30.0))
            if elapsed >= duration:
                self._advance()
            return {"yaw_input": yaw_cmd}

        if stype == "wait":
            duration = float(stage.get("duration_s", 0.0))
            if elapsed >= duration:
                self._advance()
            return None

        # Unknown stage — skip.
        self._advance()
        return None

    def _controlled_landing_out(self, stage: dict,
                                 current_yaw_deg: float) -> dict:
        pitch = float(stage.get("pitch_deg", 0.0))
        roll = float(stage.get("roll_deg", 0.0))
        out = {
            "throttle": float(cfg.LANDING_THROTTLE),
            "pitch_sp": pitch,
            "roll_sp": roll,
            "trigger_arm": True,  # ensure motors firing during descent
        }
        direction = str(stage.get("direction", ""))
        if direction in HEADING_DIRECTIONS:
            error = _wrap_180(HEADING_DIRECTIONS[direction] - current_yaw_deg)
            out["yaw_input"] = max(-1.0, min(1.0, error / 30.0))
        return out

    def _advance(self):
        self.current_idx += 1
        self._stage_started_t = None
        if self.current_idx >= len(self.stages):
            if self.loop and self.stages:
                # Wrap back to first stage. State stays RUNNING.
                self.current_idx = 0
                self.state = self.RUNNING
            else:
                self.cancel()
        else:
            # Back to normal running (out of waiting_landing if we were).
            self.state = self.RUNNING

    def _advance_with(self, override: dict) -> dict:
        """Emit override once, then advance at the same tick."""
        self._advance()
        return override

    def snapshot(self) -> dict:
        stage = None
        if 0 <= self.current_idx < len(self.stages):
            stage = self.stages[self.current_idx]
        elapsed = 0.0
        if self._stage_started_t is not None:
            elapsed = max(0.0, time.monotonic() - self._stage_started_t)
        return {
            "state": self.state,
            "active": self.active,
            "current_idx": self.current_idx,
            "total_stages": len(self.stages),
            "current_type": stage.get("type") if stage else None,
            "current_duration_s": float(stage.get("duration_s", 0.0)) if stage else 0.0,
            "elapsed_s": elapsed,
            "stages": self.stages,
            "loop": self.loop,
        }
