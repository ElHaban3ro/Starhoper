pub mod websocket;
pub mod stabilization;

use crossbeam::channel;

use std::thread;

use crate::stabilization::algorithm;

#[tokio::main]
async fn main() {
    // Canal de comunicación entre hilos (emisor y receptor).
    let (sender_to_algorithm, receiver_from_algorithm) = channel::unbounded::<websocket::client::CoordsContainer>();
    let (sender_to_websockets, receiver_from_websockets) = channel::unbounded::<algorithm::MotorForces>();

    
    // Se instancia un hilo para el cliente WebSocket, recibe valores del IMU
    let websocket_api = tokio::spawn(async move {
        // Inicia el servidor WebSocket.
        websocket::client::start(sender_to_algorithm, receiver_from_websockets).await;
    });

    // Se instancia un hilo para escuchar las coordenadas.
    let listener_testing = thread::spawn(move || {
        stabilization::algorithm::start(receiver_from_algorithm, sender_to_websockets);
    });


    websocket_api.await.unwrap();
    listener_testing.join().unwrap();

}
