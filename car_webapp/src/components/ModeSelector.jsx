import React from "react";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Navigation, Cpu, Mic, CheckCircle } from "lucide-react";
import { motion } from "framer-motion";

export default function ModeSelector({ currentMode, onModeChange, disabled }) {
  const modes = [
    {
      id: "manual",
      name: "Manual",
      icon: Navigation,
      description: "Full driver control",
      color: "from-slate-600 to-slate-700",
      accent: "text-slate-300"
    },
    {
      id: "auto",
      name: "Auto",
      icon: Cpu,
      description: "Autonomous driving",
      color: "from-blue-600 to-cyan-500",
      accent: "text-blue-300"
    },
    {
      id: "audio",
      name: "Audio",
      icon: Mic,
      description: "Voice controlled",
      color: "from-emerald-600 to-green-500",
      accent: "text-emerald-300"
    }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {modes.map((mode) => {
        const IconComponent = mode.icon;
        const isActive = currentMode === mode.id;
        
        return (
          <motion.div
            key={mode.id}
            whileHover={{ scale: disabled ? 1 : 1.02 }}
            whileTap={{ scale: disabled ? 1 : 0.98 }}
          >
            <Card 
              className={`relative overflow-hidden cursor-pointer transition-all duration-300 ${
                isActive 
                  ? `glass-effect border-2 ${mode.id === 'auto' ? 'border-blue-400 glow-blue' : mode.id === 'audio' ? 'border-green-400 glow-green' : 'border-slate-400'}` 
                  : 'glass-effect border border-slate-600 hover:border-slate-500'
              } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
              onClick={() => !disabled && onModeChange(mode.id)}
            >
              <div className={`absolute inset-0 bg-gradient-to-br ${mode.color} opacity-${isActive ? '20' : '10'}`} />
              
              <div className="relative p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-r ${mode.color} flex items-center justify-center ${isActive ? 'glow-blue' : ''}`}>
                    <IconComponent className="w-6 h-6 text-white" />
                  </div>
                  {isActive && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="w-6 h-6 text-green-400"
                    >
                      <CheckCircle className="w-full h-full" />
                    </motion.div>
                  )}
                </div>
                
                <div>
                  <h3 className={`text-lg font-bold mb-1 ${isActive ? 'text-white text-glow' : 'text-slate-200'}`}>
                    {mode.name}
                  </h3>
                  <p className={`text-sm ${isActive ? mode.accent : 'text-slate-400'}`}>
                    {mode.description}
                  </p>
                </div>
                
                {isActive && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-4 pt-4 border-t border-slate-600"
                  >
                    <div className="flex items-center gap-2 text-green-400 text-sm">
                      <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                      <span>Active</span>
                    </div>
                  </motion.div>
                )}
              </div>
            </Card>
          </motion.div>
        );
      })}
    </div>
  );
}