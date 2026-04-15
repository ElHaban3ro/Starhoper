"""Step-response test. Injects a setpoint step, records body-frame tilt
response, computes rise time / settling time / overshoot."""

from __future__ import annotations

import time


class StepTester:
    """State machine for one step test at a time."""

    def __init__(self):
        self.active = False
        self.axis = "pitch"        # "pitch" or "roll"
        self.amplitude_deg = 0.0
        self.duration_s = 0.0
        self.start_t = 0.0
        self.samples: list[tuple[float, float]] = []  # (t, current_axis_deg)

    def start(self, axis: str, amplitude_deg: float, duration_s: float):
        if axis not in ("pitch", "roll"):
            raise ValueError("axis must be 'pitch' or 'roll'")
        self.active = True
        self.axis = axis
        self.amplitude_deg = float(amplitude_deg)
        self.duration_s = max(0.5, float(duration_s))
        self.start_t = time.monotonic()
        self.samples = []

    def pitch_setpoint(self) -> float:
        if self.active and self.axis == "pitch":
            return self.amplitude_deg
        return 0.0

    def roll_setpoint(self) -> float:
        if self.active and self.axis == "roll":
            return self.amplitude_deg
        return 0.0

    def record(self, euler_deg: list[float]):
        if not self.active:
            return None
        t = time.monotonic()
        dt_elapsed = t - self.start_t
        current = euler_deg[0] if self.axis == "roll" else euler_deg[1]
        self.samples.append((dt_elapsed, current))
        if dt_elapsed >= self.duration_s:
            return self._finish()
        return None

    def _finish(self) -> dict:
        self.active = False
        amp = self.amplitude_deg
        if not self.samples or amp == 0:
            return {
                "axis": self.axis, "amplitude_deg": amp,
                "rise_ms": None, "settle_ms": None,
                "overshoot_pct": None, "samples": self.samples,
            }

        # Rise: first time current reaches 90% of target.
        target_90 = amp * 0.9
        rise_ms = None
        for t_i, v in self.samples:
            if (amp > 0 and v >= target_90) or (amp < 0 and v <= target_90):
                rise_ms = int(t_i * 1000)
                break

        # Overshoot: peak vs target.
        peak = max(self.samples, key=lambda s: abs(s[1]))[1]
        overshoot = 0.0
        if amp != 0:
            overshoot = max(0.0, (abs(peak) - abs(amp)) / abs(amp) * 100.0)

        # Settle: last time |current - target| > 5% of amp.
        tol = 0.05 * abs(amp)
        settle_ms = None
        for t_i, v in reversed(self.samples):
            if abs(v - amp) > tol:
                settle_ms = int(t_i * 1000)
                break

        return {
            "axis": self.axis, "amplitude_deg": amp,
            "rise_ms": rise_ms,
            "settle_ms": settle_ms,
            "overshoot_pct": round(overshoot, 2),
            "samples": self.samples,
        }
