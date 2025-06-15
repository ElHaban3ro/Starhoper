import asyncio
from websockets.asyncio.server import serve
import websockets
import json
from maps import Coords, IMU
from modules.stabilization import Stabilization


class WebsocketServer:
    """A simple websockt server to read Unity data."""
    def __init__(self, host: str='0.0.0.0', port: int=3030):
        """Initialize the WebsocketServer."""
        self.host = host
        self.port = port
        self.websocket = None
        self.stabilization = Stabilization()

    async def connection_handler(self, websocket: websockets.ServerConnection):
        """Handle incoming WebSocket connections."""
        self.websocket = websocket
        self.websocket.remote_address
        print(f'New Client Connected From {self.websocket.remote_address}.')
        async for message in websocket:
            message = json.loads(message)
            imu_data = IMU(
                euler_angles=Coords(**message['eulerAngles']),
                acceleration=Coords(**message['acceleration']),
                angular_velocity=Coords(**message['gyro']),
                magnetic_field=Coords(**message['magnet'])
            )
            force = self.stabilization.update_orientation(imu_data)
            # print(f'Force: {force}\n')
            await websocket.send(json.dumps(force))

    async def main(self):
        """Start the WebSocket server."""
        async with serve(self.connection_handler, self.host, self.port) as server:
            print(f'Webscoket Server Started on ws://{self.host}:{self.port}')
            await server.serve_forever()

    async def run(self):
        """Run the WebSocket server."""
        await self.main()


ws_server = WebsocketServer()
if __name__ == "__main__":
    asyncio.run(ws_server.run())