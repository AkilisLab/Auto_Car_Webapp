# Backend — FastAPI WebSocket Hub

Routes messages between frontends and Pi clients, and includes a simple A* grid planner.

Files
- `server.py` - FastAPI app exposing a `/ws` WebSocket endpoint and a POST `/broadcast` endpoint.
- `client.py` - Async WebSocket client that connects to the server and allows interactive messaging.
- `broadcast_client.py` - Small helper to POST a message to `/broadcast`.
- `requirements.txt` - Python dependencies.

Quick start (desktop/server)

1. Create & activate a virtualenv (optional but recommended):

```bash
python -m venv backend_env
source backend_env/bin/activate
```

2. Install dependencies:

```bash
pip install -r requirements.txt
```

3. Start the server (listen on all interfaces so other machines can connect):

```bash
uvicorn server:app --host 0.0.0.0 --port 8000
```

4. Find the desktop/server IP on the local network. On Linux:

```bash
hostname -I
```

Pi simulator client

1. Ensure Python and the same dependencies are installed (or reuse a venv).

2. Run the client and point it to the server's IP (replace X.X.X.X):

```bash
python client.py ws://X.X.X.X:8000/ws pi-01 5
```

Environment for AI server (optional):
```bash
export AI_SERVER_URL=http://<ai_host>:8010
```

Broadcast example (server-side send to all connected clients)

From any machine that can reach the server's HTTP port you can run:

```bash
python broadcast_client.py http://X.X.X.X:8000 "Hello from desktop"
```

Quick commands
- Frontend emits:
	```json
	{"role":"frontend","action":"control","type":"quick_command","target":"pi-01","payload":{"text":"Hey AutoDrive, navigate home"}}
	```
- Server logs and forwards to the target Pi. Ack back to the sending frontend:
	`{ "status": "quick_command_sent", "target": "pi-01", "text": "..." }`
- Pi posts to AI server `/process/text` and sends telemetry:
	`{ "action":"telemetry", "type":"command_result", "payload": {"input":"...","response":"...","error":null} }`
- Server broadcasts telemetry to all frontends.

Logs to expect
- `[SERVER] quick_command from <frontend> -> target=pi-01 text="..."`
- `[CLIENT] quick_command received from <src>: "..."`
- `[CLIENT] AI response: ...`

Notes
- CORS allows all origins for convenience; restrict in production.
- Planner expects `test_grid.txt` to be present; update `MAP_FILE` if needed.

If you'd like, I can:
- Add an HTML demo page that connects from a browser.
- Add TLS support (recommended for untrusted networks).
- Add a small systemd service file or Dockerfile to run the server on boot.
