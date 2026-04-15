"""Telemetry recorder: streams telemetry dicts to CSV while active."""

from __future__ import annotations

import csv
import time
from pathlib import Path


RECORDINGS_DIR = Path(__file__).resolve().parent.parent / "recordings"


class Recorder:
    def __init__(self):
        self._f = None
        self._writer = None
        self._fields = None
        self.filename = None
        self.started_at = None

    @property
    def active(self) -> bool:
        return self._f is not None

    def start(self, name: str = ""):
        if self.active:
            return
        RECORDINGS_DIR.mkdir(parents=True, exist_ok=True)
        stamp = time.strftime("%Y%m%d-%H%M%S")
        safe_name = "".join(c for c in name if c.isalnum() or c in "-_") or "session"
        filename = RECORDINGS_DIR / f"{stamp}-{safe_name}.csv"
        self._f = filename.open("w", newline="")
        self._writer = None
        self._fields = None
        self.filename = str(filename)
        self.started_at = time.monotonic()

    def stop(self) -> str | None:
        if not self.active:
            return None
        self._f.close()
        path = self.filename
        self._f = None
        self._writer = None
        self._fields = None
        self.filename = None
        self.started_at = None
        return path

    def write(self, telemetry: dict):
        if not self.active:
            return
        row = _flatten(telemetry)
        if self._writer is None:
            self._fields = list(row.keys())
            self._writer = csv.DictWriter(self._f, fieldnames=self._fields)
            self._writer.writeheader()
        # Fill missing keys with empty (in case schema changes mid-session).
        for k in self._fields:
            row.setdefault(k, "")
        # Skip unexpected keys.
        row = {k: row[k] for k in self._fields}
        self._writer.writerow(row)


def _flatten(d: dict, prefix: str = "") -> dict:
    out = {}
    for k, v in d.items():
        key = f"{prefix}{k}"
        if isinstance(v, dict):
            out.update(_flatten(v, prefix=f"{key}."))
        elif isinstance(v, (list, tuple)):
            for i, item in enumerate(v):
                out[f"{key}[{i}]"] = item
        elif isinstance(v, bool):
            out[key] = int(v)
        else:
            out[key] = v
    return out
