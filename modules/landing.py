"""Auto-landing state machine.

States:
    IDLE       -> nothing
    DESCENT    -> motors at MOTOR_MIN, free fall, wait for sonar valid <= approach_alt
    APPROACH   -> level attitude, gentle negative throttle, descend slowly
    TOUCHDOWN  -> disarm motors

Sonar must be the real-meter altimeter reading (already offset+scaled).
"""

from __future__ import annotations
import time

from modules.config_runtime import current as cfg


class Landing:
    IDLE = "idle"
    DESCENT = "descent"
    APPROACH = "approach"
    TOUCHDOWN = "touchdown"

    def __init__(self):
        self.state = self.IDLE
        self._approach_started_t: float | None = None

    @property
    def active(self) -> bool:
        return self.state != self.IDLE

    def start(self):
        self.state = self.DESCENT
        self._approach_started_t = None

    def cancel(self):
        self.state = self.IDLE
        self._approach_started_t = None

    def update(self, sonars: dict, now: float | None = None) -> dict | None:
        """Returns override dict for the main loop, or None when idle.

        sonars: dict with keys 'down', 'front', 'back', 'left', 'right',
        each holding {distance, valid, status}. Landing uses the MINIMUM
        valid distance across all sensors so a sideways fall (where the
        downward beam is invalid but a lateral sensor sees ground/wall)
        still triggers approach + touchdown.

        Override keys (all optional):
            throttle:         override pilot throttle (float in [-1, 1])
            pitch_sp:         override pitch setpoint (deg)
            roll_sp:          override roll setpoint (deg)
            force_motors_min: replace motor outputs with MOTOR_MIN
            force_disarm:     disarm immediately
        """
        if self.state == self.IDLE:
            return None
        if now is None:
            now = time.monotonic()

        # Aggregate across all sensors.
        valid_dists = [
            float(s.get("distance", -1.0))
            for s in sonars.values()
            if s.get("valid")
        ]
        statuses = [str(s.get("status", "init")) for s in sonars.values()]
        any_dead_zone = any(st == "dead_zone" for st in statuses)
        valid = len(valid_dists) > 0
        dist = min(valid_dists) if valid else -1.0
        status = "ok" if valid else "no_signal"

        if self.state == self.DESCENT:
            if valid and dist <= cfg.LANDING_APPROACH_ALT_M:
                self.state = self.APPROACH
                self._approach_started_t = now
                return {
                    "throttle": cfg.LANDING_THROTTLE,
                    "pitch_sp": 0.0,
                    "roll_sp": 0.0,
                }
            return {
                "force_motors_min": True,
                "pitch_sp": 0.0,
                "roll_sp": 0.0,
            }

        if self.state == self.APPROACH:
            touched = (valid and dist <= cfg.LANDING_TOUCHDOWN_ALT_M) or any_dead_zone
            timed_out = (
                self._approach_started_t is not None
                and (now - self._approach_started_t) > cfg.LANDING_APPROACH_TIMEOUT_S
            )
            if touched or timed_out:
                self.state = self.TOUCHDOWN
                return {"force_disarm": True}
            return {
                "throttle": cfg.LANDING_THROTTLE,
                "pitch_sp": 0.0,
                "roll_sp": 0.0,
            }

        if self.state == self.TOUCHDOWN:
            self.state = self.IDLE
            return {"force_disarm": True}

        return None

    def snapshot(self) -> dict:
        return {
            "state": self.state,
            "active": self.active,
            "approach_alt_m": cfg.LANDING_APPROACH_ALT_M,
            "touchdown_alt_m": cfg.LANDING_TOUCHDOWN_ALT_M,
            "landing_throttle": cfg.LANDING_THROTTLE,
        }
