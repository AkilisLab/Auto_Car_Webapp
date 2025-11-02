import React, { useRef, useState, useEffect } from "react";
import Card from "./ui/card";
import Button from "./ui/button";
import Slider from "./ui/slider";
import Input from "./ui/input";
import Badge from "./ui/badge";

/**
 * ControlPanel - renders three mode-specific UIs:
 *  - manual  -> two joysticks + temperature slider + red emergency stop
 *  - auto    -> autonomous route UI (destination, start/stop, settings)
 *  - audio   -> voice control UI (talk / mute, quick commands, voice settings)
 *
 * Keeps styles self-contained so it matches screenshots without depending on external CSS.
 */

function Joystick({ size = 160, onChange, axis = "vertical", label, valueDisplay }) {
  const boxRef = useRef();
  const knobRef = useRef();
  const [pos, setPos] = useState({ x: 0, y: 0 });

  function clamp(v, a, b) {
    return Math.min(Math.max(v, a), b);
  }

  function pointerMove(e) {
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
      <div style={{ color: "#c9d6e6", fontWeight: 700, marginBottom: 8 }}>{label}</div>
      <div
        ref={boxRef}
        onPointerDown={startDrag}
        onTouchStart={startDrag}
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          border: "2px solid rgba(255,255,255,0.06)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          background: "radial-gradient(closest-side, rgba(255,255,255,0.01), rgba(0,0,0,0.4))",
        }}
        aria-label={`${label} joystick`}
      >
        <div
          style={{
            position: "absolute",
            width: size - 36,
            height: size - 36,
            borderRadius: "50%",
            border: "1px solid rgba(255,255,255,0.03)",
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
            background: axis === "vertical" ? "linear-gradient(180deg,#2f9bff,#3be1d0)" : "linear-gradient(180deg,#2be1a6,#33c5ff)",
            boxShadow: "0 6px 18px rgba(0,0,0,0.5), 0 0 10px rgba(0,0,0,0.15) inset",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "grab",
          }}
        />
      </div>
      <div style={{ marginTop: 10, color: "#9fb0c2", fontSize: 13 }}>{valueDisplay}</div>
    </div>
  );
}

/* Small quick-command button with press effect */
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

  useEffect(() => {
    onStatusUpdate && onStatusUpdate({ ...vehicleStatus, temperature: temp });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [temp]);

  // send pwm & accel/steer updates merged into vehicleStatus whenever accel or steer changes
  useEffect(() => {
    const pwm = Math.round(Math.abs(accel) * 255); // 0-255 magnitude
    onStatusUpdate && onStatusUpdate({ ...vehicleStatus, acceleration: accel, steering: steer, pwm });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accel, steer]);

  function handleEmergency() {
    onStatusUpdate && onStatusUpdate({ ...vehicleStatus, emergency: true, speed: 0 });
    document.body.style.backgroundColor = "#2b0505";
    setTimeout(() => (document.body.style.backgroundColor = ""), 220);
  }

  // build mode-specific inner content, then render a single Card that includes the shared emergency button
  let inner = null;

  if (mode === "audio") {
    const quickCommands = [
      "Hey AutoDrive, navigate home",
      "Hey AutoDrive, set cruise control",
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
          <div><Badge variant="muted" size="sm">{voiceActive ? "Active" : "Standby"}</Badge></div>
        </div>

        <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
          <Button
            onClick={() => setVoiceActive(true)}
            style={{ background: "#14a354", flex: 1, height: 52, fontWeight: 700 }}
            aria-label="Talk"
          >
            Talk
          </Button>

          {/* Mute button highlighted red and widened */}
          <Button
            onClick={() => setVoiceActive(false)}
            style={{ background: "#c62828", color: "#fff", flex: 1, height: 52, fontWeight: 700 }}
            aria-label="Mute"
          >
            Mute
          </Button>
        </div>

        <div style={{ marginTop: 8 }}>
          <div style={{ fontWeight: 700, color: "#cfe8ff", marginBottom: 8 }}>Quick Commands</div>

          <div style={{ display: "grid", gap: 8 }}>
            {quickCommands.map((q) => (
              <QuickCommandButton
                key={q}
                onClick={() => {
                  console.log("Quick command:", q);
                  setVoiceActive(true);
                }}
              >
                {q}
              </QuickCommandButton>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 700, color: "#cfe8ff", marginBottom: 6 }}>Voice Settings</div>
          {/* voice settings container uses the same subtle background as other boxes to avoid stepping on boundaries */}
          <div style={{ borderRadius: 8, padding: 12, background: "linear-gradient(180deg, rgba(255,255,255,0.01), rgba(0,0,0,0.02))", border: "1px solid rgba(255,255,255,0.03)" }}>
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
          <div><Badge variant="success" size="sm">{routeActive ? "Active" : "Standby"}</Badge></div>
        </div>

        <div style={{ border: "1px solid rgba(255,255,255,0.03)", borderRadius: 8, padding: 12, marginBottom: 12 }}>
          <div style={{ color: "#9fb0c2", marginBottom: 6 }}>Navigating to: <strong style={{ color: "#e6eef8" }}>{routeActive ? route || "—" : "—"}</strong></div>
          <div style={{ color: "#9fb0c2" }}>ETA: {routeActive ? "12 minutes" : "—"}</div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 700, color: "#cfe8ff", marginBottom: 6 }}>Destination</div>
          <Input value={route} onChange={(e) => setRoute(e.target.value)} placeholder="Enter destination" />
        </div>

        <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
          <Button
            onClick={() => { if (route) setRouteActive(true); }}
            style={{ background: "#1f57d8" }}
          >
            Start Route
          </Button>
          <Button
            onClick={() => { setRouteActive(false); }}
            variant="ghost"
          >
            Stop Route
          </Button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 6 }}>
          <div style={{ border: "1px solid rgba(255,255,255,0.03)", padding: 12, borderRadius: 8, textAlign: "center" }}>
            <div style={{ color: "#6ee7b7", fontWeight: 700 }}>Eco</div>
            <div style={{ color: "#9fb0c2", fontSize: 13 }}>Driving Mode</div>
          </div>
          <div style={{ border: "1px solid rgba(255,255,255,0.03)", padding: 12, borderRadius: 8, textAlign: "center" }}>
            <div style={{ color: "#9ed0ff", fontWeight: 700 }}>Safe</div>
            <div style={{ color: "#9fb0c2", fontSize: 13 }}>Following Distance</div>
          </div>
        </div>

        <div style={{ marginTop: 12, borderRadius: 8, padding: 12, background: "linear-gradient(180deg, rgba(255,255,255,0.01), rgba(0,0,0,0.02))", border: "1px solid rgba(255,80,0,0.06)" }}>
          <div style={{ color: "#ffb997" }}>⚠ Keep hands near steering wheel for safety</div>
        </div>
      </>
    );
  } else {
    // manual
    inner = (
      <>
        <div style={{ display: "flex", gap: 28, alignItems: "flex-start", justifyContent: "center", flexWrap: "wrap" }}>
          <Joystick
            axis="vertical"
            label="Acceleration"
            onChange={({ value }) => {
              // value -1..1, up = +1 (forward), down = -1 (backward)
              setAccel(value);
            }}
            // show signed percent where center is "0%"
            valueDisplay={`${Math.round(accel * 100)}%`}
          />

          <Joystick
            axis="horizontal"
            label="Steering"
            onChange={({ value }) => {
              setSteer(value);
              onStatusUpdate && onStatusUpdate({ ...vehicleStatus, steering: value });
            }}
            valueDisplay={`${Math.round(steer * 45)}°`}
          />
        </div>

        <div style={{ marginTop: 26 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ fontWeight: 700, color: "#e6eef8" }}>Climate Control</div>
            <div style={{ color: "#9fb0c2", fontSize: 13 }}>Adjust interior air conditioning and heating</div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 10 }}>
            <div style={{ flex: 1 }}>
              <Slider min={60} max={85} step={1} value={Math.round(temp)} onChange={(e) => setTemp(Number(e.target.value))} />
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

      {/* Shared Emergency Stop (shown for all modes) */}
      <div style={{ marginTop: 22, display: "flex", justifyContent: "center" }}>
        <Button
          onClick={handleEmergency}
          style={{ background: "#c62828", borderColor: "rgba(0,0,0,0.25)", boxShadow: "0 8px 20px rgba(198,40,40,0.18)", minWidth: 220, padding: "12px 20px" }}
          className="emergency-btn"
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
              <rect x="3" y="3" width="18" height="18" rx="2" fill="#ffffff22" />
              <path d="M12 7v6" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M12 16h.01" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span style={{ color: "#fff", fontWeight: 700 }}>EMERGENCY STOP</span>
          </span>
        </Button>
      </div>
    </Card>
  );
}