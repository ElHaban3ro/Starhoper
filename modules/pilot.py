from pynput import keyboard
from modules import config as cfg


class PilotInput:
    """Global keyboard listener acting as an RC transmitter.

    Keys (held down = active):
      Up      -> throttle up   (climb)
      Down    -> throttle down (descend)
      W       -> pitch nose down (fly forward)
      S       -> pitch nose up   (fly backward)
      D       -> roll right     (fly right)
      A       -> roll left      (fly left)
      E       -> yaw right      (rotate clockwise from above)
      Q       -> yaw left       (rotate counter-clockwise from above)

    Outputs:
      throttle       in [-1, 1]  (0 = hover)
      pitch_setpoint in degrees  (target tilt the controller should aim for)
      roll_setpoint  in degrees  (target tilt the controller should aim for)
      yaw_input      in [-1, 1]  (sign of yaw torque to apply; 0 = no rotation)

    macOS note: requires Accessibility permission for the terminal/IDE
    running Python. Grant via System Settings -> Privacy & Security ->
    Accessibility.
    """

    def __init__(self):
        self._throttle_up = False
        self._throttle_down = False
        self._fwd = False
        self._back = False
        self._right = False
        self._left = False
        self._yaw_right = False
        self._yaw_left = False
        self._listener = keyboard.Listener(
            on_press=self._on_press,
            on_release=self._on_release,
            suppress=False,
        )

    def start(self):
        self._listener.start()

    def stop(self):
        self._listener.stop()

    @property
    def throttle(self) -> float:
        return (1.0 if self._throttle_up else 0.0) - (1.0 if self._throttle_down else 0.0)

    @property
    def pitch_setpoint(self) -> float:
        raw = (cfg.PITCH_MAX_DEG if self._fwd else 0.0) \
            - (cfg.PITCH_MAX_DEG if self._back else 0.0)
        return raw * cfg.PILOT_PITCH_SIGN

    @property
    def roll_setpoint(self) -> float:
        raw = (cfg.ROLL_MAX_DEG if self._right else 0.0) \
            - (cfg.ROLL_MAX_DEG if self._left else 0.0)
        return raw * cfg.PILOT_ROLL_SIGN

    @property
    def yaw_input(self) -> float:
        return (1.0 if self._yaw_right else 0.0) - (1.0 if self._yaw_left else 0.0)

    def _char(self, key) -> str | None:
        try:
            return key.char
        except AttributeError:
            return None

    def _on_press(self, key):
        c = self._char(key)
        if c is not None:
            c = c.lower()
        if key == keyboard.Key.up:
            self._throttle_up = True
        elif key == keyboard.Key.down:
            self._throttle_down = True
        elif c == 'w':
            self._fwd = True
        elif c == 's':
            self._back = True
        elif c == 'd':
            self._right = True
        elif c == 'a':
            self._left = True
        elif c == 'e':
            self._yaw_right = True
        elif c == 'q':
            self._yaw_left = True

    def _on_release(self, key):
        c = self._char(key)
        if c is not None:
            c = c.lower()
        if key == keyboard.Key.up:
            self._throttle_up = False
        elif key == keyboard.Key.down:
            self._throttle_down = False
        elif c == 'w':
            self._fwd = False
        elif c == 's':
            self._back = False
        elif c == 'd':
            self._right = False
        elif c == 'a':
            self._left = False
        elif c == 'e':
            self._yaw_right = False
        elif c == 'q':
            self._yaw_left = False
