# FastAPI WebSocket demo (desktop server + laptop client)

This small example shows how to run a FastAPI WebSocket server on one machine (desktop) and connect to it from another machine (laptop) on the same network.

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

Quick start (laptop/client)

1. Ensure Python and the same dependencies are installed (or reuse a venv).

2. Run the client and point it to the server's IP (replace X.X.X.X):

```bash
python client.py ws://X.X.X.X:8000/ws
```

Type messages and press ENTER to send. Incoming messages from the server will be printed.

Broadcast example (server-side send to all connected clients)

From any machine that can reach the server's HTTP port you can run:

```bash
python broadcast_client.py http://X.X.X.X:8000 "Hello from desktop"
```

Notes
- The server accepts all origins by default (CORS enabled for convenience). For production, restrict origins.
- The `/broadcast` route expects JSON `{"message": "..."}` and will forward the string to all connected websocket clients.

If you'd like, I can:
- Add an HTML demo page that connects from a browser.
- Add TLS support (recommended for untrusted networks).
- Add a small systemd service file or Dockerfile to run the server on boot.
