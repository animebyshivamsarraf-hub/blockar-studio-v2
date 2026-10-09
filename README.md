# BlockAR Studio v2

A mobile-first AR construction studio with 3D building, hand tracking, and roller coaster creation.

## Current foundation

- Responsive mobile-first dark interface.
- Three.js 3D workspace with cube, sphere, and pyramid placement.
- Touch-first Build, Move, and Delete modes.
- Color selection, Undo/Redo, local Save/Load, and clear workspace.
- Optional rear-camera preview with permission/error handling.
- TypeScript + Vite production build.

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

## Important status

This is the clean v2 foundation. Camera preview is **not yet world-locked AR**, and hand tracking plus roller-coaster track construction are planned next. A production build and physical-device check must pass before calling the app fully verified.

## Roadmap

1. Verify core 3D interactions and mobile touch behavior.
2. Add MediaPipe hand tracking with a safe touch fallback.
3. Add roller-coaster rails, curves, supports, and preview motion.
4. Add WebXR hit testing for supported phones/browsers.
5. Add automated build checks and deployment preview.
