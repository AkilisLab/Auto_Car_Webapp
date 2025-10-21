import React from "react";
import { Routes, Route } from "react-router-dom";
import Layout from "./Layout.jsx";
import HomePage from "./pages/Home.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import SettingsPage from "./pages/Settings.jsx";

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/Dashboard" element={<Dashboard />} />
        <Route path="/Settings" element={<SettingsPage />} />
      </Routes>
    </Layout>
  );
}