import numpy as np

class Coords:
    """A class to represent 3D coordinates."""

    def __init__(self, x: float = 0.0, y: float = 0.0, z: float = 0.0):
        self.x = x
        self.y = y
        self.z = z
        self.vector = np.array([x, y, z])

    def __repr__(self):
        return f"Coords(x={self.x}, y={self.y}, z={self.z})"

class IMU:
    def __init__(self, acceleration: Coords, angular_velocity: Coords, magnetic_field: Coords, euler_angles: Coords):
        """Initialize the IMU with acceleration, angular velocity, and magnetic field vectors.

        Args:
            acceleration (Coords): Acceleration vector, corresponding to the accelerometer.
            angular_velocity (Coords): Angular velocity vector, corresponding to the gyroscope.
            magnetic_field (Coords): Magnetic field vector, corresponding to the magnetometer.
        """
        self.euler_angles: Coords = euler_angles
        self.acceleration: Coords = acceleration
        self.angular_velocity: Coords = angular_velocity
        self.magnetic_field: Coords = magnetic_field

    def __repr__(self):
        return (f"IMU(acceleration={self.acceleration}, "
                f"angular_velocity={self.angular_velocity}, "
                f"magnetic_field={self.magnetic_field})")