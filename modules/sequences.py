"""Sequence persistence: JSON files in sequences/ directory.

A sequence is an ordered list of stages the Sequencer module executes in
turn. Schema mirrors profiles.py for consistency.

Sequence JSON shape:
    {
      "name": "demo",
      "stages": [
        {"type": "throttle", "duration_s": 60, "value": 1.0},
        {"type": "landing"}
      ]
    }
"""

from __future__ import annotations

import json
import re
from pathlib import Path


SEQUENCES_DIR = Path(__file__).resolve().parent.parent / "sequences"

_NAME_RE = re.compile(r"^[^/\\\x00]{1,64}$")

VALID_STAGE_TYPES = {"throttle", "attitude", "heading", "wait", "arm", "disarm", "landing"}

# Cardinal headings in degrees (Unity transform.eulerAngles.y convention,
# normalized [-180, 180]): North = 0, East = 90, South = 180/-180, West = -90.
HEADING_DIRECTIONS = {
    "N": 0.0,
    "E": 90.0,
    "S": 180.0,
    "W": -90.0,
}


def ensure_dir():
    SEQUENCES_DIR.mkdir(parents=True, exist_ok=True)


def is_valid_name(name: str) -> bool:
    return bool(_NAME_RE.fullmatch(name))


def _path(name: str) -> Path:
    return SEQUENCES_DIR / f"{name}.json"


def sanitize_stages(stages: list) -> list[dict]:
    """Normalize + validate a stages list, dropping unknown types/keys."""
    out: list[dict] = []
    for s in stages or []:
        if not isinstance(s, dict):
            continue
        t = s.get("type")
        if t not in VALID_STAGE_TYPES:
            continue
        stage: dict = {"type": t}
        if t in ("throttle", "attitude", "wait"):
            stage["duration_s"] = max(0.0, float(s.get("duration_s", 0.0)))
        if t == "throttle":
            stage["value"] = max(-1.0, min(1.0, float(s.get("value", 0.0))))
            # Throttle stages may optionally carry pitch/roll setpoints so a
            # single stage can fly forward/sideways while holding thrust.
            stage["pitch_deg"] = float(s.get("pitch_deg", 0.0))
            stage["roll_deg"] = float(s.get("roll_deg", 0.0))
            # Optional cardinal heading. "" or missing = no yaw override.
            d = str(s.get("direction", "")).upper()
            stage["direction"] = d if d in HEADING_DIRECTIONS else ""
        if t == "attitude":
            stage["pitch_deg"] = float(s.get("pitch_deg", 0.0))
            stage["roll_deg"] = float(s.get("roll_deg", 0.0))
        if t == "heading":
            stage["duration_s"] = max(0.0, float(s.get("duration_s", 0.0)))
            d = str(s.get("direction", "N")).upper()
            stage["direction"] = d if d in HEADING_DIRECTIONS else "N"
        if t == "landing":
            # Optional cardinal heading held during the entire landing.
            d = str(s.get("direction", "")).upper()
            stage["direction"] = d if d in HEADING_DIRECTIONS else ""
            # Controlled descent: bypass the free-fall DESCENT phase; hold
            # throttle negative with explicit pitch/roll until touchdown.
            stage["controlled"] = bool(s.get("controlled", False))
            stage["pitch_deg"] = float(s.get("pitch_deg", 0.0))
            stage["roll_deg"] = float(s.get("roll_deg", 0.0))
        out.append(stage)
    return out


def list_sequences() -> list[dict]:
    ensure_dir()
    out = []
    for p in sorted(SEQUENCES_DIR.glob("*.json")):
        try:
            data = json.loads(p.read_text())
            out.append({
                "name": data.get("name", p.stem),
                "stages": data.get("stages", []),
            })
        except Exception:
            continue
    return out


def load(name: str) -> dict:
    path = _path(name)
    if not path.exists():
        raise FileNotFoundError(f"sequence '{name}' not found")
    return json.loads(path.read_text())


def save(name: str, stages: list):
    if not is_valid_name(name):
        raise ValueError(f"invalid sequence name '{name}'")
    ensure_dir()
    payload = {"name": name, "stages": sanitize_stages(stages)}
    _path(name).write_text(json.dumps(payload, indent=2))


def delete(name: str):
    path = _path(name)
    if not path.exists():
        raise FileNotFoundError(name)
    path.unlink()
