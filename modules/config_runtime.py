"""Mutable runtime config singleton.

Loads defaults from config.py at boot. Other modules import `current` and
read params via attribute access (same as before). Dashboard can mutate
via `current.apply(dict)` — changes take effect on the next PID tick.
"""

from __future__ import annotations

import numpy as np

from modules import config as defaults
from modules.config_schema import SCHEMA, schema_dict


_VEC_KEYS = {e["key"] for e in SCHEMA if e["type"] == "vec3"}
_DERIVED_KEYS = {e["key"] for e in SCHEMA if e.get("derived")}


class _Runtime:
    """Holds the live values of every tunable parameter.

    Attribute access mirrors config.py so stabilization/pilot don't need
    any code changes beyond the import swap.
    """

    def __init__(self):
        self._load_defaults()

    def _load_defaults(self):
        for entry in SCHEMA:
            k = entry["key"]
            setattr(self, k, _clone(getattr(defaults, k)))

    def apply(self, params: dict):
        """Overwrite any number of parameters. Unknown keys are ignored."""
        schema = schema_dict()
        for k, v in params.items():
            if k not in schema:
                continue
            if k in _DERIVED_KEYS:
                continue  # derived from others; cannot set directly
            if k in _VEC_KEYS:
                v = np.array(v, dtype=float)
            elif schema[k]["type"] == "bool":
                v = bool(v)
            elif schema[k]["type"] == "int":
                v = int(v)
            else:
                v = float(v)
            setattr(self, k, v)
        # Recompute derived values.
        self.BASE_THRUST = (self.DRONE_MASS_KG * self.GRAVITY) / 4.0

    def to_dict(self) -> dict:
        """Snapshot of every parameter as a JSON-safe dict."""
        out = {}
        for entry in SCHEMA:
            k = entry["key"]
            v = getattr(self, k)
            if isinstance(v, np.ndarray):
                out[k] = v.tolist()
            elif isinstance(v, (np.floating, np.integer)):
                out[k] = v.item()
            else:
                out[k] = v
        return out


def _clone(v):
    if isinstance(v, np.ndarray):
        return v.copy()
    return v


# Singleton. Import as: `from modules.config_runtime import current as cfg`
current = _Runtime()
