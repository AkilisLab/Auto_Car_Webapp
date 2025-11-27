import React from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";
import { Card, CardContent } from "./ui/card";
import { Label } from "./ui/label";
import { Navigation, MapPin, Clock, AlertTriangle } from "lucide-react";

export default function AutoControls({ status, onUpdate }) {
  const [destination, setDestination] = React.useState(status?.destination || "");
  const [isNavigating, setIsNavigating] = React.useState(!!status?.destination);
  const [error, setError] = React.useState("");

  // NEW: helper to format ETA
  const formatEta = (etaMinutes) => {
    if (etaMinutes == null || Number.isNaN(etaMinutes)) return "—";
    const m = Math.max(0, Math.round(etaMinutes));
    if (m < 1) return "< 1 min";
    if (m === 1) return "1 min";
    return `${m} min`;
  };

  // --- Helper: parse "r1,c1 -> r2,c2" into coordinates ---
  const parseCoordinateInput = (input) => {
    // Expected format: "r1,c1 -> r2,c2"
    // Spaces around "->" are optional.
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
  };

  const handleStartNavigation = () => {
    setError("");

    if (!destination.trim()) {
      setError("Please enter coordinates before starting.");
      return;
    }

    const parsed = parseCoordinateInput(destination.trim());
    if (!parsed) {
      setError(
        'Invalid format. Use: "start_row,start_col -> goal_row,goal_col", e.g. "0,0 -> 4,3".'
      );
      return;
    }

    setIsNavigating(true);

    // Notify parent with a structured "route request" intent.
    // Parent (ControlPanel) can translate this into a WebSocket
    // message: type: "request_route", payload: { start, goal, destinationText }
    onUpdate?.({
      ...status,
      mode: "auto",
      destination: destination.trim(),
      auto_route_request: {
        start: parsed.start,
        goal: parsed.goal,
      },
      // Optional: default autonomous speed and steering
      speed: status?.speed ?? 45,
      steering_angle: 0,
    });
  };

  const handleStopNavigation = () => {
    setIsNavigating(false);
    setError("");

    onUpdate?.({
      ...status,
      speed: 0,
      steering_angle: 0,
      destination: "",
      auto_route_request: null,
      auto_route_active: false,
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
            <Badge
              className={
                isNavigating
                  ? "bg-green-600 text-green-100"
                  : "bg-slate-600 text-slate-100"
              }
            >
              {isNavigating ? "Active" : "Standby"}
            </Badge>
          </div>

          {isNavigating && status?.destination && (
            <div className="space-y-2 text-sm border-t border-blue-500/20 pt-3 mt-3">
              <div className="flex items-center gap-2 text-slate-300">
                <MapPin className="w-4 h-4 text-blue-400" />
                <span>
                  Navigating to:{" "}
                  <span className="font-mono">
                    {status.destination}
                  </span>
                </span>
              </div>
              {/* UPDATED: show ETA from status.eta_minutes if present */}
              <div className="flex items-center gap-2 text-slate-400">
                <Clock className="w-4 h-4 text-blue-400" />
                <span>
                  ETA:{" "}
                  <span className="font-mono">
                    {formatEta(status?.eta_minutes)}
                  </span>
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Destination Input */}
      <div className="space-y-3">
        <Label className="text-white font-medium">Route (start → goal)</Label>
        <Input
          value={destination}
          onChange={(e) => {
            setDestination(e.target.value);
            setError("");
          }}
          placeholder='e.g. "0,0 -> 4,3"'
          className="glass-effect border-slate-600 bg-slate-800/50 text-white placeholder-slate-400"
        />
        {error && (
          <p className="text-sm text-red-400">
            {error}
          </p>
        )}
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
            <span className="text-sm">
              Keep hands near steering wheel for safety
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
