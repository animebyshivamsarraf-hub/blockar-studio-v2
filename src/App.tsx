import { useEffect, useRef, useState, type ChangeEvent, type PointerEvent } from "react";
import * as THREE from "three";
import type { HandLandmarker } from "@mediapipe/tasks-vision";
import { Camera, Hand, Box, Circle, Triangle, Undo2, Redo2, Trash2, Save, RotateCcw, Move3D, MousePointer2 } from "lucide-react";

type Shape = "cube" | "sphere" | "pyramid";
type Placed = { id: number; shape: Shape; color: string; x: number; z: number };
type TrackPoint = { x: number; z: number };
type SceneSnapshot = { blocks: Placed[]; trackPoints: TrackPoint[] };
const palette = ["#60a5fa", "#fb7185", "#fbbf24", "#34d399", "#c084fc", "#f8fafc"];

export default function App() {
  const stageRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const handCursorRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const parkSplatRef = useRef<THREE.Object3D | null>(null);
  const sparkRendererRef = useRef<THREE.Object3D | null>(null);
  const parkFileInputRef = useRef<HTMLInputElement>(null);
  const [parkLoaded, setParkLoaded] = useState(false);
  const [parkLoading, setParkLoading] = useState(false);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const objectsRef = useRef(new Map<number, THREE.Object3D>());
  const trackObjectsRef = useRef<THREE.Object3D[]>([]);
  const handLandmarkerRef = useRef<HandLandmarker | null>(null);
  const trackingRafRef = useRef<number>(0);
  const wasPinchingRef = useRef(false);
  // If a hand disappears while pinching, require a visible release before accepting
  // another pinch. This prevents accidental block placement when tracking returns.
  const pinchNeedsReleaseRef = useRef(false);
  const smoothedHandPointRef = useRef<{x:number;y:number;time:number}|null>(null);
  // Keep a short-lived raw landmark anchor across brief occlusions so the primary hand
  // can be reacquired without depending on MediaPipe's changing result order.
  const lastTrackedIndexRef = useRef<{x:number;y:number;time:number}|null>(null);
  const handLostAtRef = useRef(0);
  const trackingStartingRef = useRef(false);
  const cameraStartingRef = useRef(false);
  const sessionTokenRef = useRef(0);
  const placeAtRef = useRef<(x:number,z:number)=>void>(()=>{});
  const blocksRef = useRef<Placed[]>([]);
  const modeRef = useRef<"build" | "move" | "delete">("build");
  const trackModeRef = useRef(false);
  const snapshotRef = useRef<()=>void>(()=>{});
  const dragBlockIdRef = useRef<number | null>(null);
  const [trackingOn, setTrackingOn] = useState(false);
  const [handStatus, setHandStatus] = useState("HAND TRACKING OFF");
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [shape, setShape] = useState<Shape>("cube");
  const [color, setColor] = useState(palette[0]);
  const [mode, setMode] = useState<"build" | "move" | "delete">("build");
  const [blocks, setBlocks] = useState<Placed[]>([]);
  const [trackPoints, setTrackPoints] = useState<TrackPoint[]>([]);
  const [trackMode, setTrackMode] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [hint, setHint] = useState("Tap the grid to place your first block.");
  blocksRef.current = blocks;
  modeRef.current = mode;
  trackModeRef.current = trackMode;
  const history = useRef<SceneSnapshot[]>([]);
  const future = useRef<SceneSnapshot[]>([]);
  const nextId = useRef(1);

  useEffect(() => {
    const host = stageRef.current;
    if (!host) return;
    const scene = new THREE.Scene();
    scene.background = null;
    scene.fog = new THREE.Fog("#0b1020", 10, 24);
    const camera = new THREE.PerspectiveCamera(45, host.clientWidth / host.clientHeight, 0.1, 100);
    camera.position.set(6, 7, 9);
    camera.lookAt(0, 0, 0);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));
    renderer.setClearColor(0x0b1020, 0);
    renderer.setSize(host.clientWidth, host.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(renderer.domElement);
    renderer.domElement.style.touchAction = "none";
    scene.add(new THREE.HemisphereLight(0xc8ddff, 0x22253a, 2));
    const light = new THREE.DirectionalLight(0xffffff, 2.5);
    light.position.set(4, 9, 5); light.castShadow = true; scene.add(light);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(18, 18), new THREE.MeshStandardMaterial({ color: "#171e30", roughness: 0.92 }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -0.04; floor.receiveShadow = true; floor.name = "floor"; scene.add(floor);
    const grid = new THREE.GridHelper(18, 18, "#5b719b", "#29344d"); grid.position.y = -0.02; scene.add(grid);
    sceneRef.current = scene; cameraRef.current = camera; rendererRef.current = renderer;
    let raf = 0;
    const render = () => { raf = requestAnimationFrame(render); renderer.render(scene, camera); };
    render();
    const resize = () => { if (!host) return; camera.aspect = host.clientWidth / Math.max(1, host.clientHeight); camera.updateProjectionMatrix(); renderer.setSize(host.clientWidth, host.clientHeight); };
    const observer = new ResizeObserver(resize); observer.observe(host);
    return () => { cancelAnimationFrame(raf); observer.disconnect(); renderer.dispose(); renderer.domElement.remove(); scene.clear(); objectsRef.current.clear(); };
  }, []);

  useEffect(() => {
    const scene = sceneRef.current; if (!scene) return;
    for (const obj of objectsRef.current.values()) { scene.remove(obj); obj.traverse(n => { if (n instanceof THREE.Mesh || n instanceof THREE.LineSegments) { n.geometry.dispose(); const m=n.material; if(Array.isArray(m)) m.forEach(x=>x.dispose()); else m.dispose(); } }); }
    objectsRef.current.clear();
    for (const block of blocks) {
      let geometry: THREE.BufferGeometry;
      if (block.shape === "sphere") geometry = new THREE.SphereGeometry(0.48, 24, 16);
      else if (block.shape === "pyramid") geometry = new THREE.ConeGeometry(0.55, 0.9, 4);
      else geometry = new THREE.BoxGeometry(0.9, 0.9, 0.9);
      const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: block.color, roughness: 0.38, metalness: 0.12 }));
      mesh.position.set(block.x, 0.48, block.z); mesh.castShadow = true; mesh.receiveShadow = true; mesh.userData.blockId = block.id;
      if (selected === block.id) { const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), new THREE.LineBasicMaterial({ color: "#ffffff" })); mesh.add(edges); }
      scene.add(mesh); objectsRef.current.set(block.id, mesh);
    }
  }, [blocks, selected]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    for (const obj of trackObjectsRef.current) {
      scene.remove(obj);
      obj.traverse(node => {
        if (node instanceof THREE.Mesh) {
          node.geometry.dispose();
          const material = node.material;
          if (Array.isArray(material)) material.forEach(item => item.dispose());
          else material.dispose();
        }
      });
    }
    trackObjectsRef.current = [];
    if (trackPoints.length < 2) return;
    const pathPoints = trackPoints.map((point, index) => new THREE.Vector3(point.x, 0.42 + Math.sin(index * 1.1) * 0.55 + index * 0.035, point.z));
    const curve = new THREE.CatmullRomCurve3(pathPoints);
    const rail = new THREE.Mesh(
      new THREE.TubeGeometry(curve, Math.max(48, trackPoints.length * 16), 0.075, 8, false),
      new THREE.MeshStandardMaterial({ color: "#7dd3fc", emissive: "#0c4a6e", emissiveIntensity: 0.55, metalness: 0.45, roughness: 0.28 })
    );
    rail.castShadow = true;
    scene.add(rail);
    trackObjectsRef.current.push(rail);
    pathPoints.forEach(point => {
      const supportHeight = Math.max(0.08, point.y);
      const support = new THREE.Mesh(
        new THREE.CylinderGeometry(0.035, 0.05, supportHeight, 8),
        new THREE.MeshStandardMaterial({ color: "#94a3b8", metalness: 0.35, roughness: 0.5 })
      );
      support.position.set(point.x, supportHeight / 2 - 0.035, point.z);
      support.castShadow = true;
      scene.add(support);
      trackObjectsRef.current.push(support);
    });
    return () => {
      for (const obj of trackObjectsRef.current) {
        scene.remove(obj);
        obj.traverse(node => {
          if (node instanceof THREE.Mesh) {
            node.geometry.dispose();
            const material = node.material;
            if (Array.isArray(material)) material.forEach(item => item.dispose());
            else material.dispose();
          }
        });
      }
      trackObjectsRef.current = [];
    };
  }, [trackPoints]);

  const loadParkSplat = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Allow selecting the same file again after removing or replacing it.
    event.target.value = "";
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".spz")) {
      setHint("Choose a .spz Gaussian-splat scene file.");
      return;
    }
    const scene = sceneRef.current;
    const renderer = rendererRef.current;
    if (!scene || !renderer) {
      setHint("3D workspace is still starting. Try importing the park again.");
      return;
    }
    setParkLoading(true);
    setHint("Loading amusement-park scene… large scenes may take a little while on mobile.");
    let candidate: THREE.Object3D | null = null;
    try {
      // Spark supports the SPZ Gaussian-splat format. Load it only when requested
      // so the initial BlockAR bundle stays smaller for mobile users.
      const { SparkRenderer, SplatMesh } = await import("@sparkjsdev/spark");
      if (!sparkRendererRef.current) {
        const sparkRenderer = new SparkRenderer({ renderer });
        sparkRendererRef.current = sparkRenderer;
        scene.add(sparkRenderer);
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      const splat = new SplatMesh({ fileBytes: bytes, fileName: file.name, lod: true });
      splat.quaternion.set(1, 0, 0, 0);
      candidate = splat;
      await splat.initialized;
      const currentScene = sceneRef.current;
      if (!currentScene) throw new Error("The 3D workspace closed before the scene finished loading.");
      if (parkSplatRef.current) {
        currentScene.remove(parkSplatRef.current);
        const previous = parkSplatRef.current as THREE.Object3D & { dispose?: () => void };
        previous.dispose?.();
      }
      currentScene.add(splat);
      parkSplatRef.current = splat;
      setParkLoaded(true);
      setHint("Amusement-park Gaussian-splat scene loaded. It is visual scenery; coaster rails and blocks remain editable game objects.");
    } catch (error) {
      if (candidate) {
        sceneRef.current?.remove(candidate);
        const disposable = candidate as THREE.Object3D & { dispose?: () => void };
        disposable.dispose?.();
      }
      setHint(error instanceof Error ? "Could not load this SPZ scene: " + error.message : "Could not load this SPZ scene. Try a valid .spz file.");
    } finally {
      setParkLoading(false);
    }
  };
  const removeParkSplat = () => {
    const scene = sceneRef.current;
    if (scene && parkSplatRef.current) {
      scene.remove(parkSplatRef.current);
      const previous = parkSplatRef.current as THREE.Object3D & { dispose?: () => void };
      previous.dispose?.();
      parkSplatRef.current = null;
    }
    setParkLoaded(false);
    setHint("Amusement-park scenery removed. Your blocks and coaster track are unchanged.");
  };

  const snapshot = () => { history.current.push({ blocks: blocks.map(b => ({...b})), trackPoints: trackPoints.map(p => ({...p})) }); if(history.current.length>40) history.current.shift(); future.current=[]; };
  snapshotRef.current = snapshot;
  const placeAt = (x: number, z: number) => {
    if (trackMode) {
      snapshot();
      setTrackPoints(prev => [...prev, { x: Math.round(x), z: Math.round(z) }]);
      setHint("Coaster point added. Tap another grid point to extend the rail.");
      return;
    }
    if (mode === "delete" || mode === "move") {
      const nearest = blocks.filter(b => Math.hypot(b.x-x,b.z-z)<0.9).sort((a,b)=>Math.hypot(a.x-x,a.z-z)-Math.hypot(b.x-x,b.z-z))[0];
      if (!nearest) { setHint(mode === "delete" ? "Tap near a block to delete it." : "Tap near a block to select it."); return; }
      snapshot();
      if(mode==="delete") { setBlocks(prev=>prev.filter(b=>b.id!==nearest.id)); setSelected(null); setHint("Block deleted."); }
      else { setSelected(nearest.id); setBlocks(prev=>prev.map(b=>b.id===nearest.id?{...b,x:Math.round(x),z:Math.round(z)}:b)); setHint("Block moved."); }
      return;
    }
    snapshot(); const item={id:nextId.current++,shape,color,x:Math.round(x),z:Math.round(z)};
    setBlocks(prev=>[...prev,item]); setSelected(item.id); setHint("Block placed. Keep building!");
  };
  placeAtRef.current = placeAt;
  const onStagePointer = (e: PointerEvent<HTMLDivElement>) => {
    if(e.target !== e.currentTarget && !(e.target instanceof HTMLCanvasElement)) return;
    const scene=sceneRef.current,camera=cameraRef.current,renderer=rendererRef.current;
    if(!scene||!camera||!renderer)return;
    const rect=renderer.domElement.getBoundingClientRect();
    const raycaster=new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(((e.clientX-rect.left)/rect.width)*2-1,-((e.clientY-rect.top)/rect.height)*2+1),camera);
    const floor=scene.getObjectByName("floor"); if(!floor)return;
    const hits=raycaster.intersectObject(floor); if(!hits.length)return;
    const p=hits[0].point; placeAt(p.x,p.z);
  };
  const stopTracking = () => {
    // Invalidate any camera/model startup that is still awaiting an async operation.
    sessionTokenRef.current += 1;
    trackingStartingRef.current = false;
    cameraStartingRef.current = false;
    cancelAnimationFrame(trackingRafRef.current);
    handLandmarkerRef.current?.close();
    handLandmarkerRef.current = null;
    wasPinchingRef.current = false;
    pinchNeedsReleaseRef.current = false;
    smoothedHandPointRef.current = null;
    lastTrackedIndexRef.current = null;
    dragBlockIdRef.current = null;
    handLostAtRef.current = 0;
    if (handCursorRef.current) handCursorRef.current.style.opacity = "0";
    setTrackingOn(false);
    setHandStatus("HAND TRACKING OFF");
    const stream = videoRef.current?.srcObject as MediaStream | null;
    stream?.getTracks().forEach(track => track.stop());
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraOn(false);
  };

  const toggleTracking = async () => {
    if (trackingOn || trackingStartingRef.current) { stopTracking(); setHint("Camera and hand tracking stopped. Touch controls still work."); return; }
    if (cameraStartingRef.current) return;
    trackingStartingRef.current = true;
    const sessionToken = ++sessionTokenRef.current;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Camera needs HTTPS and browser permission.");
      setHandStatus("STARTING CAMERA…");
      const video = videoRef.current;
      if (!video) throw new Error("Camera preview is unavailable.");
      // Hand tracking needs the front-facing camera. Do not accidentally reuse the rear
      // camera opened by the separate camera-preview control.
      let stream = video.srcObject as MediaStream | null;
      const liveTrack = stream?.getVideoTracks().find(track => track.readyState === "live");
      const facingMode = liveTrack?.getSettings().facingMode;
      const isFrontCamera = facingMode === "user";
      if (!stream || !liveTrack || !isFrontCamera) {
        stream?.getTracks().forEach(track => track.stop());
        video.srcObject = null;
        stream = await navigator.mediaDevices.getUserMedia({
          video:{facingMode:{ideal:"user"},width:{ideal:640},height:{ideal:480},frameRate:{ideal:30,max:30}},
          audio:false
        });
        if (sessionToken !== sessionTokenRef.current) { stream.getTracks().forEach(track => track.stop()); return; }
        video.srcObject = stream;
      }
      await video.play();
      if (sessionToken !== sessionTokenRef.current) return;
      setCameraOn(true);
      setHandStatus("LOADING HAND MODEL…");
      // Load the comparatively large MediaPipe runtime only when hand tracking is requested.
      const { FilesetResolver, HandLandmarker } = await import("@mediapipe/tasks-vision");
      if (sessionToken !== sessionTokenRef.current) return;
      const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm");
      if (sessionToken !== sessionTokenRef.current) return;
      const modelOptions = {
        baseOptions: { modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task" },
        runningMode: "VIDEO" as const, numHands: 2
      };
      let landmarker: HandLandmarker;
      try {
        landmarker = await HandLandmarker.createFromOptions(vision, { ...modelOptions, baseOptions: { ...modelOptions.baseOptions, delegate: "GPU" } });
      } catch {
        landmarker = await HandLandmarker.createFromOptions(vision, modelOptions);
      }
      if (sessionToken !== sessionTokenRef.current) { landmarker.close(); return; }
      handLandmarkerRef.current = landmarker;
      setTrackingOn(true);
      setCameraError("");
      setHandStatus("SHOW YOUR HAND");
      setHint("Pinch your thumb and index finger to place the selected block.");
      let lastVideoTime = -1;
      const detect = () => {
        trackingRafRef.current = requestAnimationFrame(detect);
        const v = videoRef.current;
        const detector = handLandmarkerRef.current;
        if (!v || !detector || v.readyState < 2 || v.currentTime === lastVideoTime) return;
        lastVideoTime = v.currentTime;
        try {
          const result = detector.detectForVideo(v, performance.now());
          // MediaPipe can reorder its hand list between frames. Keep following the
          // hand nearest to the last index-finger position instead of blindly switching
          // to landmarks[0], which makes the cursor jump when two hands cross.
          const detectedHands = result.landmarks ?? [];
          const previousPoint = smoothedHandPointRef.current;
          const lastTracked = lastTrackedIndexRef.current;
          const identityAnchor = lastTracked && performance.now() - lastTracked.time < 900
            ? lastTracked
            : previousPoint;
          const hand = identityAnchor && detectedHands.length > 1
            ? detectedHands.reduce((closest, candidate) => {
                const candidateDistance = Math.hypot(candidate[8].x - identityAnchor.x, candidate[8].y - identityAnchor.y);
                const closestDistance = Math.hypot(closest[8].x - identityAnchor.x, closest[8].y - identityAnchor.y);
                return candidateDistance < closestDistance ? candidate : closest;
              })
            : detectedHands[0];
          if (!hand) {
            setHandStatus("HAND NOT FOUND");
            if (handCursorRef.current) handCursorRef.current.style.opacity = "0";
            if (!handLostAtRef.current) handLostAtRef.current = performance.now();
            // Keep the pinch latch briefly through occlusion, then re-arm so the user
            // can continue without needing to restart tracking.
            if (performance.now() - handLostAtRef.current > 350) {
              if (wasPinchingRef.current) pinchNeedsReleaseRef.current = true;
              wasPinchingRef.current = false;
              if (dragBlockIdRef.current !== null) {
                dragBlockIdRef.current = null;
                setHint("Hand lost. Block released in its current position.");
              }
            }
            smoothedHandPointRef.current = null;
            return;
          }
          handLostAtRef.current = 0;
          const thumb = hand[4], index = hand[8];
          lastTrackedIndexRef.current = { x: index.x, y: index.y, time: performance.now() };
          const pinchDistance = Math.hypot(thumb.x-index.x, thumb.y-index.y);
          // Use hysteresis to avoid flicker around the pinch threshold. After a tracking
          // interruption during a pinch, do not fire again until the fingers visibly open.
          if (pinchNeedsReleaseRef.current && pinchDistance > 0.085) {
            pinchNeedsReleaseRef.current = false;
            wasPinchingRef.current = false;
          }
          const pinching = !pinchNeedsReleaseRef.current &&
            (wasPinchingRef.current ? pinchDistance < 0.075 : pinchDistance < 0.05);
          setHandStatus(result.landmarks.length > 1 ? (pinching ? "2 HANDS · PINCH" : "2 HANDS TRACKED") : (pinching ? "PINCH DETECTED" : "HAND TRACKED"));

          // Smooth the index fingertip in screen space; faster motion follows more quickly.
          const now = performance.now();
          const previous = smoothedHandPointRef.current;
          const dt = previous ? Math.max(1, now - previous.time) : 16;
          const alpha = 1 - Math.exp(-dt / 55);
          const point = previous
            ? { x: previous.x + (index.x - previous.x) * alpha, y: previous.y + (index.y - previous.y) * alpha, time: now }
            : { x: index.x, y: index.y, time: now };
          smoothedHandPointRef.current = point;

          const video = videoRef.current;
          const rect = video?.getBoundingClientRect();
          if (video && rect && handCursorRef.current) {
            const sourceW = video.videoWidth || rect.width;
            const sourceH = video.videoHeight || rect.height;
            // Account for the center crop caused by object-fit: cover.
            const scale = Math.max(rect.width / sourceW, rect.height / sourceH);
            const renderedW = sourceW * scale, renderedH = sourceH * scale;
            const screenX = (point.x * renderedW - (renderedW - rect.width) / 2) / Math.max(1, rect.width);
            const screenY = (point.y * renderedH - (renderedH - rect.height) / 2) / Math.max(1, rect.height);
            handCursorRef.current.style.left = (screenX * 100) + "%";
            handCursorRef.current.style.top = (screenY * 100) + "%";
            handCursorRef.current.style.opacity = screenX >= 0 && screenX <= 1 && screenY >= 0 && screenY <= 1 ? "1" : "0";
            handCursorRef.current.dataset.pinch = String(pinching);
            const pinchStarted = pinching && !wasPinchingRef.current;
            const validScreenPoint = screenX >= 0 && screenX <= 1 && screenY >= 0 && screenY <= 1;
            if (pinching && validScreenPoint) {
              const scene = sceneRef.current, camera = cameraRef.current;
              if (scene && camera) {
                const raycaster = new THREE.Raycaster();
                raycaster.setFromCamera(new THREE.Vector2(screenX * 2 - 1, -(screenY * 2 - 1)), camera);
                const floor = scene.getObjectByName("floor");
                const hits = floor ? raycaster.intersectObject(floor) : [];
                if (hits.length) {
                  const target = hits[0].point;
                  if (pinchStarted) {
                    if (!trackModeRef.current && modeRef.current === "move") {
                      const nearest = blocksRef.current
                        .map(block => ({ block, distance: Math.hypot(block.x - target.x, block.z - target.z) }))
                        .filter(item => item.distance < 1.25)
                        .sort((a, b) => a.distance - b.distance)[0]?.block;
                      if (nearest) {
                        snapshotRef.current();
                        dragBlockIdRef.current = nearest.id;
                        setSelected(nearest.id);
                        setHint("Block grabbed. Move your pinched fingers, then open them to release.");
                      } else {
                        setHint("Move your hand over a block and pinch to grab it.");
                      }
                    } else {
                      placeAtRef.current(target.x, target.z);
                    }
                  }
                  if (dragBlockIdRef.current !== null) {
                    const id = dragBlockIdRef.current;
                    const x = Math.round(target.x * 2) / 2;
                    const z = Math.round(target.z * 2) / 2;
                    setBlocks(prev => {
                      const current = prev.find(block => block.id === id);
                      if (!current || (current.x === x && current.z === z)) return prev;
                      return prev.map(block => block.id === id ? { ...block, x, z } : block);
                    });
                  }
                }
              }
            }
            if (!pinching && wasPinchingRef.current && dragBlockIdRef.current !== null) {
              dragBlockIdRef.current = null;
              setHint("Block released.");
            }
          }
          wasPinchingRef.current = pinching;
        } catch {
          setHandStatus("TRACKING RETRYING");
        }
      };
      detect();
    } catch(err) {
      if (sessionToken !== sessionTokenRef.current) return;
      const message = err instanceof Error ? err.message : "Could not start hand tracking.";
      setCameraError(message + " You can still build with touch controls.");
      setHandStatus("TRACKING UNAVAILABLE");
      const stream = videoRef.current?.srcObject as MediaStream | null;
      stream?.getTracks().forEach(track => track.stop());
      if (videoRef.current) videoRef.current.srcObject = null;
      setCameraOn(false);
      setTrackingOn(false);
    } finally {
      if (sessionToken === sessionTokenRef.current) trackingStartingRef.current = false;
    }
  };

  const toggleCamera = async () => {
    // Hand tracking may still be loading before cameraOn becomes true; cancel that session first.
    if (trackingStartingRef.current) {
      stopTracking();
      setCameraError("");
      setHint("Camera and hand tracking startup cancelled. Touch controls still work.");
      return;
    }
    if (cameraStartingRef.current) { stopTracking(); setHint("Camera startup cancelled. Touch controls still work."); return; }
    if (cameraOn) {
      if (trackingStartingRef.current) {
        stopTracking();
        setCameraError("");
        setHint("Camera and hand tracking stopped. Touch controls still work.");
        return;
      }
      // The tracking session owns the stream while it is active; stop the whole session together.
      if (trackingOn) {
        stopTracking();
        setCameraError("");
        setHint("Camera and hand tracking stopped. Touch controls still work.");
        return;
      }
      const stream = videoRef.current?.srcObject as MediaStream | null;
      stream?.getTracks().forEach(track => track.stop());
      if (videoRef.current) videoRef.current.srcObject = null;
      setCameraOn(false);
      setCameraError("");
      return;
    }
    cameraStartingRef.current = true;
    const sessionToken = ++sessionTokenRef.current;
    try {
      if(!navigator.mediaDevices?.getUserMedia) throw new Error("Camera API unavailable. Open this app on HTTPS.");
      const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:"environment"},width:{ideal:1280},height:{ideal:720}},audio:false});
      if (sessionToken !== sessionTokenRef.current) { stream.getTracks().forEach(track => track.stop()); return; }
      if(videoRef.current){videoRef.current.srcObject=stream; await videoRef.current.play();}
      if (sessionToken !== sessionTokenRef.current) { stream.getTracks().forEach(track => track.stop()); return; }
      setCameraOn(true);setCameraError("");setHint("Camera ready. Tap the grid to place blocks.");
    } catch(err) { if (sessionToken === sessionTokenRef.current) { setCameraError(err instanceof Error?err.message:"Camera permission was denied.");setCameraOn(false); } }
    finally { if (sessionToken === sessionTokenRef.current) cameraStartingRef.current = false; }
  };
  useEffect(() => () => { cancelAnimationFrame(trackingRafRef.current); handLandmarkerRef.current?.close(); const stream=videoRef.current?.srcObject as MediaStream|null; stream?.getTracks().forEach(t=>t.stop()); if (parkSplatRef.current) { sceneRef.current?.remove(parkSplatRef.current); const splat = parkSplatRef.current as THREE.Object3D & { dispose?: () => void }; splat.dispose?.(); parkSplatRef.current = null; } if (sparkRendererRef.current) { sceneRef.current?.remove(sparkRendererRef.current); const spark = sparkRendererRef.current as THREE.Object3D & { dispose?: () => void }; spark.dispose?.(); sparkRendererRef.current = null; } }, []);
  const undo=()=>{if(!history.current.length)return;future.current.push({blocks:blocks.map(b=>({...b})),trackPoints:trackPoints.map(p=>({...p}))});const previous=history.current.pop()!;setBlocks(previous.blocks);setTrackPoints(previous.trackPoints);setSelected(null);setHint("Undo complete.");};
  const redo=()=>{if(!future.current.length)return;history.current.push({blocks:blocks.map(b=>({...b})),trackPoints:trackPoints.map(p=>({...p}))});const next=future.current.pop()!;setBlocks(next.blocks);setTrackPoints(next.trackPoints);setSelected(null);setHint("Redo complete.");};
  const save=()=>{try{localStorage.setItem("blockar-v2-scene",JSON.stringify({blocks,trackPoints}));setHint("Scene and coaster track saved on this device.");}catch{setHint("Could not save scene on this device.");}};
  const load=()=>{try{const raw=localStorage.getItem("blockar-v2-scene");if(!raw){setHint("No saved scene found yet.");return;}const saved=JSON.parse(raw) as Placed[]|{blocks:Placed[];trackPoints?:TrackPoint[]};const parsed=Array.isArray(saved)?saved:saved.blocks;const savedTrack=Array.isArray(saved)?[]:(saved.trackPoints??[]);if(!Array.isArray(parsed)||!parsed.every(b=>Number.isFinite(b.id)&&["cube","sphere","pyramid"].includes(b.shape)&&Number.isFinite(b.x)&&Number.isFinite(b.z)&&typeof b.color==="string")||!Array.isArray(savedTrack)||!savedTrack.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.z)))throw new Error("Invalid scene");snapshot();setBlocks(parsed);setTrackPoints(savedTrack);nextId.current=Math.max(1,...parsed.map(b=>b.id+1));setHint("Scene and track loaded.");}catch{setHint("Saved scene could not be loaded.");}};
  const clear=()=>{if(!blocks.length&&!trackPoints.length)return;snapshot();setBlocks([]);setTrackPoints([]);setSelected(null);setHint("Workspace and coaster track cleared.");};
  return <main className="app-shell">
    <header className="topbar"><div className="brand-mark"><Box size={22}/></div><div className="brand-copy"><strong>BlockAR <span>STUDIO</span></strong><small>BUILD YOUR WORLD</small></div><div className="top-spacer"/><div className="count-pill">{blocks.length} BLOCKS</div><button className={trackingOn?"icon-button active":"icon-button"} onClick={toggleTracking} aria-label={trackingOn?"Stop hand tracking":"Start hand tracking"}><Hand size={19}/></button><button className={cameraOn?"icon-button active":"icon-button"} onClick={toggleCamera} aria-label={cameraOn?"Turn camera off":"Turn camera on"}><Camera size={19}/></button></header>
    <section className="workspace"><video ref={videoRef} className={cameraOn?"camera-feed visible":"camera-feed"} playsInline muted autoPlay/><div ref={handCursorRef} className="hand-cursor" aria-hidden="true"/><div ref={stageRef} className="three-stage" onPointerDown={onStagePointer}/><div className="scene-badge"><span className="live-dot"/>{trackingOn?handStatus:cameraOn?"CAMERA LIVE":"3D WORKSPACE"} <span className="separator">/</span> {trackingOn?"PINCH TO PLACE":"TOUCH BUILD"}</div>
      {cameraError&&<div className="error-banner">{cameraError}</div>}
      <div className="hint-card"><MousePointer2 size={16}/><span>{hint}</span></div>
      <div className="workspace-actions"><button onClick={undo} disabled={!history.current.length} aria-label="Undo"><Undo2/></button><button onClick={redo} disabled={!future.current.length} aria-label="Redo"><Redo2/></button><button onClick={save} aria-label="Save scene"><Save/></button><button onClick={load} aria-label="Load scene"><RotateCcw/></button><button onClick={clear} aria-label="Clear workspace"><Trash2/></button></div>
      <div className="mode-switch">{(["build","move","delete"] as const).map(m=><button key={m} className={!trackMode&&mode===m?"mode active":"mode"} onClick={()=>{setTrackMode(false);setMode(m);setHint(m==="build"?"Tap the grid to place a block.":m==="move"?"Tap near a block to move it.":"Tap near a block to delete it.");}}>{m}</button>)}<button className={trackMode?"mode active":"mode"} onClick={()=>{setTrackMode(true);setHint("Tap the grid to add your first coaster track point.");}}>TRACK {trackPoints.length?`· ${trackPoints.length}`:""}</button></div>
    </section>
    <section className="tool-dock"><div className="dock-heading"><span>OBJECT</span><span className="dock-sub">TAP TO SELECT</span></div><div className="shape-row"><button className={shape==="cube"?"shape active":"shape"} onClick={()=>setShape("cube")}><Box/><span>Cube</span></button><button className={shape==="sphere"?"shape active":"shape"} onClick={()=>setShape("sphere")}><Circle/><span>Sphere</span></button><button className={shape==="pyramid"?"shape active":"shape"} onClick={()=>setShape("pyramid")}><Triangle/><span>Pyramid</span></button></div><div className="dock-heading palette-heading"><span>COLOR</span><span className="dock-sub">MATERIAL</span></div><div className="palette-row">{palette.map(c=><button key={c} className={color===c?"swatch active":"swatch"} style={{background:c}} onClick={()=>setColor(c)} aria-label={"Select color "+c}/>)}</div><button className="primary-build" onClick={()=>{setTrackMode(false);setMode("build");setHint("Tap anywhere on the grid to place a "+shape+".");}}><Move3D size={18}/> BUILD {shape.toUpperCase()} <span>↗</span></button>
      <input ref={parkFileInputRef} type="file" accept=".spz,application/octet-stream" onChange={loadParkSplat} style={{display:"none"}} aria-label="Choose amusement park SPZ scene"/>
      <button className="primary-build" style={{marginTop:8,background:"linear-gradient(135deg,#0f766e,#0891b2)"}} onClick={()=>parkFileInputRef.current?.click()} disabled={parkLoading}><Move3D size={18}/> {parkLoading?"LOADING PARK…":parkLoaded?"REPLACE PARK .SPZ":"IMPORT PARK .SPZ"} <span>↗</span></button>
      {parkLoaded&&<button className="primary-build" style={{marginTop:6,background:"#273449"}} onClick={removeParkSplat}>REMOVE PARK SCENERY</button>}<p className="footnote"><Hand size={14}/> Touch controls ready · Pinch to place when tracking is on</p></section>
  </main>;
}
