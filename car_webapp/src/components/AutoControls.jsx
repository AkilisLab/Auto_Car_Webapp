
import React from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Card, CardContent } from "./ui/card";
import { Badge } from "./ui/badge";
import { Navigation, MapPin, Clock, AlertTriangle } from "lucide-react";

export default function AutoControls({ status, onUpdate }) {
  const [destination, setDestination] = React.useState(status?.destination || "");
  const [isNavigating, setIsNavigating] = React.useState(!!status?.destination);

  const handleStartNavigation = () => {
    if (destination.trim()) {
      setIsNavigating(true);
      onUpdate({ 
        ...status, 
        destination, 
        speed: 45, // Set a default autonomous speed
        steering_angle: 0 // Ensure steering is initially straight
      });
    }
  };

  const handleStopNavigation = () => {
    setIsNavigating(false);
    onUpdate({ 
      ...status, 
      speed: 0, 
      steering_angle: 0,
      destination: "" // Clear the destination
    });
  };

  return (
    <div className="space-y-6">
      {/* Navigation Status */}
      <Card className="glass-effect border-blue-500/30 bg-blue-950/20">
        <CardContent className="pt-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center">
                <Navigation className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="text-white font-medium">Autonomous Mode</h3>
                <p className="text-blue-300 text-sm">AI-powered navigation</p>
              </div>
            </div>
            <Badge className={isNavigating ? "bg-green-600 text-green-100" : "bg-slate-600 text-slate-100"}>
              {isNavigating ? "Active" : "Standby"}
            </Badge>
          </div>
          
          {isNavigating && status?.destination && (
            <div className="space-y-2 text-sm border-t border-blue-500/20 pt-3 mt-3">
              <div className="flex items-center gap-2 text-slate-300">
                <MapPin className="w-4 h-4 text-blue-400" />
                <span>Navigating to: {status.destination}</span>
              </div>
              <div className="flex items-center gap-2 text-slate-400">
                <Clock className="w-4 h-4 text-blue-400" />
                <span>ETA: 12 minutes</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Destination Input */}
      <div className="space-y-3">
        <Label className="text-white font-medium">Destination</Label>
        <Input
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
          placeholder="Enter destination address..."
          className="glass-effect border-slate-600 bg-slate-800/50 text-white placeholder-slate-400"
        />
      </div>

      {/* Navigation Controls */}
      <div className="grid grid-cols-2 gap-3">
        <Button
          onClick={handleStartNavigation}
          disabled={!destination.trim() || isNavigating}
          className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-3"
        >
          <Navigation className="w-4 h-4 mr-2" />
          Start Route
        </Button>
        <Button
          onClick={handleStopNavigation}
          disabled={!isNavigating}
          variant="outline"
          className="glass-effect border-slate-600 text-white hover:bg-slate-700 font-medium py-3"
        >
          Stop Route
        </Button>
      </div>

      {/* Auto Settings */}
      <div className="space-y-3">
        <h3 className="text-white font-medium">Autonomous Settings</h3>
        <div className="grid grid-cols-2 gap-3">
          <Card className="glass-effect border-slate-700 p-3">
            <div className="text-center">
              <div className="text-lg font-bold text-green-400">Eco</div>
              <div className="text-xs text-slate-400">Driving Mode</div>
            </div>
          </Card>
          <Card className="glass-effect border-slate-700 p-3">
            <div className="text-center">
              <div className="text-lg font-bold text-blue-400">Safe</div>
              <div className="text-xs text-slate-400">Following Distance</div>
            </div>
          </Card>
        </div>
      </div>

      {/* Safety Alert */}
      <Card className="border-orange-500/30 bg-orange-950/20">
        <CardContent className="pt-4">
          <div className="flex items-center gap-2 text-orange-300">
            <AlertTriangle className="w-4 h-4" />
            <span className="text-sm">Keep hands near steering wheel for safety</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
