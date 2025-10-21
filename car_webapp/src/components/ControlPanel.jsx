import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import ManualControls from "./ManualControls";
import AutoControls from "./AutoControls";
import AudioControls from "./AudioControls";
import { motion } from "framer-motion";

export default function ControlPanel({ mode, vehicleStatus, onStatusUpdate }) {
  const renderControls = () => {
    switch (mode) {
      case "manual":
        return <ManualControls status={vehicleStatus} onUpdate={onStatusUpdate} />;
      case "auto":
        return <AutoControls status={vehicleStatus} onUpdate={onStatusUpdate} />;
      case "audio":
        return <AudioControls status={vehicleStatus} onUpdate={onStatusUpdate} />;
      default:
        return <div className="text-slate-400 text-center py-8">Select a driving mode</div>;
    }
  };

  return (
    <motion.div
      key={mode}
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.3 }}
    >
      <Card className="glass-effect border-slate-700">
        <CardHeader>
          <CardTitle className="text-xl text-white flex items-center gap-2">
            Control Panel
            <span className="text-sm text-slate-400 font-normal">
              • {mode.charAt(0).toUpperCase() + mode.slice(1)} Mode
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {renderControls()}
        </CardContent>
      </Card>
    </motion.div>
  );
}