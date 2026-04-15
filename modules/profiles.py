"""Profile persistence: JSON files in profiles/ directory.

- default.json is auto-generated at boot from config.py defaults.
- default.json is ALWAYS readonly; never overwritten or deleted.
- Other profiles are user-created and fully editable.

Profile JSON shape:
    {
      "name": "rocket",
      "readonly": false,
      "params": { "KP": [0.015, 0.015, 0.0], "KI": [...], ... }
    }
"""

from __future__ import annotations

import json
import re
from pathlib import Path

from modules.config_runtime import current as cfg
from modules.config_schema import SCHEMA


PROFILES_DIR = Path(__file__).resolve().parent.parent / "profiles"
DEFAULT_NAME = "default"
_SEEDED_FLAG = PROFILES_DIR / ".seeded"

_NAME_RE = re.compile(r"^[A-Za-z0-9_\-]{1,32}$")


def ensure_dir():
    PROFILES_DIR.mkdir(parents=True, exist_ok=True)


def is_valid_name(name: str) -> bool:
    return bool(_NAME_RE.fullmatch(name))


def _path(name: str) -> Path:
    return PROFILES_DIR / f"{name}.json"


def list_profiles() -> list[dict]:
    ensure_dir()
    out = []
    for p in sorted(PROFILES_DIR.glob("*.json")):
        try:
            data = json.loads(p.read_text())
            out.append({"name": data.get("name", p.stem),
                        "readonly": bool(data.get("readonly", False))})
        except Exception:
            continue
    return out


def load(name: str) -> dict:
    path = _path(name)
    if not path.exists():
        raise FileNotFoundError(f"profile '{name}' not found")
    return json.loads(path.read_text())


def save(name: str, params: dict, readonly: bool = False, _bypass_readonly: bool = False):
    if not is_valid_name(name):
        raise ValueError(f"invalid profile name '{name}'")
    if name == DEFAULT_NAME and not _bypass_readonly:
        raise PermissionError("cannot overwrite default profile")
    ensure_dir()
    payload = {"name": name, "readonly": readonly, "params": params}
    _path(name).write_text(json.dumps(payload, indent=2))


def delete(name: str):
    if name == DEFAULT_NAME:
        raise PermissionError("cannot delete default profile")
    path = _path(name)
    if not path.exists():
        raise FileNotFoundError(name)
    path.unlink()


def apply(name: str):
    """Load profile and push its params into the runtime config."""
    prof = load(name)
    cfg.apply(prof["params"])


def ensure_default_exists():
    """Rewrite default.json from config.py defaults every boot."""
    from modules import config as defaults
    params = {}
    for entry in SCHEMA:
        k = entry["key"]
        v = getattr(defaults, k)
        try:
            params[k] = v.tolist()
        except AttributeError:
            params[k] = v
    save(DEFAULT_NAME, params, readonly=True, _bypass_readonly=True)


def bootstrap_presets():
    """Seed built-in presets (quad/rocket/agile) on FIRST RUN only.
    After that the sentinel file prevents re-seeding, so profiles the user
    deleted stay deleted across restarts.

    The `default` profile is always rewritten from config.py so it tracks
    code changes — it is the canonical baseline, not a user profile.
    """
    ensure_default_exists()
    if _SEEDED_FLAG.exists():
        return
    presets = {
        "quad": {
            "KP": [0.008, 0.020, 0.0],
            "KI": [0.001, 0.002, 0.0],
            "KD": [0.004, 0.010, 0.0],
            "PITCH_MAX_DEG": 30.0,
            "ROLL_MAX_DEG": 30.0,
            "MAX_COMBINED_TILT_DEG": 25.0,
            "FAILSAFE_TILT_DEG": 60.0,
        },
        "rocket": {
            "KP": [0.015, 0.015, 0.0],
            "KI": [0.0005, 0.0005, 0.0],
            "KD": [0.020, 0.020, 0.0],
            "PITCH_MAX_DEG": 20.0,
            "ROLL_MAX_DEG": 20.0,
            "MAX_COMBINED_TILT_DEG": 20.0,
            "FAILSAFE_TILT_DEG": 45.0,
        },
        "agile": {
            "KP": [0.025, 0.030, 0.0],
            "KI": [0.002, 0.003, 0.0],
            "KD": [0.012, 0.015, 0.0],
            "PITCH_MAX_DEG": 45.0,
            "ROLL_MAX_DEG": 45.0,
            "MAX_COMBINED_TILT_DEG": 40.0,
            "THROTTLE_GAIN": 1.5,
        },
    }
    for name, params in presets.items():
        if not _path(name).exists():
            save(name, params, readonly=False)
    _SEEDED_FLAG.touch()
