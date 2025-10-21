import React from "react";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import { Badge } from "./ui/badge";
import { Mic, MicOff, Volume2, VolumeX, MessageSquare } from "lucide-react";
import { motion } from "framer-motion";

export default function AudioControls({ status, onUpdate }) {
  const [isListening, setIsListening] = React.useState(false);
  const [isMuted, setIsMuted] = React.useState(false);
  const [lastCommand, setLastCommand] = React.useState("Say 'Hey AutoDrive' to start");

  const startListening = () => {
    setIsListening(true);
    setLastCommand("Listening for command...");
    
    // Simulate voice recognition
    setTimeout(() => {
      const commands = [
        { text: "Navigate to home", action: () => onUpdate({ ...status, destination: "Home", speed: 45 }) },
        { text: "Set speed to 65 mph", action: () => onUpdate({ ...status, speed: 65 }) },
        { text: "Increase temperature", action: () => onUpdate({ ...status, temperature: (status?.temperature || 72) + 2 }) },
        { text: "Decrease temperature", action: () => onUpdate({ ...status, temperature: (status?.temperature || 72) - 2 }) },
        { text: "Stop the car", action: () => onUpdate({ ...status, speed: 0, steering_angle: 0 }) },
      ];
      const randomCommand = commands[Math.floor(Math.random() * commands.length)];
      
      setLastCommand(`Command received: "${randomCommand.text}"`);
      randomCommand.action(); // Execute the action
      setIsListening(false);
      
    }, 3000);
  };

  const stopListening = () => {
    setIsListening(false);
    setLastCommand("Voice recognition stopped");
  };

  const toggleMute = () => {
    setIsMuted(!isMuted);
  };

  return (
    <div className="space-y-6">
      {/* Voice Status */}
      <Card className="glass-effect border-green-500/30 bg-green-950/20">
        <CardContent className="pt-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                isListening ? 'bg-green-500 pulse-glow' : 'bg-green-600'
              }`}>
                <Mic className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="text-white font-medium">Voice Control</h3>
                <p className="text-green-300 text-sm">Hands-free operation</p>
              </div>
            </div>
            <Badge className={isListening ? "bg-green-500 text-green-100" : "bg-slate-600 text-slate-100"}>
              {isListening ? "Listening" : "Standby"}
            </Badge>
          </div>
          
          <div className="text-sm text-green-300">
            <MessageSquare className="w-4 h-4 inline mr-2" />
            {lastCommand}
          </div>
        </CardContent>
      </Card>

      {/* Voice Controls */}
      <div className="grid grid-cols-2 gap-4">
        <motion.div
          whileTap={{ scale: 0.95 }}
        >
          <Button
            onClick={isListening ? stopListening : startListening}
            className={`w-full h-20 ${
              isListening 
                ? 'bg-red-600 hover:bg-red-700 text-white' 
                : 'bg-green-600 hover:bg-green-700 text-white'
            } font-medium text-lg`}
          >
            {isListening ? <MicOff className="w-6 h-6 mr-2" /> : <Mic className="w-6 h-6 mr-2" />}
            {isListening ? 'Stop' : 'Talk'}
          </Button>
        </motion.div>

        <motion.div
          whileTap={{ scale: 0.95 }}
        >
          <Button
            onClick={toggleMute}
            variant="outline"
            className={`w-full h-20 glass-effect font-medium text-lg ${
              isMuted 
                ? 'border-red-500 text-red-400 hover:bg-red-900/30' 
                : 'border-slate-600 text-white hover:bg-slate-700'
            }`}
          >
            {isMuted ? <VolumeX className="w-6 h-6 mr-2" /> : <Volume2 className="w-6 h-6 mr-2" />}
            {isMuted ? 'Unmute' : 'Mute'}
          </Button>
        </motion.div>
      </div>

      {/* Quick Commands */}
      <div className="space-y-3">
        <h3 className="text-white font-medium">Quick Commands</h3>
        <div className="grid grid-cols-1 gap-2">
          {[
            { text: "Navigate home", action: () => onUpdate({ ...status, destination: "Home", speed: 45, steering_angle: 0 }) },
            { text: "Set cruise control", action: () => onUpdate({ ...status, speed: 65 }) },
            { text: "Find parking", action: () => onUpdate({ ...status, destination: "Nearby Parking", speed: 15, steering_angle: 0 }) },
            { text: "Emergency stop", action: () => onUpdate({ ...status, speed: 0, steering_angle: 0 }) },
          ].map((command, index) => (
            <Button
              key={index}
              variant="outline"
              className="glass-effect border-slate-600 text-slate-300 hover:bg-slate-700 justify-start"
              onClick={() => {
                setLastCommand(`Quick command: "${command.text}"`);
                command.action();
              }}
            >
              "Hey AutoDrive, {command.text.toLowerCase()}"
            </Button>
          ))}
        </div>
      </div>

      {/* Voice Settings */}
      <Card className="glass-effect border-slate-700">
        <CardContent className="pt-4">
          <h4 className="text-white font-medium mb-3">Voice Settings</h4>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-400">Wake Word</span>
              <span className="text-white">"Hey AutoDrive"</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Language</span>
              <span className="text-white">English (US)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Sensitivity</span>
              <span className="text-white">High</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
