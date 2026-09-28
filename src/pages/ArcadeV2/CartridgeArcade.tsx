import { useEffect, useRef, useState } from "react";
import {
  AdditiveBlending,
  AmbientLight,
  Box3,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  Raycaster,
  Scene,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
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
import { CARTRIDGE_ASPECT, CARTRIDGE_STYLES, createCartridge, loadVideoStills, stillUrlFor, type Cartridge } from "./cartridge.ts";
import { canvasFont, linkArcadeFonts, marqueeFont, TERMINAL_FONT, whenFontReady, type ArcadeFont } from "./arcadeFonts.ts";
import { playClunk, playPop, playStatic, playTick, playWhoosh } from "./arcadeSounds.ts";
import GameCard from "./GameCard.tsx";
import CartridgeIndex from "./CartridgeIndex.tsx";
import { createCassetteRoom, type CassetteRoom } from "./cassetteRoom.ts";
import { CABINET_FONT, CABINET_TRIM, createCabinetFinish } from "./cabinetFinish.ts";
import { applyCrtLook, createCrtGlow } from "./crtScreen.ts";
import { createSlotTerminal, type SlotTerminal } from "./slotTerminal.ts";
import { createSlotRig, MARKER_FONT, type SlotRig } from "./slotRig.ts";
import { useNavigatorContext } from "../../components/navigator/context.tsx";

// One arcade cabinet and a shelf of game cartridges. Pick a cartridge and it
// flies into the slot on the cabinet's control panel; the screen crackles to
// life with that game's attract video. The cartridges sit in one row on a ledge
// in front of the cabinet that you swipe, scroll or arrow through.

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
  moveFocus: (dx: number) => void;
  activate: (index: number) => void;
  setPaused: (paused: boolean) => void;
};

type CartState = {
  cart: Cartridge;
  home: Vector3; // resting spot, in the shelf group's space
  focus: { value: number };
  intro: { value: number }; // 0 → 1 as it drops onto the shelf when the page opens
  where: "shelf" | "flying" | "slot";
};

const PANEL_MATERIALS = new Set(["JoystickBase", "JoystickStick", "JoystickBall", "OrangeButton", "PurpleButton"]);
const SHELF_NEON = "#ff7a1a";
// The big buttons' and LEDs' colour while no game is picked
const IDLE_ACCENT = "#ff7a1a";
// Narrower than this is a phone: the cabinet fills the width and the site menu docks into the card
const TALL_ASPECT = 1.05;
const NAV_CLEARANCE = 84; // px the site's top nav covers on wide screens; keep the cabinet below it
// Pixels kept clear under the scene for the info card (which carries the site
// menu button on phones)
const LEDGE_CARD_SPACE = 166; // the least room the phone card needs, in px
const WIDE_CARD_SPACE = 226; // the card on wide screens, with its keyboard hints
const SCANNER_GREEN = "#33ff66"; // terminal phosphor
const MAX_LEDGE_ZOOM = 1.1; // how far past "cabinet exactly fills the width" a tall phone may zoom
const SCREEN_GLOW = 1.1; // the screen's usual emissive intensity
const POWER_ON = 0.26; // seconds for the CRT to warm up from a line to a full picture
const POWER_OFF = 0.3;
const STATIC = 0.4;

const isTall = (width: number, height: number) => width / Math.max(height, 1) < TALL_ASPECT;

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
  const [tall, setTall] = useState(() => isTall(window.innerWidth, window.innerHeight));
  // Phones: the site menu button lives in the info card instead of floating over the arcade
  const { setMobileNavDocked } = useNavigatorContext();
  useEffect(() => {
    setMobileNavDocked(tall);
    return () => setMobileNavDocked(false);
  }, [tall, setMobileNavDocked]);
  // The index of every cartridge, open over the arcade
  const [browsing, setBrowsing] = useState(false);
  // Where the card's top goes, just under the ledge, in px
  const [ledgeCardTop, setLedgeCardTop] = useState<number | null>(null);

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

    // Dim fixed lights, just enough to read the cabinet's shape: the screen does
    // most of the lighting (screenLights, below)
    const ambientLight = new AmbientLight(0xffffff, 0.16);
    scene.add(ambientLight);
    const pointLight = new PointLight(0xffaa55, 0.5, 50);
    pointLight.position.set(0, 5, 5);
    scene.add(pointLight);
    const directionalLight = new DirectionalLight(0xffffff, 1.4);
    directionalLight.position.set(5, 10, 5);
    scene.add(directionalLight);
    const shelfLight = new PointLight(0xff8a3d, 2, 6);
    scene.add(shelfLight);

    linkArcadeFonts([...games.map((game) => game.cartridge.font), CABINET_FONT, TERMINAL_FONT, MARKER_FONT]);
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
    let screenGame = -1; // which game the screen is tuned to
    let staticUntil = 0;
    let lastIdleBlink = -1;
    let screenVideo: ScreenVideo | null = null;
    let waitingForPicture = false; // the screen shows snow until screenVideo has a frame
    let screenMaterial: MeshStandardMaterial | null = null;
    let crtGlow: ReturnType<typeof createCrtGlow> | null = null;

    // While a preview loads: the game's name, "LOADING PREVIEW" and a bar of
    // blocks with a light chasing along it, in the game's colour
    let lastLoadingFrame = -1;
    const paintLoading = (time: number) => {
      if (!screenContext) return;
      const frame = Math.floor(time * 20);
      if (frame === lastLoadingFrame) return;
      lastLoadingFrame = frame;
      const { width, height } = screenCanvas;
      const game = games[screenGame];
      const color = game?.cartridge.color ?? SHELF_NEON;
      screenContext.fillStyle = "#050308";
      screenContext.fillRect(0, 0, width, height);
      const glow = screenContext.createRadialGradient(width / 2, height / 2, 10, width / 2, height / 2, width * 0.6);
      glow.addColorStop(0, `${color}33`);
      glow.addColorStop(1, `${color}00`);
      screenContext.fillStyle = glow;
      screenContext.fillRect(0, 0, width, height);
      screenContext.textAlign = "center";
      screenContext.textBaseline = "middle";
      screenContext.shadowColor = color;
      screenContext.shadowBlur = 14;
      screenContext.fillStyle = color;
      // The game's name, shrunk to fit
      const name = (game?.name ?? "").replace(/[‘’]/g, "'").toUpperCase();
      let size = 40;
      screenContext.font = canvasFont(TERMINAL_FONT, size);
      while (size > 20 && screenContext.measureText(name).width > width * 0.84) {
        size -= 2;
        screenContext.font = canvasFont(TERMINAL_FONT, size);
      }
      screenContext.fillText(name, width / 2, height * 0.3);
      // "LOADING PREVIEW" with ticking dots, the text kept centred without them
      screenContext.font = canvasFont(TERMINAL_FONT, 30);
      screenContext.fillStyle = "#f4efe6";
      const label = "LOADING PREVIEW";
      const labelWidth = screenContext.measureText(label).width;
      screenContext.textAlign = "left";
      screenContext.fillText(label + ".".repeat(Math.floor(time * 3) % 4), (width - labelWidth) / 2, height * 0.52);
      // The bar: a light chasing back and forth along a row of blocks
      const blocks = 16;
      const blockWidth = 18;
      const gap = 5;
      const barWidth = blocks * blockWidth + (blocks - 1) * gap;
      const barX = (width - barWidth) / 2;
      const barY = height * 0.68;
      const sweep = (Math.sin(time * 3.2) * 0.5 + 0.5) * (blocks - 1);
      screenContext.strokeStyle = color;
      screenContext.lineWidth = 2;
      screenContext.strokeRect(barX - 6, barY - 6, barWidth + 12, 26);
      for (let i = 0; i < blocks; i += 1) {
        const lit = Math.max(0, 1 - Math.abs(i - sweep) / 2.5);
        screenContext.globalAlpha = 0.18 + lit * 0.82;
        screenContext.fillStyle = color;
        screenContext.fillRect(barX + i * (blockWidth + gap), barY, blockWidth, 14);
      }
      screenContext.globalAlpha = 1;
      screenContext.shadowBlur = 0;
      screenContext.fillStyle = "rgba(0, 0, 0, 0.28)";
      for (let y = 0; y < height; y += 4) screenContext.fillRect(0, y, width, 2);
      screenTexture.needsUpdate = true;
    };

    const paintScreen = (time: number) => {
      if (!screenContext) return;
      const { width, height } = screenCanvas;
      if (screenMode === "video") {
        // A loading screen until the clip (or its still) has a picture to show,
        // rather than a black screen while it loads or if autoplay is refused
        if (!screenVideo) return;
        if (screenVideo.hasPicture()) {
          if (waitingForPicture) {
            waitingForPicture = false;
            showOnScreen(screenVideo.texture);
          }
          return;
        }
        paintLoading(time);
        return;
      }
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
        screenContext.fillText("INSERT CARTRIDGE", width / 2, height / 2);
        screenContext.shadowBlur = 0;
      }
      screenContext.fillStyle = "rgba(0, 0, 0, 0.28)";
      for (let y = 0; y < height; y += 4) screenContext.fillRect(0, y, width, 2);
      screenTexture.needsUpdate = true;
    };

    const showOnScreen = (texture: CanvasTexture) => {
      if (!screenMaterial) return;
      // The video frames are ordinary sRGB pictures; read as linear they wash out
      if (texture.colorSpace !== SRGBColorSpace) {
        texture.colorSpace = SRGBColorSpace;
        texture.needsUpdate = true;
      }
      screenMaterial.map = texture;
      screenMaterial.emissiveMap = texture;
      screenMaterial.needsUpdate = true;
      crtGlow?.setPicture(texture);
    };

    const stopVideo = () => {
      screenVideo?.dispose();
      screenVideo = null;
    };

    const startVideo = (game: MachineData, bloom = false) => {
      stopVideo();
      if (bloom && screenMaterial) {
        // The picture comes on bright and settles, like a tube warming up
        gsap.fromTo(screenMaterial, { emissiveIntensity: 2.2 }, { emissiveIntensity: SCREEN_GLOW, duration: 0.7, ease: "power2.out" });
      }
      if (!game.videoUrl) {
        screenMode = "idle";
        lastIdleBlink = -1;
        showOnScreen(screenTexture);
        return;
      }
      // The label still is small and usually cached already, so it stands in
      // until the clip plays (and for good if the phone won't autoplay it)
      screenVideo = createScreenVideo(game.videoUrl, lightweight, stillUrlFor(game.videoUrl), previewVideo);
      screenMode = "video";
      waitingForPicture = true;
      lastLoadingFrame = -1;
      showOnScreen(screenTexture);
      syncVideo();
    };

    // One video element for every preview (see createScreenVideo), started from
    // inside a tap whenever one comes along so iOS lets it play from then on
    const previewVideo = document.createElement("video");
    const playFromGesture = () => {
      if (!screenVideo || pausedRef.current || document.hidden || !previewVideo.paused) return;
      previewVideo.play().catch(() => {
        // Still refused: the still stays up
      });
    };
    document.addEventListener("pointerdown", playFromGesture, true);
    document.addEventListener("touchend", playFromGesture, true);

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
    // A split-flap sign: switching games flips its columns over in a jumble,
    // each at its own moment and speed, the top flap falling to show the new name. Signs are painted off
    // screen and composited into the marquee's canvas while flipping.
    const MARQUEE_WIDTH = 2048;
    const MARQUEE_HEIGHT = 340;
    const FLAP_COLUMNS = 12;
    // Each flip, every column gets its own start and length, as shares of the flip
    const flapStarts = new Array<number>(FLAP_COLUMNS).fill(0);
    const flapSpans = new Array<number>(FLAP_COLUMNS).fill(1);
    const shuffleFlaps = () => {
      for (let i = 0; i < FLAP_COLUMNS; i += 1) {
        flapSpans[i] = 0.3 + Math.random() * 0.3;
        flapStarts[i] = Math.random() * (1 - flapSpans[i]);
      }
    };
    const makeSign = () => {
      const canvas = document.createElement("canvas");
      canvas.width = MARQUEE_WIDTH;
      canvas.height = MARQUEE_HEIGHT;
      return canvas;
    };
    const marqueeCanvas = makeSign();
    const marqueeContext = marqueeCanvas.getContext("2d");
    const marqueeTexture = track(new CanvasTexture(marqueeCanvas));
    marqueeTexture.colorSpace = SRGBColorSpace;
    marqueeTexture.anisotropy = 8;
    const shownSign = makeSign(); // what the sign showed when the flip began
    const nextSign = makeSign(); // what it's flipping to
    const flip = { t: 1 };
    let marqueeText = "Scareathon";
    let marqueeColor = MARQUEE_NEON_COLORS[0];
    let marqueeFontName: string | undefined;
    let marqueeMaterial: MeshStandardMaterial | null = null;

    const composeMarquee = () => {
      if (!marqueeContext) return;
      const half = MARQUEE_HEIGHT / 2;
      const column = MARQUEE_WIDTH / FLAP_COLUMNS;
      for (let i = 0; i < FLAP_COLUMNS; i += 1) {
        const x = Math.floor(i * column);
        const w = Math.ceil(column) + 1;
        const p = Math.min(Math.max((flip.t - flapStarts[i]) / flapSpans[i], 0), 1);
        const piece = (source: HTMLCanvasElement, sy: number, dy: number, dh: number) =>
          marqueeContext.drawImage(source, x, sy, w, half, x, dy, w, dh);
        if (p <= 0 || p >= 1) {
          marqueeContext.drawImage(p >= 1 ? nextSign : shownSign, x, 0, w, MARQUEE_HEIGHT, x, 0, w, MARQUEE_HEIGHT);
          continue;
        }
        // Behind the flap: the new top half is already showing, the old bottom half not yet covered
        piece(nextSign, 0, 0, half);
        piece(shownSign, half, half, half);
        // The flap: the old top half folding down to the hinge, then the new bottom
        // half folding down from it, darker the more edge-on it is
        const fold = Math.cos(p * Math.PI);
        const height = half * Math.abs(fold);
        const top = fold > 0 ? half - height : half;
        piece(fold > 0 ? shownSign : nextSign, fold > 0 ? 0 : half, top, height);
        marqueeContext.fillStyle = `rgba(0, 0, 0, ${(1 - Math.abs(fold)) * 0.7})`;
        marqueeContext.fillRect(x, top, w, height);
        // The hinge, and the gap between columns
        marqueeContext.fillStyle = "rgba(0, 0, 0, 0.85)";
        marqueeContext.fillRect(x, half - 3, w, 6);
        marqueeContext.fillRect(x, 0, 3, MARQUEE_HEIGHT);
      }
      marqueeTexture.needsUpdate = true;
    };

    // Paint the sign; `animate` flips over to it from whatever is showing now
    const paintMarquee = (text: string, color: string, font?: ArcadeFont, animate = false) => {
      marqueeText = text;
      marqueeColor = color;
      marqueeFontName = font && marqueeFont(font);
      if (animate) {
        // Start from what's on the sign, even partway through another flip
        shownSign.getContext("2d")?.drawImage(marqueeCanvas, 0, 0);
        gsap.killTweensOf(flip);
        shuffleFlaps();
        flip.t = 0;
        gsap.to(flip, { t: 1, duration: 0.7, ease: "none", onUpdate: composeMarquee });
      }
      drawNeonMarquee(nextSign, text, color, marqueeFontName);
      composeMarquee();
      // Repaint once the game's font has arrived, if it's still the sign
      if (font) {
        whenFontReady(font).then(() => {
          if (disposed || marqueeText !== text) return;
          drawNeonMarquee(nextSign, text, color, marqueeFontName);
          composeMarquee();
        });
      }
    };
    // Show a game on the sign (flipping over to its name, font and colour), and
    // light the buttons and LEDs in its colour
    const showGame = (game: MachineData) => {
      if (game.name !== marqueeText) paintMarquee(game.name, game.cartridge.color, game.cartridge.font, true);
      tintCabinet(game.cartridge.color);
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
      if (!disposed && !marqueeFontName) paintMarquee(marqueeText, marqueeColor);
    }).catch(() => {});

    // --- State filled in once the cabinet model loads --------------------------------
    const holder = new Group(); // the cabinet, moved so it stands on y = 0 centred on x = z = 0
    scene.add(holder);
    const shelfGroup = new Group();
    scene.add(shelfGroup);
    let shelfMeshes: Mesh[] = [];
    let tallMode = isTall(size().width, size().height);
    let cartSize = { width: 0.3, height: 0.3 * CARTRIDGE_ASPECT, depth: 0.054 };
    let pitchX = 0.4;
    const scroll = { x: 0 };
    const seat = new Vector3();
    let cabinetBox = new Box3();
    let rimMaterial: MeshBasicMaterial | null = null;
    const carts: CartState[] = [];
    let focusIndex = -1;
    let insertedIndex = -1;
    let terminal: SlotTerminal | null = null;
    let slotRig: SlotRig | null = null;
    // What the slot's terminal prints for a picked cartridge
    const terminalLines = (game: MachineData) => [
      "> CART READ OK",
      game.name.replace(/[‘’]/g, "'").slice(0, 20),
      game.cartridge.about.genre.slice(0, 20),
      game.cartridge.about.players.slice(0, 20),
      `(C) ${game.cartridge.about.released} SCAREATHON`,
    ];
    let busy = false;
    let room: CassetteRoom | null = null;
    const cameraBase = new Vector3();
    const cameraTarget = new Vector3();
    const shake = { value: 0 };
    const punch = { value: 0 }; // brief push of the camera toward the cabinet when a cartridge seats
    let sceneHeight = 1;
    const parallax = { x: 0, y: 0, targetX: 0, targetY: 0 };
    let portLight: PointLight | null = null;
    // The screen's own light, coming off the glass itself: two lights spread
    // across its width, just in front of it, so the flat bezel round it only
    // catches a glancing sheen while the deck, the cartridges and the room in
    // front take the light. They take the colour and brightness of whatever
    // the screen is showing.
    const screenLights = [0, 1].map(() => {
      const light = new PointLight(0xffffff, 0, 5, 1.4);
      scene.add(light);
      return light;
    });
    const screenSample = document.createElement("canvas");
    screenSample.width = screenSample.height = 1;
    const screenSampler = screenSample.getContext("2d", { willReadFrequently: true });
    const screenColor = new Color(0x000000);
    const targetScreenColor = new Color(0x000000);
    let lastSample = 0;
    const SCREEN_LIGHT = 9;
    const updateScreenLight = (time: number) => {
      const source = screenMaterial?.map?.image as CanvasImageSource | undefined;
      if (source && screenSampler && time - lastSample > 0.12) {
        lastSample = time;
        try {
          // The whole picture averaged down to one pixel
          screenSampler.drawImage(source, 0, 0, 1, 1);
          const [red, green, blue] = screenSampler.getImageData(0, 0, 1, 1).data;
          targetScreenColor.setRGB(red / 255, green / 255, blue / 255, SRGBColorSpace);
        } catch {
          // Unreadable picture: keep the last colour
        }
      }
      // Ease toward it, so flickering footage doesn't strobe the room
      screenColor.lerp(targetScreenColor, 0.15);
      const brightness = Math.max(screenColor.r, screenColor.g, screenColor.b);
      const power = screenMaterial ? screenMaterial.emissiveIntensity / SCREEN_GLOW : 0;
      screenLights.forEach((light) => {
        // Normalised colour, with its brightness carried in the intensity
        light.color.copy(screenColor);
        if (brightness > 0.001) light.color.multiplyScalar(1 / brightness);
        light.intensity = (SCREEN_LIGHT / 2) * (0.15 + brightness) * power;
      });
    };

    // --- Scanner: a little camera on the cabinet reads the barcode sticker on the
    // back of the cartridge being previewed (that's how the screen knows what to
    // show). Two red laser fans sweep the sticker, each with a soft glow. ------------
    let cabinetModel: Object3D | null = null;
    let panelBottom = Infinity; // underside of the control panel, world y
    const emitter = new Vector3();
    const laserMaterial = (opacity: number) =>
      track(
        new MeshBasicMaterial({
          color: new Color(SCANNER_GREEN),
          transparent: true,
          opacity,
          blending: AdditiveBlending,
          depthWrite: false,
          side: DoubleSide,
        })
      );
    // Each beam: a thin bright fan, and a thicker faint one around it for the glow.
    // Fans carry a per-corner alpha so the light spilling past the cartridge fades out
    const makeFan = (triangles: number, material: MeshBasicMaterial) => {
      const geometry = track(new BufferGeometry());
      geometry.setAttribute("position", new Float32BufferAttribute(new Float32Array(triangles * 9), 3));
      geometry.setAttribute("color", new Float32BufferAttribute(new Float32Array(triangles * 12).fill(1), 4));
      material.vertexColors = true;
      const mesh = new Mesh(geometry, material);
      mesh.frustumCulled = false;
      mesh.visible = false;
      scene.add(mesh);
      return mesh;
    };
    const beams = [0, 1].map(() => ({
      core: makeFan(3, laserMaterial(0)),
      glow: makeFan(6, laserMaterial(0)),
      line: new Mesh(track(new PlaneGeometry(1, 1)), laserMaterial(0)),
      lineGlow: new Mesh(track(new PlaneGeometry(1, 1)), laserMaterial(0)),
    }));

    // The camera: a dark ball on a short mount, a green lens, and a glow around the lens
    const scannerCamera = new Group();
    const shellMaterialDark = track(new MeshStandardMaterial({ color: new Color("#1b1720"), roughness: 0.35, metalness: 0.4 }));
    const ball = new Mesh(track(new SphereGeometry(1, 24, 16)), shellMaterialDark);
    scannerCamera.add(ball);
    const cameraMount = new Mesh(track(new CylinderGeometry(0.45, 0.6, 0.9, 16)), shellMaterialDark);
    cameraMount.rotation.x = Math.PI / 2;
    cameraMount.position.z = -0.9;
    scannerCamera.add(cameraMount);
    const lensMesh = new Mesh(track(new SphereGeometry(0.42, 16, 12)), track(new MeshBasicMaterial({ color: new Color("#b8ffc9") })));
    lensMesh.position.z = 0.78;
    scannerCamera.add(lensMesh);
    const glowCanvas = document.createElement("canvas");
    glowCanvas.width = glowCanvas.height = 64;
    const glowContext = glowCanvas.getContext("2d");
    if (glowContext) {
      const gradient = glowContext.createRadialGradient(32, 32, 0, 32, 32, 32);
      gradient.addColorStop(0, "rgba(170, 255, 190, 1)");
      gradient.addColorStop(0.35, "rgba(51, 255, 102, 0.45)");
      gradient.addColorStop(1, "rgba(51, 255, 102, 0)");
      glowContext.fillStyle = gradient;
      glowContext.fillRect(0, 0, 64, 64);
    }
    const lensGlowMaterial = track(
      new SpriteMaterial({ map: track(new CanvasTexture(glowCanvas)), blending: AdditiveBlending, depthWrite: false, transparent: true })
    );
    const lensGlow = new Sprite(lensGlowMaterial);
    lensGlow.position.z = 0.9;
    lensGlow.scale.setScalar(3.2);
    scannerCamera.add(lensGlow);
    scannerCamera.visible = false;
    scene.add(scannerCamera);
    let scanAmount = 0;
    let scanned: CartState | null = null;

    // Mount the camera on the cabinet's front, above the ledge, facing the cartridges
    const placeScanner = () => {
      if (!cabinetModel || !carts.length) return;
      const h = cartSize.height;
      const size = h * 0.09;
      const ray = new Raycaster();
      const home = homeWorld(carts[0]);
      // Just under the controls, high enough that the beams show above the cartridge
      const y = Math.max(home.y + h * 0.75, Math.min(panelBottom - h * 0.1, home.y + h * 1.6));
      ray.set(new Vector3(0, y, cabinetBox.max.z + 1), new Vector3(0, 0, -1));
      const hit = ray.intersectObject(cabinetModel, true)[0];
      const surface = hit ? hit.point.z : cabinetBox.max.z;
      scannerCamera.position.set(0, y, surface + size * 1.4);
      // Aim at the middle of the ledge, where the previewed cartridge sits
      scannerCamera.lookAt(new Vector3(0, home.y, shelfGroup.position.z));
      scannerCamera.scale.setScalar(size);
      scannerCamera.visible = true;
      scannerCamera.updateMatrixWorld(true);
      lensMesh.getWorldPosition(emitter);
      // Its lead runs off the back of the mount
      slotRig?.plugScanner(cameraMount.getWorldPosition(new Vector3()));
    };

    const scanPoint = new Vector3();
    // Fill a fan: each [point, alpha] corner in order, three per triangle
    const setFan = (mesh: Mesh, corners: [Vector3, number][]) => {
      const positions = mesh.geometry.getAttribute("position") as Float32BufferAttribute;
      const colors = mesh.geometry.getAttribute("color") as Float32BufferAttribute;
      corners.forEach(([point, alpha], i) => {
        positions.setXYZ(i, point.x, point.y, point.z);
        colors.setW(i, alpha);
      });
      positions.needsUpdate = true;
      colors.needsUpdate = true;
    };
    // A fan from the lens to a line across the cartridge: solid across the
    // cartridge itself, fading to nothing where it spills past the sides
    const fanCorners = (at: (x: number) => Vector3, inner: number, outer: number): [Vector3, number][] => {
      const e: [Vector3, number] = [emitter, 1];
      return [e, [at(-outer), 0], [at(-inner), 1], e, [at(-inner), 1], [at(inner), 1], e, [at(inner), 1], [at(outer), 0]];
    };

    const updateScanner = (time: number) => {
      const focusedCart = focusIndex >= 0 ? carts[focusIndex] : null;
      const active = !pausedRef.current && insertedIndex < 0 && focusedCart?.where === "shelf";
      const flicker = 0.85 + Math.random() * 0.15;
      if (active && focusedCart !== scanned) {
        scanned = focusedCart;
        beams.forEach((beam) => scanned!.cart.group.add(beam.line, beam.lineGlow));
      }

      // Warm up gently; switch off straight away when the cartridge leaves the shelf
      scanAmount = active ? scanAmount + (1 - scanAmount) * 0.2 : 0;
      const visible = scanAmount > 0.02 && scanned !== null && scanned.where === "shelf";
      lensGlowMaterial.opacity = 0.35 + 0.65 * scanAmount;
      beams.forEach((beam) => {
        beam.core.visible = beam.glow.visible = beam.line.visible = beam.lineGlow.visible = visible;
      });
      if (!visible || !scanned) return;
      const { sticker, group } = scanned.cart;
      group.updateWorldMatrix(true, false);
      // Solid across the cartridge, spilling a little past its sides
      const inner = cartSize.width * 0.5;
      const outer = cartSize.width * 0.66;
      const glowHeight = cartSize.height * 0.07;
      beams.forEach((beam, i) => {
        // The two beams sweep the sticker out of step with each other
        const y = sticker.y + Math.sin(time * 3.6 + i * Math.PI) * sticker.height * 0.46;
        const at = (dy: number) => (x: number) => group.localToWorld(scanPoint.set(x, y + dy, sticker.z)).clone();
        setFan(beam.core, fanCorners(at(0), inner, outer));
        setFan(beam.glow, [...fanCorners(at(glowHeight), inner, outer), ...fanCorners(at(-glowHeight), inner, outer)]);
        (beam.core.material as MeshBasicMaterial).opacity = 0.42 * scanAmount * flicker;
        (beam.glow.material as MeshBasicMaterial).opacity = 0.1 * scanAmount * flicker;
        // Where each beam lands on the cartridge: a bright line with a soft band around it
        beam.line.position.set(0, y, sticker.z - 0.001);
        beam.line.rotation.set(0, Math.PI, 0);
        beam.line.scale.set(inner * 2, cartSize.height * 0.012, 1);
        beam.lineGlow.position.set(0, y, sticker.z - 0.0015);
        beam.lineGlow.rotation.set(0, Math.PI, 0);
        beam.lineGlow.scale.set(inner * 2, glowHeight * 1.4, 1);
        (beam.line.material as MeshBasicMaterial).opacity = scanAmount * flicker;
        (beam.lineGlow.material as MeshBasicMaterial).opacity = 0.25 * scanAmount * flicker;
      });
    };

    // --- Cabinet colour: fixed 70s trim; the big buttons and the LEDs take on the game's colour
    const tintMaterials: MeshStandardMaterial[] = [];
    const finish = track(createCabinetFinish());
    let tintTarget = IDLE_ACCENT;
    const tintCabinet = (hex: string, instant = false) => {
      tintTarget = hex;
      const target = new Color(hex);
      tintMaterials.forEach((material) => {
        gsap.killTweensOf([material.color, material.emissive]);
        const glow = target.clone().multiplyScalar(0.3);
        const duration = instant ? 0 : 0.45;
        gsap.to(material.color, { r: target.r, g: target.g, b: target.b, duration, ease: "power2.out" });
        gsap.to(material.emissive, { r: glow.r, g: glow.g, b: glow.b, duration, ease: "power2.out" });
      });
      gsap.killTweensOf(finish.accent);
      gsap.to(finish.accent, { r: target.r, g: target.g, b: target.b, duration: instant ? 0 : 0.45, ease: "power2.out" });
    };

    const buildShelf = () => {
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

      pitchX = w * 1.45;
      // Up under the control panel, so screen, controls and cartridges fit a screen together.
      // The cartridges' tops a little way below the controls, so they don't cover them
      const cartTop = Number.isFinite(panelBottom) ? panelBottom - h * 0.4 : seat.y - h * 0.5;
      const ledgeY = Math.max(cabinetSize.y * 0.2, cartTop - h - plankT / 2);
      const depth = d * 3.4;
      const span = (games.length - 1) * pitchX;
      shelfGroup.position.set(0, 0, cabinetBox.max.z + d * 6);
      // Well past both ends, so a wide screen doesn't see the plank stop beside the first cartridge
      const length = span + pitchX * 16;
      addBox(length, plankT, depth, span / 2, ledgeY, 0, wood);
      addBox(length, plankT * 0.35, plankT * 0.35, span / 2, ledgeY + plankT * 0.2, depth / 2, neon);
      carts.forEach((state, i) => {
        state.home.set(i * pitchX, ledgeY + plankT / 2 + h / 2, 0);
      });
      shelfLight.position.set(0, ledgeY + h * 2, shelfGroup.position.z + depth * 2);
      scroll.x = Math.max(0, focusIndex) * pitchX;
      carts.forEach((state) => {
        if (state.where !== "shelf") return;
        shelfGroup.add(state.cart.group);
        state.cart.group.rotation.set(0, 0, 0);
      });
    };

    // Where a world point lands on screen, in px from the top
    const screenY = (point: Vector3) => ((1 - point.clone().project(camera).y) / 2) * size().height;
    const ledgeEdgePoint = () =>
      new Vector3(0, carts[0].home.y - cartSize.height * 0.57, shelfGroup.position.z + cartSize.depth * 1.7);

    // Wide screens: set the camera's distance so the cabinet's top to the ledge's front
    // edge exactly fills the band between the nav and the card, then slide it so the
    // top sits just under the nav. Measured on screen, a few passes, as perspective
    // makes a straight calculation miss.
    const fitWide = (reserveTop: number, reserveBottom: number, startDistance: number) => {
      const band = size().height - reserveTop - reserveBottom - 8;
      const top = new Vector3(0, cabinetBox.max.y, cabinetBox.max.z);
      let distance = startDistance;
      for (let pass = 0; pass < 4; pass += 1) {
        cameraBase.z = cabinetBox.max.z + distance;
        camera.position.copy(cameraBase);
        camera.lookAt(cameraTarget);
        camera.updateMatrixWorld();
        const topPx = Math.min(screenY(top), screenY(top.clone().setZ(cabinetBox.min.z)));
        const edgePx = screenY(ledgeEdgePoint());
        // Slide so the top lands just under the nav (raising the camera lowers the picture)
        const shift = ((topPx - (reserveTop + 4)) * 2 * Math.tan((camera.fov * Math.PI) / 360) * distance) / size().height;
        cameraBase.y -= shift;
        cameraTarget.y -= shift;
        distance *= (edgePx - topPx) / band;
      }
      cameraBase.z = cabinetBox.max.z + distance;
    };

    const fitCamera = () => {
      const { width, height } = size();
      const aspect = width / height;
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
      // The ledge only needs to show its middle; it scrolls. Skip the floor under
      // it so the cabinet can fill the width of a phone.
      const box = cabinetBox.clone();
      box.expandByPoint(new Vector3(0, cartSize.height, shelfGroup.position.z + cartSize.depth));
      const ledgeTop = carts.length ? carts[0].home.y - cartSize.height / 2 : box.min.y;
      box.min.y = Math.max(box.min.y, ledgeTop - cartSize.height * 0.35);
      const extent = box.getSize(new Vector3());
      const center = box.getCenter(new Vector3());
      sceneHeight = extent.y;
      // Fit the scene into the band of screen the page's chrome leaves free: under
      // the top nav on wide screens, and above at least the card's room along the
      // bottom; the card then grows up to meet the ledge
      const reserveTop = tallMode ? 0 : Math.min(NAV_CLEARANCE, height * 0.14);
      const reserveBottom = tallMode ? Math.min(LEDGE_CARD_SPACE, height * 0.42) : Math.min(WIDE_CARD_SPACE, height * 0.32);
      const tan = Math.tan((camera.fov * Math.PI) / 360);
      // Come in until the cabinet's top to the ledge fills the band between them
      const ledgeBottom = carts.length ? carts[0].home.y - cartSize.height * 0.57 : box.min.y;
      const freeFraction = (height - reserveTop - reserveBottom) / height;
      const fillDistance = center.z + (cabinetBox.max.y - ledgeBottom) / (2 * tan * freeFraction) - cabinetBox.max.z;
      // Phones: the cabinet's sides meet the screen's edges. Size by its width at its
      // front face; a taller screen may come in a little closer (trimming the sides)
      // to fill the height, and a short one crops the cabinet's top rather than
      // shrinking the whole thing.
      const widthDistance = cabinetBox.getSize(new Vector3()).x / 2 / (tan * aspect);
      const frontDistance = tallMode
        ? Math.min(widthDistance, Math.max(fillDistance, widthDistance / MAX_LEDGE_ZOOM))
        : fillDistance;
      const cameraZ = cabinetBox.max.z + frontDistance;
      const depth = cameraZ - center.z;
      const visibleHeight = 2 * tan * depth;
      shelfGroup.position.y = 0;
      let targetY = box.min.y + visibleHeight / 2 - (reserveBottom / height) * visibleHeight;
      // When there's room, pin the cabinet's top to the top of the band rather than
      // leaving a gap above it; the card grows to fill below. Wide screens always do.
      const topAnchoredY = cabinetBox.max.y + visibleHeight * (0.01 + reserveTop / height) - visibleHeight / 2;
      if (carts.length && (!tallMode || topAnchoredY < targetY)) targetY = topAnchoredY;
      cameraTarget.set(center.x, targetY, center.z);
      cameraBase.set(center.x, targetY + extent.y * 0.04, cameraZ);
      if (carts.length && !tallMode) fitWide(reserveTop, reserveBottom, cameraZ - cabinetBox.max.z);
      if (carts.length) {
        // Measure where the ledge's front edge lands on screen: the card starts
        // just below it. If that leaves the card too little room, move the
        // camera so the ledge sits higher, cropping a touch off the cabinet's top
        camera.position.copy(cameraBase);
        camera.lookAt(cameraTarget);
        camera.updateMatrixWorld();
        const ledgeEdge = carts[0].home.y - cartSize.height / 2 - cartSize.height * 0.07;
        const edge = new Vector3(0, ledgeEdge, shelfGroup.position.z + cartSize.depth * 1.7).project(camera);
        let edgePx = ((1 - edge.y) / 2) * height;
        const lowestPx = height - reserveBottom - 4;
        const worldPerPx = (2 * tan * (cameraZ - shelfGroup.position.z)) / height;
        if (edgePx > lowestPx) {
          const lift = (edgePx - lowestPx) * worldPerPx;
          cameraTarget.y -= lift;
          cameraBase.y -= lift;
          edgePx = lowestPx;
        }
        setLedgeCardTop(Math.round(edgePx + 4));
        shelfLight.position.y = carts[0].home.y + shelfGroup.position.y + cartSize.height * 1.5;
      }
      camera.position.copy(cameraBase);
      camera.lookAt(cameraTarget);
      camera.updateMatrixWorld();
      placeScanner();
    };

    const homeWorld = (state: CartState) => {
      shelfGroup.updateMatrixWorld(true);
      return shelfGroup.localToWorld(state.home.clone());
    };

    // Fly an object along an arc to a world position, spinning `turns` times on the way.
    // `bank` rolls it into the turn, peaking mid-flight. Pass a function for a target
    // that moves, like a slot on a ledge that's still scrolling.
    const flyTo = (object: Object3D, target: Vector3 | (() => Vector3), duration: number, arc: number, turns: number, ease: string, bank = 0, spinLag = 1) => {
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
          // spinLag above 1 holds the spin back early, so the first turn is lazier than the last
          object.rotation.y = fromRotation.y * u + turns * Math.PI * 2 * Math.pow(t, spinLag);
          object.rotation.z = bank * Math.sin(Math.PI * t);
        },
        onComplete: () => {
          object.rotation.y = 0;
          object.rotation.z = 0;
        },
      });
    };

    // A short burst of static, then that game's attract video
    const tuneScreen = (index: number, seconds: number) => {
      if (index === screenGame && screenMode === "video") return;
      stopVideo();
      screenGame = index;
      screenMode = "static";
      staticUntil = performance.now() / 1000 + seconds;
      showOnScreen(screenTexture);
      const game = games[index];
      if (game) showGame(game);
    };

    const focus = (index: number, fromUser = false) => {
      if (index < 0 || index >= carts.length || index === focusIndex) return;
      if (focusIndex >= 0) gsap.to(carts[focusIndex].focus, { value: 0, duration: 0.2 });
      focusIndex = index;
      gsap.to(carts[index].focus, { value: 1, duration: 0.2 });
      gsap.to(scroll, { x: index * pitchX, duration: 0.35, ease: "power2.out" });
      if (fromUser) playTick();
      setFocused(index);
      terminal?.print(terminalLines(games[index]));
      // Browsing the shelf previews each game on the screen
      if (insertedIndex < 0 && !busy) tuneScreen(index, 0.18);
    };

    // One row, so only left and right move
    const moveFocus = (dx: number) => {
      const start = focusIndex < 0 ? Math.max(insertedIndex, 0) : focusIndex;
      focus(Math.min(Math.max(start + dx, 0), carts.length - 1), true);
    };

    const seatCartridge = (index: number, instant: boolean) => {
      const state = carts[index];
      const game = games[index];
      state.where = "slot";
      insertedIndex = index;
      setInserted(index);
      showGame(game);
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
      stopVideo();
      screenGame = index;
      screenMode = "power";
      modeStart = performance.now() / 1000;
      showOnScreen(screenTexture);
      callbacksRef.current.onInsert(game);
      // Plugging in plays: once the screen warms up and starts to crackle, the
      // full-screen static takes over so it feels like it spills out of the cabinet
      gsap.delayedCall(POWER_ON + 0.1, () => {
        if (insertedIndex === index) callbacksRef.current.onPlay(game);
      });
    };

    // Spring the inserted cartridge up out of the port and fly it home
    const ejectTimeline = () => {
      const timeline = gsap.timeline();
      if (insertedIndex < 0) return timeline;
      const old = carts[insertedIndex];
      const oldGroup = old.cart.group;
      insertedIndex = -1;
      setInserted(-1);
      terminal?.print(["> EJECT", "CARTRIDGE RELEASED"]);
      stopVideo();
      screenGame = -1;
      screenMode = "off";
      modeStart = performance.now() / 1000;
      showOnScreen(screenTexture);
      paintMarquee("Scareathon", MARQUEE_NEON_COLORS[0], undefined, true);
      tintCabinet(IDLE_ACCENT);
      flickerMarquee();
      if (rimMaterial) rimMaterial.color.set(SHELF_NEON);
      old.where = "flying";
      const h = cartSize.height;
      const color = new Color(games[old.cart.group.userData.cartIndex]?.cartridge.color ?? SHELF_NEON);
      // Press in against the spring...
      timeline.to(oldGroup.position, { y: seat.y - h * 0.08, duration: 0.07, ease: "power2.in" });
      timeline.to(oldGroup.scale, { x: 1.07, y: 0.88, z: 1.07, duration: 0.07, ease: "power2.in" }, "<");
      // ...then it kicks out with a jolt
      timeline.call(() => {
        playPop();
        gsap.fromTo(shake, { value: h * 0.05 }, { value: 0, duration: 0.3, ease: "power2.out" });
        gsap.fromTo(punch, { value: 0.025 }, { value: 0, duration: 0.5, ease: "power2.out" });
        if (portLight) {
          portLight.color.copy(color);
          gsap.fromTo(portLight, { intensity: 4 }, { intensity: 0, duration: 0.6, ease: "power2.out" });
        }
      });
      timeline.to(oldGroup.position, { y: seat.y + h * 1.15, duration: 0.17, ease: "power4.out" });
      timeline.fromTo(oldGroup.scale, { x: 0.9, y: 1.16, z: 0.9 }, { x: 1, y: 1, z: 1, duration: 0.45, ease: "elastic.out(1.2, 0.35)" }, "<");
      timeline.fromTo(oldGroup.rotation, { z: 0 }, { z: 0.14, duration: 0.17, ease: "power2.out" }, "<");
      // A beat in the air, then home, spinning once on the way
      timeline.add(flyTo(oldGroup, () => homeWorld(old), 0.5, h * 0.7, 1, "power3.inOut", -0.2), "+=0.05");
      timeline.call(() => {
        shelfGroup.attach(oldGroup);
        oldGroup.position.copy(old.home);
        oldGroup.rotation.set(0, 0, 0);
        old.where = "shelf";
        playTick();
        // Lands with a little squash
        gsap.fromTo(oldGroup.scale, { x: 1.08, y: 0.88, z: 1.08 }, { x: 1, y: 1, z: 1, duration: 0.4, ease: "elastic.out(1.1, 0.4)" });
      });
      return timeline;
    };

    const eject = () => {
      if (busy || insertedIndex < 0) return;
      busy = true;
      const index = insertedIndex;
      ejectTimeline().eventCallback("onComplete", () => {
        busy = false;
        terminal?.print(focusIndex >= 0 ? terminalLines(games[focusIndex]) : ["> INSERT CARTRIDGE"]);
        // Back to previewing whatever's focused once the tube has powered down
        gsap.delayedCall(0.15, () => {
          if (insertedIndex < 0) tuneScreen(focusIndex >= 0 ? focusIndex : index, 0.3);
        });
      });
    };

    const insert = (index: number) => {
      if (busy || index < 0 || index >= carts.length) return;
      const state = carts[index];
      if (state.where !== "shelf") return;
      busy = true;
      // On the ledge, let the row finish sliding the cartridge to the middle before
      // anything takes off, so the row isn't moving under a cartridge in flight
      const settle = Math.abs(scroll.x - index * pitchX) > pitchX * 0.05 ? 0.3 : 0;
      focus(index);
      if (settle) gsap.to(scroll, { x: index * pitchX, duration: settle, ease: "power2.out", overwrite: true });
      const timeline = gsap.timeline({ delay: settle, onComplete: () => { busy = false; } });

      // Pop the current cartridge out and send it home first
      const hadCartridge = insertedIndex >= 0;
      if (hadCartridge) timeline.add(ejectTimeline());

      const group = state.cart.group;
      const { height: h, depth: d } = cartSize;
      timeline.call(() => {
        state.where = "flying";
        scene.attach(group);
        playWhoosh();
        terminal?.loading(games[index].name);
        // Off the scanner, so no preview: back to the idle screen until it's seated
        stopVideo();
        screenGame = -1;
        screenMode = "idle";
        lastIdleBlink = -1;
        showOnScreen(screenTexture);
      }, undefined, hadCartridge ? 0.35 : 0);
      // Slide it off the shelf toward you, then arc over, spinning twice (a slow turn, then a quick one) and banking into the turn
      timeline.to(group.position, { z: `+=${d * 2.5}`, y: `+=${h * 0.12}`, duration: 0.16, ease: "power2.out" });
      const hover = seat.clone().add(new Vector3(0, h * 1.05, 0));
      timeline.add(flyTo(group, hover, 0.7, h * 1.1, 2, "power2.inOut", 0.35, 1.6));
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
      setPaused: (isPaused: boolean) => {
        syncVideo();
        // Leaving the game unplugs its cartridge
        if (!isPaused) eject();
      },
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
      const screenBox = new Box3();
      const marqueeBox = new Box3();
      model.traverse((child) => {
        // (Skips the screen's glow, added below)
        if (!(child instanceof Mesh) || !(child.material instanceof MeshStandardMaterial)) return;
        const material = child.material as MeshStandardMaterial;
        material.emissive = new Color(0x222222);
        material.emissiveIntensity = 0.25;
        if (material.name === "GreyScreen") {
          screenMaterial = material.clone();
          screenMaterial.emissive = new Color("#ffffff");
          screenMaterial.emissiveIntensity = SCREEN_GLOW;
          applyCrtLook(screenMaterial);
          child.material = screenMaterial;
          // The glass alone, before its (larger) glow is attached
          screenBox.setFromObject(child, true);
          // A hair in front of the glass, a third of the way in from each side
          const glassMiddle = screenBox.getCenter(new Vector3());
          const glassWidth = screenBox.max.x - screenBox.min.x;
          screenLights.forEach((light, i) => {
            light.position.set(glassMiddle.x + (i ? 1 : -1) * glassWidth * 0.2, glassMiddle.y, screenBox.max.z + 0.06);
          });
          crtGlow = track(createCrtGlow(child));
          showOnScreen(screenTexture);
        } else if (material.name === "Marque") {
          marqueeMaterial = material.clone();
          marqueeMaterial.map = marqueeTexture;
          marqueeMaterial.emissiveMap = marqueeTexture;
          marqueeMaterial.color = new Color("#ffffff");
          marqueeMaterial.emissive = new Color("#ffffff");
          marqueeMaterial.emissiveIntensity = MARQUEE_GLOW;
          child.material = marqueeMaterial;
          marqueeBox.setFromObject(child, true);
        } else if (material.name === "Panels.001") {
          // The black body, dressed as cassette-futurism hardware
          child.material = finish.material;
        } else if (material.name === "Lining") {
          const trim = track(material.clone());
          trim.color.set(CABINET_TRIM);
          trim.emissive.set(CABINET_TRIM).multiplyScalar(0.08);
          trim.metalness = 0.35;
          trim.roughness = 0.32;
          child.material = trim;
        } else if (material.name === "PurpleButton") {
          // The buttons' dark bezels
          const bezel = track(material.clone());
          bezel.color.set("#2a2226");
          child.material = bezel;
        } else if (material.name === "OrangeButton") {
          const own = track(material.clone());
          child.material = own;
          tintMaterials.push(own);
        }
        if (PANEL_MATERIALS.has(material.name)) panelBox.union(new Box3().setFromObject(child));
      });
      tintCabinet(tintTarget, true);
      finish.decorate({ cabinet: cabinetBox, screen: screenBox, panel: panelBox, marquee: marqueeBox });
      cabinetModel = model;
      if (!panelBox.isEmpty()) panelBottom = panelBox.min.y;

      const cabinetSize = cabinetBox.getSize(new Vector3());
      const cartWidth = cabinetSize.x * 0.2;
      // Landscape cartridges, wider than tall
      cartSize = { width: cartWidth, height: cartWidth * CARTRIDGE_ASPECT, depth: cartWidth * 0.18 };

      // The cartridge port: a box with a neon rim, in the empty strip
      // between the controls and the screen so it doesn't sit on the buttons
      const panelCenter = panelBox.isEmpty() ? new Vector3(0, cabinetSize.y * 0.45, cabinetBox.max.z * 0.6) : panelBox.getCenter(new Vector3());
      if (!panelBox.isEmpty() && !screenBox.isEmpty()) {
        panelCenter.z = screenBox.max.z + (panelBox.min.z - screenBox.max.z) * 0.35;
      }
      // Find the cabinet's surface there by dropping a ray onto it
      const surfaceRay = new Raycaster(new Vector3(0, screenBox.isEmpty() ? cabinetBox.max.y : screenBox.min.y, panelCenter.z), new Vector3(0, -1, 0));
      const surface = surfaceRay.intersectObject(model, true).find((hit) => (hit.object as Mesh).material !== screenMaterial);
      const surfaceY = surface ? surface.point.y : panelBox.isEmpty() ? panelCenter.y : panelBox.min.y;
      // A raised housing, so the slot reads above the joysticks rather than among them
      const portTop = Math.max(surfaceY + cartSize.height * 0.12, panelBox.isEmpty() ? 0 : panelBox.max.y + cartSize.height * 0.08);
      const portHeight = portTop - surfaceY + cartSize.height * 0.05;
      // ...retrofitted: bolted on, taped up, wired into the cabinet
      const cabinetRay = new Raycaster();
      const rig = track(
        createSlotRig({
          width: cartSize.width * 1.22,
          height: portHeight,
          depth: cartSize.depth * 2.2,
          center: new Vector3(0, portTop - portHeight / 2, panelCenter.z),
          deckY: surfaceY,
          // Drop a ray onto the deck, passing through the buttons and joysticks
          deckAt: (x, z) => {
            cabinetRay.set(new Vector3(x, portTop + cartSize.height * 0.5, z), new Vector3(0, -1, 0));
            const hit = cabinetRay
              .intersectObject(model, true)
              .find((h) => !PANEL_MATERIALS.has(((h.object as Mesh).material as MeshStandardMaterial).name) && (h.object as Mesh).material !== screenMaterial);
            return hit ? hit.point.y : surfaceY;
          },
          deckFront: cabinetBox.max.z - cartSize.depth * 0.5,
          deckEdge: cabinetBox.max.x - cartSize.width * 0.17,
          faceZ: (x, y) => {
            cabinetRay.set(new Vector3(x, y, cabinetBox.max.z + 1), new Vector3(0, 0, -1));
            const hit = cabinetRay.intersectObject(model, true).find((h) => (h.object as Mesh).material !== screenMaterial);
            return hit ? hit.point.z : panelCenter.z - cartSize.depth;
          },
          // Under the screen's "AUTO TRACKING" label
          vent: new Vector3(screenBox.max.x - 0.1, screenBox.min.y - 0.1, 0),
          // Under the screen's "CH 03" label
          scopeX: screenBox.min.x + 0.15,
        })
      );
      scene.add(rig.group);
      slotRig = rig;
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
      // The terminal, set into the bottom left of the housing's front face
      const housingFront = panelCenter.z + cartSize.depth * 1.1;
      const faceHeight = portTop - surfaceY;
      const terminalHeight = Math.min(faceHeight * 0.72, cartSize.width * 0.3);
      const terminalWidth = terminalHeight / 0.62;
      const terminalDepth = cartSize.depth * 0.25;
      const margin = faceHeight * 0.12;
      terminal = track(createSlotTerminal(terminalWidth, terminalHeight, terminalDepth));
      terminal.group.position.set(
        -cartSize.width * 0.61 + margin + terminalWidth / 2,
        surfaceY + margin + terminalHeight / 2,
        housingFront + terminalDepth / 2
      );
      scene.add(terminal.group);
      // Sunk far enough that the part left standing stays below the screen
      seat.set(0, portTop + cartSize.height / 2 - cartSize.height * 0.55, panelCenter.z);
      portLight = new PointLight(SHELF_NEON, 0, cartSize.height * 5);
      portLight.position.set(0, portTop + cartSize.height * 0.3, panelCenter.z + cartSize.depth * 3);
      scene.add(portLight);

      games.forEach((game, index) => {
        // Neighbours on the shelf never share a shell
        const style = CARTRIDGE_STYLES[index % CARTRIDGE_STYLES.length];
        const cart = createCartridge(game.name, game.cartridge.color, game.cartridge.font, cartSize, style);
        cart.group.userData.cartIndex = index;
        carts.push({ cart, home: new Vector3(), focus: { value: 0 }, intro: { value: 0 }, where: "shelf" });
        disposables.push(cart);
      });

      buildShelf();
      fitCamera();

      room = createCassetteRoom(scene);

      // Start on the game the link names, or the first one, already previewing
      const initial = games.findIndex((game) => game.name === initialGameRef.current);
      focus(Math.max(initial, 0));
      // Cartridges drop onto the shelf one after another
      carts.forEach((state, i) => {
        gsap.to(state.intro, { value: 1, duration: 0.6, delay: 0.15 + i * 0.05, ease: "back.out(1.7)" });
      });

      stopStills = loadVideoStills(games.map((game) => game.videoUrl), (index, source, width, height) => {
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
        if ((press.dragging || Math.abs(dx) > 8)) {
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
        // The first tap or click picks a cartridge and slides it to the middle;
        // another plugs it in. (Hover can't pick: the row would slide out from under it.)
        const onShelf = carts[hit.index].where === "shelf";
        if (onShelf && hit.index !== focusIndex) focus(hit.index, true);
        else activate(hit.index);
      }
      else if (hit?.kind === "cabinet" && insertedIndex >= 0) callbacksRef.current.onPlay(games[insertedIndex]);
    };
    const onWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaX) + Math.abs(event.deltaY) < 4) return;
      moveFocus(Math.sign(event.deltaX || event.deltaY));
    };
    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerup", onPointerUp);
    renderer.domElement.addEventListener("pointercancel", () => { press = null; });
    renderer.domElement.addEventListener("wheel", onWheel, { passive: true });

    // --- Render loop -----------------------------------------------------------------
    let frame = 0;
    const animate = () => {
      frame = requestAnimationFrame(animate);
      if (pausedRef.current) return; // a game is open on top; leave the GPU to it
      const time = performance.now() / 1000;
      room?.update(time);
      finish.update(time);
      terminal?.update(time);
      slotRig?.update(time);

      if (screenMode === "power" && time > modeStart + POWER_ON) {
        screenMode = "static";
        staticUntil = time + STATIC;
        playStatic();
      }
      if (screenMode === "off" && time > modeStart + POWER_OFF) {
        screenMode = "idle";
        lastIdleBlink = -1;
      }
      if (screenMode === "static" && time > staticUntil && screenGame >= 0) startVideo(games[screenGame], true);
      paintScreen(time);
      updateScreenLight(time);
      updateScanner(time);
      screenVideo?.updateFrame();
      // The glow swells with the picture when it flares on
      if (screenMaterial) crtGlow?.setStrength(screenMaterial.emissiveIntensity / SCREEN_GLOW);
      if (marqueeMaterial) marqueeMaterial.emissiveIntensity = MARQUEE_GLOW * marqueeFlicker(time, 0) * marqueeBoot.value;

      shelfGroup.position.x = -scroll.x;
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
      if (!tallMode) {
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
      tallMode = isTall(width, height);
      setTall(tallMode);
      if (!carts.length) return;
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
      document.removeEventListener("pointerdown", playFromGesture, true);
      document.removeEventListener("touchend", playFromGesture, true);
      stopStills?.();
      stopVideo();
      gsap.killTweensOf([scroll, shake, punch, marqueeBoot, flip]);
      if (screenMaterial) gsap.killTweensOf(screenMaterial);
      if (portLight) gsap.killTweensOf(portLight);
      if (rimMaterial) gsap.killTweensOf(rimMaterial.color);
      carts.forEach((state) => {
        gsap.killTweensOf([state.focus, state.intro, state.cart.group.position, state.cart.group.scale]);
      });
      shelfMeshes.forEach((mesh) => mesh.geometry.dispose());
      room?.dispose();
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
      if (paused || browsing) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("button, input, textarea, select, a")) return;
      const world = worldRef.current;
      if (!world) return;
      const moves: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1 };
      if (moves[event.key]) {
        event.preventDefault();
        world.moveFocus(moves[event.key]);
      } else if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        world.activate(focused >= 0 ? focused : inserted);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [paused, browsing, focused, inserted]);

  const shown = focused >= 0 ? focused : inserted;
  const shownGame = games[shown];

  return (
    <div className="relative h-[100dvh] w-screen overflow-hidden bg-black">
      <div ref={mountRef} className="absolute inset-0" style={{ touchAction: "none" }} />
      {loading && <LoadingSpinner />}

      {!loading && (
        <GameCard
          game={shownGame}
          phone={tall}
          onLeaderboard={onLeaderboard}
          onBrowseAll={() => setBrowsing(true)}
          // Fills from just under the ledge down to the bottom
          className="absolute bottom-3 left-1/2 z-10 w-[min(94vw,30rem)] -translate-x-1/2"
          style={ledgeCardTop !== null ? { top: ledgeCardTop } : undefined}
        />
      )}

      {browsing && (
        <CartridgeIndex
          games={games}
          current={shown}
          onClose={() => setBrowsing(false)}
          onPick={(index) => {
            setBrowsing(false);
            worldRef.current?.focus(index, true);
          }}
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
