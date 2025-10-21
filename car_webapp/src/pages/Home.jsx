import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Car, Zap } from 'lucide-react';
import { motion } from 'framer-motion';

export default function HomePage() {
  const bgImageUrl = "https://images.unsplash.com/photo-1533106418989-87423dec6922?q=80&w=1974&auto=format&fit=crop";

  return (
    <div className="relative min-h-screen flex items-center justify-center text-white overflow-hidden">
      {/* Background Image */}
      <div 
        className="absolute inset-0 bg-cover bg-center -z-10"
        style={{ backgroundImage: `url(${bgImageUrl})` }}
      >
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      </div>

      <div className="text-center p-4">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="flex flex-col items-center"
        >
          <div className="w-24 h-24 mb-6 bg-gradient-to-r from-blue-500 to-cyan-400 rounded-2xl flex items-center justify-center glow-blue shadow-2xl">
            <Car className="w-12 h-12 text-white" />
          </div>

          <h1 className="text-5xl md:text-7xl font-bold mb-4">
            Welcome to <span className="text-glow bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent">AutoDrive</span>
          </h1>

          <p className="text-lg md:text-xl text-slate-300 max-w-2xl mx-auto mb-10">
            The future of autonomous vehicle control. Seamlessly connect and command your vehicle with our advanced interface.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.5, ease: "easeOut" }}
        >
          <Link to="/Settings">
            <Button 
              size="lg" 
              className="h-14 px-10 text-lg font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg glow-blue transition-all duration-300 transform hover:scale-105"
            >
              <Zap className="w-6 h-6 mr-3" />
              Connect to Vehicle
            </Button>
          </Link>
        </motion.div>
      </div>
    </div>
  );
}