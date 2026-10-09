# BlockAR Studio v2

A mobile-first 3D construction studio being developed toward hand-controlled building, roller-coaster tracks, and real-world AR.

## Current features in the repository

- Responsive mobile-first dark interface.
- Three.js 3D workspace with cube, sphere, and pyramid placement.
- Touch-first Build, Move, and Delete modes.
- Color selection, Undo/Redo for block edits, local Save/Load, and clear workspace.
- Camera preview with permission/error handling.
- MediaPipe Hand Landmarker integration: pinch thumb and index finger to place the selected object on the 3D floor.
- GPU inference is attempted first, with a CPU fallback.
- Basic coaster track drawing: switch to TRACK and tap multiple grid points to create an elevated curved rail with supports.
- Save/Load includes both blocks and track points.
- GitHub Actions build check and GitHub Pages deployment workflow.

## Run locally

Requires Node.js 20+.

```bash
npm install
npm run dev
```

## Production build

```bash
npm run build
npm run preview
```

## Important limitations

- Hand tracking requires camera permission, HTTPS (or localhost), and network access to load the MediaPipe model/WASM files.
- The current camera view is a camera-backed 3D overlay, **not yet calibrated/world-locked AR**. Objects are placed on a virtual floor, not anchored to real surfaces.
- Coaster track editing is a first version: it creates a curved rail and supports, but there is no train, collision physics, or ride preview yet.
- A GitHub Actions build and physical-device test must pass before calling the app verified.
- The Pages workflow is committed, but its deployment has not yet been confirmed.

## Roadmap

1. Confirm the production build and deployment workflow.
2. Improve hand pointer smoothing, selection, and stable pinch placement.
3. Add coaster editing (undo, remove last point, track height/shape controls) and ride preview.
4. Add WebXR hit testing for supported phones/browsers.
5. Test on real Android devices and fix issues reported by the browser.
