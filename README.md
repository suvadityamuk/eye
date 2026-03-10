# Eye - 3D Object Viewer

A browser-based 3D object viewer with a sci-fi HUD interface. View, inspect, and compare 3D models directly in your browser. No plugins, no installs.

**Live Demo**: [eye.suvadityamuk.com](https://eye.suvadityamuk.com)

---

## Features

### 3D Viewing
- **Drag & drop** or use the UPLOAD FILE button to load models
- **Orbit, zoom, and pan** with mouse or touch gestures
- **Grid and axes helpers** with toggle controls
- **Wireframe mode** for mesh inspection
- **Custom background color**
- **Fullscreen mode**

### Supported Formats
| Format | Extensions |
|--------|-----------|
| glTF / GLB | `.gltf`, `.glb` |
| Wavefront OBJ | `.obj` (+ `.mtl`) |
| Stanford PLY | `.ply` |
| Autodesk FBX | `.fbx` |
| STL | `.stl` |
| Rhino 3DM | `.3dm` |
| Gaussian Splat | `.splat` |
| OpenUSD | `.usd`, `.usda`, `.usdc`, `.usdz` *(coming soon)* |

### Comparison Mode
- Compare up to **4 models side-by-side** in a responsive grid
- Each slot has independent orbit controls
- Click **COMPARE** in the top bar to toggle

### Materials
- Browse all materials in a loaded model
- Edit color, metalness, roughness, emissive, and opacity per-material
- Upload custom textures (map, normal, roughness, metalness, emissive)

### Lighting
- **Ambient light** — intensity and color
- **Directional light** — intensity, color, azimuth, elevation
- **Point light** — toggle, intensity, color
- **Environment intensity** control
- **Show helpers** toggle for light visualization

### Animation
- Playback controls (play, stop, loop) in the bottom bar
- Timeline scrubber with speed control (0.1× – 3×)
- Animation clip selector for models with multiple animations

### History
- Previously viewed models are saved locally using **IndexedDB**
- Click any history item to instantly reload it
- Up to 30 entries, newest first
- All data stays on your device — nothing is sent to a server

### Responsive Design
- Works on **desktop, tablet, and mobile**
- Sidebars collapse into slide-out drawers on smaller screens
- Touch-friendly controls with larger tap targets

---

## Getting Started

### Prerequisites
- A modern web browser (Chrome, Firefox, Safari, Edge)
- For local development: Python 3 or any static file server

### Run Locally
```bash
cd src
python3 -m http.server 8888
```
Open [http://localhost:8888](http://localhost:8888)

### Deploy with Docker
```bash
docker build -t eye-3d-viewer .
docker run -p 8080:80 eye-3d-viewer
```

### Deploy to Cloud Run
```bash
gcloud run deploy eye-3d-viewer \
  --source . \
  --region us-central1 \
  --allow-unauthenticated
```

---

## Project Structure

```
eye/
├── Dockerfile              # Nginx-based container image
├── nginx.conf              # Server config with MIME types for 3D formats
├── README.md               # This file
├── AGENTS.md               # AI agent reference
└── src/
    ├── index.html           # Single-page app HTML
    ├── css/
    │   └── style.css        # Full design system + responsive breakpoints
    └── js/
        ├── app.js           # Main orchestrator — file handling, UI bindings
        ├── scene-manager.js # Three.js scene, camera, controls, rendering
        ├── file-loader.js   # Format detection and loader dispatch
        ├── comparison-mode.js # Multi-viewport comparison logic
        ├── material-panel.js  # Material inspection and editing
        ├── lighting-panel.js  # Light controls
        ├── animation-panel.js # Animation playback controls
        ├── history-panel.js   # History UI
        └── history-store.js   # IndexedDB persistence layer
```

---

## Tech Stack
- **Three.js** (r170) — 3D rendering via ES module imports
- **Vanilla JS** — no frameworks, no build step
- **Vanilla CSS** — custom design system with CSS variables
- **Nginx** — production static file server
- **IndexedDB** — client-side file history storage

## License
MIT
