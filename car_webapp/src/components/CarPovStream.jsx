import React, { useEffect, useState } from "react";
import { Card } from "./ui/card";
import { Compass } from "lucide-react";
import { motion } from "framer-motion";

export default function CarPovStream({ status = {} }) {
  const [frameSrc, setFrameSrc] = useState(null);
  const pwm = typeof status.pwm !== "undefined" ? status.pwm : 0;
  const steering = typeof status.steering !== "undefined" ? status.steering : 0;
  const steeringDeg = Math.round(steering * 45); // same mapping used elsewhere

  useEffect(() => {
    const wsUrl = (import.meta.env.VITE_WS_URL) ? import.meta.env.VITE_WS_URL : "ws://localhost:8000/ws";
    const ws = new WebSocket(wsUrl);

    ws.addEventListener("open", () => {
      // handshake as frontend
      const hs = { role: "frontend", device_id: `web-${Math.floor(Math.random()*10000)}`, action: "handshake", payload: {} };
      ws.send(JSON.stringify(hs));
    });

    ws.addEventListener("message", (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        if (msg.action === "telemetry" && msg.type === "camera_frame" && msg.payload?.frame_b64) {
          setFrameSrc(`data:image/jpeg;base64,${msg.payload.frame_b64}`);
        }
      } catch (e) {
        // ignore
      }
    });

    ws.addEventListener("close", () => {
      // cleanup handled in return
    });

    return () => {
      ws.close();
    };
  }, []);

  // A modern, clean car interior view for the stream background (kept as fallback)
  const fallbackImageUrl = "https://t3.ftcdn.net/jpg/15/31/01/02/360_F_1531010286_TImk7GQHMlAahGKfYoB5rcRsp78cj3pz.jpg";

  return (
    <Card className="glass-effect border-slate-700 overflow-hidden relative aspect-video shadow-2xl shadow-blue-500/10">
      {/* camera stream image (or fallback) */}
      <img
        src={frameSrc || fallbackImageUrl}
        alt="Car POV"
        className="absolute inset-0 w-full h-full object-cover transition-opacity duration-300"
      />
      <div className="absolute inset-0 bg-black/40" />

      {/* HUD Overlays */}
      <div className="relative z-10 p-4 md:p-6 h-full flex flex-col justify-between">
        {/* Top Overlay */}
        <div className="flex justify-between items-start">
          <div className="flex items-center gap-2 text-red-500 font-bold bg-black/50 px-3 py-1 rounded-full text-sm">
            <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            LIVE
          </div>

          <div className="text-right text-white bg-black/50 p-2 rounded-lg text-sm">
            <div className="flex items-center gap-2">
              <Compass className="w-4 h-4 text-blue-400" />
              <span className="font-mono">{status?.location || "N/A"}</span>
            </div>
            <div className="text-xs text-slate-400">Steering: {steeringDeg}°</div>
          </div>
        </div>

        {/* Bottom Overlay - PWM display (static, no animation) */}
        <div className="flex justify-center items-end">
          <div className="text-center text-white">
            <div
              className="text-7xl md:text-8xl font-mono font-bold"
              style={{ /* removed animation for clear presentation */ }}
            >
              {pwm}
            </div>
            <div className="text-lg text-slate-300 -mt-2">PWM</div>
          </div>
        </div>
      </div>

      {/* Subtle scanning line effect */}
      <motion.div
        className="absolute top-0 left-0 w-full h-0.5 bg-cyan-300/30"
        style={{ boxShadow: '0 0 8px #00D4FF' }}
        animate={{ y: ['0%', '100%'] }}
        transition={{ duration: 10, repeat: Infinity, ease: 'linear', repeatType: 'reverse' }}
      />
    </Card>
  );
}