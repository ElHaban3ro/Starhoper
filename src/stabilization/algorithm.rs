use crate::websocket::client::CoordsContainer;
use ahrs::{Ahrs, Madgwick};
use nalgebra::Vector3;
use std::f64;

pub struct Orientation {
    pub x: f64,
    pub y: f64,
    pub z: f64,
}

pub struct PDController {
    pub kp: f64, // Proportional gain
    pub kd: f64, // Derivative gain
}

pub struct MotorForces {
    pub m1: f64,
    pub m2: f64,
    pub m3: f64,
    pub m4: f64,
}

pub fn start(receiver: crossbeam::channel::Receiver<CoordsContainer>, sender: crossbeam::channel::Sender<MotorForces>) {
    let standby_target = Orientation {
        x: 0.0,
        y: 0.0,
        z: 0.0,
    };
    
    let mut ahrs = Madgwick::default();

    loop {
        let coords = receiver.recv().unwrap();

        let gyroscope = Vector3::new(
            coords.gyroscope.x as f64,
            coords.gyroscope.y as f64,
            coords.gyroscope.z as f64,
        );
        let accelerometer = Vector3::new(
            coords.acceleration.x as f64,
            coords.acceleration.y as f64,
            coords.acceleration.z as f64,
        );
        let magnetometer = Vector3::new(
            coords.magnetometer.x as f64,
            coords.magnetometer.y as f64,
            coords.magnetometer.z as f64,
        );
        
        let quat = ahrs.update(
            &(gyroscope * (f64::consts::PI / 180.0)),
            &accelerometer,
            &magnetometer,
        ).unwrap();

        let (roll, pitch, yaw) = quat.euler_angles();

        let orientation_error = calculate_orientation_error(&standby_target, roll, pitch, yaw);

        let pd = PDController {
            kp: 600000.0, // Adjust as needed this is the proportional gain
            kd: 1000000.0, // Adjust as needed ths is the derivative gain
        };

        let correction_x = pd_control(&pd, orientation_error.x, coords.gyroscope.x);
        let correction_y = pd_control(&pd, orientation_error.y, coords.gyroscope.y);
        let correction_z = pd_control(&pd, orientation_error.z, coords.gyroscope.z); 

        let base_thrust: f64 = 70.0; // Base thrust value, adjust as needed. This is Newton's second law of motion.
        let max_thrust: f64 = 150.0; // Maximum thrust value for motors, adjust as needed.

        let motors = mix_motor_forces(base_thrust, correction_x, correction_y, correction_z);

        let motors_forece_final = MotorForces {
            m1: clamp_motor_force(motors.m1, 0.0, max_thrust),
            m2: clamp_motor_force(motors.m2, 0.0, max_thrust),
            m3: clamp_motor_force(motors.m3, 0.0, max_thrust),
            m4: clamp_motor_force(motors.m4, 0.0, max_thrust),
        };

        sender.send(motors_forece_final).unwrap();

    }
}

fn mix_motor_forces(
    base_thrust: f64,
    correction_x: f64,
    correction_y: f64,
    correction_z: f64,
) -> MotorForces {
    let m1 = base_thrust + correction_x - correction_y + correction_z; // Front-left motor
    let m2 = base_thrust - correction_x - correction_y - correction_z; // Front-right motor
    let m3 = base_thrust - correction_x + correction_y + correction_z; // Back-right motor
    let m4 = base_thrust + correction_x + correction_y - correction_z; // Back-left motor

    MotorForces { m1, m2, m3, m4 }
}


pub fn clamp_motor_force(force: f64, min: f64, max: f64) -> f64 {
    force.max(min).min(max)
}

pub fn calculate_orientation_error(
    target: &Orientation,
    roll: f64,
    pitch: f64,
    yaw: f64,
) -> Orientation {
    Orientation {
        x: target.x - roll,
        y: target.y - pitch,
        z: target.z - yaw,
    }
}

pub fn normalize_angle(angle: f64) -> f64 {
    ((angle + std::f64::consts::PI) % (2.0 * std::f64::consts::PI)) - std::f64::consts::PI
}


fn pd_control(
    controller: &PDController,
    error: f64,
    angular_velocity: f64
) -> f64 {
    controller.kp * error - controller.kd * angular_velocity
}