import time
import numpy as np
from maps import IMU, Coords
from modules import config as cfg


# Axis convention (BODY-FRAME tilt errors from Unity imu.cs):
#   roll  -> index 0 -> + when drone rolled right (body+X tilts down)
#   pitch -> index 1 -> + when nose down (body+Z tilts down)
#   yaw   -> index 2 -> heading (info only; not controlled)
#
# Body-frame is YAW-INDEPENDENT — controller works correctly even if the
# drone has yawed any amount.
#
# Motor layout (quad-X mixer):
#   m1 front-left, m2 front-right, m3 rear-right, m4 rear-left


class Stabilization:
    """PID attitude stabilizer for a quad-X spacecraft.

    All tuning constants live in modules/config.py — edit there.
    """

    def __init__(self):
        self.imu_data = IMU(Coords(), Coords(), Coords(), Coords())
        self.euler = np.zeros(3)
        self.integral = np.zeros(3)
        self.standby = np.zeros(3)
        self._last_t = None

    def update_orientation(
        self, imu_data: IMU, throttle: float = 0.0, tilt: float = 0.0,
        pitch_setpoint: float = 0.0, roll_setpoint: float = 0.0,
        yaw_input: float = 0.0,
    ) -> dict:
        # Pilot commands tilt setpoints (deg). PID drives current attitude
        # toward them. Tilted thrust -> horizontal acceleration -> drone
        # flies in that direction.
        # Cap the combined tilt magnitude so diagonal commands don't exceed
        # the safe envelope and trigger the failsafe.
        mag = float(np.hypot(roll_setpoint, pitch_setpoint))
        if mag > cfg.MAX_COMBINED_TILT_DEG:
            scale = cfg.MAX_COMBINED_TILT_DEG / mag
            roll_setpoint *= scale
            pitch_setpoint *= scale

        self.standby[0] = roll_setpoint
        self.standby[1] = pitch_setpoint
        self.imu_data = imu_data
        roll, pitch, yaw = imu_data.euler_angles.vector
        self.euler = np.array([roll, pitch, yaw])

        now = time.monotonic()
        dt = 0.02 if self._last_t is None else max(1e-4, now - self._last_t)
        self._last_t = now

        base = cfg.BASE_THRUST + cfg.THROTTLE_GAIN * max(-1.0, min(1.0, throttle))

        # Closed-loop yaw rate controller: pilot input sets a target rate,
        # P-term drives actual gyro rate toward it. When pilot = 0, target
        # = 0 -> actively brakes residual rotation.
        target_yaw_rate = yaw_input * cfg.YAW_RATE_MAX_DEG
        current_yaw_rate = self.imu_data.angular_velocity.vector[2]  # gyro Y (deg/s)
        yaw_rate_error = target_yaw_rate - current_yaw_rate
        yaw_cmd = float(np.clip(
            cfg.YAW_STABILITY * yaw_rate_error,
            -cfg.YAW_OUT_LIMIT, cfg.YAW_OUT_LIMIT,
        ))

        if cfg.PASSIVE:
            return self._mix(np.array([0.0, 0.0, yaw_cmd]), base)

        # Soft failsafe: kill throttle boost and integral, but keep PID
        # damping the rotation so the drone doesn't spin out of control.
        if tilt > cfg.FAILSAFE_TILT_DEG:
            self.integral[:] = 0.0
            base = cfg.BASE_THRUST

        correction = self._pid(dt)
        correction[2] = yaw_cmd  # override PID yaw (which is 0'd) with rate-controller cmd
        return self._mix(correction, base)

    def _pid(self, dt: float) -> np.ndarray:
        # Sign overrides applied to BOTH euler error and gyro so the D-term
        # remains a damping term (its sign cancels with the error sign).
        signs = np.array([cfg.SIGN_ROLL, cfg.SIGN_PITCH, 1.0])
        euler_signed = self.euler * signs
        gyro_signed = self.imu_data.angular_velocity.vector * signs

        error = self._wrap(self.standby - euler_signed)

        u_unsat = cfg.KP * error + cfg.KI * self.integral - cfg.KD * gyro_signed
        saturated = np.abs(u_unsat) >= cfg.OUT_LIMIT

        leak = np.exp(-cfg.I_LEAK * dt)
        new_integral = self.integral * leak + error * dt
        new_integral = np.clip(new_integral, -cfg.I_LIMIT, cfg.I_LIMIT)

        unwinding = np.sign(error) != np.sign(self.integral)
        self.integral = np.where(saturated & ~unwinding, self.integral, new_integral)

        u = cfg.KP * error + cfg.KI * self.integral - cfg.KD * gyro_signed

        if cfg.DEBUG:
            print(f'  euler={euler_signed.round(1)} gyro={gyro_signed.round(1)} '
                  f'err={error.round(1)} u={u.round(3)}')

        return np.clip(u, -cfg.OUT_LIMIT, cfg.OUT_LIMIT)

    def _mix(self, u: np.ndarray, b: float) -> dict:
        r, p, y = u
        m1 = b + r - p + y
        m2 = b - r - p - y
        m3 = b - r + p + y
        m4 = b + r + p - y
        return {
            'm1': float(np.clip(m1, cfg.MOTOR_MIN, cfg.MOTOR_MAX)),
            'm2': float(np.clip(m2, cfg.MOTOR_MIN, cfg.MOTOR_MAX)),
            'm3': float(np.clip(m3, cfg.MOTOR_MIN, cfg.MOTOR_MAX)),
            'm4': float(np.clip(m4, cfg.MOTOR_MIN, cfg.MOTOR_MAX)),
        }

    @staticmethod
    def _wrap(angles: np.ndarray) -> np.ndarray:
        return (angles + 180.0) % 360.0 - 180.0

    def reset(self):
        self.integral[:] = 0.0
        self._last_t = None
