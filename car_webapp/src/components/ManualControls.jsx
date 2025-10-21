
import React from "react";
import { Button } from "./ui/button";
import { Slider } from "./ui/slider";
import { Card, CardContent } from "./ui/card";
import { Square, Thermometer } from "lucide-react";

export default function ManualControls({ status, onUpdate }) {
  const [leftStick, setLeftStick] = React.useState({ x: 0, y: 0 }); // Acceleration/Braking
  const [rightStick, setRightStick] = React.useState({ x: 0, y: 0 }); // Steering
  const [temperature, setTemperature] = React.useState(status?.temperature || 72);
  
  const stickRadius = 60; // Radius of joystick area

  const handleStickMove = (stickType, clientX, clientY, rect) => {
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    let deltaX = clientX - centerX;
    let deltaY = clientY - centerY;
    
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    if (distance > stickRadius) {
      deltaX = (deltaX / distance) * stickRadius;
      deltaY = (deltaY / distance) * stickRadius;
    }
    
    const normalizedX = deltaX / stickRadius;
    const normalizedY = -deltaY / stickRadius;
    
    if (stickType === 'left') {
      setLeftStick({ x: deltaX, y: deltaY });
      const speed = Math.max(0, Math.round(normalizedY * 120));
      onUpdate({ ...status, speed });
    } else {
      setRightStick({ x: deltaX, y: deltaY });
      const steeringAngle = Math.round(normalizedX * 45);
      onUpdate({ ...status, steering_angle: steeringAngle });
    }
  };

  const createStickHandler = (stickType) => (e) => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    
    const moveHandler = (moveEvent) => {
      const { clientX, clientY } = moveEvent.touches ? moveEvent.touches[0] : moveEvent;
      handleStickMove(stickType, clientX, clientY, rect);
    };

    const endHandler = () => {
      document.removeEventListener('mousemove', moveHandler);
      document.removeEventListener('mouseup', endHandler);
      document.removeEventListener('touchmove', moveHandler);
      document.removeEventListener('touchend', endHandler);
      
      if (stickType === 'left') {
        setLeftStick({ x: 0, y: 0 });
        onUpdate({ ...status, speed: 0 });
      } else {
        setRightStick({ x: 0, y: 0 });
        onUpdate({ ...status, steering_angle: 0 });
      }
    };

    if (e.touches) {
      document.addEventListener('touchmove', moveHandler, { passive: false });
      document.addEventListener('touchend', endHandler);
    } else {
      document.addEventListener('mousemove', moveHandler);
      document.addEventListener('mouseup', endHandler);
    }

    const { clientX, clientY } = e.touches ? e.touches[0] : e;
    handleStickMove(stickType, clientX, clientY, rect);
  };

  const getLeftStickStatus = () => {
    const normalizedY = -leftStick.y / stickRadius;
    if (normalizedY > 0.7) return "Full Speed";
    if (normalizedY > 0.3) return "Accelerating";
    if (normalizedY < -0.3) return "Braking";
    return "Idle";
  };

  const getRightStickStatus = () => {
    const normalizedX = rightStick.x / stickRadius;
    if (normalizedX > 0.5) return "Sharp Right";
    if (normalizedX > 0.1) return "Right";
    if (normalizedX < -0.5) return "Sharp Left";
    if (normalizedX < -0.1) return "Left";
    return "Straight";
  };

  const handleTemperatureChange = (value) => {
    const newTemp = value[0];
    setTemperature(newTemp);
    onUpdate({ ...status, temperature: newTemp });
  };

  return (
    <div className="space-y-8">
      {/* Xbox-Style Controller Layout */}
      <div className="grid grid-cols-2 gap-4 md:gap-8 max-w-2xl mx-auto">
        
        {/* Left Joystick - Acceleration/Braking */}
        <div className="space-y-4">
          <div className="text-center">
            <h3 className="text-white font-medium">Acceleration</h3>
            <div className="text-slate-400 text-sm">{getLeftStickStatus()}</div>
            <div className="text-white font-bold text-lg">{status?.speed || 0} mph</div>
          </div>
          
          <div className="flex justify-center">
            <div 
              className="relative w-32 h-32 bg-slate-800 rounded-full border-2 border-slate-600 cursor-pointer select-none"
              onMouseDown={createStickHandler('left')}
              onTouchStart={createStickHandler('left')}
            >
              <div className="absolute top-1/2 left-1/2 w-1 h-1 bg-slate-500 rounded-full transform -translate-x-1/2 -translate-y-1/2" />
              <div className="absolute top-2 left-1/2 transform -translate-x-1/2 text-green-400 text-xs">▲</div>
              <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 text-red-400 text-xs">▼</div>
              <div 
                className="absolute w-6 h-6 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full border-2 border-white shadow-lg transform -translate-x-1/2 -translate-y-1/2 transition-all duration-75"
                style={{
                  left: `calc(50% + ${leftStick.x}px)`,
                  top: `calc(50% + ${leftStick.y}px)`
                }}
              />
            </div>
          </div>
          
          <div className="text-center text-xs text-slate-400">
            <div>Up: Accelerate</div>
            <div>Down: Brake</div>
          </div>
        </div>

        {/* Right Joystick - Steering */}
        <div className="space-y-4">
          <div className="text-center">
            <h3 className="text-white font-medium">Steering</h3>
            <div className="text-slate-400 text-sm">{getRightStickStatus()}</div>
            <div className="text-white font-bold text-lg">
              {status?.steering_angle || 0}°
            </div>
          </div>
          
          <div className="flex justify-center">
            <div 
              className="relative w-32 h-32 bg-slate-800 rounded-full border-2 border-slate-600 cursor-pointer select-none"
              onMouseDown={createStickHandler('right')}
              onTouchStart={createStickHandler('right')}
            >
              <div className="absolute top-1/2 left-1/2 w-1 h-1 bg-slate-500 rounded-full transform -translate-x-1/2 -translate-y-1/2" />
              <div className="absolute top-1/2 left-2 transform -translate-y-1/2 text-purple-400 text-xs">◀</div>
              <div className="absolute top-1/2 right-2 transform -translate-y-1/2 text-green-400 text-xs">▶</div>
              <div 
                className="absolute w-6 h-6 bg-gradient-to-br from-green-500 to-green-600 rounded-full border-2 border-white shadow-lg transform -translate-x-1/2 -translate-y-1/2 transition-all duration-75"
                style={{
                  left: `calc(50% + ${rightStick.x}px)`,
                  top: `calc(50% + ${rightStick.y}px)`
                }}
              />
            </div>
          </div>
          
          <div className="text-center text-xs text-slate-400">
            <div>Left/Right: Steer</div>
          </div>
        </div>
      </div>

      {/* Climate Control - Interior Temperature */}
      <div className="space-y-3 max-w-md mx-auto">
        <h3 className="text-white font-medium flex items-center gap-2">
          <Thermometer className="w-5 h-5" />
          Climate Control
        </h3>
        <p className="text-slate-400 text-sm">Adjust interior air conditioning and heating</p>
        <div className="space-y-3">
          <div className="flex justify-between items-center text-sm">
            <span className="text-slate-400">Interior Temperature</span>
            <span className="text-white font-bold">{temperature}°F</span>
          </div>
          <Slider
            value={[temperature]}
            onValueChange={handleTemperatureChange}
            min={60}
            max={85}
            step={1}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-slate-400">
            <span>Cool (60°)</span>
            <span>Warm (85°)</span>
          </div>
        </div>
      </div>

      {/* Emergency Stop */}
      <Card className="border-red-500/30 bg-red-950/20 max-w-md mx-auto">
        <CardContent className="pt-4">
          <Button 
            className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3"
            size="lg"
            onClick={() => {
              setLeftStick({ x: 0, y: 0 });
              setRightStick({ x: 0, y: 0 });
              onUpdate({ ...status, speed: 0, steering_angle: 0 });
            }}
          >
            <Square className="w-5 h-5 mr-2" />
            EMERGENCY STOP
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
