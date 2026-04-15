"""Simple threshold alarms on telemetry."""

from __future__ import annotations


DEFAULT_RULES = {
    # rule_id -> {"enabled": bool, "threshold": float, "label": str}
    "tilt_high": {
        "enabled": True, "threshold": 45.0,
        "label": "Tilt > threshold (deg)",
    },
    "motor_saturated": {
        "enabled": True, "threshold": 0.5,
        "label": "Motor saturated > threshold seconds continuous",
    },
    "failsafe": {
        "enabled": True, "threshold": 0.0,
        "label": "Failsafe active",
    },
}


class Alarms:
    def __init__(self):
        self.rules = {k: dict(v) for k, v in DEFAULT_RULES.items()}
        self._sat_start = None
        self.active: dict[str, dict] = {}

    def set_rule(self, rule_id: str, enabled: bool | None = None,
                 threshold: float | None = None):
        if rule_id not in self.rules:
            return
        if enabled is not None:
            self.rules[rule_id]["enabled"] = bool(enabled)
        if threshold is not None:
            self.rules[rule_id]["threshold"] = float(threshold)

    def evaluate(self, t: float, tilt: float, motor_sat: list[bool],
                 failsafe: bool) -> list[dict]:
        """Returns list of state-change events to broadcast."""
        events = []

        # tilt_high
        r = self.rules["tilt_high"]
        fires = r["enabled"] and tilt > r["threshold"]
        events += self._update("tilt_high", fires, tilt, r)

        # motor_saturated (continuous duration)
        any_sat = any(motor_sat)
        if any_sat:
            if self._sat_start is None:
                self._sat_start = t
            duration = t - self._sat_start
        else:
            self._sat_start = None
            duration = 0.0
        r = self.rules["motor_saturated"]
        fires = r["enabled"] and duration > r["threshold"]
        events += self._update("motor_saturated", fires, duration, r)

        # failsafe
        r = self.rules["failsafe"]
        fires = r["enabled"] and failsafe
        events += self._update("failsafe", fires, float(failsafe), r)

        return events

    def _update(self, rule_id: str, fires: bool, value: float, r: dict):
        was_active = rule_id in self.active
        if fires and not was_active:
            self.active[rule_id] = {
                "rule": rule_id,
                "label": r["label"],
                "threshold": r["threshold"],
                "value": value,
                "active": True,
            }
            return [self.active[rule_id]]
        if not fires and was_active:
            payload = {
                "rule": rule_id,
                "label": r["label"],
                "threshold": r["threshold"],
                "value": value,
                "active": False,
            }
            del self.active[rule_id]
            return [payload]
        return []

    def snapshot(self) -> list[dict]:
        return list(self.active.values())

    def rules_snapshot(self) -> dict:
        return self.rules
