"""Central tuning file. Edit values here, no need to touch other modules.

All parameters that affect drone behavior live in this file, grouped by
purpose. Each constant has a comment explaining what it does and how it
interacts with the rest of the system.
"""

import numpy as np


# ============================================================================
# DRONE PHYSICS (must match the Unity scene)
# ============================================================================

# Mass of the drone Rigidbody in kg. Read from OutdoorsScene.unity.
# If you change the mass in Unity, update this too — BASE_THRUST is derived
# from it. Wrong mass -> drone falls (too low) or rockets up (too high).
DRONE_MASS_KG = 0.25

# Gravity used by Unity's physics (default Y = -9.81 m/s²).
GRAVITY = 9.81

# Yaw reaction torque per Newton of thrust (prop drag coefficient). Higher
# = each motor generates more counter-torque on the body per unit thrust
# -> yaw is more responsive to motor thrust imbalances.
# This lives in Unity (websocket_client.cs:yawReactionCoeff field); this
# constant is documented here so you know where to tune it.
YAW_REACTION_COEFF = 0.05  # Unity Inspector: websocket_client.yawReactionCoeff


# ============================================================================
# MOTOR LIMITS
# ============================================================================

# Per-motor thrust hover value: mass * g / 4 motors.
# Each motor outputs this much in N when drone is level and not boosted.
BASE_THRUST = (DRONE_MASS_KG * GRAVITY) / 4.0

# Hard motor saturation. The mixer output is clamped to this range BEFORE
# being sent to Unity.
#   MOTOR_MIN: cannot go negative (a propeller can't push down).
#   MOTOR_MAX: physical thrust ceiling (motor saturation).
MOTOR_MIN = 0.0
MOTOR_MAX = 6.0


# ============================================================================
# PILOT INPUT (RC transmitter behavior)
# ============================================================================

# Extra thrust per motor when throttle = ±1.0. Total extra force on the drone
# at full throttle = 4 * THROTTLE_GAIN. Higher = punchier climb/descent.
THROTTLE_GAIN = 1

# Tilt setpoint commanded when an arrow key is held (degrees).
# Higher = faster horizontal acceleration but harder for PID to recover.
# At 15° the drone loses ~3.4% of vertical thrust to horizontal; at 30°,
# ~13%. Above ~25° you usually need extra throttle to maintain altitude.
PITCH_MAX_DEG = 30.0   # forward / backward (W / S)
ROLL_MAX_DEG = 30.0    # left / right       (A / D)

# Yaw is generated the realistic way: motor-thrust differential modulated
# into the mixer's yaw term, then Unity applies each motor's drag-reaction
# torque on the body (m1,m3 spin CW; m2,m4 spin CCW -- opposites cancel
# at equal RPM, imbalance causes yaw).
#
# Closed-loop rate controller: pilot Q/E commands a TARGET yaw rate (deg/s)
# instead of raw torque. The controller then drives the drone's actual yaw
# rate (from gyro) toward that target. When you release Q/E the target is 0
# and the controller actively BRAKES any residual rotation -- no more
# coasting from prop drag or air friction.

# Max yaw rate requested when Q/E is held at full input (deg/s).
YAW_RATE_MAX_DEG = 80.0

# Yaw stability / rate-tracking strength. Higher values mean:
#   - Faster acceleration to the commanded rate when Q/E is held.
#   - Stronger braking when Q/E is released (less coasting).
#   - More resistance to external yaw disturbances (prop drag, collisions).
# Too high causes oscillation or motor saturation. Typical range: 0.002-0.01.
YAW_STABILITY = 0.010

# Hard clamp on yaw mixer output so it can't monopolize motor authority.
YAW_OUT_LIMIT = 1

# Combined tilt cap. Holding two arrows at once would otherwise stack
# diagonally to sqrt(pitch² + roll²) ≈ 85° at full input, exceeding
# FAILSAFE_TILT_DEG and triggering a tumble. When the combined magnitude
# exceeds this, both setpoints are scaled down proportionally — the drone
# tilts in the commanded DIRECTION but caps the magnitude. Keep this safely
# below FAILSAFE_TILT_DEG (e.g., 70-80% of it) to leave the PID headroom
# to recover from disturbances around the commanded attitude.
MAX_COMBINED_TILT_DEG = 45.0

# Direction overrides for pilot inputs. Flip to -1 if an arrow key moves the
# drone in the opposite direction of what you expect.
#   PILOT_PITCH_SIGN: -1 if Up arrow flies BACKWARD instead of forward.
#   PILOT_ROLL_SIGN:  -1 if Right arrow flies LEFT instead of right.
PILOT_PITCH_SIGN = +1
PILOT_ROLL_SIGN = +1


# ============================================================================
# PID GAINS  (tuning)
# ============================================================================

# Per-axis [roll, pitch, yaw]. Yaw is zero because pure-thrust quad-X cannot
# generate yaw torque (no prop counter-rotation in this model).
#
# Roll gains are LOWER than pitch because the roll arm (~0.9 m) is ~2.4x
# longer than the pitch arm (~0.38 m), giving more torque authority per unit
# of correction. If you change ARM_X / ARM_Z in Unity, rebalance these.

# ROCKET TUNING — step 1: isolate oscillation with KI=0, KD high vs KP.
# Once stable in PD, gradually raise KP, then re-enable KI.
#
# Proportional: how hard to correct against angular error.
KP = np.array([0.015, 0.015, 0.0])

# Integral: cancels persistent biases. Kept tiny for rocket — the high
# inertia means integral wind-up is easy. Raise only if drone consistently
# settles at a small but persistent tilt.
KI = np.array([0.0005, 0.0005, 0.0])

# Derivative: damps angular velocity. For rocket (high inertia), ratio
# KD/KP > 1 is normal — gives strong damping against oscillation.
KD = np.array([0.020, 0.020, 0.0])


# ============================================================================
# PID GUARDS (anti-windup, output clamping, failsafe)
# ============================================================================

# Hard clamp on accumulated integral per axis. Prevents wind-up if the PID
# can't physically correct (e.g., during a hard impact when motors saturate).
I_LIMIT = np.array([1.0, 1.0, 0.0])

# Per-axis cap on the PID output BEFORE it's mixed to motors. Keeps any one
# axis from monopolizing motor authority.
OUT_LIMIT = 0.5

# Integral leak rate (per second). Each tick: integral *= exp(-I_LEAK * dt).
# Higher = faster decay = less long-term memory. Helps recover from saturated
# scenarios where integral wound up despite anti-windup.
I_LEAK = 1.0

# Above this tilt-from-vertical (degrees), the controller assumes the drone
# is unrecoverable in normal mode:
#   - throttle boost is dropped (no climbing while tumbling)
#   - integral is reset to 0 (no wind-up while inverted)
#   - PID stays active to brake the rotation
# The drone falls under gravity but continues damping its spin, so when it
# re-enters the control range it isn't spinning out of control.
FAILSAFE_TILT_DEG = 60.0


# ============================================================================
# AXIS SIGN CORRECTIONS  (Unity left-handed coord convention quirks)
# ============================================================================

# Empirically determined. If a single-axis tilt test shows the PID making
# the tilt WORSE on that axis, flip its sign here.
# Apply at the input -- both euler error and gyro flip together so the
# D-term remains a damping term.
SIGN_ROLL = -1
SIGN_PITCH = +1


# ============================================================================
# DIAGNOSTICS
# ============================================================================

# If True, bypass PID and send only BASE_THRUST to all 4 motors. Use to
# verify the drone hovers without controller input -- isolates physics
# issues from controller bugs.
PASSIVE = False

# If True, print euler / gyro / err / u every PID tick. Useful for sign
# diagnosis but pollutes the console.
DEBUG = False
