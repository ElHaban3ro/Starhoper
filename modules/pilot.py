from pynput import keyboard


class PilotInput:
    """Global keyboard listener acting as an RC transmitter.

    Keys (held down = active):
      +  -> throttle up   (full boost while held)
      -  -> throttle down (descend while held)

    Throttle range: [-1.0, 1.0]. Neutral (0.0) = hover (no extra thrust).

    macOS note: requires Accessibility permission for the terminal/IDE
    running Python. Grant via System Settings -> Privacy & Security ->
    Accessibility.
    """

    def __init__(self):
        self._up = False
        self._down = False
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
        return (1.0 if self._up else 0.0) - (1.0 if self._down else 0.0)

    def _char(self, key) -> str | None:
        try:
            return key.char
        except AttributeError:
            return None

    def _on_press(self, key):
        c = self._char(key)
        if c == '+':
            self._up = True
        elif c == '-':
            self._down = True

    def _on_release(self, key):
        c = self._char(key)
        if c == '+':
            self._up = False
        elif c == '-':
            self._down = False
