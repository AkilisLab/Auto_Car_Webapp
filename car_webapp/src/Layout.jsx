import React, { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Car, Zap, Shield, Home, Settings, Tv } from "lucide-react";

export default function Layout({ children }) {
  const location = useLocation();
  const navItems = [
    { name: "Home", path: "/", icon: Home },
    { name: "Dashboard", path: "/Dashboard", icon: Tv },
    { name: "Connect", path: "/Settings", icon: Settings },
  ];

  const [deviceSummary, setDeviceSummary] = useState({
    connected: 0,
    available: 0,
    total: 0,
    error: false,
  });

  useEffect(() => {
    let cancelled = false;

    const fetchStatus = async () => {
      try {
        const response = await fetch("http://localhost:8000/devices");
        if (!response.ok) throw new Error("Failed to fetch devices");
        const data = await response.json();
        if (cancelled) return;
        const devices = Array.isArray(data.devices) ? data.devices : [];
        const vehicleDevices = devices.filter(
          (device) => (device.role || "pi").toLowerCase() !== "frontend"
        );
        const connected = vehicleDevices.filter((device) => device.connected).length;
        const available = vehicleDevices.filter((device) => device.available !== false).length;
        setDeviceSummary({ connected, available, total: vehicleDevices.length, error: false });
      } catch (error) {
        if (!cancelled) {
          setDeviceSummary((prev) => ({
            connected: prev.connected,
            available: prev.available,
            total: prev.total,
            error: true,
          }));
        }
      }
    };

    fetchStatus();
    const intervalId = setInterval(fetchStatus, 5000);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, []);

  let statusClass = "standby";
  let statusText = "Checking...";
  if (deviceSummary.error) {
    statusClass = "offline";
    statusText = "Status Unavailable";
  } else if (deviceSummary.connected > 0) {
    statusClass = "ok";
    statusText = deviceSummary.connected > 1 ? `Connected (${deviceSummary.connected})` : "Connected";
  } else if (deviceSummary.available > 0) {
    statusClass = "standby";
    statusText = deviceSummary.available > 1 ? `Ready (${deviceSummary.available})` : "Ready";
  } else {
    statusClass = "offline";
    statusText = "No Devices";
  }

  return (
    <div className="app-root">
      <style>
        {`
          /* base */
          :root {
            --bg-1: #06121a;
            --bg-2: #0b1624;
            --card: rgba(30,41,59,0.7);
            --muted: #98a0b3;
            --accent: #2fb7ff;
            --green: #00ff88;
            --glass-border: rgba(255,255,255,0.04);
          }
          html,body,#root { height:100%; margin:0; font-family: Inter, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial; color:#e6eef8; background: linear-gradient(180deg,var(--bg-1), var(--bg-2)); }

          /* header */
          .topbar {
            backdrop-filter: blur(8px);
            background: linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01));
            border-bottom: 1px solid var(--glass-border);
            padding: 12px 20px;
            position: sticky;
            top:0;
            z-index:50;
          }
          .topbar-inner { max-width:1200px; margin:0 auto; display:flex; align-items:center; justify-content:space-between; gap:16px; }

          .brand { display:flex; align-items:center; gap:12px; text-decoration:none; color:inherit; }
          .brand-badge { width:44px;height:44px;border-radius:10px; display:flex; align-items:center; justify-content:center; background:linear-gradient(135deg,#2f9bff,#3be1d0); box-shadow:0 4px 18px rgba(47,155,255,0.16); }
          .brand h1 { margin:0; font-size:16px; font-weight:700; color:#fff; }
          .brand p { margin:0; font-size:12px; color:var(--muted); }

          /* nav */
          .topnav { display:flex; gap:8px; align-items:center; }
          .topnav a { text-decoration:none; color:var(--muted); }
          .nav-link {
            display:inline-flex; align-items:center; gap:8px; padding:8px 12px; border-radius:10px;
            transition: background .12s, color .12s;
            color:var(--muted);
          }
          .nav-link:hover { background: rgba(255,255,255,0.03); color:#fff; }
          .nav-link.active { background: rgba(255,255,255,0.06); color:#fff; box-shadow: 0 4px 22px rgba(0,0,0,0.35); }

          /* status */
          .status { display:flex; gap:14px; align-items:center; color:var(--muted); }
          .status .ok { color: #2bd76a; display:flex; gap:8px; align-items:center; }
          .status .standby { color: #fbbf24; display:flex; gap:8px; align-items:center; }
          .status .offline { color: #f87171; display:flex; gap:8px; align-items:center; }

          /* main container - centers pages (hero) */
          .main { flex:1 1 auto; padding:48px 20px; }
          .container { max-width:1200px; margin:0 auto; }

          /* basic hero styles (so Home.jsx markup looks correct) */
          .hero { text-align:center; padding:64px 20px 96px; }
          .hero .hero-badge { width:84px;height:84px;margin:0 auto 18px;border-radius:14px;background:linear-gradient(135deg,#39aaff,#3be1d0); display:flex; align-items:center; justify-content:center; box-shadow:0 10px 40px rgba(0,0,0,0.45); }
          .hero h1 { font-size:56px; line-height:1; margin:0 0 14px; color:#fff; font-weight:800; letter-spacing:-1px; }
          .hero p { color:var(--muted); font-size:16px; margin:0 0 28px; max-width:720px; margin-left:auto; margin-right:auto; }

          .btn-primary {
            display:inline-flex; align-items:center; gap:10px; padding:12px 26px; border-radius:999px;
            background:linear-gradient(90deg,#1678ff,#5bd2ff); color:#fff; border:none; cursor:pointer;
            box-shadow: 0 8px 28px rgba(24,119,255,0.18), inset 0 -3px 8px rgba(0,0,0,0.12);
            font-weight:600;
          }

          /* footer */
          .footer { border-top:1px solid var(--glass-border); padding:14px 20px; color:var(--muted); text-align:center; }
          /* responsive tweaks */
          @media (max-width:768px) {
            .topnav { display:none; }
            .hero h1 { font-size:36px; }
          }
        `}
      </style>

      <header className="topbar">
        <div className="topbar-inner">
          <Link to="/" className="brand" aria-label="AutoDrive Home">
            <div className="brand-badge"><Car className="icon" /></div>
            <div>
              <h1>AutoDrive</h1>
              <p>Autonomous Control System</p>
            </div>
          </Link>

          <nav className="topnav" role="navigation" aria-label="Main navigation">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path;
              const Icon = item.icon;
              return (
                <Link key={item.name} to={item.path} className={`nav-link ${isActive ? "active" : ""}`}>
                  <Icon className="icon" />
                  <span style={{fontSize:13, fontWeight:600}}>{item.name}</span>
                </Link>
              );
            })}
          </nav>

          <div className="status" aria-live="polite">
            <div className={statusClass}><Zap className="icon" /> <span className="status-text">{statusText}</span></div>
            <div><Shield className="icon" /> <span className="status-text">Secure</span></div>
          </div>
        </div>
      </header>

      <main className="main">
        <div className="container">
          {/* wrap children so Home hero centers and spacing matches design */}
          {children}
        </div>
      </main>

      <footer className="footer">
        <div className="container">
          <p>© 2024 AutoDrive System • Advanced Autonomous Vehicle Control</p>
        </div>
      </footer>
    </div>
  );
}
