use crate::websocket::client::CoordsContainer;


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

    loop {
        let coords = receiver.recv().unwrap();

        let orientation_error = calculate_orientation_error(&standby_target, &coords);

        let pd = PDController {
            kp: 1.5, // Adjust as needed
            kd: 0.3, // Adjust as needed
        };

        let correction_x = pd_control(&pd, orientation_error.x, coords.gyroscope.x);
        let correction_y = pd_control(&pd, orientation_error.y, coords.gyroscope.y);
        let correction_z = pd_control(&pd, orientation_error.z, coords.gyroscope.z); 

        let base_thrust: f64 = 40.0; // Base thrust value, adjust as needed. This is Newton's second law of motion.
        let max_thrust: f64 = 70.0; // Maximum thrust value for motors, adjust as needed.

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
    current: &CoordsContainer,
) -> Orientation {
    Orientation {
        x: normalize_angle(target.x - current.gyroscope.x),
        y: normalize_angle(target.y - current.gyroscope.y),
        z: normalize_angle(target.z - current.gyroscope.z),
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