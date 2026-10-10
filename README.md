# BlockAR Studio v2

A mobile-first 3D construction studio being developed toward hand-controlled building, roller-coaster tracks, and real-world AR.

## Current features in the repository

- Responsive mobile-first dark interface.
- Three.js 3D workspace with cube, sphere, and pyramid placement.
- Touch-first Build, Move, and Delete modes.
- Color selection, full-scene Undo/Redo for block and track edits, local Save/Load, and clear workspace.
- Camera preview with permission/error handling.
- MediaPipe Hand Landmarker integration: pinch thumb and index finger to place the selected object on the 3D floor, with separate pinch/release thresholds to reduce jitter.
- GPU inference is attempted first, with a CPU fallback.
- Pinch hysteresis uses separate start/release thresholds; after a tracking interruption during a pinch, the user must visibly open their fingers before a new placement can trigger. This prevents accidental repeat placement on tracking recovery.
- Primary-hand selection follows the index fingertip nearest to the previous frame when two hands are visible, reducing cursor jumps if MediaPipe changes the order of its detected hands. A short-lived fingertip anchor is retained across brief occlusions to improve reacquisition.
- Basic coaster track drawing: switch to TRACK and tap multiple grid points to create an elevated curved rail with supports.
- Optional local `.spz` Gaussian-splat scene import using Spark, so a generated amusement-park scan can be loaded as visual scenery without bundling a large binary into the repository.
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
- Imported `.spz` scenery is a visual Gaussian-splat environment, not editable coaster geometry or a room-depth map. The user must select the asset from the device; the binary is not included in the Git repository.
- The current camera view is a camera-backed 3D overlay, **not yet calibrated/world-locked AR**. Objects are placed on a virtual floor, not anchored to real surfaces.
- Coaster track editing is a first version: it creates a curved rail and supports, but there is no train, collision physics, or ride preview yet.
- A GitHub Actions build and physical-device test must pass before calling the app verified.
- The Pages workflow is committed, but its deployment has not yet been confirmed.

## Roadmap

1. Confirm the production build and deployment workflow.
2. Continue the hand-system foundation: validate cursor/video crop mapping on real Android devices, validate stable primary-hand selection and add richer gesture states, then implement true grab-and-drag (the current pinch action places objects; it does not yet drag them).
3. Add coaster editing (undo, remove last point, track height/shape controls) and ride preview.
4. Add WebXR hit testing for supported phones/browsers.
5. Test on real Android devices and fix issues reported by the browser.
