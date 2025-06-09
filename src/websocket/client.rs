use warp::Filter;
use warp::ws::{
    Message,
    WebSocket,
};
use futures::{SinkExt, StreamExt}; // Para manejar flujos de datos asincrónicos.
use std::convert::Infallible;

use crate::stabilization::algorithm; // Para manejar errores que no deberían ocurrir.

#[derive(Clone, Debug)]
pub struct Coords {
    pub x: f64,
    pub y: f64,
    pub z: f64,
}

#[derive(Clone, Debug)]
pub struct CoordsContainer {
    pub acceleration: Coords,
    pub gyroscope: Coords,
    pub magnetometer: Coords,
}


pub async fn start(sender: crossbeam::channel::Sender<CoordsContainer>, receiver: crossbeam::channel::Receiver<algorithm::MotorForces>) {
    println!("Listening for WebSocket connections on ws://localhost:3030/ws");

    let sender_copy = sender.clone(); // Clonamos el emisor para usarlo en el handler.
    let receiver_copy = receiver.clone(); // Clonamos el receptor para usarlo en el handler.

    // Comprueba que el path es 'ws' y que es una conexión WebSocket.
    let ws_route = warp::path("ws").and(warp::ws()).and_then(move |ws: warp::ws::Ws| {
        let sender = sender_copy.clone(); // Clonamos desde el copy.
        let receiver = receiver_copy.clone(); // Clonamos desde el copy.
        handle_ws(ws, sender, receiver)
    });

    println!("Starting WebSocket server on localhost:3030/ws");

    // Iniciamos el servidor websocket.
    warp::serve(ws_route).run(([127, 0, 0, 1], 3030)).await;
}


pub async fn handle_ws(ws: warp::ws::Ws, sender: crossbeam::channel::Sender<CoordsContainer>, receiver: crossbeam::channel::Receiver<algorithm::MotorForces>) -> Result<impl warp::Reply, Infallible> {
    println!("Trying to upgrade connection to WebSocket...");
    Ok(ws.on_upgrade(move |socket| {
        // Cuando se establece una conexión WebSocket, manejamos la conexión.
        handle_connection(socket, sender, receiver)
    }))
}

pub async fn handle_connection(mut socket: WebSocket, sender: crossbeam::channel::Sender<CoordsContainer>, receiver: crossbeam::channel::Receiver<algorithm::MotorForces>) {
    // New connection established.
    println!("New WebSocket connection established.");

    // Loop to send and receive messages.
    while let Some(result) = socket.next().await {
        match result {
            Ok(msg) => {
                // Echo the received message back to the client.
                if msg.is_text(){
                    let content = msg.to_str().unwrap_or("Invalid UTF-8 message");
                    let json: serde_json::Value = match serde_json::from_str(content) {
                        Ok(val) => val,
                        Err(e) => {
                            eprintln!("Error parsing JSON: {:?}", e);
                            continue;
                        }
                    };
                    
                    
                    proccess_json_data(&json, sender.clone(), receiver.clone(), &mut socket).await;

                    //println!("Received message: {:?}", json);

                } else if msg.is_close() {
                    println!("Client closed the connection.");
                    break; // Exit loop on close message.
                }
            },
            Err(e) => {
                eprintln!("Error receiving message: {:?}", e);
                break; // Exit loop on error.
            }
            
        }
    }
}

pub async fn proccess_json_data(json: &serde_json::Value, sender: crossbeam::channel::Sender<CoordsContainer>, receiver: crossbeam::channel::Receiver<algorithm::MotorForces>, socket: &mut WebSocket) {

    let acceleration = Coords { // Aceleración lineal.
        x: json["acceleration"]["x"].as_f64().unwrap_or(0.0),
        y: json["acceleration"]["y"].as_f64().unwrap_or(0.0),
        z: json["acceleration"]["z"].as_f64().unwrap_or(0.0),
    };

    let gyroscope = Coords { // Velocidad angular.
        x: json["gyro"]["x"].as_f64().unwrap_or(0.0),
        y: json["gyro"]["y"].as_f64().unwrap_or(0.0),
        z: json["gyro"]["z"].as_f64().unwrap_or(0.0),
    };

    let magnetometer = Coords {
        x: json["magnet"]["x"].as_f64().unwrap_or(0.0),
        y: json["magnet"]["y"].as_f64().unwrap_or(0.0),
        z: json["magnet"]["z"].as_f64().unwrap_or(0.0),
    };

    let container = CoordsContainer {
        acceleration,
        gyroscope,
        magnetometer,
    };

    sender.send(container).unwrap();
    let motors_forces = receiver.recv().unwrap(); // Recibe las fuerzas de los motores.
    let motors_forces_json = serde_json::json!({
        "m1": motors_forces.m1,
        "m2": motors_forces.m2,
        "m3": motors_forces.m3,
        "m4": motors_forces.m4,
    }).to_string();
    socket.send(Message::text(motors_forces_json)).await.unwrap();
    
}