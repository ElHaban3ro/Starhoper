"""Ring buffer for console output. stdout/stderr mirror here so the
dashboard log viewer can replay the last N lines."""

from __future__ import annotations

import sys
from collections import deque
from typing import Callable


class LogBuffer:
    def __init__(self, capacity: int = 200):
        self.buf: deque[str] = deque(maxlen=capacity)
        self._subscribers: list[Callable[[str], None]] = []

    def append(self, line: str):
        line = line.rstrip("\n")
        if not line:
            return
        self.buf.append(line)
        for cb in list(self._subscribers):
            try:
                cb(line)
            except Exception:
                pass

    def subscribe(self, cb: Callable[[str], None]):
        self._subscribers.append(cb)

    def snapshot(self) -> list[str]:
        return list(self.buf)


log_buffer = LogBuffer()


class _TeeStream:
    def __init__(self, inner, buf: LogBuffer):
        self._inner = inner
        self._buf = buf
        self._pending = ""

    def write(self, s: str):
        self._inner.write(s)
        self._pending += s
        while "\n" in self._pending:
            line, self._pending = self._pending.split("\n", 1)
            self._buf.append(line)

    def flush(self):
        self._inner.flush()

    def __getattr__(self, name):
        return getattr(self._inner, name)


def install_tee():
    """Mirror stdout/stderr into log_buffer without losing terminal output."""
    if not isinstance(sys.stdout, _TeeStream):
        sys.stdout = _TeeStream(sys.stdout, log_buffer)
    if not isinstance(sys.stderr, _TeeStream):
        sys.stderr = _TeeStream(sys.stderr, log_buffer)
