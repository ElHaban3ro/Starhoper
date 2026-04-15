"""Metadata for every tunable parameter in config.py.

The dashboard uses this to auto-generate sliders + input widgets with
sensible ranges and tooltips. Keep this in sync with config.py when adding
new parameters.

Each entry:
  {
    "key":       name of the attribute in config.py,
    "section":   UI grouping (title appears in the dashboard),
    "type":      "float" | "int" | "bool" | "vec3",
    "min":       lower slider bound,
    "max":       upper slider bound,
    "step":      slider step,
    "label":     human-friendly label,
    "tooltip":   short description,
    "derived":   true if the value is computed from others (read-only),
  }
"""

SCHEMA = [
    # DRONE PHYSICS
    {"key": "DRONE_MASS_KG", "section": "Physics", "type": "float",
     "min": 0.05, "max": 5.0, "step": 0.01,
     "label": "Drone mass (kg)",
     "tooltip": "Rigidbody mass from Unity. Drives BASE_THRUST."},
    {"key": "GRAVITY", "section": "Physics", "type": "float",
     "min": 1.0, "max": 20.0, "step": 0.01,
     "label": "Gravity (m/s²)",
     "tooltip": "Unity's physics gravity magnitude."},
    {"key": "YAW_REACTION_COEFF", "section": "Physics", "type": "float",
     "min": 0.0, "max": 1.0, "step": 0.005,
     "label": "Yaw reaction coeff (doc only)",
     "tooltip": "Prop drag coefficient. Lives in Unity Inspector; this field is reference-only."},

    # MOTOR LIMITS
    {"key": "BASE_THRUST", "section": "Motors", "type": "float",
     "min": 0.0, "max": 20.0, "step": 0.01, "derived": True,
     "label": "Base thrust per motor (N)",
     "tooltip": "Computed = mass·g/4. Change mass/gravity to recompute."},
    {"key": "MOTOR_MIN", "section": "Motors", "type": "float",
     "min": 0.0, "max": 5.0, "step": 0.1,
     "label": "Motor min (N)",
     "tooltip": "Floor clamp on mixer output."},
    {"key": "MOTOR_MAX", "section": "Motors", "type": "float",
     "min": 0.5, "max": 50.0, "step": 0.5,
     "label": "Motor max (N)",
     "tooltip": "Ceiling clamp. Raise only if your motors saturate often."},

    # PILOT INPUT
    {"key": "THROTTLE_GAIN", "section": "Pilot", "type": "float",
     "min": 0.0, "max": 5.0, "step": 0.05,
     "label": "Throttle gain",
     "tooltip": "Extra thrust per motor at full throttle."},
    {"key": "PITCH_MAX_DEG", "section": "Pilot", "type": "float",
     "min": 0.0, "max": 85.0, "step": 1.0,
     "label": "Max pitch (°)",
     "tooltip": "Tilt setpoint when W/S held."},
    {"key": "ROLL_MAX_DEG", "section": "Pilot", "type": "float",
     "min": 0.0, "max": 85.0, "step": 1.0,
     "label": "Max roll (°)",
     "tooltip": "Tilt setpoint when A/D held."},
    {"key": "MAX_COMBINED_TILT_DEG", "section": "Pilot", "type": "float",
     "min": 0.0, "max": 85.0, "step": 1.0,
     "label": "Max combined tilt (°)",
     "tooltip": "Diagonal cap. Keep < FAILSAFE_TILT_DEG."},
    {"key": "PILOT_PITCH_SIGN", "section": "Pilot", "type": "int",
     "min": -1, "max": 1, "step": 2,
     "label": "Pitch direction",
     "tooltip": "+1 normal, -1 if W flies backward."},
    {"key": "PILOT_ROLL_SIGN", "section": "Pilot", "type": "int",
     "min": -1, "max": 1, "step": 2,
     "label": "Roll direction",
     "tooltip": "+1 normal, -1 if D flies left."},

    # YAW
    {"key": "YAW_RATE_MAX_DEG", "section": "Yaw", "type": "float",
     "min": 10.0, "max": 360.0, "step": 5.0,
     "label": "Max yaw rate (°/s)",
     "tooltip": "Rate commanded at full Q/E."},
    {"key": "YAW_STABILITY", "section": "Yaw", "type": "float",
     "min": 0.0, "max": 0.1, "step": 0.0005,
     "label": "Yaw stability (KP)",
     "tooltip": "Rate-tracking strength. Higher = snappier + stronger braking."},
    {"key": "YAW_OUT_LIMIT", "section": "Yaw", "type": "float",
     "min": 0.0, "max": 5.0, "step": 0.05,
     "label": "Yaw mixer cap",
     "tooltip": "Saturation limit on yaw mixer term."},

    # PID GAINS
    {"key": "KP", "section": "PID Gains", "type": "vec3",
     "min": 0.0, "max": 0.3, "step": 0.001,
     "label": "KP [roll, pitch, yaw]",
     "tooltip": "Proportional gain per axis. Yaw is usually 0 (controlled separately)."},
    {"key": "KI", "section": "PID Gains", "type": "vec3",
     "min": 0.0, "max": 0.05, "step": 0.0001,
     "label": "KI [roll, pitch, yaw]",
     "tooltip": "Integral. Small values cancel bias; too high causes wind-up."},
    {"key": "KD", "section": "PID Gains", "type": "vec3",
     "min": 0.0, "max": 0.2, "step": 0.001,
     "label": "KD [roll, pitch, yaw]",
     "tooltip": "Derivative (damping). Ratio KD/KP > 0.8 typical for rockets."},

    # PID GUARDS
    {"key": "I_LIMIT", "section": "Guards", "type": "vec3",
     "min": 0.0, "max": 10.0, "step": 0.1,
     "label": "Integral clamp",
     "tooltip": "Hard cap on integral accumulation (anti-windup)."},
    {"key": "OUT_LIMIT", "section": "Guards", "type": "float",
     "min": 0.1, "max": 5.0, "step": 0.05,
     "label": "PID out cap (N)",
     "tooltip": "Per-axis clamp on PID output before mixer."},
    {"key": "I_LEAK", "section": "Guards", "type": "float",
     "min": 0.0, "max": 10.0, "step": 0.05,
     "label": "Integral leak (1/s)",
     "tooltip": "Decay rate of accumulated integral per second."},
    {"key": "FAILSAFE_TILT_DEG", "section": "Guards", "type": "float",
     "min": 10.0, "max": 89.0, "step": 1.0,
     "label": "Failsafe tilt (°)",
     "tooltip": "Above this tilt, throttle boost dropped + integral reset."},

    # SIGN
    {"key": "SIGN_ROLL", "section": "Axis Signs", "type": "int",
     "min": -1, "max": 1, "step": 2,
     "label": "Roll sign",
     "tooltip": "+1 or -1 to correct axis convention."},
    {"key": "SIGN_PITCH", "section": "Axis Signs", "type": "int",
     "min": -1, "max": 1, "step": 2,
     "label": "Pitch sign",
     "tooltip": "+1 or -1 to correct axis convention."},

    # DIAGNOSTICS
    {"key": "PASSIVE", "section": "Diagnostics", "type": "bool",
     "label": "Passive mode",
     "tooltip": "Bypass PID; send only BASE_THRUST. Isolates physics from controller."},
    {"key": "DEBUG", "section": "Diagnostics", "type": "bool",
     "label": "Debug log",
     "tooltip": "Print per-tick PID state to stdout."},
]


def schema_dict() -> dict:
    """Return schema keyed by param name for fast lookup."""
    return {entry["key"]: entry for entry in SCHEMA}
