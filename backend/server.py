from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import asyncio
import json
import time
import os
from typing import Dict, Any

# Import your planner
import Astar_planner


import threading
import socket

app = FastAPI(title="WebSocket Demo Server")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Device Discovery ---
UDP_BROADCAST_PORT = 50010
UDP_LISTEN_PORT = 50011
discovered_devices = {}  # device_id -> {info, last_seen, ip}

def udp_listener():
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
    sock.bind(("", UDP_BROADCAST_PORT))
    print(f"[SERVER] UDP listener started on port {UDP_BROADCAST_PORT}")
    while True:
        try:
            data, addr = sock.recvfrom(4096)
            msg = json.loads(data.decode())
            if msg.get("action") == "announce":
                device_id = msg.get("device_id")
                info = msg.get("info", "")
                listen_port = msg.get("listen_port", UDP_LISTEN_PORT)
                discovered_devices[device_id] = {
                    "info": info,
                    "last_seen": time.time(),
                    "ip": addr[0],
                    "status": "discovered",
                    "listen_port": listen_port,
                }
                print(f"[SERVER] Discovered device: {device_id} from {addr[0]}")
        except Exception as e:
            print(f"[SERVER] UDP listener error: {e}")

# Start UDP listener in background thread
udp_thread = threading.Thread(target=udp_listener, daemon=True)
udp_thread.start()


# --- NAVIGATION SETUP ---
# Load the grid map once on startup
MAP_FILE = "test_grid.txt" # Change to "data/grid.txt" when ready
NAV_GRID = None
POI_MAP = {
    "kitchen": (1, 1),
    "living_room": (4, 4),
    "garage": (0, 0)
}

try:
    if os.path.exists(MAP_FILE):
        NAV_GRID = Astar_planner.read_grid(MAP_FILE)
        print(f"Navigation: Loaded map from {MAP_FILE} ({len(NAV_GRID)}x{len(NAV_GRID[0])})")
    else:
        print(f"Navigation Warning: Map file {MAP_FILE} not found.")
except Exception as e:
    print(f"Navigation Error: Failed to load map: {e}")
# ------------------------

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
        notify_frontends = False
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
            if role == "pi":
                notify_frontends = True
                if device_id in discovered_devices:
                    discovered_devices[device_id]["connected_at"] = time.time()
                    discovered_devices[device_id]["status"] = "connected"
        if notify_frontends:
            await self.broadcast_to_frontends({
                "action": "device_connected",
                "device_id": device_id,
                "role": role,
                "ts": time.time()
            })

    async def disconnect(self, websocket: WebSocket):
        removed_devices: list[str] = []
        async with self.lock:
            self.unregistered.discard(websocket)
            for did, info in list(self.devices.items()):
                if info.get("ws") is websocket:
                    del self.devices[did]
                    removed_devices.append(did)
        for did in removed_devices:
            if did in discovered_devices:
                discovered_devices[did]["status"] = "discovered"
                discovered_devices[did]["last_seen"] = time.time()
            await self.broadcast_to_frontends({
                "action": "device_disconnected",
                "device_id": did,
                "ts": time.time()
            })

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

    async def disconnect_device(self, device_id: str, reason: str = "frontend_request") -> bool:
        async with self.lock:
            info = self.devices.get(device_id)
        if not info:
            return False
        ws = info["ws"]
        try:
            await ws.close(code=4001, reason=reason)
        except Exception:
            pass
        await self.disconnect(ws)
        return True

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



# List both discovered and connected devices
@app.get("/devices")
async def devices():
    connected = await manager.list_devices()
    # Merge discovered and connected
    all_devices = {}
    for d in discovered_devices:
        all_devices[d] = discovered_devices[d].copy()
        all_devices[d]["device_id"] = d
        all_devices[d]["connected"] = False
        all_devices[d]["available"] = bool(discovered_devices[d].get("ip"))
    for d in connected:
        did = d["device_id"]
        if did in all_devices:
            all_devices[did]["connected"] = True
            all_devices[did]["role"] = d["role"]
            all_devices[did]["meta"] = d["meta"]
            all_devices[did]["last_seen"] = d["last_seen"]
            all_devices[did]["emergency"] = d["emergency"]
            all_devices[did]["available"] = True
        else:
            all_devices[did] = {
                "info": d.get("meta", {}),
                "last_seen": d["last_seen"],
                "ip": None,
                "status": d["role"],
                "connected": True,
                "role": d["role"],
                "meta": d["meta"],
                "emergency": d["emergency"],
                "available": True
            }
    return {"devices": list(all_devices.values())}


# Connect API: trigger client to connect via UDP
@app.post("/connect_device")
async def connect_device(request: Request):
    body = await request.json()
    device_id = body.get("device_id")
    ws_url = body.get("ws_url", "ws://0.0.0.0:8000/ws")  # Default to local server
    print(f"[SERVER] /connect_device called for device_id={device_id}, ws_url={ws_url}")
    if not device_id or device_id not in discovered_devices:
        print(f"[SERVER] /connect_device error: device_id {device_id} not in discovered_devices {list(discovered_devices.keys())}")
        return {"status": "error", "message": "Device not found"}

    # Disconnect any other connected Pi devices before connecting this one
    current_devices = await manager.list_devices()
    for info in current_devices:
        if info["role"] == "pi" and info["device_id"] != device_id:
            print(f"[SERVER] Disconnecting {info['device_id']} before connecting {device_id}")
            await manager.disconnect_device(info["device_id"], reason="switch_device")

    # Send UDP connect command to device
    ip = discovered_devices[device_id]["ip"]
    port = discovered_devices[device_id].get("listen_port", UDP_LISTEN_PORT)
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    payload = json.dumps({
        "action": "connect",
        "device_id": device_id,
        "ws_url": ws_url
    }).encode()
    try:
        sock.sendto(payload, (ip, port))
        discovered_devices[device_id]["status"] = "connect_sent"
        discovered_devices[device_id]["last_connect"] = time.time()
        print(f"[SERVER] Sent connect command to {device_id} at {ip}:{port}")
        return {"status": "ok", "message": f"Connect command sent to {device_id}"}
    except Exception as e:
        print(f"[SERVER] Error sending connect command: {e}")
        return {"status": "error", "message": str(e)}


@app.post("/disconnect_device")
async def disconnect_device(request: Request):
    body = await request.json()
    device_id = body.get("device_id")
    print(f"[SERVER] /disconnect_device called for device_id={device_id}")
    if not device_id:
        return {"status": "error", "message": "device_id required"}
    disconnected = await manager.disconnect_device(device_id, reason="frontend_request")
    if disconnected:
        return {"status": "ok", "message": f"Disconnected {device_id}"}
    # If device already offline, treat as success for idempotency
    if device_id in discovered_devices:
        discovered_devices[device_id]["status"] = "discovered"
        discovered_devices[device_id]["last_seen"] = time.time()
    return {"status": "ok", "message": f"{device_id} already disconnected"}


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
                        # If payload has location/telemetry, it gets saved here
                        manager.devices[src]["meta"].update(payload)

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

            # Frontend microphone control messages -> route to target pi(s)
            if act in ["microphone_open", "microphone_close"] and role == "frontend":
                # Forward microphone control to target device (default: pi-01)
                target = packet.get("target") or payload.get("device_id") or "pi-01"
                envelope = {
                    "from": src,
                    "action": "control",
                    "type": act,
                    "payload": payload,
                    "ts": ts or time.time(),
                }
                ok = await manager.send_to_device(target, envelope)
                if not ok:
                    await manager.send_json({"error": "target offline", "target": target}, websocket)
                else:
                    await manager.send_json({"status": f"{act}_sent", "target": target}, websocket)
                continue

            # Frontend control messages -> route to target pi(s)
            elif act == "control" and role == "frontend":
                target = packet.get("target") or payload.get("target")
                envelope = {"from": src, "action": "control", "type": ptype, "payload": payload, "ts": ts}
                
                # EMERGENCY STOP - highest priority
                if ptype == "emergency_stop":
                    success_count, total_count = await manager.emergency_broadcast_to_pis(envelope)
                    await manager.send_json({
                        "status": "emergency_sent", 
                        "devices_reached": success_count, 
                        "total_devices": total_count,
                        "ts": time.time()
                    }, websocket)
                    await manager.broadcast_to_frontends({
                        "action": "emergency_broadcast",
                        "from": src,
                        "payload": {"sent_to": success_count, "total_devices": total_count},
                        "ts": time.time()
                    })
                    continue

                # --- NEW: HYBRID NAVIGATION HANDLER ---
                elif ptype == "request_route":
                    dest_raw = payload.get("destination")
                    target_device = target
                    
                    if not target_device or target_device not in manager.devices:
                        await manager.send_json({"error": "Target device not found or offline"}, websocket)
                        continue

                    # 1. Determine Start Position (from device telemetry)
                    device_meta = manager.devices[target_device]["meta"]
                    # Expecting device to report "location": [row, col] in its telemetry
                    start_pos = device_meta.get("location")
                    
                    # Fallback: if device hasn't reported location, check payload or default
                    if not start_pos:
                        start_pos = payload.get("start_location", (0, 0)) 

                    # 2. Determine Goal Position
                    goal_pos = None
                    if isinstance(dest_raw, str) and dest_raw.lower() in POI_MAP:
                        goal_pos = POI_MAP[dest_raw.lower()]
                    elif isinstance(dest_raw, list) and len(dest_raw) == 2:
                        goal_pos = tuple(dest_raw)
                    
                    if not goal_pos:
                         await manager.send_json({"error": f"Unknown destination: {dest_raw}"}, websocket)
                         continue

                    # 3. Calculate Path
                    if NAV_GRID:
                        try:
                            # Ensure inputs are integers for the planner
                            start_node = (int(start_pos[0]), int(start_pos[1]))
                            goal_node = (int(goal_pos[0]), int(goal_pos[1]))
                            
                            print(f"Planning route for {target_device}: {start_node} -> {goal_node}")
                            waypoints = Astar_planner.plan_with_headings(NAV_GRID, start_node, goal_node)
                            
                            if not waypoints:
                                await manager.send_json({"error": "No path found (blocked or invalid)"}, websocket)
                                continue

                            print(f"[SERVER] A* path length: {len(waypoints)}")
                            print(f"[SERVER] First waypoint: {waypoints[0] if waypoints else None}")
                            print(f"[SERVER] Last  waypoint: {waypoints[-1] if waypoints else None}")

                            # 4. Send Instructions to Pi (Execute)
                            route_command = {
                                "from": "server",
                                "action": "control",
                                "type": "execute_route",
                                "payload": {
                                    "waypoints": waypoints,
                                    "goal_name": str(dest_raw)
                                }
                            }
                            await manager.send_to_device(target_device, route_command)

                            # 5. Send Confirmation to Frontend (Visualize)
                            await manager.send_json({
                                "status": "route_calculated",
                                "target": target_device,
                                "payload": {
                                    "waypoints": waypoints,
                                    "start": start_node,
                                    "goal": goal_node
                                }
                            }, websocket)

                        except Exception as e:
                            print(f"Planning error: {e}")
                            await manager.send_json({"error": f"Planning failed: {str(e)}"}, websocket)
                    else:
                        await manager.send_json({"error": "Server has no map loaded"}, websocket)
                    continue
                # --------------------------------------

                # QUICK COMMAND - log and forward to target device
                elif ptype == "quick_command":
                    qc_text = (payload or {}).get("text", "")
                    print(f"[SERVER] quick_command from {src} -> target={target} text=\"{qc_text}\"")
                    if not qc_text:
                        await manager.send_json({"error": "missing quick_command text"}, websocket)
                        continue

                    if target == "all" or payload.get("broadcast", False):
                        await manager.broadcast_to_pis(envelope)
                        await manager.send_json({"status": "quick_command_sent", "target": "all", "text": qc_text}, websocket)
                    elif target:
                        ok = await manager.send_to_device(target, envelope)
                        if not ok:
                            await manager.send_json({"error": "target offline", "target": target}, websocket)
                        else:
                            await manager.send_json({"status": "quick_command_sent", "target": target, "text": qc_text}, websocket)
                    else:
                        await manager.send_json({"error": "missing target for quick_command"}, websocket)
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
