import React, { useState, useCallback, useEffect } from "react";
import { Zap, Battery, Airplay, Thermometer } from "lucide-react";
import Card from "../components/ui/card";
import CarPovStream from "../components/CarPovStream";
import VehicleStatusComponent from "../components/VehicleStatus";
import ControlPanel from "../components/ControlPanel";
import { motion, AnimatePresence } from "framer-motion";

const initialStatus = {
  id: 1,
  speed: 0,
  mode: "manual",
  battery_level: 85,
  location: "Downtown Area",
  destination: "",
  temperature: 72,
  is_active: true,
};

export default function Dashboard() {
  const [vehicleStatus, setVehicleStatus] = useState(initialStatus);
  const [currentMode, setCurrentMode] = useState(vehicleStatus.mode);
  const [activeDeviceId, setActiveDeviceId] = useState(null);

  useEffect(() => {
    const interval = setInterval(() => {
      setVehicleStatus((prev) => ({
        ...prev,
        battery_level: Math.max(prev.battery_level - 0.1, 0),
        speed: prev.mode === "auto" ? Math.min(prev.speed + 1, 60) : prev.speed,
        temperature: prev.temperature + (Math.random() - 0.5),
      }));
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    setCurrentMode(vehicleStatus.mode);
  }, [vehicleStatus.mode]);

  useEffect(() => {
    let isMounted = true;

    const fetchActiveDevice = async () => {
      try {
        const response = await fetch("http://localhost:8000/devices");
        if (!response.ok) return;
        const data = await response.json();
        const connectedDevice = data.devices?.find((device) => device.connected);
        if (isMounted) {
          setActiveDeviceId(connectedDevice ? connectedDevice.device_id : null);
        }
      } catch (error) {
        if (isMounted) {
          setActiveDeviceId(null);
        }
      }
    };

    fetchActiveDevice();
    const intervalId = setInterval(fetchActiveDevice, 3000);

    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, []);

  const handleModeChange = (newMode) => {
    setCurrentMode(newMode);
    setVehicleStatus((prev) => ({ ...prev, mode: newMode }));
  };

  const handleStatusUpdate = useCallback((updatedLocalStatus) => {
    // merge updates to avoid overwriting other fields (so pwm/steering/temperature are preserved)
    setVehicleStatus((prev) => ({ ...prev, ...updatedLocalStatus }));
  }, []);

  const [isLoading, setIsLoading] = useState(false);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          className="w-12 h-12 border-4 border-blue-400 border-t-transparent rounded-full"
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Top status cards */}
        <section className="status-grid" aria-label="Vehicle status">
          <Card className="status-card" shadow padded={false}>
            <div className="status-label"><Airplay size={16} /> <span>Speed</span></div>
            <div className="status-value">{vehicleStatus.speed} <span style={{fontSize:12, fontWeight:500, color:"#9fb0c2"}}>mph</span></div>
          </Card>

          <Card className="status-card" shadow padded={false}>
            <div className="status-label"><Battery size={16} /> <span>Battery</span></div>
            <div className="status-value">{Math.round(vehicleStatus.battery_level)}<span style={{fontSize:12, fontWeight:500, color:"#9fb0c2"}}>%</span></div>
            <div style={{height:8, background:"#0f1720", borderRadius:99, marginTop:8}}>
              <div style={{width:`${vehicleStatus.battery_level}%`, height:"100%", background:"#34d399", borderRadius:99}} />
            </div>
          </Card>

          <Card className="status-card" shadow padded={false}>
            <div className="status-label"><Zap size={16} /> <span>Mode</span></div>
            <div style={{marginTop:6}}>
              <span style={{background:"#1f2937", padding:"6px 10px", borderRadius:999, fontSize:13}}>{currentMode.charAt(0).toUpperCase() + currentMode.slice(1)}</span>
            </div>
          </Card>

          <Card className="status-card" shadow padded={false}>
            <div className="status-label"><Thermometer size={16} /> <span>Climate</span></div>
            <div className="status-value">{Math.round(vehicleStatus.temperature)}<span style={{fontSize:12, fontWeight:500, color:"#9fb0c2"}}>°F</span></div>
          </Card>
        </section>

        {/* Driving mode tiles - horizontal row */}
        <div>
          <h2 style={{color:"#e6eef8", marginBottom:12}}>Driving Mode</h2>

          <div className="modes-grid" role="list" aria-label="mode tiles">
            <Card
              onClick={() => handleModeChange("manual")}
              className={`mode-card ${currentMode === "manual" ? "mode-active" : ""}`}
              style={{cursor:"pointer"}}
              shadow
            >
              <div style={{display:"flex", gap:12, alignItems:"center"}}>
                <div style={{width:44,height:44,borderRadius:10,display:"flex",alignItems:"center",justifyContent:"center",background:"linear-gradient(135deg,#2f9bff,#3be1d0)"}}>
                  <Airplay color="#fff" />
                </div>
                <div>
                  <div style={{fontWeight:700, fontSize:16, color:"#fff"}}>Manual</div>
                  <div style={{color:"#9fb0c2", fontSize:13}}>Full driver control</div>
                </div>
              </div>
            </Card>

            <Card
              onClick={() => handleModeChange("auto")}
              className={`mode-card ${currentMode === "auto" ? "mode-active" : ""}`}
              style={{cursor:"pointer"}}
              shadow
            >
              <div style={{display:"flex", gap:12, alignItems:"center"}}>
                <div style={{width:44,height:44,borderRadius:10,display:"flex",alignItems:"center",justifyContent:"center",background:"linear-gradient(135deg,#2f6cff,#235ea8)"}}>
                  <Zap color="#fff" />
                </div>
                <div>
                  <div style={{fontWeight:700, fontSize:16, color:"#fff"}}>Auto</div>
                  <div style={{color:"#9fb0c2", fontSize:13}}>Autonomous driving</div>
                </div>
              </div>
            </Card>

            <Card
              onClick={() => handleModeChange("audio")}
              className={`mode-card ${currentMode === "audio" ? "mode-active" : ""}`}
              style={{cursor:"pointer"}}
              shadow
            >
              <div style={{display:"flex", gap:12, alignItems:"center"}}>
                <div style={{width:44,height:44,borderRadius:10,display:"flex",alignItems:"center",justifyContent:"center",background:"linear-gradient(135deg,#2be1a6,#2fb7ff)"}}>
                  <Thermometer color="#fff" />
                </div>
                <div>
                  <div style={{fontWeight:700, fontSize:16, color:"#fff"}}>Audio</div>
                  <div style={{color:"#9fb0c2", fontSize:13}}>Voice controlled</div>
                </div>
              </div>
            </Card>
          </div>
        </div>

        {/* Stream (full width) then centered control panel below */}
        <div>
          <div className="live-wrap">
            <Card className="p-0" shadow>
              <CarPovStream status={vehicleStatus} />
            </Card>
          </div>

          <div className="center-controls" style={{marginTop:18, display:"flex", justifyContent:"center"}}>
            <div style={{width:"100%", maxWidth:540}}>
              <ControlPanel
                mode={currentMode}
                vehicleStatus={vehicleStatus}
                onStatusUpdate={handleStatusUpdate}
                deviceId={activeDeviceId}
              />
            </div>
          </div>
        </div>
      </div>

      <style>
        {`
          .status-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 18px;
            margin-bottom: 28px;
            align-items: start;
          }

          /* modes: horizontal row */
          .modes-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 18px;
            margin: 8px 0 20px;
            align-items: stretch;
          }

          .mode-card { padding:18px; display:flex; align-items:center; gap:12px; min-height:110px; }
          .mode-active { box-shadow: 0 8px 30px rgba(45,125,255,0.12); border: 1px solid rgba(255,255,255,0.03); }

          .live-wrap { display:block; border-radius: 12px; overflow: hidden; padding: 6px; background: linear-gradient(180deg, rgba(63,92,125,0.06), rgba(2,6,23,0.05)); box-shadow: 0 6px 28px rgba(3,8,18,0.6), inset 0 1px 0 rgba(255,255,255,0.02); }

          @media (max-width:1000px) {
            .status-grid { grid-template-columns: repeat(2, 1fr); }
            .modes-grid { grid-template-columns: 1fr; }
            .center-controls { padding: 0 12px; }
          }
        `}
      </style>
    </div>
  );
}