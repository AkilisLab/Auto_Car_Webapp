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
        # device_id -> {"ws": WebSocket, "role": str, "meta": dict, "last_seen": float, "emergency": bool}
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
                "emergency": False,
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

    async def emergency_broadcast_to_pis(self, payload: dict):
        """HIGH PRIORITY emergency broadcast - ensures all Pi devices get the message"""
        async with self.lock:
            pi_devices = [(did, info) for did, info in self.devices.items() if info.get("role") == "pi"]
            
        # Send to all Pi devices and track which ones receive it
        success_count = 0
        for device_id, info in pi_devices:
            try:
                await self.send_json(payload, info["ws"])
                # Mark device as in emergency state
                async with self.lock:
                    if device_id in self.devices:
                        self.devices[device_id]["emergency"] = True
                success_count += 1
            except Exception:
                await self.disconnect(info["ws"])
        
        return success_count, len(pi_devices)

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

    async def broadcast_json(self, payload: dict):
        # broadcast to all connected websockets
        async with self.lock:
            conns = [info["ws"] for info in self.devices.values()]
        for ws in conns:
            try:
                await self.send_json(payload, ws)
            except Exception:
                await self.disconnect(ws)

    async def list_devices(self):
        async with self.lock:
            return [
                {
                    "device_id": did, 
                    "role": info["role"], 
                    "meta": info["meta"], 
                    "last_seen": info["last_seen"],
                    "emergency": info.get("emergency", False)
                }
                for did, info in self.devices.items()
            ]

    async def clear_emergency_status(self, device_id: str = None):
        """Clear emergency status for specific device or all devices"""
        async with self.lock:
            if device_id:
                if device_id in self.devices:
                    self.devices[device_id]["emergency"] = False
            else:
                for info in self.devices.values():
                    info["emergency"] = False


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
    control_type = body.get("type", "manual_drive")
    
    envelope = {
        "from": "http-client",
        "action": "control", 
        "type": control_type,
        "payload": payload,
        "ts": time.time()
    }
    
    # Special handling for emergency stops
    if control_type == "emergency_stop":
        success_count, total_count = await manager.emergency_broadcast_to_pis(envelope)
        await manager.broadcast_to_frontends({
            "action": "emergency_broadcast",
            "payload": {"sent_to": success_count, "total_devices": total_count},
            "ts": time.time()
        })
        return {"status": "emergency_sent", "devices_reached": success_count, "total_devices": total_count}
    
    if target == "all":
        await manager.broadcast_to_pis(envelope)
    else:
        ok = await manager.send_to_device(target, envelope)
        if not ok:
            raise HTTPException(status_code=404, detail="target not found")
    return {"status": "sent", "target": target}


@app.post("/clear_emergency")
async def clear_emergency(request: Request):
    """Clear emergency status for all or specific devices"""
    body = await request.json()
    device_id = body.get("device_id")  # None = clear all
    await manager.clear_emergency_status(device_id)
    
    # Notify frontends
    await manager.broadcast_to_frontends({
        "action": "emergency_cleared",
        "device_id": device_id,
        "ts": time.time()
    })
    
    return {"status": "emergency_cleared", "device_id": device_id or "all"}


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
      - Emergency stops get highest priority routing to all Pi devices
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

            # Pi emergency acknowledgments -> forward to frontends and clear emergency status
            elif act == "telemetry" and ptype == "emergency_ack" and role == "pi":
                out = {"from": src, "action": "telemetry", "type": "emergency_ack", "payload": payload, "ts": ts}
                await manager.broadcast_to_frontends(out)
                # Clear emergency status for this device
                await manager.clear_emergency_status(src)
                continue

            # Pi emergency cleared acknowledgments -> forward to frontends
            elif act == "telemetry" and ptype == "emergency_cleared_ack" and role == "pi":
                out = {"from": src, "action": "telemetry", "type": "emergency_cleared_ack", "payload": payload, "ts": ts}
                await manager.broadcast_to_frontends(out)
                continue

            # Frontend control messages -> route to target pi(s)
            elif act == "control" and role == "frontend":
                target = packet.get("target") or payload.get("target")
                envelope = {"from": src, "action": "control", "type": ptype, "payload": payload, "ts": ts}
                
                # EMERGENCY STOP - highest priority, broadcast to ALL Pi devices
                if ptype == "emergency_stop":
                    success_count, total_count = await manager.emergency_broadcast_to_pis(envelope)
                    # Immediate feedback to frontend
                    await manager.send_json({
                        "status": "emergency_sent", 
                        "devices_reached": success_count, 
                        "total_devices": total_count,
                        "ts": time.time()
                    }, websocket)
                    # Notify all frontends about emergency broadcast
                    await manager.broadcast_to_frontends({
                        "action": "emergency_broadcast",
                        "from": src,
                        "payload": {"sent_to": success_count, "total_devices": total_count},
                        "ts": time.time()
                    })
                    continue
                
                # ROUTE CONTROL MESSAGES - route start/stop commands
                elif ptype in ["auto_route_start", "auto_route_stop"]:
                    if target == "all" or payload.get("broadcast", False):
                        await manager.broadcast_to_pis(envelope)
                        await manager.send_json({"status": "route_command_sent", "target": "all", "type": ptype}, websocket)
                    elif target:
                        ok = await manager.send_to_device(target, envelope)
                        if not ok:
                            await manager.send_json({"error": "target offline", "target": target}, websocket)
                        else:
                            await manager.send_json({"status": "route_command_sent", "target": target, "type": ptype}, websocket)
                    else:
                        await manager.send_json({"error": "missing target for route command"}, websocket)
                    continue
                
                # Regular control messages (manual drive, clear emergency, etc.)
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
