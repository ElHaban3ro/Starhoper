"""World-frame velocity estimator from accelerometer integration.

Purpose: give the brake / position-hold logic a horizontal velocity estimate
WITHOUT depending on GPS. Pure inertial (accelerometer) dead reckoning.

Axis convention (matches IMU wire format from modern_imu.cs remap):
    accel[0] = world north (+Z Unity)
    accel[1] = world east  (+X Unity)
    accel[2] = world up    (+Y Unity)  -- unused, altitude not estimated here

Drift: accelerometer bias integrates linearly into velocity error. Over short
windows (<30 s) this is accurate to a few cm/s; over minutes it grows
unbounded. Brake mode fires seconds after WASD release so drift is
negligible in practice.

Reset on disarm — on the ground there is no velocity so the estimate
zeroes cleanly each time the drone is re-armed.
"""

from __future__ import annotations

import math

import numpy as np


class VelocityEstimator:
    def __init__(self):
        # [v_north, v_east] in m/s, world frame.
        self.v_world = np.zeros(2)

    def reset(self) -> None:
        self.v_world[:] = 0.0

    def update(self, accel_imu: np.ndarray, dt: float) -> None:
        """Integrate one tick of accelerometer.

        accel_imu: 3-vector in IMU remap order (north, east, up) m/s².
        dt: tick duration in seconds.
        """
        self.v_world[0] += float(accel_imu[0]) * dt
        self.v_world[1] += float(accel_imu[1]) * dt

    def body_frame(self, yaw_deg: float) -> tuple[float, float]:
        """Project world velocity into body frame.

        Returns (v_forward, v_right) in m/s.
        Yaw convention: 0° = facing world +Z (north); rotates about +Y up.
        """
        yaw_rad = math.radians(yaw_deg)
        v_n = float(self.v_world[0])
        v_e = float(self.v_world[1])
        # drone_forward_world = (sin(yaw), 0, cos(yaw))  [unity xyz]
        # drone_right_world   = (cos(yaw), 0, -sin(yaw))
        # In IMU remap (imu.x = world.z, imu.y = world.x):
        v_forward = v_e * math.sin(yaw_rad) + v_n * math.cos(yaw_rad)
        v_right = v_e * math.cos(yaw_rad) - v_n * math.sin(yaw_rad)
        return v_forward, v_right

    def speed(self) -> float:
        return float(np.linalg.norm(self.v_world))
