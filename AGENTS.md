# AGENTS.md — AI Agent Reference for EYE

This document helps AI coding agents understand the EYE 3D viewer codebase for modification, debugging, and extension.

---

## Overview

EYE is a **zero-build, single-page 3D object viewer** served as static files via Nginx. It uses Three.js (r170) loaded via ES module import maps — there is no bundler, no transpiler, and no `node_modules`.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  index.html (single page, all UI structure)         │
│  ┌───────────────────────────────────────────────┐  │
│  │  app.js — Main orchestrator                   │  │
│  │  ├── SceneManager (scene-manager.js)          │  │
│  │  ├── FileLoader (file-loader.js)              │  │
│  │  ├── ComparisonMode (comparison-mode.js)      │  │
│  │  ├── MaterialPanel (material-panel.js)        │  │
│  │  ├── LightingPanel (lighting-panel.js)        │  │
│  │  ├── AnimationPanel (animation-panel.js)      │  │
│  │  └── HistoryPanel (history-panel.js)          │  │
│  │       └── HistoryStore (history-store.js)     │  │
│  └───────────────────────────────────────────────┘  │
│  style.css (complete design system)                  │
└─────────────────────────────────────────────────────┘
```

## Key Files

### `src/js/app.js`
- Entry point. Instantiates all modules.
- `_handleFiles(files)` — Central file routing. When comparison mode is active, routes to `ComparisonMode.loadToSlot()`. Otherwise loads into the main `SceneManager`.
- `_bindSidebarToggles()` — Responsive sidebar drawer logic.
- All UI event bindings: file upload, drag-and-drop, keyboard shortcuts, panel toggles.

### `src/js/scene-manager.js`
- Manages a single Three.js scene: renderer, camera, controls, lights, grid/axes helpers.
- `setModel(object, clips)` — Replaces current model, auto-fits camera.
- `_resize()` — Called every frame in `_animate()`, accounts for pixel ratio and 0-dimension guards.
- `_fitCameraToModel(object)` — Centers camera on model bounding box.
- Constructor takes a `<canvas>` element and sets up the full rendering pipeline.

### `src/js/file-loader.js`
- `loadFile(primaryFile, allFiles)` — Async. Returns `{ object, clips }`.
- `getFormatType(filename)` — Returns format string or null.
- Dynamically imports Three.js loaders as needed (GLTF, OBJ, PLY, FBX, STL, 3DM, Splat).
- DRACO decoder auto-configured for compressed glTF.

### `src/js/comparison-mode.js`
- Manages up to 4 comparison slots, each with its own `SceneManager`.
- `loadToSlot(slotIndex, files)` — Loads a file into a specific slot.
- `clearSlot(slotIndex)` — Clears a slot and hides it.
- Lazy initialization: `SceneManager` instances are created only when a slot becomes active.
- CSS grid layout is driven by `data-visible-slots` attribute on the grid container.

### `src/js/history-store.js`
- IndexedDB wrapper. Stores full file blobs + metadata.
- `save(file)` — Deduplicates by name+size.
- `getById(id)` — Returns the full entry with blob for reload.
- Max 30 entries, auto-trimmed.

### `src/css/style.css`
- Complete design system using CSS custom properties (`:root` variables).
- Responsive breakpoints at 1024px, 768px, and 480px.
- `html { zoom: 1.25 }` on desktop, reset to `zoom: 1` on ≤1024px.
- Sidebar overlay transitions in media queries.

### `nginx.conf`
- Serves `src/` as webroot. Includes MIME types for all 3D formats (`.glb`, `.gltf`, `.fbx`, `.3dm`, `.splat`, etc.) and `.wasm` for DRACO decoder.

### `Dockerfile`
- Single-stage: copies `src/` into `nginx:alpine` at `/usr/share/nginx/html/`.

## Common Tasks

### Add a new 3D format
1. Add the loader import in `file-loader.js` (dynamic import pattern).
2. Add a case in the `loadFile` switch.
3. Add the format to `FORMATS` map in `file-loader.js`.
4. Add a badge in `index.html` `.format-badges`.
5. Add the MIME type in `nginx.conf`.
6. Update the `accept` attribute on `#file-input` in `index.html`.

### Modify lighting defaults
Edit `_initLights()` in `scene-manager.js`. The `LightingPanel` reads initial values from the DOM inputs.

### Change the design system
All colors, fonts, and sizes are in `:root` CSS variables at the top of `style.css`.

### Add a new sidebar panel
1. Add HTML structure in `index.html` inside `#sidebar-left` or `#sidebar-right`.
2. Create a new JS module following the pattern of `material-panel.js`.
3. Instantiate it in `app.js` constructor.

## Running Locally

```bash
cd src && python3 -m http.server 8888
# Open http://localhost:8888
```

## Deploying

```bash
# Docker
docker build -t eye-3d-viewer . && docker run -p 8080:80 eye-3d-viewer

# Cloud Run
gcloud run deploy eye-3d-viewer --source . --region us-central1 --allow-unauthenticated
```

## Important Notes
- **No build step** — edit files directly and refresh the browser.
- **ES modules only** — all JS uses `import`/`export` via `<script type="importmap">`.
- **Three.js loaded from CDN** — version pinned at r170 in the import map in `index.html`.
- **Client-side only** — no server-side processing. All file handling happens in the browser.
- **IndexedDB for history** — no cookies, no localStorage. Data persists across sessions.
