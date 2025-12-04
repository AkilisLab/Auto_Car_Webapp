import React, { useRef, useState, useEffect } from "react";
import Card from "./ui/card";
import Button from "./ui/button";
import Slider from "./ui/slider";
import Input from "./ui/input";
import Badge from "./ui/badge";

function Joystick({ size = 160, onChange, axis = "vertical", label, valueDisplay, disabled = false }) {
  const boxRef = useRef();
  const knobRef = useRef();
  const [pos, setPos] = useState({ x: 0, y: 0 });

  function clamp(v, a, b) {
    return Math.min(Math.max(v, a), b);
  }

  function pointerMove(e) {
    if (disabled) return;
    
    const rect = boxRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const dx = clientX - cx;
    const dy = clientY - cy;
    const r = rect.width / 2 - 18;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const ratio = distance > r ? r / distance : 1;
    const nx = dx * ratio;
    const ny = dy * ratio;
    setPos({ x: nx, y: ny });

    const normX = clamp(nx / r, -1, 1);
    const normY = clamp(-ny / r, -1, 1); // invert Y so up is positive
    if (axis === "vertical") {
      onChange && onChange({ value: normY });
    } else if (axis === "horizontal") {
      onChange && onChange({ value: normX });
    } else {
      onChange && onChange({ x: normX, y: normY });
    }
  }

  function startDrag(e) {
    if (disabled) return;
    
    e.preventDefault();
    const move = (ev) => pointerMove(ev);
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setPos({ x: 0, y: 0 });
      onChange && onChange({ value: 0 });
    };
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up, { once: true });
  }

  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ color: disabled ? "#666" : "#c9d6e6", fontWeight: 700, marginBottom: 8 }}>{label}</div>
      <div
        ref={boxRef}
        onPointerDown={startDrag}
        onTouchStart={startDrag}
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          border: `2px solid ${disabled ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.06)"}`,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          background: disabled 
            ? "radial-gradient(closest-side, rgba(0,0,0,0.3), rgba(0,0,0,0.6))"
            : "radial-gradient(closest-side, rgba(255,255,255,0.01), rgba(0,0,0,0.4))",
          opacity: disabled ? 0.4 : 1,
          cursor: disabled ? "not-allowed" : "grab",
        }}
        aria-label={`${label} joystick ${disabled ? "(disabled)" : ""}`}
      >
        <div
          style={{
            position: "absolute",
            width: size - 36,
            height: size - 36,
            borderRadius: "50%",
            border: `1px solid ${disabled ? "rgba(255,255,255,0.01)" : "rgba(255,255,255,0.03)"}`,
          }}
        />
        <div
          ref={knobRef}
          style={{
            transform: `translate(${pos.x}px, ${pos.y}px)`,
            transition: "transform 0.06s linear",
            width: 28,
            height: 28,
            borderRadius: 999,
            background: disabled 
              ? "linear-gradient(180deg, #444, #333)"
              : axis === "vertical" 
                ? "linear-gradient(180deg,#2f9bff,#3be1d0)" 
                : "linear-gradient(180deg,#2be1a6,#33c5ff)",
            boxShadow: disabled 
              ? "0 2px 6px rgba(0,0,0,0.3)"
              : "0 6px 18px rgba(0,0,0,0.5), 0 0 10px rgba(0,0,0,0.15) inset",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: disabled ? "not-allowed" : "grab",
          }}
        />
      </div>
      <div style={{ marginTop: 10, color: disabled ? "#666" : "#9fb0c2", fontSize: 13 }}>{valueDisplay}</div>
      {disabled && (
        <div style={{ marginTop: 4, color: "#ff6b6b", fontSize: 12, fontWeight: 600 }}>
          🚨 EMERGENCY MODE
        </div>
      )}
    </div>
  );
}

function QuickCommandButton({ children, onClick }) {
  const [pressed, setPressed] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      onMouseLeave={() => setPressed(false)}
      onTouchStart={() => setPressed(true)}
      onTouchEnd={() => setPressed(false)}
      style={{
        width: "100%",
        textAlign: "left",
        padding: "12px 14px",
        borderRadius: 6,
        border: "1px solid rgba(255,255,255,0.03)",
        background: pressed ? "rgba(255,255,255,0.02)" : "transparent",
        color: "#9fb0c2",
        transform: pressed ? "translateY(1px) scale(0.997)" : "none",
        transition: "transform 120ms ease, background 120ms ease",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

export default function ControlPanel({ mode = "manual", vehicleStatus = {}, onStatusUpdate }) {
  const [accel, setAccel] = useState(0);
  const [steer, setSteer] = useState(0);
  const [temp, setTemp] = useState(vehicleStatus.temperature || 72);
  const [route, setRoute] = useState("");
  const [routeActive, setRouteActive] = useState(false);
  const [voiceActive, setVoiceActive] = useState(false);
  // --- Microphone control logic ---
  const deviceId = "pi-01";
  const sendMicrophoneEvent = (eventType) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      const msg = {
        action: eventType,
        payload: { device_id: deviceId },
      };
      console.log(`[VOICE] Sending ${eventType}:`, msg);
      ws.send(JSON.stringify(msg));
    } else {
      console.log(`[VOICE] WebSocket not ready for ${eventType}`);
    }
  };
  const [ws, setWs] = useState(null);
  const [emergencyStatus, setEmergencyStatus] = useState({
    active: false,
    devicesReached: 0,
    totalDevices: 0,
    ackReceived: [],
    timestamp: null
  });

  // Add route status state
  const [routeStatus, setRouteStatus] = useState({
    status: "idle", // "idle" | "planning" | "navigating" | "arrived" | "error"
    destination: "",
    current_lat: 0,
    current_lng: 0,
    distance_remaining: 0,
    eta_minutes: 0,
    next_instruction: "",
    route_progress: 0,
    current_speed: 0,
    speed_limit: 35
  });

  // Add route settings state
  const [routeSettings, setRouteSettings] = useState({
    route_type: "fastest", // "fastest" | "eco" | "safe"
    max_speed: 35,
    following_distance: "safe" // "close" | "safe" | "far"
  });

  // --- NEW: helper to send planner request to backend ---
  const sendRouteRequest = React.useCallback(
    ({ start, goal, destinationText }) => {
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      if (!start || !goal) return;

      const msg = {
        role: "frontend",
        device_id: "control-panel",
        action: "control",
        type: "request_route",
        target: "pi-01", // keep this as your current target
        payload: {
          // The backend handler in server.py will look at "destination"
          // and optional "start_location"
          destination: goal,          // [row, col]
          start_location: start,      // [row, col]
          destination_text: destinationText || "",
        },
        ts: Date.now() / 1000,
      };
      console.log("Sending route request:", msg);
      ws.send(JSON.stringify(msg));
    },
    [ws]
  );
  // ------------------------------------------------------

  // WebSocket connection setup
  useEffect(() => {
    const wsUrl = import.meta.env.VITE_WS_URL || "ws://localhost:8000/ws";
    const websocket = new WebSocket(wsUrl);

    websocket.addEventListener("open", () => {
      console.log("ControlPanel WebSocket connected");
      const hs = { 
        role: "frontend", 
        device_id: `control-${Math.floor(Math.random()*10000)}`, 
        action: "handshake", 
        payload: {} 
      };
      websocket.send(JSON.stringify(hs));
      setWs(websocket);
    });

    websocket.addEventListener("message", (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        console.log("ControlPanel received:", msg);
        
        // Handle emergency responses
        if (msg.status === "emergency_sent") {
          setEmergencyStatus(prev => ({
            ...prev,
            active: true,
            devicesReached: msg.devices_reached,
            totalDevices: msg.total_devices,
            timestamp: Date.now()
          }));
        }
        
        // Handle emergency acknowledgments from Pi devices
        if (msg.action === "telemetry" && msg.type === "emergency_ack") {
          setEmergencyStatus(prev => ({
            ...prev,
            ackReceived: [...prev.ackReceived, msg.from]
          }));
          console.log(`Emergency acknowledged by ${msg.from}:`, msg.payload);
        }
        
        // Handle control acknowledgments
        if (msg.action === "telemetry" && msg.type === "control_ack") {
          console.log("Control acknowledged by Pi:", msg.payload);
          if (msg.payload.emergency_active) {
            setEmergencyStatus(prev => ({...prev, active: true}));
          }
        }
        
        // Handle emergency cleared notifications
        if (msg.action === "emergency_cleared") {
          setEmergencyStatus({
            active: false,
            devicesReached: 0,
            totalDevices: 0,
            ackReceived: [],
            timestamp: null
          });
          console.log("Emergency status cleared");
        }
        
        // Handle emergency cleared acknowledgments from Pi devices
        if (msg.action === "telemetry" && msg.type === "emergency_cleared_ack") {
          setEmergencyStatus(prev => ({
            ...prev,
            active: false,
            ackReceived: [],
            devicesReached: 0,
            totalDevices: 0,
            timestamp: null
          }));
          console.log(`Emergency cleared and acknowledged by ${msg.from}:`, msg.payload);
        }

        // Handle route status updates from Pi
        if (msg.action === "telemetry" && msg.type === "route_status") {
          setRouteStatus(msg.payload);
          // Update routeActive based on Pi status, not just "navigating"
          setRouteActive(msg.payload.status === "navigating" || msg.payload.status === "planning");
          console.log("Route status update:", msg.payload);
        }

        // Handle route acknowledgments
        if (msg.action === "telemetry" && msg.type === "route_ack") {
          console.log("Route command acknowledged:", msg.payload);
          
          // Handle different route acknowledgment statuses
          if (msg.payload.status === "route_stopped") {
            // Ensure UI resets when route is stopped
            setRouteActive(false);
            setRouteStatus(prev => ({
              ...prev,
              status: "idle",
              destination: "",
              distance_remaining: 0,
              eta_minutes: 0,
              next_instruction: "",
              route_progress: 0,
              current_speed: 0
            }));
          } else if (msg.payload.status === "route_started") {
            setRouteActive(true);
          }
        }
        
      } catch (e) {
        // ignore malformed messages
      }
    });

    websocket.addEventListener("close", () => {
      console.log("ControlPanel WebSocket disconnected");
      setWs(null);
    });

    return () => {
      websocket.close();
    };
  }, []);

  // Send control messages when joystick values change (BLOCKED during auto & emergency)
  useEffect(() => {
    if (
      ws &&
      ws.readyState === WebSocket.OPEN &&
      mode === "manual" &&
      !emergencyStatus.active
    ) {
      const controlMsg = {
        role: "frontend",
        device_id: "control-panel",
        action: "control",
        type: "manual_drive",
        target: "pi-01", // TODO: make this configurable
        payload: {
          speed: accel,
          angle: steer,
        },
        ts: Date.now() / 1000,
      };
      ws.send(JSON.stringify(controlMsg));
    }
  }, [accel, steer, ws, mode, emergencyStatus.active]);

  // --- NEW: wrapper around onStatusUpdate to hook auto_route_request ---
  const handleStatusUpdate = React.useCallback(
    (nextStatus) => {
      // If auto mode requested a route (from AutoControls or similar),
      // immediately trigger planner request to backend.
      if (
        mode === "auto" &&
        nextStatus?.auto_route_request &&
        nextStatus.auto_route_request.start &&
        nextStatus.auto_route_request.goal
      ) {
        const { start, goal } = nextStatus.auto_route_request;
        const destinationText = nextStatus.destination || "";
        sendRouteRequest({ start, goal, destinationText });

        // Mark route as "planning" locally
        setRouteActive(true);
        setRouteStatus((prev) => ({
          ...prev,
          status: "planning",
          destination: destinationText,
        }));
      }

      // Forward to parent Dashboard / vehicleStatus state
      onStatusUpdate && onStatusUpdate(nextStatus);
    },
    [mode, onStatusUpdate, sendRouteRequest]
  );
  // ---------------------------------------------------------------

  // NOTE: replace direct uses of onStatusUpdate in this file with handleStatusUpdate
  useEffect(() => {
    handleStatusUpdate({ ...vehicleStatus, temperature: temp });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [temp]);

  // send pwm & accel/steer updates merged into vehicleStatus whenever accel or steer changes
  useEffect(() => {
    const pwm = emergencyStatus.active ? 0 : Math.round(Math.abs(accel) * 255);
    handleStatusUpdate({
      ...vehicleStatus,
      acceleration: emergencyStatus.active ? 0 : accel,
      steering: emergencyStatus.active ? 0 : steer,
      pwm,
      emergency: emergencyStatus.active,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accel, steer, emergencyStatus.active]);

  function handleEmergency() {
    // Send emergency stop via WebSocket
    if (ws && ws.readyState === WebSocket.OPEN) {
      const emergencyMsg = {
        role: "frontend",
        device_id: "control-panel",
        action: "control",
        type: "emergency_stop",
        target: "all", // send to all Pi devices
        payload: {
          reason: "user_button",
          source: "control_panel"
        },
        ts: Date.now() / 1000
      };
      ws.send(JSON.stringify(emergencyMsg));
    }

    // Immediate local feedback
    setAccel(0);
    setSteer(0);
    setRouteActive(false);
    setEmergencyStatus(prev => ({
      ...prev,
      active: true,
      timestamp: Date.now()
    }));
    
    handleStatusUpdate({
      ...vehicleStatus,
      emergency: true,
      speed: 0,
      acceleration: 0,
      steering: 0,
      pwm: 0,
    });
    
    // Visual feedback
    document.body.style.backgroundColor = "#2b0505";
    setTimeout(() => (document.body.style.backgroundColor = ""), 500);
  }

  function handleClearEmergency() {
    if (ws && ws.readyState === WebSocket.OPEN) {
      const clearMsg = {
        role: "frontend",
        device_id: "control-panel",
        action: "control",
        type: "clear_emergency",
        target: "all",
        payload: {},
        ts: Date.now() / 1000
      };
      ws.send(JSON.stringify(clearMsg));
    }
  }

  // Route control functions
  function parseCoordinateRoute(input) {
    // Expected format: "r1,c1 -> r2,c2"
    if (!input) return null;
    const parts = input.split("->");
    if (parts.length !== 2) return null;

    const startRaw = parts[0].trim();
    const goalRaw = parts[1].trim();

    const startParts = startRaw.split(",").map((s) => s.trim());
    const goalParts = goalRaw.split(",").map((s) => s.trim());
    if (startParts.length !== 2 || goalParts.length !== 2) return null;

    const sr = Number(startParts[0]);
    const sc = Number(startParts[1]);
    const gr = Number(goalParts[0]);
    const gc = Number(goalParts[1]);

    if (
      Number.isNaN(sr) ||
      Number.isNaN(sc) ||
      Number.isNaN(gr) ||
      Number.isNaN(gc)
    ) {
      return null;
    }

    return {
      start: [sr, sc],
      goal: [gr, gc],
    };
  }

  function handleStartRoute() {
    if (!route || emergencyStatus.active) return;

    const parsed = parseCoordinateRoute(route);
    if (!parsed) {
      console.warn(
        'Invalid route format. Use "row1,col1 -> row2,col2", e.g. "1,1 -> 4,4".'
      );
      return;
    }

    // Use the same planner request path as AutoControls
    sendRouteRequest({
      start: parsed.start,
      goal: parsed.goal,
      destinationText: route,
    });

    // Mark route as planning locally
    setRouteActive(true);
    setRouteStatus((prev) => ({
      ...prev,
      status: "planning",
      destination: route,
    }));
  }

  function handleStopRoute() {
    if (ws && ws.readyState === WebSocket.OPEN) {
      const stopMsg = {
        role: "frontend",
        device_id: "control-panel",
        action: "control",
        type: "auto_route_stop",
        target: "pi-01",
        payload: {
          reason: "user_request"
        },
        ts: Date.now() / 1000
      };
      ws.send(JSON.stringify(stopMsg));
      
      // Immediately reset local state - don't wait for Pi response
      setRouteActive(false);
      setRouteStatus(prev => ({
        ...prev,
        status: "idle",
        destination: "",
        distance_remaining: 0,
        eta_minutes: 0,
        next_instruction: "",
        route_progress: 0,
        current_speed: 0
      }));
      
      console.log("Sent route stop command:", stopMsg);
    }
  }

  // Move emergency status display outside mode-specific sections
  const EmergencyStatusDisplay = () => {
    if (!emergencyStatus.active) return null;
    
    return (
      <div style={{ 
        marginTop: 16, 
        padding: 12, 
        borderRadius: 8, 
        background: "linear-gradient(180deg, rgba(255,0,0,0.1), rgba(139,0,0,0.05))", 
        border: "1px solid rgba(255,0,0,0.2)" 
      }}>
        <div style={{ color: "#ff6b6b", fontWeight: 700, marginBottom: 4 }}>
          🚨 EMERGENCY MODE ACTIVE
        </div>
        <div style={{ color: "#ff9999", fontSize: 13, marginBottom: 8 }}>
          {mode === "manual" && "Manual controls disabled • "}
          {mode === "auto" && "Autonomous navigation stopped • "}
          {mode === "audio" && "Voice commands disabled • "}
          {emergencyStatus.ackReceived.length}/{emergencyStatus.devicesReached} devices acknowledged
        </div>
        <Button
          onClick={handleClearEmergency}
          style={{ 
            background: "#2d8f2d", 
            color: "#fff", 
            fontSize: 13,
            padding: "6px 12px",
            height: "auto"
          }}
        >
          Clear Emergency
        </Button>
      </div>
    );
  };

  // build mode-specific inner content, then render a single Card that includes the shared emergency button
  let inner = null;

  if (mode === "audio") {
    const quickCommands = [
      "Hey AutoDrive, navigate home",
      "Hey AutoDrive, play shape of you",
      "Hey AutoDrive, find parking",
      "Hey AutoDrive, emergency stop",
    ];

    inner = (
      <>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 18, color: "#e6eef8" }}>Voice Control</div>
            <div style={{ color: "#9fb0c2", fontSize: 13 }}>Hands-free operation</div>
          </div>
          <div><Badge variant="muted" size="sm">{voiceActive && !emergencyStatus.active ? "Active" : "Standby"}</Badge></div>
        </div>

        <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
          <Button
            onClick={() => {
              setVoiceActive(true);
              sendMicrophoneEvent("microphone_open");
            }}
            disabled={emergencyStatus.active}
            style={{ 
              background: emergencyStatus.active ? "#666" : "#14a354", 
              flex: 1, 
              height: 52, 
              fontWeight: 700,
              opacity: emergencyStatus.active ? 0.5 : 1 
            }}
            aria-label="Talk"
          >
            {emergencyStatus.active ? "Disabled" : "Talk"}
          </Button>

          <Button
            onClick={() => {
              setVoiceActive(false);
              sendMicrophoneEvent("microphone_close");
            }}
            style={{ background: "#c62828", color: "#fff", flex: 1, height: 52, fontWeight: 700 }}
            aria-label="Mute"
          >
            Mute
          </Button>
        </div>

        <div style={{ marginTop: emergencyStatus.active ? 16 : 8 }}>
          <div style={{ fontWeight: 700, color: "#cfe8ff", marginBottom: 8 }}>Quick Commands</div>

          <div style={{ display: "grid", gap: 8 }}>
            {quickCommands.map((q) => (
              <QuickCommandButton
                key={q}
                onClick={() => {
                  if (!emergencyStatus.active) {
                    console.log("Quick command:", q);
                    setVoiceActive(true);
                    // Send quick command over WS to backend -> client
                    if (ws && ws.readyState === WebSocket.OPEN) {
                      const msg = {
                        role: "frontend",
                        device_id: "control-panel",
                        action: "control",
                        type: "quick_command",
                        target: "pi-01",
                        payload: { text: q, device_id: "pi-01" },
                        ts: Date.now() / 1000,
                      };
                      console.log("Sending quick_command:", msg);
                      ws.send(JSON.stringify(msg));
                    } else {
                      console.warn("WebSocket not connected; cannot send quick_command");
                    }
                  }
                }}
              >
                <span style={{ opacity: emergencyStatus.active ? 0.5 : 1 }}>
                  {q}
                </span>
              </QuickCommandButton>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 700, color: "#cfe8ff", marginBottom: 6 }}>Voice Settings</div>
          <div style={{ 
            borderRadius: 8, 
            padding: 12, 
            background: "linear-gradient(180deg, rgba(255,255,255,0.01), rgba(0,0,0,0.02))", 
            border: "1px solid rgba(255,255,255,0.03)",
            opacity: emergencyStatus.active ? 0.5 : 1
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", color: "#9fb0c2", fontSize: 13 }}>
              <div>Wake Word</div><div>"Hey AutoDrive"</div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", color: "#9fb0c2", fontSize: 13 }}>
              <div>Language</div><div>English (US)</div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", color: "#9fb0c2", fontSize: 13 }}>
              <div>Sensitivity</div><div>High</div>
            </div>
          </div>
        </div>

        {/* Emergency Status Display */}
        <EmergencyStatusDisplay />
      </>
    );
  } else if (mode === "auto") {
    inner = (
      <>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 18, color: "#e6eef8" }}>Autonomous Mode</div>
            <div style={{ color: "#9fb0c2", fontSize: 13 }}>AI-powered navigation</div>
          </div>
          <div>
            <Badge variant="success" size="sm">
              {emergencyStatus.active ? "Emergency" : routeStatus.status === "navigating" ? "Navigating" : routeStatus.status === "planning" ? "Planning" : "Standby"}
            </Badge>
          </div>
        </div>

        {/* Route Status Display */}
        <div style={{ 
          border: "1px solid rgba(255,255,255,0.03)", 
          borderRadius: 8, 
          padding: 12, 
          marginBottom: 12,
          opacity: emergencyStatus.active ? 0.5 : 1
        }}>
          <div style={{ color: "#9fb0c2", marginBottom: 6 }}>
            Navigating to: <strong style={{ color: "#e6eef8" }}>
              {emergencyStatus.active ? "STOPPED" : routeStatus.destination || route || "—"}
            </strong>
          </div>
          <div style={{ color: "#9fb0c2", marginBottom: 4 }}>
            ETA: {emergencyStatus.active ? "—" : routeStatus.eta_minutes > 0 ? `${routeStatus.eta_minutes} minutes` : "—"}
          </div>
          {routeStatus.status === "navigating" && (
            <>
              <div style={{ color: "#9fb0c2", marginBottom: 6, fontSize: 13 }}>
                Distance: {routeStatus.distance_remaining.toFixed(1)} miles • Speed: {routeStatus.current_speed} mph
              </div>
              {routeStatus.next_instruction && (
                <div style={{ color: "#6ee7b7", fontSize: 13, fontWeight: 600 }}>
                  📍 {routeStatus.next_instruction}
                </div>
              )}
              {/* Progress Bar */}
              <div style={{ marginTop: 8, background: "rgba(255,255,255,0.1)", borderRadius: 4, height: 4 }}>
                <div style={{ 
                  background: "linear-gradient(90deg, #6ee7b7, #3be1d0)", 
                  borderRadius: 4, 
                  height: 4, 
                  width: `${routeStatus.route_progress * 100}%`,
                  transition: "width 1s ease"
                }} />
              </div>
            </>
          )}
        </div>

        <EmergencyStatusDisplay />

        <div style={{ marginBottom: 12, marginTop: emergencyStatus.active ? 16 : 0 }}>
          <div style={{ fontWeight: 700, color: "#cfe8ff", marginBottom: 6 }}>Destination</div>
          <Input 
            value={route} 
            onChange={(e) => setRoute(e.target.value)} 
            placeholder="Enter destination (e.g., 123 Main St, City)"
            disabled={emergencyStatus.active || routeActive}
            style={{ opacity: emergencyStatus.active || routeActive ? 0.5 : 1 }}
          />
        </div>

        <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
          <Button
            onClick={handleStartRoute}
            disabled={emergencyStatus.active || !route || routeActive}
            style={{ 
              background: emergencyStatus.active ? "#666" : routeActive ? "#666" : "#1f57d8",
              opacity: (emergencyStatus.active || routeActive) ? 0.5 : 1
            }}
          >
            {emergencyStatus.active ? "Disabled" : routeActive ? "Navigating" : "Start Route"}
          </Button>
          <Button
            onClick={handleStopRoute}
            disabled={!routeActive}
            variant="ghost"
            style={{ opacity: !routeActive ? 0.5 : 1 }}
          >
            Stop Route
          </Button>
        </div>

        {/* Route Settings */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 6 }}>
          <div style={{ 
            border: "1px solid rgba(255,255,255,0.03)", 
            padding: 12, 
            borderRadius: 8, 
            textAlign: "center",
            opacity: emergencyStatus.active ? 0.5 : 1
          }}>
            <div style={{ color: emergencyStatus.active ? "#999" : "#6ee7b7", fontWeight: 700 }}>
              {emergencyStatus.active ? "Disabled" : routeSettings.route_type === "eco" ? "Eco" : routeSettings.route_type === "safe" ? "Safe" : "Fast"}
            </div>
            <div style={{ color: "#9fb0c2", fontSize: 13 }}>Driving Mode</div>
          </div>
          <div style={{ 
            border: "1px solid rgba(255,255,255,0.03)", 
            padding: 12, 
            borderRadius: 8, 
            textAlign: "center",
            opacity: emergencyStatus.active ? 0.5 : 1
          }}>
            <div style={{ color: emergencyStatus.active ? "#999" : "#9ed0ff", fontWeight: 700 }}>
              {emergencyStatus.active ? "Disabled" : routeSettings.following_distance === "close" ? "Close" : routeSettings.following_distance === "far" ? "Far" : "Safe"}
            </div>
            <div style={{ color: "#9fb0c2", fontSize: 13 }}>Following Distance</div>
          </div>
        </div>

        <div style={{ 
          marginTop: 12, 
          borderRadius: 8, 
          padding: 12, 
          background: "linear-gradient(180deg, rgba(255,255,255,0.01), rgba(0,0,0,0.02))", 
          border: emergencyStatus.active ? "1px solid rgba(255,0,0,0.2)" : "1px solid rgba(255,80,0,0.06)" 
        }}>
          <div style={{ color: emergencyStatus.active ? "#ff6b6b" : "#ffb997" }}>
            {emergencyStatus.active 
              ? "🚨 Emergency stop activated - autonomous navigation disabled" 
              : routeStatus.status === "navigating" 
                ? "🤖 Autonomous navigation active - monitoring route progress"
                : "⚠ Keep hands near steering wheel for safety"}
          </div>
        </div>
      </>
    );
  } else {
    // manual mode
    inner = (
      <>
        <div style={{ display: "flex", gap: 28, alignItems: "flex-start", justifyContent: "center", flexWrap: "wrap" }}>
          <Joystick
            axis="vertical"
            label="Acceleration"
            disabled={emergencyStatus.active}
            onChange={({ value }) => {
              if (!emergencyStatus.active) {
                setAccel(value);
              }
            }}
            valueDisplay={`${Math.round(accel * 100)}%`}
          />

          <Joystick
            axis="horizontal"
            label="Steering"
            disabled={emergencyStatus.active}
            onChange={({ value }) => {
              if (!emergencyStatus.active) {
                setSteer(value);
                handleStatusUpdate({ ...vehicleStatus, steering: value });
              }
            }}
            valueDisplay={`${Math.round(steer * 45)}°`}
          />
        </div>

        {/* Emergency Status Display */}
        <EmergencyStatusDisplay />

        <div style={{ marginTop: emergencyStatus.active ? 16 : 26 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ fontWeight: 700, color: "#e6eef8" }}>Climate Control</div>
            <div style={{ color: "#9fb0c2", fontSize: 13 }}>Adjust interior air conditioning and heating</div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 10 }}>
            <div style={{ flex: 1 }}>
              <Slider 
                min={60} 
                max={85} 
                step={1} 
                value={Math.round(temp)} 
                onChange={(e) => setTemp(Number(e.target.value))}
                disabled={emergencyStatus.active}
                style={{ opacity: emergencyStatus.active ? 0.5 : 1 }}
              />
              <div style={{ display: "flex", justifyContent: "space-between", color: "#9fb0c2", fontSize: 12, marginTop: 6 }}>
                <span>Cool (60°)</span>
                <span>Warm (85°)</span>
              </div>
            </div>
            <div style={{ width: 64, textAlign: "right", fontWeight: 700, color: "#e6eef8" }}>{Math.round(temp)}°F</div>
          </div>
        </div>
      </>
    );
  }

  return (
    <Card className="control-panel" shadow>
      {inner}

      {/* Enhanced Emergency Stop Button - Works in ALL modes */}
      <div style={{ marginTop: 22, display: "flex", justifyContent: "center" }}>
        <Button
          onClick={handleEmergency}
          disabled={emergencyStatus.active}
          style={{ 
            background: emergencyStatus.active ? "#8b0000" : "#c62828", 
            borderColor: "rgba(0,0,0,0.25)", 
            boxShadow: emergencyStatus.active 
              ? "0 4px 12px rgba(139,0,0,0.3)" 
              : "0 8px 20px rgba(198,40,40,0.18)", 
            minWidth: 220, 
            padding: "12px 20px",
            opacity: emergencyStatus.active ? 0.7 : 1
          }}
          className="emergency-btn"
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
              <rect x="3" y="3" width="18" height="18" rx="2" fill="#ffffff22" />
              <path d="M12 7v6" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M12 16h.01" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span style={{ color: "#fff", fontWeight: 700 }}>
              {emergencyStatus.active ? "EMERGENCY ACTIVE" : "EMERGENCY STOP"}
            </span>
          </span>
        </Button>
      </div>
    </Card>
  );
}