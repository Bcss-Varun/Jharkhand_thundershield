# Jharkhand ThunderShield

AI-powered **State Thunderstorm Command & Control** dashboard for the Government of Jharkhand — live GIS risk mapping, weather & lightning monitoring, AI threat intelligence, sensor status, incident management, automated SOP rules, multi-channel alerting, analytics, and reporting.

Frontend-only demo built with **Vite + vanilla JS**. All data is mock/dummy (`js/data/mock.js`) — there is no backend.

## Local development

```bash
npm install
npm run dev        # http://localhost:5173
```

## Production build

```bash
npm run build      # outputs to dist/
npm run preview    # serve the production build locally
```

## Deploy (Vercel)

Import the repository in Vercel — it auto-detects Vite. Settings are pinned in `vercel.json`:

- Build command: `npm run build`
- Output directory: `dist`

The app uses hash routing (`#/route`), so no SPA rewrites are required. The Jharkhand district boundaries (`public/assets/jharkhand.geojson`) and logos are bundled into `dist/` at build time.

## Tech

Vanilla ES modules · Vite · Leaflet (maps) · ApexCharts (charts) · Lucide (icons) — chart/map/icon libraries load from CDN.
