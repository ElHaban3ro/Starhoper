import time
import numpy as np
from maps import IMU, Coords


# Axis convention (BODY-FRAME tilt errors from Unity imu.cs):
#   roll  -> index 0 -> + when drone rolled right (body+X tilts down)
#   pitch -> index 1 -> + when nose down (body+Z tilts down)
#   yaw   -> index 2 -> heading (info only; not controlled)
#
# Body-frame is YAW-INDEPENDENT — controller works correctly even if the
# drone has yawed any amount. Previously we used world-frame Unity euler which
# coupled with yaw and broke after any ground-friction yaw drift.
#
# Gyro axes match: gyro[0]=roll rate (body-Z), gyro[1]=pitch rate (body-X).
#
# Motor layout (quad-X mixer):
#   m1 front-left, m2 front-right, m3 rear-right, m4 rear-left
#   roll  +  -> m1, m4 less thrust (left side drops -> wrong; mixer inverts)
#   See _mix() for actual signs.


class Stabilization:
    """PID attitude stabilizer for a quad-X spacecraft."""

    # Yaw gains are zero: quad-X with pure vertical thrust cannot generate
    # yaw torque. Attempting to control yaw only causes integral windup and
    # destabilizes the other axes. Yaw must be controlled by prop-reaction
    # torque (not modeled here) or an explicit AddTorque in Unity.
    # Sign overrides empirically determined from log analysis. Pitch axis
    # recovers correctly with +1; roll axis runs away with +1 (gyro and
    # euler share sign with PID output -> positive feedback) so it needs -1.
    SIGN_ROLL = -1
    SIGN_PITCH = +1

    # Roll has ~2.4x more torque authority than pitch (arm 0.9 vs 0.38),
    # so its gains must be proportionally lower to avoid high-freq chatter.
    KP = np.array([0.008, 0.020, 0.0])   # roll, pitch, yaw
    KI = np.array([0.000, 0.000, 0.0])   # PD only — re-enable after stable
    KD = np.array([0.004, 0.010, 0.0])

    # Verbose log every tick to identify wrong-sign axes empirically.
    DEBUG = False

    I_LIMIT = np.array([1.0, 1.0, 0.0])  # anti-windup clamp on integral
    OUT_LIMIT = 0.5                      # per-axis correction clamp (N)
    I_LEAK = 1.0                         # integral decay rate (per second)

    # Soft failsafe: above this tilt drop the throttle boost (don't gain more
    # altitude while tumbling) and disable integral, but KEEP PID active to
    # damp rotation. Cutting motors completely lets the drone tumble freely,
    # accumulating angular velocity that the PID can't catch when it
    # re-enters control range.
    FAILSAFE_TILT_DEG = 60.0

    # Drone mass in Unity scene is 0.25 kg (OutdoorsScene.unity).
    # Hover = mass * g / 4 motors = 0.25 * 9.81 / 4 = 0.6131 N per motor.
    BASE_THRUST = 0.62
    # Extra thrust per motor at throttle=1.0. 4 motors * 0.5 N = 2.0 N extra
    # -> ~0.8 g of vertical accel above hover. Tune to taste.
    THROTTLE_GAIN = 0.5
    MOTOR_MIN = 0.0
    MOTOR_MAX = 2.0

    # Diagnostic: if True, bypass PID and send only BASE_THRUST to all 4
    # motors. Use to verify the drone hovers with no control — isolates
    # physics/wiring issues from controller bugs.
    PASSIVE = False

    def __init__(self):
        self.imu_data = IMU(Coords(), Coords(), Coords(), Coords())
        self.euler = np.zeros(3)
        self.integral = np.zeros(3)
        self.standby = np.zeros(3)
        self._last_t = None

    def update_orientation(
        self, imu_data: IMU, throttle: float = 0.0, tilt: float = 0.0
    ) -> dict:
        self.imu_data = imu_data
        roll, pitch, yaw = imu_data.euler_angles.vector
        self.euler = np.array([roll, pitch, yaw])

        now = time.monotonic()
        dt = 0.02 if self._last_t is None else max(1e-4, now - self._last_t)
        self._last_t = now

        base = self.BASE_THRUST + self.THROTTLE_GAIN * max(-1.0, min(1.0, throttle))

        if self.PASSIVE:
            return self._mix(np.zeros(3), base)

        # Soft failsafe: kill throttle boost and integral, but keep PID
        # damping the rotation. Drone falls under gravity but its rotation is
        # actively braked, so when it re-enters the control range it isn't
        # spinning out of control.
        if tilt > self.FAILSAFE_TILT_DEG:
            self.integral[:] = 0.0
            base = self.BASE_THRUST

        correction = self._pid(dt)
        return self._mix(correction, base)

    def _pid(self, dt: float) -> np.ndarray:
        # Apply sign overrides at the input — both euler error AND gyro must
        # flip together so the D-term keeps damping (matches the rate of the
        # signed error).
        signs = np.array([self.SIGN_ROLL, self.SIGN_PITCH, 1.0])
        euler_signed = self.euler * signs
        gyro_signed = self.imu_data.angular_velocity.vector * signs

        error = self._wrap(self.standby - euler_signed)

        u_unsat = self.KP * error + self.KI * self.integral - self.KD * gyro_signed
        saturated = np.abs(u_unsat) >= self.OUT_LIMIT

        leak = np.exp(-self.I_LEAK * dt)
        new_integral = self.integral * leak + error * dt
        new_integral = np.clip(new_integral, -self.I_LIMIT, self.I_LIMIT)

        unwinding = np.sign(error) != np.sign(self.integral)
        self.integral = np.where(saturated & ~unwinding, self.integral, new_integral)

        u = self.KP * error + self.KI * self.integral - self.KD * gyro_signed

        if self.DEBUG:
            print(f'  euler={euler_signed.round(1)} gyro={gyro_signed.round(1)} '
                  f'err={error.round(1)} u={u.round(3)}')

        return np.clip(u, -self.OUT_LIMIT, self.OUT_LIMIT)

    def _mix(self, u: np.ndarray, b: float) -> dict:
        r, p, y = u
        m1 = b + r - p + y
        m2 = b - r - p - y
        m3 = b - r + p + y
        m4 = b + r + p - y
        return {
            'm1': float(np.clip(m1, self.MOTOR_MIN, self.MOTOR_MAX)),
            'm2': float(np.clip(m2, self.MOTOR_MIN, self.MOTOR_MAX)),
            'm3': float(np.clip(m3, self.MOTOR_MIN, self.MOTOR_MAX)),
            'm4': float(np.clip(m4, self.MOTOR_MIN, self.MOTOR_MAX)),
        }

    @staticmethod
    def _wrap(angles: np.ndarray) -> np.ndarray:
        return (angles + 180.0) % 360.0 - 180.0

    def reset(self):
        self.integral[:] = 0.0
        self._last_t = None
