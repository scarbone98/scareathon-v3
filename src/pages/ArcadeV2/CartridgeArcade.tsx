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
import GameCard from "./GameCard.tsx";

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
  intro: { value: number }; // 0 → 1 as it drops onto the shelf when the page opens
  where: "shelf" | "flying" | "slot";
};

const PANEL_MATERIALS = new Set(["JoystickBase", "JoystickStick", "JoystickBall", "OrangeButton", "PurpleButton"]);
const SHELF_NEON = "#ff7a1a";
const TALL_ASPECT = 1.05; // narrower than this and the shelf becomes a swipeable ledge
const NAV_CLEARANCE = 84; // px the site's top nav covers on wide screens; keep the cabinet below it
const LEDGE_CARD_SPACE = 0.3; // share of a tall screen kept clear under the scene for the info card
const POWER_ON = 0.26; // seconds for the CRT to warm up from a line to a full picture
const POWER_OFF = 0.3;
const STATIC = 0.4;

// Where the info card sits on wide screens: centred over the top of the shelf, in px
type CardAnchor = { x: number; y: number; width: number };

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
  const [cardAnchor, setCardAnchor] = useState<CardAnchor | null>(null);

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
    // idle → power (CRT warming up) → static → video; eject runs off → idle
    let screenMode: "idle" | "power" | "static" | "video" | "off" = "idle";
    let modeStart = 0;
    let staticUntil = 0;
    let lastIdleBlink = -1;
    let screenVideo: ScreenVideo | null = null;
    let screenMaterial: MeshStandardMaterial | null = null;

    const paintScreen = (time: number) => {
      if (!screenContext || screenMode === "video") return;
      const { width, height } = screenCanvas;
      if (screenMode === "power" || screenMode === "off") {
        // A CRT beam: a line that opens out to the full picture, or collapses back to a dot
        const t = Math.min((time - modeStart) / (screenMode === "power" ? POWER_ON : POWER_OFF), 1);
        const k = screenMode === "power" ? t : 1 - t;
        const lineWidth = width * Math.min(k / 0.35, 1);
        const lineHeight = k < 0.35 ? 3 : 3 + (height - 3) * ((k - 0.35) / 0.65) ** 2;
        screenContext.fillStyle = "#000";
        screenContext.fillRect(0, 0, width, height);
        screenContext.shadowColor = "#bfe6ff";
        screenContext.shadowBlur = 24;
        screenContext.fillStyle = `rgba(235, 248, 255, ${0.55 + 0.45 * (1 - k)})`;
        screenContext.fillRect((width - lineWidth) / 2, (height - lineHeight) / 2, lineWidth, lineHeight);
        screenContext.shadowBlur = 0;
        screenTexture.needsUpdate = true;
        lastIdleBlink = -1;
        return;
      }
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

    const startVideo = (game: MachineData, bloom = false) => {
      stopVideo();
      if (bloom && screenMaterial) {
        // The picture comes on bright and settles, like a tube warming up
        gsap.fromTo(screenMaterial, { emissiveIntensity: 2.2 }, { emissiveIntensity: 0.85, duration: 0.7, ease: "power2.out" });
      }
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
    const marqueeBoot = { value: 1 };
    // Neon catching: a few stutters before it holds
    const flickerMarquee = () => {
      gsap.killTweensOf(marqueeBoot);
      gsap
        .timeline()
        .set(marqueeBoot, { value: 0.05 })
        .to(marqueeBoot, { value: 1, duration: 0.04 }, 0.08)
        .to(marqueeBoot, { value: 0.12, duration: 0.03 }, 0.15)
        .to(marqueeBoot, { value: 0.9, duration: 0.04 }, 0.28)
        .to(marqueeBoot, { value: 0.3, duration: 0.03 }, 0.38)
        .to(marqueeBoot, { value: 1, duration: 0.25 }, 0.45);
    };
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
    const punch = { value: 0 }; // brief push of the camera toward the cabinet when a cartridge seats
    let sceneHeight = 1;
    const parallax = { x: 0, y: 0, targetX: 0, targetY: 0 };
    const shelfTop = new Vector3(); // top centre of the shelf, in the shelf group's space
    let shelfWidth = 0;
    let portLight: PointLight | null = null;

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
        shelfTop.set(0, top + plankT, 0);
        shelfWidth = width;
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
      sceneHeight = extent.y;
      // Fit the scene into the band of screen the page's chrome leaves free: under
      // the top nav on wide screens, above the info card on tall ones
      const reserveTop = layoutMode === "wall" ? Math.min(NAV_CLEARANCE, height * 0.14) : 0;
      const reserveBottom = layoutMode === "wall" ? height * 0.02 : height * LEDGE_CARD_SPACE;
      const freeShare = (height - reserveTop - reserveBottom) / height;
      const tan = Math.tan((camera.fov * Math.PI) / 360);
      const distance =
        Math.max(extent.y / 2 / (tan * freeShare), extent.x / 2 / (tan * aspect)) * (layoutMode === "wall" ? 1.06 : 1.04) +
        extent.z / 2;
      // Slide the camera so the scene's middle lands in the middle of that band
      const visibleHeight = 2 * tan * distance;
      const shiftY = ((reserveTop - reserveBottom) / 2 / height) * visibleHeight;
      cameraTarget.set(center.x, center.y + shiftY, center.z);
      cameraBase.set(center.x, center.y + shiftY + extent.y * 0.08, center.z + distance);
      camera.position.copy(cameraBase);
      camera.lookAt(cameraTarget);
      camera.updateMatrixWorld();

      if (layoutMode === "wall") {
        shelfGroup.updateMatrixWorld(true);
        const project = (local: Vector3) => {
          const p = shelfGroup.localToWorld(local.clone()).project(camera);
          return { x: ((p.x + 1) / 2) * width, y: ((1 - p.y) / 2) * height };
        };
        const top = project(shelfTop);
        const left = project(new Vector3(-shelfWidth / 2, shelfTop.y, 0));
        const right = project(new Vector3(shelfWidth / 2, shelfTop.y, 0));
        setCardAnchor({ x: top.x, y: top.y, width: right.x - left.x });
      } else {
        setCardAnchor(null);
      }
    };

    const homeWorld = (state: CartState) => {
      shelfGroup.updateMatrixWorld(true);
      return shelfGroup.localToWorld(state.home.clone());
    };

    // Fly an object along an arc to a world position, spinning `turns` times on the way.
    // `bank` rolls it into the turn, peaking mid-flight. Pass a function for a target
    // that moves, like a slot on a ledge that's still scrolling.
    const flyTo = (object: Object3D, target: Vector3 | (() => Vector3), duration: number, arc: number, turns: number, ease: string, bank = 0) => {
      const targetNow = () => (typeof target === "function" ? target() : target);
      let to = new Vector3();
      const proxy = { t: 0 };
      let from = new Vector3();
      let fromRotation = { x: 0, y: 0 };
      const control = new Vector3();
      return gsap.to(proxy, {
        t: 1,
        duration,
        ease,
        onStart: () => {
          to = targetNow();
          from = object.position.clone();
          fromRotation = { x: object.rotation.x, y: object.rotation.y };
          control.copy(from).lerp(to, 0.5);
          control.y = Math.max(from.y, to.y) + arc;
          control.z += arc * 0.6;
        },
        onUpdate: () => {
          const t = proxy.t;
          const u = 1 - t;
          if (typeof target === "function") {
            // Carry the arc's peak along with the target so the path stays smooth
            const next = target();
            control.x += (next.x - to.x) * 0.5;
            control.z += (next.z - to.z) * 0.5;
            to = next;
          }
          object.position.set(
            u * u * from.x + 2 * u * t * control.x + t * t * to.x,
            u * u * from.y + 2 * u * t * control.y + t * t * to.y,
            u * u * from.z + 2 * u * t * control.z + t * t * to.z
          );
          object.rotation.x = fromRotation.x * u;
          object.rotation.y = fromRotation.y * u + turns * Math.PI * 2 * t;
          object.rotation.z = bank * Math.sin(Math.PI * t);
        },
        onComplete: () => {
          object.rotation.y = 0;
          object.rotation.z = 0;
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
      flickerMarquee();
      gsap.fromTo(shake, { value: cartSize.height * 0.06 }, { value: 0, duration: 0.35, ease: "power2.out" });
      gsap.fromTo(punch, { value: 0.035 }, { value: 0, duration: 0.7, ease: "power2.out" });
      // Squash into the port, then spring back
      gsap.fromTo(
        state.cart.group.scale,
        { x: 1.08, y: 0.86, z: 1.08 },
        { x: 1, y: 1, z: 1, duration: 0.55, ease: "elastic.out(1.1, 0.4)" }
      );
      if (portLight) {
        portLight.color.set(game.cartridge.color);
        gsap.fromTo(portLight, { intensity: 5 }, { intensity: 0, duration: 0.8, ease: "power2.out" });
      }
      if (rimMaterial) {
        const rim = new Color(game.cartridge.color);
        gsap.fromTo(rimMaterial.color, { r: 1, g: 1, b: 1 }, { r: rim.r, g: rim.g, b: rim.b, duration: 0.5 });
      }
      screenMode = "power";
      modeStart = performance.now() / 1000;
      showOnScreen(screenTexture);
      callbacksRef.current.onInsert(game);
    };

    const insert = (index: number) => {
      if (busy || index < 0 || index >= carts.length) return;
      const state = carts[index];
      if (state.where !== "shelf") return;
      busy = true;
      // On the ledge, let the row finish sliding the cartridge to the middle before
      // anything takes off, so the row isn't moving under a cartridge in flight
      const settle =
        layoutMode === "ledge" && Math.abs(scroll.x - index * pitchX) > pitchX * 0.05 ? 0.3 : 0;
      focus(index);
      if (settle) gsap.to(scroll, { x: index * pitchX, duration: settle, ease: "power2.out", overwrite: true });
      const timeline = gsap.timeline({ delay: settle, onComplete: () => { busy = false; } });

      // Pop the current cartridge out and send it home first
      if (insertedIndex >= 0) {
        const old = carts[insertedIndex];
        const oldGroup = old.cart.group;
        insertedIndex = -1;
        setInserted(-1);
        stopVideo();
        screenMode = "off";
        modeStart = performance.now() / 1000;
        showOnScreen(screenTexture);
        paintMarquee("Scareathon", MARQUEE_NEON_COLORS[0]);
        flickerMarquee();
        if (rimMaterial) rimMaterial.color.set(SHELF_NEON);
        old.where = "flying";
        playTick();
        // Spring up out of the port, then glide home
        timeline.to(oldGroup.position, { y: seat.y + cartSize.height * 0.95, duration: 0.26, ease: "back.out(2.4)" });
        timeline.add(flyTo(oldGroup, () => homeWorld(old), 0.5, cartSize.height * 0.8, 0, "power2.inOut", -0.25));
        timeline.call(() => {
          shelfGroup.attach(oldGroup);
          oldGroup.position.copy(old.home);
          oldGroup.rotation.set(0, 0, 0);
          old.where = "shelf";
        });
      }

      const group = state.cart.group;
      const { height: h, depth: d } = cartSize;
      timeline.call(() => {
        state.where = "flying";
        scene.attach(group);
        playWhoosh();
      }, undefined, insertedIndex >= 0 ? 0.35 : 0);
      // Slide it off the shelf toward you, then arc over, spinning once and banking into the turn
      timeline.to(group.position, { z: `+=${d * 2.5}`, y: `+=${h * 0.12}`, duration: 0.16, ease: "power2.out" });
      const hover = seat.clone().add(new Vector3(0, h * 1.05, 0));
      timeline.add(flyTo(group, hover, 0.62, h * 1.1, 1, "power2.inOut", 0.35));
      // Line up over the port for a beat, then push it home
      timeline.to(group.position, { y: hover.y + h * 0.05, duration: 0.1, ease: "sine.out" });
      timeline.to(group.position, { y: seat.y, duration: 0.14, ease: "power3.in" });
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
      portLight = new PointLight(SHELF_NEON, 0, cartSize.height * 5);
      portLight.position.set(0, portTop + cartSize.height * 0.3, panelCenter.z + cartSize.depth * 3);
      scene.add(portLight);

      games.forEach((game, index) => {
        const cart = createCartridge(game.name, game.cartridge.tagline, game.cartridge.color, cartSize);
        cart.group.userData.cartIndex = index;
        carts.push({ cart, home: new Vector3(), focus: { value: 0 }, intro: { value: 0 }, where: "shelf" });
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
      // Cartridges drop onto the shelf one after another
      carts.forEach((state, i) => {
        gsap.to(state.intro, { value: 1, duration: 0.6, delay: 0.15 + i * 0.05, ease: "back.out(1.7)" });
      });

      stopStills = loadVideoStills(games, (index, source, width, height) => {
        carts[index]?.cart.setPicture(source, width, height);
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

    let press: { x: number; y: number; scroll: number; dragging: boolean; lastX: number; lastT: number; velocity: number } | null = null;
    const worldPerPixel = () => {
      const distance = camera.position.z - shelfGroup.position.z;
      const visibleHeight = 2 * Math.tan((camera.fov * Math.PI) / 360) * distance;
      return visibleHeight / renderer.domElement.clientHeight;
    };
    // `velocity` is the finger's speed in px/ms; a flick carries on a few cartridges
    const snapLedge = (velocity = 0) => {
      const coast = -velocity * 180 * worldPerPixel();
      const index = Math.round((scroll.x + coast) / pitchX);
      const clamped = Math.min(Math.max(index, 0), carts.length - 1);
      if (clamped === focusIndex) gsap.to(scroll, { x: clamped * pitchX, duration: 0.3, ease: "power2.out" });
      else focus(clamped, true);
    };

    const onPointerDown = (event: PointerEvent) => {
      press = {
        x: event.clientX,
        y: event.clientY,
        scroll: scroll.x,
        dragging: false,
        lastX: event.clientX,
        lastT: event.timeStamp,
        velocity: 0,
      };
      renderer.domElement.setPointerCapture(event.pointerId);
    };
    const onPointerMove = (event: PointerEvent) => {
      if (press) {
        const dx = event.clientX - press.x;
        if (layoutMode === "ledge" && (press.dragging || Math.abs(dx) > 8)) {
          press.dragging = true;
          gsap.killTweensOf(scroll);
          const dt = event.timeStamp - press.lastT;
          if (dt > 0) press.velocity = press.velocity * 0.4 + ((event.clientX - press.lastX) / dt) * 0.6;
          press.lastX = event.clientX;
          press.lastT = event.timeStamp;
          const limit = (carts.length - 1) * pitchX;
          scroll.x = Math.min(Math.max(press.scroll - dx * worldPerPixel(), -pitchX * 0.4), limit + pitchX * 0.4);
        }
        return;
      }
      if (event.pointerType !== "mouse") return;
      const rect = renderer.domElement.getBoundingClientRect();
      parallax.targetX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      parallax.targetY = ((event.clientY - rect.top) / rect.height) * 2 - 1;
      const hit = pick(event.clientX, event.clientY);
      if (hit?.kind === "cart" && carts[hit.index].where === "shelf") focus(hit.index);
      const clickable = hit?.kind === "cart" || (hit?.kind === "cabinet" && insertedIndex >= 0);
      renderer.domElement.style.cursor = clickable ? "pointer" : "default";
    };
    const onPointerUp = (event: PointerEvent) => {
      const released = press;
      press = null;
      if (released?.dragging) {
        // A finger that stopped before lifting shouldn't fling the row
        snapLedge(event.timeStamp - released.lastT < 80 ? released.velocity : 0);
        return;
      }
      const hit = pick(event.clientX, event.clientY);
      if (hit?.kind === "cart") {
        // A mouse has already focused it by hovering. On touch, the first tap picks a
        // cartridge and slides it to the middle; tapping it again plugs it in.
        const onShelf = carts[hit.index].where === "shelf";
        if (event.pointerType !== "mouse" && onShelf && hit.index !== focusIndex) focus(hit.index, true);
        else activate(hit.index);
      }
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

      if (screenMode === "power" && time > modeStart + POWER_ON) {
        screenMode = "static";
        staticUntil = time + STATIC;
        playStatic();
      }
      if (screenMode === "off" && time > modeStart + POWER_OFF) {
        screenMode = "idle";
        lastIdleBlink = -1;
      }
      if (screenMode === "static" && time > staticUntil && insertedIndex >= 0) startVideo(games[insertedIndex], true);
      paintScreen(time);
      screenVideo?.updateFrame();
      if (marqueeMaterial) marqueeMaterial.emissiveIntensity = MARQUEE_GLOW * marqueeFlicker(time, 0) * marqueeBoot.value;

      if (layoutMode === "ledge") shelfGroup.position.x = -scroll.x;
      carts.forEach((state, i) => {
        const f = state.focus.value;
        state.cart.setHighlight(state.where === "slot" ? 0.6 + 0.15 * Math.sin(time * 3) : f);
        if (state.where !== "shelf") return;
        const group = state.cart.group;
        const drop = 1 - state.intro.value;
        group.position.set(
          state.home.x,
          state.home.y + cartSize.height * (0.08 * f + 1.4 * drop),
          state.home.z + cartSize.depth * 1.8 * f
        );
        // The focused cartridge tips toward you and sways a little, as if held up
        group.rotation.x = 0.15 * f;
        group.rotation.y = 0.12 * f * Math.sin(time * 2.2 + i);
        group.rotation.z = 0.25 * drop * (i % 2 ? 1 : -1);
      });

      // Ease toward the pointer for a touch of depth
      parallax.x += (parallax.targetX - parallax.x) * 0.05;
      parallax.y += (parallax.targetY - parallax.y) * 0.05;
      camera.position.copy(cameraBase);
      if (layoutMode === "wall") {
        camera.position.x += parallax.x * sceneHeight * 0.03;
        camera.position.y -= parallax.y * sceneHeight * 0.015;
      }
      if (punch.value > 0) camera.position.lerp(cameraTarget, punch.value);
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
      gsap.killTweensOf([scroll, shake, punch, marqueeBoot]);
      if (screenMaterial) gsap.killTweensOf(screenMaterial);
      if (portLight) gsap.killTweensOf(portLight);
      if (rimMaterial) gsap.killTweensOf(rimMaterial.color);
      carts.forEach((state) => {
        gsap.killTweensOf([state.focus, state.intro, state.cart.group.position, state.cart.group.scale]);
      });
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
        <GameCard
          game={shownGame}
          index={shown}
          total={games.length}
          isInserted={shownIsInserted}
          insertedGame={insertedGame}
          layout={layout}
          onPlay={onPlay}
          onLeaderboard={onLeaderboard}
          onPlugIn={() => worldRef.current?.activate(shown)}
          // Wide screens: over the shelf. Tall screens: along the bottom, clear of the menu button
          className={`absolute z-10 ${
            layout === "ledge" || !cardAnchor
              ? "bottom-[5.25rem] left-1/2 w-[min(92vw,30rem)] -translate-x-1/2"
              : "-translate-x-1/2 -translate-y-full"
          }`}
          style={
            layout === "wall" && cardAnchor
              ? {
                  left: cardAnchor.x,
                  top: Math.max(cardAnchor.y - 16, NAV_CLEARANCE + 220),
                  width: Math.min(Math.max(cardAnchor.width, 320), 480),
                }
              : undefined
          }
        />
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
