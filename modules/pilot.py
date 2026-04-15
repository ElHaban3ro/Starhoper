"""Pilot input state.

Used to listen to the OS keyboard via pynput. Now the dashboard UI is the
only input source — it sends `pilot_input` WebSocket commands and this
module just stores the resulting state. All properties are used downstream
by the stabilization mixer the same way as before.
"""

from __future__ import annotations

from modules.config_runtime import current as cfg


def _clamp(v: float) -> float:
    if v < -1.0: return -1.0
    if v >  1.0: return  1.0
    return float(v)


class PilotInput:
    def __init__(self):
        self._throttle = 0.0  # [-1, 1]
        self._pitch = 0.0     # [-1, 1]  (+1 = W = forward)
        self._roll = 0.0      # [-1, 1]  (+1 = D = right)
        self._yaw = 0.0       # [-1, 1]  (+1 = E = right)

    def set_state(self, throttle: float = 0.0, pitch: float = 0.0,
                  roll: float = 0.0, yaw: float = 0.0):
        self._throttle = _clamp(throttle)
        self._pitch = _clamp(pitch)
        self._roll = _clamp(roll)
        self._yaw = _clamp(yaw)

    def reset(self):
        self._throttle = self._pitch = self._roll = self._yaw = 0.0

    # -------- downstream consumers (same API as before) --------

    @property
    def throttle(self) -> float:
        return self._throttle

    @property
    def pitch_setpoint(self) -> float:
        return self._pitch * cfg.PITCH_MAX_DEG * cfg.PILOT_PITCH_SIGN

    @property
    def roll_setpoint(self) -> float:
        return self._roll * cfg.ROLL_MAX_DEG * cfg.PILOT_ROLL_SIGN

    @property
    def yaw_input(self) -> float:
        return self._yaw

    def active_keys(self) -> list[str]:
        """Symbolic names of currently-active inputs (for UI highlighting)."""
        out = []
        if self._throttle > 0: out.append('up')
        if self._throttle < 0: out.append('down')
        if self._pitch > 0: out.append('w')
        if self._pitch < 0: out.append('s')
        if self._roll > 0: out.append('d')
        if self._roll < 0: out.append('a')
        if self._yaw > 0: out.append('e')
        if self._yaw < 0: out.append('q')
        return out
