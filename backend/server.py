from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import asyncio
import json
import time
from typing import Dict, Any

app = FastAPI(title="WebSocket Demo Server")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ConnectionManager:
    """
    Manage connections and route camera frames (telemetry) from pis -> frontends.
    """
    def __init__(self):
        # device_id -> {"ws": WebSocket, "role": str, "meta": dict, "last_seen": float}
        self.devices: Dict[str, Dict[str, Any]] = {}
        self.unregistered: set[WebSocket] = set()
        self.lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        async with self.lock:
            self.unregistered.add(websocket)

    async def register(self, websocket: WebSocket, device_id: str, role: str, meta: dict | None = None):
        async with self.lock:
            self.unregistered.discard(websocket)
            # remove any existing mapping for this websocket
            for did, info in list(self.devices.items()):
                if info.get("ws") is websocket:
                    del self.devices[did]
            self.devices[device_id] = {
                "ws": websocket,
                "role": role,
                "meta": meta or {},
                "last_seen": time.time(),
            }

    async def disconnect(self, websocket: WebSocket):
        async with self.lock:
            self.unregistered.discard(websocket)
            for did, info in list(self.devices.items()):
                if info.get("ws") is websocket:
                    del self.devices[did]

    async def send_json(self, payload: dict, websocket: WebSocket):
        await websocket.send_text(json.dumps(payload))

    async def broadcast_to_frontends(self, payload: dict):
        async with self.lock:
            conns = [info["ws"] for info in self.devices.values() if info.get("role") == "frontend"]
        for ws in conns:
            try:
                await self.send_json(payload, ws)
            except Exception:
                await self.disconnect(ws)

    async def broadcast_to_pis(self, payload: dict):
        async with self.lock:
            conns = [info["ws"] for info in self.devices.values() if info.get("role") == "pi"]
        for ws in conns:
            try:
                await self.send_json(payload, ws)
            except Exception:
                await self.disconnect(ws)

    async def broadcast_json(self, payload: dict):
        # broadcast to all connected websockets
        async with self.lock:
            conns = [info["ws"] for info in self.devices.values()]
        for ws in conns:
            try:
                await self.send_json(payload, ws)
            except Exception:
                await self.disconnect(ws)

    async def send_to_device(self, device_id: str, payload: dict) -> bool:
        async with self.lock:
            info = self.devices.get(device_id)
            if not info:
                return False
            ws = info["ws"]
        try:
            await self.send_json(payload, ws)
            return True
        except Exception:
            await self.disconnect(ws)
            return False

    async def list_devices(self):
        async with self.lock:
            return [
                {"device_id": did, "role": info["role"], "meta": info["meta"], "last_seen": info["last_seen"]}
                for did, info in self.devices.items()
            ]


manager = ConnectionManager()


@app.get("/")
async def root():
    return {"message": "WebSocket server running"}


@app.get("/devices")
async def devices():
    return {"devices": await manager.list_devices()}


@app.post("/control")
async def http_control(request: Request):
    """Send control commands via HTTP for testing"""
    body = await request.json()
    target = body.get("target", "all")
    payload = body.get("payload", {})
    envelope = {
        "from": "http-client",
        "action": "control", 
        "type": "manual_drive",
        "payload": payload,
        "ts": time.time()
    }
    if target == "all":
        await manager.broadcast_to_pis(envelope)
    else:
        ok = await manager.send_to_device(target, envelope)
        if not ok:
            raise HTTPException(status_code=404, detail="target not found")
    return {"status": "sent", "target": target}


@app.post("/broadcast")
async def broadcast(request: Request):
    """
    Accept arbitrary JSON and broadcast it to all connected websockets.
    Useful for quickly pushing camera frames via HTTP in tests.
    """
    payload = await request.json()
    await manager.broadcast_json(payload)
    return {"status": "ok", "sent": payload}


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """
    WebSocket expectations:
      - First message should be a handshake JSON:
          {"role":"pi"|"frontend", "device_id":"<id>", "action":"handshake", "payload":{...}}
      - Pi sends camera frames:
          {"role":"pi","device_id":"pi-01","action":"telemetry","type":"camera_frame",
            "payload":{"frame_b64":"...","width":...,"height":...,"encoding":"jpeg"}, "ts":...}
      - Frontend sends manual controls:
          {"role":"frontend","device_id":"web-1","action":"control","type":"manual_drive",
            "payload":{"speed":0.5,"angle":-0.2}, "target":"pi-01"}
      - Server forwards camera_frame telemetry to all frontends as JSON:
          {"from":"pi-01","action":"telemetry","type":"camera_frame","payload":{...},"ts":...}
    """
    await manager.connect(websocket)
    device_id = None
    role = "unknown"
    try:
        raw = await websocket.receive_text()
        try:
            msg = json.loads(raw)
        except Exception:
            # anonymous frontend fallback
            device_id = "frontend-unknown"
            role = "frontend"
            await manager.register(websocket, device_id=device_id, role=role, meta={})
        else:
            role = msg.get("role", "frontend")
            device_id = msg.get("device_id", f"{role}-unknown")
            meta = msg.get("payload", {})
            await manager.register(websocket, device_id=device_id, role=role, meta=meta)
            await manager.send_json({"status": "connected", "device_id": device_id, "role": role}, websocket)

        while True:
            text = await websocket.receive_text()
            try:
                packet = json.loads(text)
            except Exception:
                await manager.send_json({"error": "expected json"}, websocket)
                continue

            act = packet.get("action")
            ptype = packet.get("type")
            payload = packet.get("payload", {})
            ts = packet.get("ts")
            src = packet.get("device_id", device_id)

            # update last_seen/meta
            async with manager.lock:
                if src in manager.devices:
                    manager.devices[src]["last_seen"] = time.time()
                    if payload:
                        manager.devices[src]["meta"].update({"last_payload": payload})

            # Camera frames telemetry from Pi -> forward to frontends
            if act == "telemetry" and ptype == "camera_frame" and role == "pi":
                out = {"from": src, "action": "telemetry", "type": "camera_frame", "payload": payload, "ts": ts}
                await manager.broadcast_to_frontends(out)
                continue

            # Frontend control messages -> route to target pi(s)
            elif act == "control" and role == "frontend":
                target = packet.get("target") or payload.get("target")
                envelope = {"from": src, "action": "control", "type": ptype, "payload": payload, "ts": ts}
                if target == "all" or payload.get("broadcast", False):
                    await manager.broadcast_to_pis(envelope)
                    await manager.send_json({"status": "sent", "target": "all"}, websocket)
                elif target:
                    ok = await manager.send_to_device(target, envelope)
                    if not ok:
                        await manager.send_json({"error": "target offline", "target": target}, websocket)
                    else:
                        await manager.send_json({"status": "sent", "target": target}, websocket)
                else:
                    await manager.send_json({"error": "missing target for control message"}, websocket)
                continue

            # All other messages
            else:
                # forward other pi telemetry to frontends; echo frontend messages
                if role == "pi":
                    out = {"from": src, "action": act, "type": ptype, "payload": payload, "ts": ts}
                    await manager.broadcast_to_frontends(out)
                else:
                    await manager.send_json({"echo": packet}, websocket)

    except WebSocketDisconnect:
        await manager.disconnect(websocket)
    except Exception:
        await manager.disconnect(websocket)
