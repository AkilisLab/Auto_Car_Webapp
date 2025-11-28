# Car Webapp (React + Vite)

Frontend control UI for the Auto Car stack. Connects to the backend WebSocket server and exposes manual, auto, and audio control modes.

## Configure & Run
1) Optional: set backend WS URL (defaults to `ws://localhost:8000/ws` if not set)
```
echo "VITE_WS_URL=ws://127.0.0.1:8000/ws" > .env.local
```

2) Install deps and start dev server
```
npm install
npm run dev
```

Open http://localhost:5173.

## Audio Mode — Quick Commands
- Four preset buttons in `ControlPanel.jsx`:
	- "Hey AutoDrive, navigate home"
	- "Hey AutoDrive, set cruise control"
	- "Hey AutoDrive, find parking"
	- "Hey AutoDrive, emergency stop"
- Each click sends a `quick_command` packet to the backend targeting `pi-01`.
- The Pi client forwards the text to the AI server `/process/text` and returns `command_result` telemetry.
- Watch the browser console to see sent messages; the backend and client terminals will show logs.

## Pages/Components
- `pages/Dashboard.jsx` — primary control surface
- `components/ControlPanel.jsx` — control widgets & quick commands
- `components/CarPovStream.jsx` — camera view
- `components/VehicleStatus.jsx` — live telemetry

## Build
```
npm run build
npm run preview
```
