from typing import Union
import numpy as np
from maps import IMU, Coords
from ahrs.filters import Madgwick
from scipy.spatial.transform import Rotation as R
import numpy as np


class Stabilization:
    """A class to handle the stabilization of a spacecraft.
    """
    def __init__(self):
        """Initialize the Stabilization class with IMU data.

        Args:
            imu_data (IMU): The IMU data containing acceleration, angular velocity, and magnetic field.
        """
        self.imu_data: IMU = IMU(Coords(), Coords(), Coords(), Coords())  # Initialize with default IMU data
        self.mw = Madgwick(gain=0.5)  # Initialize the Madgwick filter
        self.quaternions = np.ndarray = np.array([1.0, 0.0, 0.0, 0.0])  # Initial quaternion representing no rotation
        self.euler_angles = np.ndarray = np.array([0.0, 0.0, 0.0])  # Initial Euler angles (roll, pitch, yaw)
        
        self.standby_orientation = Coords(
            x=0.0, 
            y=0.0, 
            z=0.0
        )
        
    def update_orientation(self, imu_data: IMU):
        """Get the orientation of the spacecraft based on IMU data.

        Returns:
            tuple: A tuple containing the orientation in quaternion format.
        """
        self.imu_data = imu_data
        print(f'EULER ANGLES: {self.imu_data.euler_angles}')

        roll, pitch, yaw = self.imu_data.euler_angles.vector
        self.euler_angles = np.array([roll, pitch, yaw])

        correction_vector = self.correction_pd(kp=0.05, kd=0.015)
        #print(f'Correction Vector: {correction_vector}')
        return self.apply_correction(correction_vector, base_thrust=20)

    def apply_correction(self, correction: Coords, base_thrust: float = 40) -> dict:
        """Apply the correction to the spacecraft orientation.

        Args:
            correction (Coords): The correction vector in euler angles (roll, pitch, yaw).

        Returns:
            Coords: The new orientation after applying the correction.
        """
        return {    
            'm1': base_thrust + correction.x - correction.y + correction.z,
            'm2': base_thrust - correction.x - correction.y - correction.z,
            'm3': base_thrust - correction.x + correction.y + correction.z,
            'm4': base_thrust + correction.x + correction.y - correction.z,
        }


    def correction_pd(self, kp: float = 0.1, kd: float = 0.01) -> Coords:
        """Compute the correction needed to stabilize the spacecraft.

        Args:
            kp (float): Proportional gain.
            kd (float): Derivative gain.

        Returns:
            Coords: The correction vector in euler angles (roll, pitch, yaw).
        """
        error_vector = self.compute_target_orientation()
        correction = Coords(
            x=-(kp * error_vector.x - kd * self.imu_data.angular_velocity.x), # X is roll
            y=kp * error_vector.y - kd * self.imu_data.angular_velocity.y, # Y is pitch
            z=kp * error_vector.z - kd * self.imu_data.angular_velocity.z # Z is yaw
        )
        return correction
        
        
    def compute_target_orientation(self) -> Coords:
        """Compute the target orientation based on the target coordinates.

        Returns:
            np.ndarray: The target orientation in euler angles (roll, pitch, yaw). This is the error.
        """
        return Coords(
            x=self.standby_orientation.x - self.euler_angles[0],
            y=self.standby_orientation.y - self.euler_angles[1],
            z=self.standby_orientation.z - self.euler_angles[2]
        )


    def quaternion_to_euler_angle_vectorized(self, w, x, y, z):
        ysqr = y * y

        t0 = +2.0 * (w * x + y * z)
        t1 = +1.0 - 2.0 * (x * x + ysqr)
        X = np.degrees(np.arctan2(t0, t1))

        t2 = +2.0 * (w * y - z * x)
        t2 = np.where(t2>+1.0,+1.0,t2)
        #t2 = +1.0 if t2 > +1.0 else t2

        t2 = np.where(t2<-1.0, -1.0, t2)
        #t2 = -1.0 if t2 < -1.0 else t2
        Y = np.degrees(np.arcsin(t2))

        t3 = +2.0 * (w * z + x * y)
        t4 = +1.0 - 2.0 * (ysqr + z * z)
        Z = np.degrees(np.arctan2(t3, t4))

        return X, Y, Z 