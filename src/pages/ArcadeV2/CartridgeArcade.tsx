import { useEffect, useRef, useState } from "react";
import {
  AmbientLight,
  Box3,
  BoxGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  PointLight,
  Raycaster,
  Scene,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import gsap from "gsap";
import { FaPlay, FaTrophy } from "react-icons/fa";
import LoadingSpinner from "../../components/LoadingSpinner";
import type { MachineData } from "../Arcade/games.tsx";
import {
  MARQUEE_GLOW,
  MARQUEE_NEON_COLORS,
  createScreenVideo,
  drawNeonMarquee,
  isLightweightDevice,
  marqueeFlicker,
  type ScreenVideo,
} from "../Arcade/cabinetParts.ts";
import { createArcadeAmbience, type ArcadeAmbience } from "../Arcade/arcadeAmbience.ts";
import { createCartridge, loadVideoStills, type Cartridge } from "./cartridge.ts";
import { playClunk, playStatic, playTick, playWhoosh } from "./arcadeSounds.ts";

// One arcade cabinet and a shelf of game cartridges. Pick a cartridge and it
// flies into the slot on the cabinet's control panel; the screen crackles to
// life with that game's attract video. Wide screens get a two-row shelf beside
// the cabinet; tall (phone) screens get one row on a ledge in front of it that
// you swipe through.

type Props = {
  games: MachineData[];
  initialGameName?: string;
  paused: boolean;
  onInsert: (game: MachineData) => void;
  onPlay: (game: MachineData) => void;
  onLeaderboard: (game: MachineData) => void;
};

type World = {
  focus: (index: number, fromUser?: boolean) => void;
  moveFocus: (dx: number, dy: number) => void;
  activate: (index: number) => void;
  setPaused: (paused: boolean) => void;
};

type Layout = "wall" | "ledge";

type CartState = {
  cart: Cartridge;
  home: Vector3; // resting spot, in the shelf group's space
  focus: { value: number };
  where: "shelf" | "flying" | "slot";
};

const PANEL_MATERIALS = new Set(["JoystickBase", "JoystickStick", "JoystickBall", "OrangeButton", "PurpleButton"]);
const SHELF_NEON = "#ff7a1a";
const TALL_ASPECT = 1.05; // narrower than this and the shelf becomes a swipeable ledge

const layoutFor = (width: number, height: number): Layout =>
  width / Math.max(height, 1) < TALL_ASPECT ? "ledge" : "wall";

// The cabinet model's screen UVs are flipped; video and idle canvases share this fix.
function orientForScreen(texture: CanvasTexture) {
  texture.flipY = true;
  texture.repeat.set(1, -1);
  texture.offset.set(0, 1);
}

export default function CartridgeArcade({
  games,
  initialGameName,
  paused,
  onInsert,
  onPlay,
  onLeaderboard,
}: Props) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const worldRef = useRef<World | null>(null);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const callbacksRef = useRef({ onInsert, onPlay });
  callbacksRef.current = { onInsert, onPlay };
  // Read once: inserting a cartridge updates ?game=, which must not rebuild the scene
  const initialGameRef = useRef(initialGameName);

  const [loading, setLoading] = useState(true);
  const [focused, setFocused] = useState(-1);
  const [inserted, setInserted] = useState(-1);
  const [layout, setLayout] = useState<Layout>(() => layoutFor(window.innerWidth, window.innerHeight));

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let disposed = false;
    const lightweight = isLightweightDevice();
    const size = () => ({
      width: mount.clientWidth || window.innerWidth,
      height: mount.clientHeight || window.innerHeight,
    });

    const scene = new Scene();
    const camera = new PerspectiveCamera(40, size().width / size().height, 0.05, 200);
    const renderer = new WebGLRenderer({ antialias: !lightweight });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, lightweight ? 1.5 : 2));
    renderer.setSize(size().width, size().height);
    renderer.domElement.style.display = "block";
    mount.appendChild(renderer.domElement);

    const ambientLight = new AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);
    const pointLight = new PointLight(0xffaa55, 1, 50);
    pointLight.position.set(0, 5, 5);
    scene.add(pointLight);
    const directionalLight = new DirectionalLight(0xffffff, 4);
    directionalLight.position.set(5, 10, 5);
    scene.add(directionalLight);
    const shelfLight = new PointLight(0xff8a3d, 2, 6);
    scene.add(shelfLight);

    const disposables: { dispose: () => void }[] = [];
    const track = <T extends { dispose: () => void }>(item: T) => {
      disposables.push(item);
      return item;
    };

    // --- Screen: idle "insert cartridge", static, then the attract video ---------------
    const screenCanvas = document.createElement("canvas");
    screenCanvas.width = 480;
    screenCanvas.height = 256;
    const screenContext = screenCanvas.getContext("2d");
    const screenTexture = track(new CanvasTexture(screenCanvas));
    screenTexture.colorSpace = SRGBColorSpace;
    orientForScreen(screenTexture);
    const noiseCanvas = document.createElement("canvas");
    noiseCanvas.width = 120;
    noiseCanvas.height = 64;
    const noiseContext = noiseCanvas.getContext("2d");
    let screenMode: "idle" | "static" | "video" = "idle";
    let staticUntil = 0;
    let lastIdleBlink = -1;
    let screenVideo: ScreenVideo | null = null;
    let screenMaterial: MeshStandardMaterial | null = null;

    const paintScreen = (time: number) => {
      if (!screenContext || screenMode === "video") return;
      const { width, height } = screenCanvas;
      if (screenMode === "static" && noiseContext) {
        const image = noiseContext.createImageData(noiseCanvas.width, noiseCanvas.height);
        for (let i = 0; i < image.data.length; i += 4) {
          const v = Math.random() * 255;
          image.data[i] = image.data[i + 1] = image.data[i + 2] = v;
          image.data[i + 3] = 255;
        }
        noiseContext.putImageData(image, 0, 0);
        screenContext.imageSmoothingEnabled = false;
        screenContext.drawImage(noiseCanvas, 0, 0, width, height);
        screenTexture.needsUpdate = true;
        return;
      }
      const blink = Math.floor(time * 1.6) % 2;
      if (blink === lastIdleBlink) return;
      lastIdleBlink = blink;
      screenContext.fillStyle = "#07040b";
      screenContext.fillRect(0, 0, width, height);
      const glow = screenContext.createRadialGradient(width / 2, height / 2, 10, width / 2, height / 2, width * 0.6);
      glow.addColorStop(0, "rgba(255, 122, 26, 0.16)");
      glow.addColorStop(1, "rgba(255, 122, 26, 0)");
      screenContext.fillStyle = glow;
      screenContext.fillRect(0, 0, width, height);
      screenContext.textAlign = "center";
      screenContext.textBaseline = "middle";
      if (blink === 0) {
        screenContext.font = "54px Zombie, Creepster, cursive";
        screenContext.shadowColor = SHELF_NEON;
        screenContext.shadowBlur = 18;
        screenContext.fillStyle = "#ffd2a8";
        screenContext.fillText("INSERT CARTRIDGE", width / 2, height / 2 - 14);
        screenContext.shadowBlur = 0;
      }
      screenContext.font = "600 20px system-ui, sans-serif";
      screenContext.fillStyle = "rgba(255, 220, 190, 0.6)";
      screenContext.fillText("pick a game from the shelf", width / 2, height / 2 + 40);
      screenContext.fillStyle = "rgba(0, 0, 0, 0.28)";
      for (let y = 0; y < height; y += 4) screenContext.fillRect(0, y, width, 2);
      screenTexture.needsUpdate = true;
    };

    const showOnScreen = (texture: CanvasTexture) => {
      if (!screenMaterial) return;
      screenMaterial.map = texture;
      screenMaterial.emissiveMap = texture;
      screenMaterial.needsUpdate = true;
    };

    const stopVideo = () => {
      screenVideo?.dispose();
      screenVideo = null;
    };

    const startVideo = (game: MachineData) => {
      stopVideo();
      if (!game.videoUrl) {
        screenMode = "idle";
        lastIdleBlink = -1;
        showOnScreen(screenTexture);
        return;
      }
      screenVideo = createScreenVideo(game.videoUrl, lightweight);
      screenMode = "video";
      showOnScreen(screenVideo.texture);
      syncVideo();
    };

    const syncVideo = () => {
      const video = screenVideo?.video;
      if (!video) return;
      if (!pausedRef.current && !document.hidden) {
        video.play().catch(() => {
          // Autoplay can be denied; the first frame still shows
        });
      } else {
        video.pause();
      }
    };

    // --- Marquee ------------------------------------------------------------------------
    const marqueeCanvas = document.createElement("canvas");
    marqueeCanvas.width = 2048;
    marqueeCanvas.height = 340;
    const marqueeTexture = track(new CanvasTexture(marqueeCanvas));
    marqueeTexture.colorSpace = SRGBColorSpace;
    marqueeTexture.anisotropy = 8;
    let marqueeText = "Scareathon";
    let marqueeColor = MARQUEE_NEON_COLORS[0];
    let marqueeMaterial: MeshStandardMaterial | null = null;
    const paintMarquee = (text: string, color: string) => {
      marqueeText = text;
      marqueeColor = color;
      drawNeonMarquee(marqueeCanvas, text, color);
      marqueeTexture.needsUpdate = true;
    };
    paintMarquee(marqueeText, marqueeColor);
    document.fonts?.load("220px Zombie").then(() => {
      if (!disposed) paintMarquee(marqueeText, marqueeColor);
    }).catch(() => {});

    // --- State filled in once the cabinet model loads --------------------------------
    const holder = new Group(); // the cabinet, moved so it stands on y = 0 centred on x = z = 0
    scene.add(holder);
    const shelfGroup = new Group();
    scene.add(shelfGroup);
    let shelfMeshes: Mesh[] = [];
    let layoutMode: Layout | null = null;
    let cartSize = { width: 0.3, height: 0.36, depth: 0.08 };
    let pitchX = 0.4;
    let wallColumns = 1;
    const scroll = { x: 0 };
    const seat = new Vector3();
    let cabinetBox = new Box3();
    let rimMaterial: MeshBasicMaterial | null = null;
    const carts: CartState[] = [];
    let focusIndex = -1;
    let insertedIndex = -1;
    let busy = false;
    let ambience: ArcadeAmbience | null = null;
    const cameraBase = new Vector3();
    const cameraTarget = new Vector3();
    const shake = { value: 0 };

    const buildShelf = (mode: Layout) => {
      layoutMode = mode;
      shelfMeshes.forEach((mesh) => {
        shelfGroup.remove(mesh);
        mesh.geometry.dispose();
      });
      shelfMeshes = [];
      const { width: w, height: h, depth: d } = cartSize;
      const cabinetSize = cabinetBox.getSize(new Vector3());
      const wood = track(new MeshStandardMaterial({ color: new Color("#2b1a22"), roughness: 0.9 }));
      const neon = track(new MeshBasicMaterial({ color: new Color(SHELF_NEON) }));
      const plankT = h * 0.07;
      const addBox = (sx: number, sy: number, sz: number, x: number, y: number, z: number, material: MeshStandardMaterial | MeshBasicMaterial) => {
        const mesh = new Mesh(new BoxGeometry(sx, sy, sz), material);
        mesh.position.set(x, y, z);
        shelfGroup.add(mesh);
        shelfMeshes.push(mesh);
      };

      if (mode === "wall") {
        const rows = games.length > 4 ? 2 : 1;
        wallColumns = Math.ceil(games.length / rows);
        pitchX = w * 1.32;
        const pitchY = h * 1.5;
        const width = wallColumns * pitchX + w * 0.3;
        const depth = d * 3.4;
        const baseY = cabinetSize.y * 0.16;
        const top = baseY + rows * pitchY;
        shelfGroup.position.set(cabinetBox.max.x + cabinetSize.x * 0.35 + width / 2, 0, 0);
        for (let r = 0; r <= rows; r += 1) {
          const y = baseY + r * pitchY;
          addBox(width, plankT, depth, 0, y, 0, wood);
          addBox(width, plankT * 0.35, plankT * 0.35, 0, y + plankT * 0.2, depth / 2, neon);
        }
        addBox(width, top - baseY + plankT, plankT, 0, (baseY + top) / 2, -depth / 2, wood);
        addBox(plankT, top + plankT / 2, depth, -width / 2, (top + plankT / 2) / 2, 0, wood);
        addBox(plankT, top + plankT / 2, depth, width / 2, (top + plankT / 2) / 2, 0, wood);
        carts.forEach((state, i) => {
          const row = Math.floor(i / wallColumns);
          const column = i % wallColumns;
          state.home.set(
            -width / 2 + w * 0.15 + pitchX * (column + 0.5),
            baseY + (rows - 1 - row) * pitchY + plankT / 2 + h / 2,
            0
          );
        });
        shelfLight.position.set(shelfGroup.position.x, top + h, depth * 2);
        scroll.x = 0;
      } else {
        pitchX = w * 1.45;
        const ledgeY = cabinetSize.y * 0.2;
        const depth = d * 3.4;
        const span = (games.length - 1) * pitchX;
        shelfGroup.position.set(0, 0, cabinetBox.max.z + d * 6);
        addBox(span + pitchX * 2, plankT, depth, span / 2, ledgeY, 0, wood);
        addBox(span + pitchX * 2, plankT * 0.35, plankT * 0.35, span / 2, ledgeY + plankT * 0.2, depth / 2, neon);
        carts.forEach((state, i) => {
          state.home.set(i * pitchX, ledgeY + plankT / 2 + h / 2, 0);
        });
        shelfLight.position.set(0, ledgeY + h * 2, shelfGroup.position.z + depth * 2);
        scroll.x = Math.max(0, focusIndex) * pitchX;
      }
      carts.forEach((state) => {
        if (state.where !== "shelf") return;
        shelfGroup.add(state.cart.group);
        state.cart.group.rotation.set(0, 0, 0);
      });
    };

    const fitCamera = () => {
      const { width, height } = size();
      const aspect = width / height;
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
      const box = cabinetBox.clone();
      if (layoutMode === "wall") {
        box.union(new Box3().setFromObject(shelfGroup));
      } else {
        // The ledge only needs to show its middle; it scrolls
        box.expandByPoint(new Vector3(0, cartSize.height, shelfGroup.position.z + cartSize.depth));
      }
      const extent = box.getSize(new Vector3());
      const center = box.getCenter(new Vector3());
      const tan = Math.tan((camera.fov * Math.PI) / 360);
      const distance =
        Math.max(extent.y / 2 / tan, extent.x / 2 / (tan * aspect)) * (layoutMode === "wall" ? 1.1 : 1.06) +
        extent.z / 2;
      // Look a little low so the scene sits above the info card, and from slightly above
      cameraTarget.set(center.x, center.y - extent.y * 0.06, center.z);
      cameraBase.set(center.x, center.y + extent.y * 0.1, center.z + distance);
      camera.position.copy(cameraBase);
      camera.lookAt(cameraTarget);
    };

    const homeWorld = (state: CartState) => {
      shelfGroup.updateMatrixWorld(true);
      return shelfGroup.localToWorld(state.home.clone());
    };

    // Fly an object along an arc to a world position, spinning `turns` times on the way.
    const flyTo = (object: Object3D, to: Vector3, duration: number, arc: number, turns: number, ease: string) => {
      const proxy = { t: 0 };
      let from = new Vector3();
      let fromRotation = { x: 0, y: 0 };
      const control = new Vector3();
      return gsap.to(proxy, {
        t: 1,
        duration,
        ease,
        onStart: () => {
          from = object.position.clone();
          fromRotation = { x: object.rotation.x, y: object.rotation.y };
          control.copy(from).lerp(to, 0.5);
          control.y = Math.max(from.y, to.y) + arc;
          control.z += arc * 0.6;
        },
        onUpdate: () => {
          const t = proxy.t;
          const u = 1 - t;
          object.position.set(
            u * u * from.x + 2 * u * t * control.x + t * t * to.x,
            u * u * from.y + 2 * u * t * control.y + t * t * to.y,
            u * u * from.z + 2 * u * t * control.z + t * t * to.z
          );
          object.rotation.x = fromRotation.x * u;
          object.rotation.y = fromRotation.y * u + turns * Math.PI * 2 * t;
        },
        onComplete: () => {
          object.rotation.y = 0;
        },
      });
    };

    const focus = (index: number, fromUser = false) => {
      if (index < 0 || index >= carts.length || index === focusIndex) return;
      if (focusIndex >= 0) gsap.to(carts[focusIndex].focus, { value: 0, duration: 0.2 });
      focusIndex = index;
      gsap.to(carts[index].focus, { value: 1, duration: 0.2 });
      if (layoutMode === "ledge") gsap.to(scroll, { x: index * pitchX, duration: 0.35, ease: "power2.out" });
      if (fromUser) playTick();
      setFocused(index);
    };

    const moveFocus = (dx: number, dy: number) => {
      const start = focusIndex < 0 ? Math.max(insertedIndex, 0) : focusIndex;
      let next = start + dx;
      if (layoutMode === "wall") next += dy * wallColumns;
      focus(Math.min(Math.max(next, 0), carts.length - 1), true);
    };

    const seatCartridge = (index: number, instant: boolean) => {
      const state = carts[index];
      const game = games[index];
      state.where = "slot";
      insertedIndex = index;
      setInserted(index);
      paintMarquee(game.name, MARQUEE_NEON_COLORS[index % MARQUEE_NEON_COLORS.length]);
      if (rimMaterial) rimMaterial.color.set(game.cartridge.color);
      if (instant) {
        startVideo(game);
        return;
      }
      playClunk();
      gsap.fromTo(shake, { value: cartSize.height * 0.06 }, { value: 0, duration: 0.35, ease: "power2.out" });
      if (rimMaterial) {
        const rim = new Color(game.cartridge.color);
        gsap.fromTo(rimMaterial.color, { r: 1, g: 1, b: 1 }, { r: rim.r, g: rim.g, b: rim.b, duration: 0.5 });
      }
      screenMode = "static";
      staticUntil = performance.now() / 1000 + 0.45;
      showOnScreen(screenTexture);
      playStatic();
      callbacksRef.current.onInsert(game);
    };

    const insert = (index: number) => {
      if (busy || index < 0 || index >= carts.length) return;
      const state = carts[index];
      if (state.where !== "shelf") return;
      busy = true;
      focus(index);
      const timeline = gsap.timeline({ onComplete: () => { busy = false; } });

      // Pop the current cartridge out and send it home first
      if (insertedIndex >= 0) {
        const old = carts[insertedIndex];
        const oldGroup = old.cart.group;
        insertedIndex = -1;
        setInserted(-1);
        stopVideo();
        screenMode = "idle";
        lastIdleBlink = -1;
        showOnScreen(screenTexture);
        paintMarquee("Scareathon", MARQUEE_NEON_COLORS[0]);
        if (rimMaterial) rimMaterial.color.set(SHELF_NEON);
        old.where = "flying";
        timeline.to(oldGroup.position, { y: seat.y + cartSize.height * 0.9, duration: 0.22, ease: "power2.out" });
        timeline.add(flyTo(oldGroup, homeWorld(old), 0.5, cartSize.height * 0.8, 0, "power2.inOut"));
        timeline.call(() => {
          shelfGroup.attach(oldGroup);
          oldGroup.position.copy(old.home);
          oldGroup.rotation.set(0, 0, 0);
          old.where = "shelf";
        });
      }

      const group = state.cart.group;
      timeline.call(() => {
        state.where = "flying";
        scene.attach(group);
        playWhoosh();
      }, undefined, insertedIndex >= 0 ? 0.35 : 0);
      const hover = seat.clone().add(new Vector3(0, cartSize.height * 1.05, 0));
      timeline.add(flyTo(group, hover, 0.7, cartSize.height * 1.2, 1, "power2.inOut"));
      timeline.to(group.position, { y: seat.y, duration: 0.16, ease: "power3.in" });
      timeline.call(() => seatCartridge(index, false));
    };

    const activate = (index: number) => {
      if (index < 0) return;
      if (carts[index]?.where === "slot") callbacksRef.current.onPlay(games[index]);
      else insert(index);
    };

    worldRef.current = {
      focus,
      moveFocus,
      activate,
      setPaused: () => syncVideo(),
    };

    // --- Load the cabinet, then build everything around it ----------------------------------
    let stopStills: (() => void) | null = null;
    new GLTFLoader().load("/models/ArcadeCabinet.glb", (gltf) => {
      if (disposed) return;
      const model = gltf.scene;
      model.scale.set(0.5, 0.5, 0.5);
      model.rotation.set(Math.PI / 2, Math.PI, -Math.PI * 2);
      holder.add(model);
      holder.updateMatrixWorld(true);
      const raw = new Box3().setFromObject(holder);
      const rawCenter = raw.getCenter(new Vector3());
      holder.position.set(-rawCenter.x, -raw.min.y, -rawCenter.z);
      holder.updateMatrixWorld(true);
      cabinetBox = new Box3().setFromObject(holder);

      const panelBox = new Box3();
      model.traverse((child) => {
        if (!(child instanceof Mesh) || !child.material) return;
        const material = child.material as MeshStandardMaterial;
        material.emissive = new Color(0x222222);
        material.emissiveIntensity = 0.25;
        if (material.name === "GreyScreen") {
          screenMaterial = material.clone();
          screenMaterial.emissive = new Color("#ffffff");
          screenMaterial.emissiveIntensity = 0.85;
          child.material = screenMaterial;
          showOnScreen(screenTexture);
        } else if (material.name === "Marque") {
          marqueeMaterial = material.clone();
          marqueeMaterial.map = marqueeTexture;
          marqueeMaterial.emissiveMap = marqueeTexture;
          marqueeMaterial.color = new Color("#ffffff");
          marqueeMaterial.emissive = new Color("#ffffff");
          marqueeMaterial.emissiveIntensity = MARQUEE_GLOW;
          child.material = marqueeMaterial;
        } else if (PANEL_MATERIALS.has(material.name)) {
          panelBox.union(new Box3().setFromObject(child));
        }
      });

      const cabinetSize = cabinetBox.getSize(new Vector3());
      const cartWidth = cabinetSize.x * 0.2;
      cartSize = { width: cartWidth, height: cartWidth * 1.2, depth: cartWidth * 0.26 };

      // The cartridge port: a dark block with a neon rim, between the two sets of controls
      const panelCenter = panelBox.isEmpty() ? new Vector3(0, cabinetSize.y * 0.45, cabinetBox.max.z * 0.6) : panelBox.getCenter(new Vector3());
      const portTop = (panelBox.isEmpty() ? panelCenter.y : panelBox.min.y) + cartSize.height * 0.12;
      const port = new Mesh(
        track(new BoxGeometry(cartSize.width * 1.22, cartSize.height * 0.3, cartSize.depth * 2.2)),
        track(new MeshStandardMaterial({ color: new Color("#0d0a10"), roughness: 0.6 }))
      );
      port.position.set(0, portTop - cartSize.height * 0.15, panelCenter.z);
      scene.add(port);
      rimMaterial = track(new MeshBasicMaterial({ color: new Color(SHELF_NEON) }));
      const rimThickness = cartSize.depth * 0.18;
      const rimGeometryX = track(new BoxGeometry(cartSize.width * 1.26, rimThickness, rimThickness));
      const rimGeometryZ = track(new BoxGeometry(rimThickness, rimThickness, cartSize.depth * 2.24));
      [-1, 1].forEach((side) => {
        const front = new Mesh(rimGeometryX, rimMaterial!);
        front.position.set(0, portTop, panelCenter.z + side * cartSize.depth * 1.1);
        scene.add(front);
        const end = new Mesh(rimGeometryZ, rimMaterial!);
        end.position.set(side * cartSize.width * 0.62, portTop, panelCenter.z);
        scene.add(end);
      });
      seat.set(0, portTop + cartSize.height / 2 - cartSize.height * 0.3, panelCenter.z);

      games.forEach((game, index) => {
        const cart = createCartridge(game.name, game.cartridge.tagline, game.cartridge.color, cartSize);
        cart.group.userData.cartIndex = index;
        carts.push({ cart, home: new Vector3(), focus: { value: 0 }, where: "shelf" });
        disposables.push(cart);
      });

      buildShelf(layoutFor(size().width, size().height));
      fitCamera();

      ambience = createArcadeAmbience({
        scene,
        ambientLight,
        machines: [holder],
        neonColors: [SHELF_NEON],
        glowLevel: () => 1,
      });

      const initial = games.findIndex((game) => game.name === initialGameRef.current);
      if (initial >= 0) {
        const group = carts[initial].cart.group;
        scene.attach(group);
        group.position.copy(seat);
        focus(initial);
        seatCartridge(initial, true);
      }

      stopStills = loadVideoStills(games.map((game) => game.videoUrl), (index, video) => {
        carts[index]?.cart.setPicture(video, video.videoWidth, video.videoHeight);
      });
      setLoading(false);
    });

    // --- Pointer: hover to focus, click/tap to insert or play, drag the ledge ----------------
    const raycaster = new Raycaster();
    const pointer = new Vector2();
    const pick = (clientX: number, clientY: number): { kind: "cart"; index: number } | { kind: "cabinet" } | null => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      const targets: Object3D[] = [holder, ...carts.map((state) => state.cart.group)];
      for (const hit of raycaster.intersectObjects(targets, true)) {
        for (let node: Object3D | null = hit.object; node; node = node.parent) {
          if (typeof node.userData.cartIndex === "number") return { kind: "cart", index: node.userData.cartIndex };
          if (node === holder) return { kind: "cabinet" };
        }
      }
      return null;
    };

    let press: { x: number; y: number; scroll: number; dragging: boolean } | null = null;
    const worldPerPixel = () => {
      const distance = camera.position.z - shelfGroup.position.z;
      const visibleHeight = 2 * Math.tan((camera.fov * Math.PI) / 360) * distance;
      return visibleHeight / renderer.domElement.clientHeight;
    };
    const snapLedge = () => {
      const index = Math.round(scroll.x / pitchX);
      const clamped = Math.min(Math.max(index, 0), carts.length - 1);
      if (clamped === focusIndex) gsap.to(scroll, { x: clamped * pitchX, duration: 0.3, ease: "power2.out" });
      else focus(clamped, true);
    };

    const onPointerDown = (event: PointerEvent) => {
      press = { x: event.clientX, y: event.clientY, scroll: scroll.x, dragging: false };
      renderer.domElement.setPointerCapture(event.pointerId);
    };
    const onPointerMove = (event: PointerEvent) => {
      if (press) {
        const dx = event.clientX - press.x;
        if (layoutMode === "ledge" && (press.dragging || Math.abs(dx) > 8)) {
          press.dragging = true;
          gsap.killTweensOf(scroll);
          const limit = (carts.length - 1) * pitchX;
          scroll.x = Math.min(Math.max(press.scroll - dx * worldPerPixel(), -pitchX * 0.4), limit + pitchX * 0.4);
        }
        return;
      }
      if (event.pointerType !== "mouse") return;
      const hit = pick(event.clientX, event.clientY);
      if (hit?.kind === "cart" && carts[hit.index].where === "shelf") focus(hit.index);
      const clickable = hit?.kind === "cart" || (hit?.kind === "cabinet" && insertedIndex >= 0);
      renderer.domElement.style.cursor = clickable ? "pointer" : "default";
    };
    const onPointerUp = (event: PointerEvent) => {
      const wasDragging = press?.dragging;
      press = null;
      if (wasDragging) {
        snapLedge();
        return;
      }
      const hit = pick(event.clientX, event.clientY);
      if (hit?.kind === "cart") activate(hit.index);
      else if (hit?.kind === "cabinet" && insertedIndex >= 0) callbacksRef.current.onPlay(games[insertedIndex]);
    };
    const onWheel = (event: WheelEvent) => {
      if (layoutMode !== "ledge" || Math.abs(event.deltaX) + Math.abs(event.deltaY) < 4) return;
      moveFocus(Math.sign(event.deltaX || event.deltaY), 0);
    };
    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerup", onPointerUp);
    renderer.domElement.addEventListener("pointercancel", () => { press = null; });
    renderer.domElement.addEventListener("wheel", onWheel, { passive: true });

    // --- Render loop -----------------------------------------------------------------
    let frame = 0;
    let lastTime = performance.now() / 1000;
    const animate = () => {
      frame = requestAnimationFrame(animate);
      if (pausedRef.current) return; // a game is open on top; leave the GPU to it
      const time = performance.now() / 1000;
      ambience?.update(time, Math.min(time - lastTime, 0.1));
      lastTime = time;

      if (screenMode === "static" && time > staticUntil && insertedIndex >= 0) startVideo(games[insertedIndex]);
      paintScreen(time);
      screenVideo?.updateFrame();
      if (marqueeMaterial) marqueeMaterial.emissiveIntensity = MARQUEE_GLOW * marqueeFlicker(time, 0);

      if (layoutMode === "ledge") shelfGroup.position.x = -scroll.x;
      carts.forEach((state) => {
        const f = state.focus.value;
        state.cart.setHighlight(state.where === "slot" ? 0.6 : f);
        if (state.where !== "shelf") return;
        const group = state.cart.group;
        group.position.set(state.home.x, state.home.y + cartSize.height * 0.08 * f, state.home.z + cartSize.depth * 1.8 * f);
        group.rotation.x = 0.15 * f;
      });

      camera.position.copy(cameraBase);
      if (shake.value > 0) {
        camera.position.x += (Math.random() - 0.5) * shake.value;
        camera.position.y += (Math.random() - 0.5) * shake.value;
      }
      camera.lookAt(cameraTarget);
      renderer.render(scene, camera);
    };
    animate();

    // --- Resize, visibility, cleanup -----------------------------------------------------
    const onResize = () => {
      const { width, height } = size();
      renderer.setSize(width, height);
      const mode = layoutFor(width, height);
      setLayout(mode);
      if (!carts.length) return;
      if (mode !== layoutMode) buildShelf(mode);
      fitCamera();
    };
    const resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(mount);
    document.addEventListener("visibilitychange", syncVideo);

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      document.removeEventListener("visibilitychange", syncVideo);
      stopStills?.();
      stopVideo();
      gsap.killTweensOf(scroll);
      carts.forEach((state) => gsap.killTweensOf(state.focus));
      shelfMeshes.forEach((mesh) => mesh.geometry.dispose());
      ambience?.dispose();
      disposables.forEach((item) => item.dispose());
      renderer.dispose();
      mount.removeChild(renderer.domElement);
      worldRef.current = null;
    };
  }, [games]);

  useEffect(() => {
    worldRef.current?.setPaused(paused);
  }, [paused]);

  // Keyboard: arrows browse, Enter inserts (or plays the inserted game)
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (paused) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("button, input, textarea, select, a")) return;
      const world = worldRef.current;
      if (!world) return;
      const moves: Record<string, [number, number]> = {
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
      };
      if (moves[event.key]) {
        event.preventDefault();
        world.moveFocus(...moves[event.key]);
      } else if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        world.activate(focused >= 0 ? focused : inserted);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [paused, focused, inserted]);

  const shown = focused >= 0 ? focused : inserted;
  const shownGame = games[shown];
  const shownIsInserted = shown >= 0 && shown === inserted;
  const insertedGame = games[inserted];

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-black">
      <div ref={mountRef} className="absolute inset-0" style={{ touchAction: "none" }} />
      {loading && <LoadingSpinner />}

      {!loading && (
        <div
          className={`pointer-events-none absolute left-1/2 z-10 flex w-[min(92vw,34rem)] -translate-x-1/2 flex-col items-center gap-3 text-center ${
            layout === "ledge" ? "top-20" : "bottom-6"
          }`}
        >
          {shownGame ? (
            <div className="pointer-events-auto w-full rounded-xl border border-orange-500/40 bg-black/75 px-5 py-3 shadow-glow backdrop-blur-sm">
              <h2 className="font-zombie text-3xl tracking-wide text-orange-200" style={{ textShadow: `0 0 12px ${shownGame.cartridge.color}` }}>
                {shownGame.name}
              </h2>
              <p className="text-sm text-orange-100/75">{shownGame.cartridge.tagline}</p>
              <div className="mt-3 flex justify-center gap-2">
                {shownIsInserted ? (
                  <>
                    <button
                      type="button"
                      onClick={() => onPlay(shownGame)}
                      className="flex items-center gap-2 rounded bg-orange-500 px-5 py-2 font-bold text-black transition hover:bg-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-200"
                    >
                      <FaPlay aria-hidden="true" /> Play
                    </button>
                    {shownGame.hasLeaderboard !== false && (
                      <button
                        type="button"
                        onClick={() => onLeaderboard(shownGame)}
                        className="flex items-center gap-2 rounded border border-orange-500/70 bg-black/60 px-4 py-2 font-semibold text-orange-100 transition hover:border-orange-300 hover:bg-orange-950 focus:outline-none focus:ring-2 focus:ring-orange-200"
                      >
                        <FaTrophy aria-hidden="true" /> Leaderboard
                      </button>
                    )}
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => worldRef.current?.activate(shown)}
                    className="rounded border border-orange-500/70 bg-black/60 px-5 py-2 font-semibold text-orange-100 transition hover:border-orange-300 hover:bg-orange-950 focus:outline-none focus:ring-2 focus:ring-orange-200"
                  >
                    Plug it in
                  </button>
                )}
              </div>
            </div>
          ) : (
            <p className="rounded-full bg-black/60 px-4 py-2 text-sm text-orange-100/80">
              {layout === "ledge" ? "Swipe the shelf and tap a cartridge" : "Pick a cartridge from the shelf"}
            </p>
          )}
          {insertedGame && !shownIsInserted && (
            <p className="rounded-full bg-black/60 px-3 py-1 text-xs text-orange-100/70">
              In the machine: {insertedGame.name}
            </p>
          )}
        </div>
      )}

      {/* Screen readers and keyboard users get the shelf as a plain list */}
      <ul className="sr-only" aria-label="Game cartridges">
        {games.map((game, index) => (
          <li key={game.name}>
            <button type="button" onClick={() => worldRef.current?.activate(index)}>
              {index === inserted ? `Play ${game.name}` : `Plug in ${game.name}`}: {game.cartridge.tagline}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
