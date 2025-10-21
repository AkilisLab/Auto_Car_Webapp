import React from "react";
import { Link, useLocation } from "react-router-dom";
import { Car, Zap, Shield, Home, Settings, Tv } from "lucide-react";

export default function Layout({ children }) {
  const location = useLocation();
  const navItems = [
    { name: "Home", path: "/", icon: Home },
    { name: "Dashboard", path: "/Dashboard", icon: Tv },
    { name: "Connect", path: "/Settings", icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col">
      <style>
        {`
          :root {
            --electric-blue: #00D4FF;
            --neon-green: #00FF88;
            --dark-slate: #0F172A;
            --medium-slate: #1E293B;
            --light-slate: #334155;
          }
          
          .glow-blue {
            box-shadow: 0 0 20px rgba(0, 212, 255, 0.3);
          }
          
          .glow-green {
            box-shadow: 0 0 20px rgba(0, 255, 136, 0.3);
          }
          
          .text-glow {
            text-shadow: 0 0 10px currentColor;
          }
          
          .glass-effect {
            background: rgba(30, 41, 59, 0.7);
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.1);
          }
          
          @keyframes pulse-glow {
            0%, 100% { box-shadow: 0 0 20px rgba(0, 212, 255, 0.3); }
            50% { box-shadow: 0 0 30px rgba(0, 212, 255, 0.6); }
          }
          
          .pulse-glow {
            animation: pulse-glow 2s infinite;
          }
        `}
      </style>
      
      {/* Top Status Bar */}
      <header className="glass-effect border-b border-slate-700/50 px-4 py-3 sticky top-0 z-50">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <Link to="/" className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-cyan-400 rounded-lg flex items-center justify-center glow-blue">
              <Car className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-white font-bold text-lg">AutoDrive</h1>
              <p className="text-slate-400 text-xs">Autonomous Control System</p>
            </div>
          </Link>
          
          {/* Navigation Links */}
          <nav className="hidden md:flex items-center gap-2">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <Link key={item.name} to={item.path}>
                  <div className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                    isActive
                      ? 'bg-slate-700/80 text-white'
                      : 'text-slate-400 hover:bg-slate-700/50 hover:text-white'
                  }`}>
                    <item.icon className="w-4 h-4" />
                    <span className="text-sm font-medium">{item.name}</span>
                  </div>
                </Link>
              );
            })}
          </nav>
          
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-green-400">
              <Zap className="w-4 h-4" />
              <span className="text-sm font-medium hidden md:block">Connected</span>
            </div>
            <div className="flex items-center gap-2 text-blue-400">
              <Shield className="w-4 h-4" />
              <span className="text-sm font-medium hidden md:block">Secure</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative flex-grow">
        {children}
      </main>

      {/* Footer */}
      <footer className="glass-effect border-t border-slate-700/50 px-4 py-3 mt-auto">
        <div className="text-center text-slate-500 text-xs max-w-7xl mx-auto">
          <p>© 2024 AutoDrive System • Advanced Autonomous Vehicle Control</p>
        </div>
      </footer>
    </div>
  );
}
