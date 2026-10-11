# BlockAR Studio v2

A mobile-first 3D construction studio being developed toward hand-controlled building, roller-coaster tracks, and real-world AR.

## Current features

- Responsive mobile-first dark interface and a Three.js 3D workspace.
- Place cubes, spheres, and pyramids; choose colors; use Build, Move, and Delete modes.
- Touch controls remain available even when the camera or hand model cannot start.
- Undo/Redo, local Save/Load, and clear workspace for blocks and coaster track edits.
- Camera preview and MediaPipe Hand Landmarker integration for one or two hands, with GPU inference attempted first and CPU fallback.
- Pinch hysteresis and fingertip smoothing to reduce jitter; primary-hand selection follows the fingertip nearest the previous frame to reduce jumps when two hands are visible.
- In Move mode, pinch near a block to grab it, move the pinched hand to reposition it on a half-unit grid, and open the fingers to release it.
- Coaster track drawing with two parallel rails, cross-ties, and evenly spaced support pillars.
- Optional local `.spz` Gaussian-splat scene import via Spark, loaded on demand instead of bundling a scene asset.

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

GitHub Actions runs `npm run build` on pushes to `main` and pull requests targeting `main`.

## Enable the hosted preview

The GitHub Pages deployment workflow is in `.github/workflows/deploy-pages.yml`. The repository owner must enable Pages once:

1. Open the repository **Settings → Pages**.
2. Under **Build and deployment**, set **Source** to **GitHub Actions**.
3. Return to **Actions** and confirm the latest **Deploy BlockAR Studio to GitHub Pages** run succeeds.

The intended project-site URL is:

`https://animebyshivamsarraf-hub.github.io/blockar-studio-v2/`

The URL only becomes available after Pages is enabled and the deployment workflow succeeds.

## Important limitations

- Camera access requires HTTPS (or localhost), browser camera permission, and network access for the MediaPipe model and WASM files.
- The camera-backed 3D overlay is **not yet calibrated or world-locked AR**. Blocks and coaster rails sit on a virtual floor, not surfaces detected in the real room.
- Coaster track height is currently generated procedurally from the order of track points; manual height controls, a coaster train, ride physics, and ride preview are not implemented yet.
- Imported `.spz` scenery is visual Gaussian-splat content, not editable coaster geometry or a room-depth map. The user must select the asset on the device; no scene binary is included in this repository.
- A green CI build does not prove camera/hand tracking works on every phone. Physical Android browser testing is still required.
- GitHub Pages deployment has not succeeded until the repository Pages setting above is enabled and a deployment run passes.

## Next steps

1. Enable Pages and verify the deployed site loads from the project URL.
2. Test hand cursor alignment, pinch and grab/drag on a real Android phone; fix any reported device-specific problems.
3. Add coaster point deletion and manual height/shape controls, then a ride preview and physics.
4. Add WebXR hit testing and world anchors for supported browsers and devices.
