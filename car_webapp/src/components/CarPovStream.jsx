import React from "react";
import { Card } from "./ui/card";
import { Compass } from "lucide-react";
import { motion } from "framer-motion";

export default function CarPovStream({ status }) {
  // A modern, clean car interior view for the stream background
  const imageUrl = "https://images.unsplash.com/photo-1616455579107-5337aDEb5b63?q=80&w=2070&auto=format&fit=crop";

  return (
    <Card className="glass-effect border-slate-700 overflow-hidden relative aspect-video shadow-2xl shadow-blue-500/10">
      <div 
        className="absolute inset-0 bg-cover bg-center transition-all duration-500"
        style={{ backgroundImage: `url(${imageUrl})` }}
      >
        {/* Darkening overlay to make HUD more readable */}
        <div className="absolute inset-0 bg-black/40" />
      </div>

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
            <div className="text-xs text-slate-400">Heading: North</div>
          </div>
        </div>

        {/* Bottom Overlay - Speedometer */}
        <div className="flex justify-center items-end">
          <div className="text-center text-white">
            <motion.div
              key={status?.speed || 0}
              initial={{ opacity: 0.5, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className="text-7xl md:text-8xl font-mono font-bold"
              style={{ textShadow: '0 0 15px rgba(0, 212, 255, 0.7)' }}
            >
              {status?.speed || 0}
            </motion.div>
            <div className="text-lg text-slate-300 -mt-2">MPH</div>
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