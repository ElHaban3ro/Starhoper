"""Dashboard websocket + HTTP server.

- ws://localhost:3031 : bidirectional command/telemetry with browser.
- http://localhost:3032 : serves dashboard/ static assets.

The controller pushes telemetry snapshots via `broadcast_telemetry()`.
Browser commands (set_param, apply_profile, arm, etc.) are routed to the
supplied CommandHandler.
"""

from __future__ import annotations

import asyncio
import http
import json
from functools import partial
from pathlib import Path
from typing import Callable

from websockets.asyncio.server import serve as ws_serve

from modules.log_buffer import log_buffer


DASHBOARD_DIR = Path(__file__).resolve().parent.parent / "dashboard" / "dist"


class DashboardServer:
    def __init__(self, command_handler: Callable[[dict], dict | None]):
        self._clients: set = set()
        self._loop: asyncio.AbstractEventLoop | None = None
        self._handle = command_handler
        # Mirror log lines to every connected client.
        log_buffer.subscribe(self._on_log_line)

    # ---------- lifecycle ----------

    async def run(self, ws_port: int = 3031, http_port: int | None = 3032):
        self._loop = asyncio.get_running_loop()
        tasks = [asyncio.create_task(self._run_ws(ws_port))]
        if http_port is not None:
            tasks.append(asyncio.create_task(self._run_http(http_port)))
        else:
            print("Dashboard HTTP skipped (dev mode — served by Vite).")
        await asyncio.gather(*tasks)

    async def _run_ws(self, port: int):
        async with ws_serve(self._handler, "0.0.0.0", port):
            print(f'Dashboard WS started on ws://0.0.0.0:{port}')
            await asyncio.Future()  # run forever

    async def _run_http(self, port: int):
        server = await asyncio.start_server(self._http_handle, "0.0.0.0", port)
        print(f'Dashboard HTTP started on http://0.0.0.0:{port}')
        async with server:
            await server.serve_forever()

    # ---------- ws ----------

    async def _handler(self, websocket):
        self._clients.add(websocket)
        try:
            # Initial snapshot of log buffer for this client.
            for line in log_buffer.snapshot()[-50:]:
                await self._safe_send(websocket, {"type": "log", "line": line})
            async for raw in websocket:
                try:
                    msg = json.loads(raw)
                except Exception:
                    continue
                response = None
                try:
                    response = self._handle(msg)
                except Exception as e:
                    response = {"type": "error", "message": str(e)}
                if response is not None:
                    await self._safe_send(websocket, response)
        finally:
            self._clients.discard(websocket)

    def broadcast(self, payload: dict):
        """Fire-and-forget broadcast to every connected dashboard client.
        Safe to call from any thread."""
        if not self._clients or self._loop is None:
            return
        asyncio.run_coroutine_threadsafe(
            self._broadcast_async(payload), self._loop
        )

    async def _broadcast_async(self, payload: dict):
        data = json.dumps(payload, default=_json_default)
        stale = []
        for ws in list(self._clients):
            try:
                await ws.send(data)
            except Exception:
                stale.append(ws)
        for ws in stale:
            self._clients.discard(ws)

    async def _safe_send(self, ws, payload: dict):
        try:
            await ws.send(json.dumps(payload, default=_json_default))
        except Exception:
            self._clients.discard(ws)

    def _on_log_line(self, line: str):
        self.broadcast({"type": "log", "line": line})

    # ---------- http (static files) ----------

    async def _http_handle(self, reader: asyncio.StreamReader,
                           writer: asyncio.StreamWriter):
        try:
            request = await reader.readuntil(b"\r\n\r\n")
        except Exception:
            writer.close()
            return
        try:
            req_line = request.split(b"\r\n", 1)[0].decode("ascii", "replace")
            method, path, *_ = req_line.split(" ")
        except Exception:
            writer.close()
            return
        path = path.split("?", 1)[0]
        if path == "/":
            path = "/index.html"
        resolved = (DASHBOARD_DIR / path.lstrip("/")).resolve()
        if not str(resolved).startswith(str(DASHBOARD_DIR.resolve())) or not resolved.is_file():
            await _write_response(writer, 404, b"not found", "text/plain")
            return
        mime = _mime_for(resolved.suffix)
        body = resolved.read_bytes()
        await _write_response(writer, 200, body, mime)


def _mime_for(ext: str) -> str:
    return {
        ".html":  "text/html; charset=utf-8",
        ".css":   "text/css; charset=utf-8",
        ".js":    "application/javascript; charset=utf-8",
        ".mjs":   "application/javascript; charset=utf-8",
        ".json":  "application/json; charset=utf-8",
        ".png":   "image/png",
        ".jpg":   "image/jpeg",
        ".jpeg":  "image/jpeg",
        ".webp":  "image/webp",
        ".svg":   "image/svg+xml",
        ".ico":   "image/x-icon",
        ".woff":  "font/woff",
        ".woff2": "font/woff2",
        ".ttf":   "font/ttf",
        ".map":   "application/json; charset=utf-8",
        ".txt":   "text/plain; charset=utf-8",
    }.get(ext.lower(), "application/octet-stream")


async def _write_response(writer, status: int, body: bytes, mime: str):
    phrase = http.HTTPStatus(status).phrase
    headers = (
        f"HTTP/1.1 {status} {phrase}\r\n"
        f"Content-Type: {mime}\r\n"
        f"Content-Length: {len(body)}\r\n"
        f"Cache-Control: no-cache\r\n"
        f"Connection: close\r\n\r\n"
    ).encode("ascii")
    writer.write(headers + body)
    try:
        await writer.drain()
    finally:
        writer.close()


def _json_default(o):
    try:
        return float(o)
    except Exception:
        return str(o)
