from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.middleware.cors import CORSMiddleware
import asyncio

app = FastAPI(title="WebSocket Demo Server")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []
        self.lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        async with self.lock:
            self.active_connections.append(websocket)

    async def disconnect(self, websocket: WebSocket):
        async with self.lock:
            if websocket in self.active_connections:
                self.active_connections.remove(websocket)

    async def send_personal_message(self, message: str, websocket: WebSocket):
        await websocket.send_text(message)

    async def broadcast(self, message: str):
        async with self.lock:
            conns = list(self.active_connections)
        for connection in conns:
            try:
                await connection.send_text(message)
            except Exception:
                # if send fails, remove the connection
                await self.disconnect(connection)


manager = ConnectionManager()


@app.get("/")
async def root():
    return {"message": "WebSocket server running"}


@app.post("/broadcast")
async def broadcast(request: Request):
    """Broadcast a JSON {"message": "..."} to all connected websockets."""
    payload = await request.json()
    message = payload.get("message", "")
    await manager.broadcast(message)
    return {"status": "ok", "sent": message}


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        await manager.send_personal_message("connected: welcome", websocket)
        while True:
            data = await websocket.receive_text()
            # simple behavior: echo back and also broadcast a small notice
            await manager.send_personal_message(f"Echo: {data}", websocket)
    except WebSocketDisconnect:
        await manager.disconnect(websocket)
    except Exception:
        # ensure disconnected on unexpected errors
        await manager.disconnect(websocket)
