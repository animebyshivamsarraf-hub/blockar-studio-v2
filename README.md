# BlockAR Studio v2

A mobile-first 3D construction studio being developed toward hand-controlled building, roller-coaster tracks, and real-world AR.

## Current features

- Responsive mobile-first dark interface.
- Three.js 3D workspace with cube, sphere, and pyramid placement.
- Touch-first Build, Move, and Delete modes.
- Color selection, Undo/Redo, local Save/Load, and clear workspace.
- Camera preview with permission/error handling.
- MediaPipe Hand Landmarker integration: pinch thumb and index finger to place the selected object on the 3D floor.
- GPU inference is attempted first, with a CPU fallback.
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
- Roller-coaster rails, physics, and ride preview are not implemented yet.
- A GitHub Actions build and physical-device test must pass before calling the app verified.

## Roadmap

1. Verify build and core interactions on a real phone.
2. Improve stable hand selection and pinch placement.
3. Add roller-coaster rails, curves, supports, and ride preview.
4. Add WebXR hit testing for supported phones/browsers.
5. Continue free GitHub Pages deployment and smoke tests.
