import React, { useState, useCallback, useMemo } from "react";
import ModeSelector from "../components/ModeSelector";
import VehicleStatusComponent from "../components/VehicleStatus";
import ControlPanel from "../components/ControlPanel";
import CarPovStream from "../components/CarPovStream";
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

  // Simulate live updates (e.g., battery drain, speed changes)
  React.useEffect(() => {
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

  React.useEffect(() => {
    setCurrentMode(vehicleStatus.mode);
  }, [vehicleStatus.mode]);

  const handleModeChange = (newMode) => {
    setCurrentMode(newMode);
    setVehicleStatus((prev) => ({ ...prev, mode: newMode }));
  };

  const handleStatusUpdate = useCallback((updatedLocalStatus) => {
    setVehicleStatus(updatedLocalStatus);
  }, []);

  // Simulate loading state
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
        {/* Vehicle Status Cards */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <VehicleStatusComponent status={vehicleStatus} />
        </motion.div>

        {/* Mode Selection */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="space-y-4"
        >
          <h2 className="text-2xl font-bold text-white">Driving Mode</h2>
          <ModeSelector
            currentMode={currentMode}
            onModeChange={handleModeChange}
            disabled={false}
          />
        </motion.div>

        {/* Command Center: Stream + Controls */}
        <div className="space-y-8">
          {/* Car POV Stream */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
          >
            <CarPovStream status={vehicleStatus} />
          </motion.div>
          
          {/* Control Panel */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7 }}
          >
            <AnimatePresence mode="wait">
              <ControlPanel
                mode={currentMode}
                vehicleStatus={vehicleStatus}
                onStatusUpdate={handleStatusUpdate}
              />
            </AnimatePresence>
          </motion.div>
        </div>
      </div>
    </div>
  );
}