# Auto Car Webapp — End-to-End Guide

This project is a full local stack for a simulated autonomous car:
- Frontend (`car_webapp/`) — React + Vite control UI
- Backend (`backend/`) — FastAPI WebSocket server routing messages between frontend and Pi clients
- Pi Simulator (`backend/client.py`) — simulates a car device
- AI Server (`Auto_Car/Models/Audio_Interaction/ai_server.py`) — processes text/audio commands

## Prerequisites
- Python 3.11+
- Node.js 18+
- Optional: virtualenv for Python

## Run Order (4 terminals)
1) AI Server (port 8010)
```
cd /home/akilis/Documents/GitHub/Auto_Car/Models/Audio_Interaction
python3 -m uvicorn ai_server:app --host 0.0.0.0 --port 8010 --reload
```

2) Backend Server (port 8000)
```
cd /home/akilis/Documents/GitHub/Auto_Car_Webapp/backend
source backend_env/bin/activate  # or: python -m venv backend_env && source backend_env/bin/activate && pip install -r requirements.txt
uvicorn server:app --host 0.0.0.0 --port 8000
```

3) Pi Simulator Client
```
cd /home/akilis/Documents/GitHub/Auto_Car_Webapp/backend
source backend_env/bin/activate
# (optional) if AI server is remote: export AI_SERVER_URL=http://<ai_host>:8010
python3 client.py ws://127.0.0.1:8000/ws pi-01 5
```

4) Frontend (Vite dev server)
```
cd /home/akilis/Documents/GitHub/Auto_Car_Webapp/car_webapp
# optional: echo "VITE_WS_URL=ws://127.0.0.1:8000/ws" > .env.local
npm install
npm run dev
```

Open http://localhost:5173 and select modes from the dashboard.

## Quick Commands Flow
- UI (Audio mode → Quick Commands) sends `quick_command` to backend with the button text.
- Backend logs and forwards to the Pi client (`target: pi-01`).
- Pi client calls the AI Server `/process/text` and emits `telemetry: command_result` back.
- Backend broadcasts `command_result` to all frontends for display.

### Logs to expect
- Backend: `[SERVER] quick_command from <frontend> -> target=pi-01 text="..."`
- Client: `[CLIENT] quick_command received ...` then `[CLIENT] AI response: ...`
- AI Server: `[AI_SERVER] /process/text input="..." -> response="..."`

## Project Structure (high-level)
- `backend/server.py` — WebSocket hub, A* planner, control routing
- `backend/client.py` — Pi simulator (camera, status, navigation, quick commands)
- `car_webapp/src/components/ControlPanel.jsx` — Audio mode buttons and WS emits
- `Auto_Car/Models/Audio_Interaction/ai_server.py` — FastAPI text/audio endpoints

## Build/Deploy Frontend
- Build: `npm run build`
- Preview: `npm run preview`

Notes
- If ports conflict, change the AI server port in the run command and set `AI_SERVER_URL` for the client.
- Ensure `VITE_WS_URL` points to the backend’s `/ws` if your backend is on another host.
