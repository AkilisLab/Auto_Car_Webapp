import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";
import { Battery, Thermometer, MapPin, Navigation, Gauge } from "lucide-react";
import { motion } from "framer-motion";

export default function VehicleStatus({ status }) {
  const getStatusColor = () => {
    if (status?.speed > 70) return "text-red-400";
    if (status?.speed > 35) return "text-yellow-400";
    return "text-green-400";
  };

  const getBatteryColor = () => {
    if (status?.battery_level < 20) return "text-red-400";
    if (status?.battery_level < 50) return "text-yellow-400";
    return "text-green-400";
  };

  const getModeDisplay = (mode) => {
    const modeConfig = {
      manual: { label: "Manual", color: "bg-slate-600 text-slate-100" },
      auto: { label: "Autonomous", color: "bg-blue-600 text-blue-100" },
      audio: { label: "Voice Control", color: "bg-green-600 text-green-100" }
    };
    return modeConfig[mode] || modeConfig.manual;
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <Card className="glass-effect border-slate-700">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-slate-400 flex items-center gap-2">
              <Gauge className="w-4 h-4" />
              Speed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-1">
              <span className={`text-2xl font-bold ${getStatusColor()}`}>
                {status?.speed || 0}
              </span>
              <span className="text-slate-500 text-sm">mph</span>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <Card className="glass-effect border-slate-700">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-slate-400 flex items-center gap-2">
              <Battery className="w-4 h-4" />
              Battery
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-1">
              <span className={`text-2xl font-bold ${getBatteryColor()}`}>
                {status?.battery_level || 0}
              </span>
              <span className="text-slate-500 text-sm">%</span>
            </div>
            <div className="mt-2 w-full bg-slate-700 rounded-full h-1.5">
              <div 
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  status?.battery_level < 20 ? 'bg-red-400' :
                  status?.battery_level < 50 ? 'bg-yellow-400' : 'bg-green-400'
                }`}
                style={{ width: `${status?.battery_level || 0}%` }}
              />
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <Card className="glass-effect border-slate-700">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-slate-400 flex items-center gap-2">
              <Navigation className="w-4 h-4" />
              Mode
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Badge className={getModeDisplay(status?.mode).color}>
              {getModeDisplay(status?.mode).label}
            </Badge>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
      >
        <Card className="glass-effect border-slate-700">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-slate-400 flex items-center gap-2">
              <Thermometer className="w-4 h-4" />
              Climate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-bold text-blue-400">
                {status?.temperature || 72}
              </span>
              <span className="text-slate-500 text-sm">°F</span>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}