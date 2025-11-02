# Auto_Car_Webapp

A local React + Vite user app for controlling and monitoring autonomous vehicles. The project uses local mock data and simple UI components (no external base44 tooling).

Key files and structure:
- src/
  - App.jsx — route setup and layout wrapper
  - Layout.jsx — global layout, nav, header, footer
  - main.jsx — app bootstrap
  - components/
    - AudioControls.jsx
    - AutoControls.jsx
    - CarPovStream.jsx
    - ControlPanel.jsx
    - ManualControls.jsx
    - ModeSelector.jsx
    - VehicleStatus.jsx
    - ui/ (simple local UI primitives)
      - badge.jsx
      - button.jsx
      - card.jsx
      - input.jsx
      - label.jsx
      - slider.jsx
  - pages/
    - Home.jsx
    - Dashboard.jsx
    - Settings.jsx

Quick start (development):
1. Install dependencies
   - npm install
2. Run dev server
   - npm run dev
3. Open http://localhost:5173/

Build and deploy:
- Build for production:
  - npm run build
- Preview build locally:
  - npm run preview
- For Vercel: commit repo (exclude node_modules and secrets) and connect the GitHub repo to Vercel. Vercel will run the install and build steps automatically.

Notes:
- All UI imports use local relative paths (src/components/ui/*).
- No base44 or remote runtime libraries are required; pages use local mock data.
- Ignore: node_modules/, dist/, and .env* in Git.
