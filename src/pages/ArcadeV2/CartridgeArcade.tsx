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
  SpotLight,
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
import { createSlotTerminal, TERMINAL_ASPECT, type SlotTerminal } from "./slotTerminal.ts";
import { nowSeconds, type TerminalOptions, type TerminalScreen } from "./terminalScreen.ts";
import { splitParts } from "./splitParts.ts";
import { createMysteryScreen } from "./mysteryScreen.ts";
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
  setTerminalOptions: (options: TerminalOptions) => void;
  // The ? key: lift the picked cartridge up for a look (its details on the terminal), or
  // put it back; with nothing to lift (a game's plugged in), just the details
  pressDetails: () => void;
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
  // What the slot's terminal shows; the info card shows the same, up close
  const [terminalScreen, setTerminalScreen] = useState<TerminalScreen>(() => ({ kind: "message", lines: ["> INSERT CARTRIDGE"], at: nowSeconds() }));
  // The terminal's ? key; stays on while browsing, so you can flick through every game's details
  const [details, setDetails] = useState(false);
  // Read when the scene's built; kept in step after through setTerminalOptions
  const terminalOptionsRef = useRef<TerminalOptions>({ details, phone: tall });
  terminalOptionsRef.current = { details, phone: tall };
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
    // idle → power (CRT warming up) → static → video; eject runs off → idle.
    // "bars": the off-air test card, for a game with nothing to preview.
    // "mystery": the "???" cartridge's live cuts, once it's plugged in
    // "soon": a coming-soon cart's cover (with COMING SOON over it once it's plugged in)
    let screenMode: "idle" | "power" | "static" | "video" | "off" | "bars" | "mystery" | "soon" = "idle";
    const mysteryScreen = createMysteryScreen("/game-recordings/stills/Mystery.jpg");
    const MYSTERY_STOP_CODE = "HEXUS_HANDSHAKE";
    let mysteryCrash: gsap.core.Tween | null = null; // the "???" cartridge's crash, on its way
    let crashCode: string | null = null; // the blue screen's stop code, when it isn't the tapping one
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
    let waitStart = 0;
    const LOADING_AFTER = 1; // seconds of snow before the loading screen shows
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

    // The finger on the glass: a hot spot under it, rings rolling out from it and
    // bright tears across the lines it's on, in the cabinet's colour
    const paintTouch = (time: number, width: number, height: number) => {
      if (!screenContext) return;
      // (The screen's texture is flipped to suit the model's UVs)
      const x = touch.u * width;
      const y = touch.v * height;
      const color = new Color(tintTarget).lerp(new Color("#ffffff"), 0.25);
      const rgb = `${Math.round(color.r * 255)}, ${Math.round(color.g * 255)}, ${Math.round(color.b * 255)}`;
      const age = time - touch.start;
      screenContext.globalCompositeOperation = "lighter";
      for (let i = 0; i < 6; i += 1) {
        screenContext.fillStyle = `rgba(${rgb}, ${0.3 + Math.random() * 0.5})`;
        screenContext.fillRect(0, y + (Math.random() - 0.5) * height * 0.25, width, 1 + Math.random() * 3);
      }
      const reach = height * 0.7;
      screenContext.lineWidth = 6;
      for (let k = 0; k < 3; k += 1) {
        const radius = (age * reach * 0.9 + (k * reach) / 3) % reach;
        screenContext.strokeStyle = `rgba(${rgb}, ${(1 - radius / reach) * 1})`;
        screenContext.beginPath();
        screenContext.arc(x, y, radius, 0, Math.PI * 2);
        screenContext.stroke();
      }
      const spot = height * (0.38 + 0.04 * Math.sin(time * 18));
      const glow = screenContext.createRadialGradient(x, y, 0, x, y, spot);
      glow.addColorStop(0, "rgba(255, 255, 255, 0.95)");
      glow.addColorStop(0.3, `rgba(${rgb}, 0.65)`);
      glow.addColorStop(1, `rgba(${rgb}, 0)`);
      screenContext.fillStyle = glow;
      screenContext.fillRect(x - spot, y - spot, spot * 2, spot * 2);
      screenContext.globalCompositeOperation = "source-over";
    };

    // The crash screen: blue, a sad face and a fault report, with a glitch now and then
    let lastBrokenFrame = -1;
    const paintBroken = (time: number, width: number, height: number) => {
      if (!screenContext) return;
      const frame = Math.floor(time * 12);
      if (frame === lastBrokenFrame) return;
      lastBrokenFrame = frame;
      screenContext.fillStyle = "#0b2fc9";
      screenContext.fillRect(0, 0, width, height);
      screenContext.fillStyle = "#ffffff";
      screenContext.textAlign = "left";
      screenContext.textBaseline = "top";
      screenContext.font = "700 56px ui-monospace, Menlo, Consolas, monospace";
      screenContext.fillText(":(", 36, 22);
      screenContext.font = "700 20px ui-monospace, Menlo, Consolas, monospace";
      const percent = Math.min(Math.floor(((time - brokenAt) / REBOOT) * 100), 100);
      ["SCAREATHON-86 RAN INTO A PROBLEM", "AND NEEDS TO RESTART.", "", `STOP CODE: ${crashCode ?? "EXCESSIVE_TAPPING"}`, `RESTARTING... ${percent}%`].forEach((line, i) =>
        screenContext.fillText(line, 36, 100 + i * 26)
      );
      // A torn band or two
      if (Math.random() < 0.35) {
        const y = Math.random() * height;
        const band = 6 + Math.random() * 24;
        screenContext.drawImage(screenCanvas, 0, y, width, band, (Math.random() - 0.5) * 60, y, width, band);
      }
      screenContext.fillStyle = "rgba(0, 0, 0, 0.22)";
      for (let y = 0; y < height; y += 4) screenContext.fillRect(0, y, width, 2);
      screenTexture.needsUpdate = true;
    };

    // A coming-soon cart: its cover fills the screen. Plugged in, the cover dims
    // behind a band that blinks COMING SOON in the cart's colour.
    const covers = new Map<string, HTMLImageElement>();
    const coverFor = (url: string) => {
      let image = covers.get(url);
      if (!image) {
        image = new Image();
        image.src = url;
        covers.set(url, image);
      }
      return image;
    };
    let soonCover: HTMLImageElement | null = null;
    let soonPlugged = false;
    let soonColor = SHELF_NEON;
    let lastSoonFrame = -1;
    const paintSoon = (time: number, width: number, height: number) => {
      if (!screenContext) return;
      const frame = Math.floor(time * 4);
      if (frame === lastSoonFrame) return;
      lastSoonFrame = frame;
      screenContext.fillStyle = "#07040b";
      screenContext.fillRect(0, 0, width, height);
      if (soonCover?.complete && soonCover.naturalWidth) {
        const scale = Math.max(width / soonCover.naturalWidth, height / soonCover.naturalHeight);
        const w = soonCover.naturalWidth * scale;
        const h = soonCover.naturalHeight * scale;
        screenContext.imageSmoothingEnabled = false;
        screenContext.drawImage(soonCover, (width - w) / 2, (height - h) / 2, w, h);
        screenContext.imageSmoothingEnabled = true;
      } else {
        lastSoonFrame = -1; // try again once the cover has loaded
      }
      if (soonPlugged) {
        screenContext.fillStyle = "rgba(4, 2, 8, 0.55)";
        screenContext.fillRect(0, 0, width, height);
        const band = height * 0.3;
        screenContext.fillStyle = "rgba(4, 2, 8, 0.85)";
        screenContext.fillRect(0, (height - band) / 2, width, band);
        screenContext.fillStyle = soonColor;
        screenContext.fillRect(0, (height - band) / 2, width, 3);
        screenContext.fillRect(0, (height + band) / 2 - 3, width, 3);
        if (frame % 4 !== 3) {
          screenContext.font = canvasFont(TERMINAL_FONT, 44);
          screenContext.textAlign = "center";
          screenContext.textBaseline = "middle";
          screenContext.shadowColor = soonColor;
          screenContext.shadowBlur = 16;
          screenContext.fillStyle = "#fff4e0";
          screenContext.fillText("COMING SOON", width / 2, height / 2 + 2);
          screenContext.shadowBlur = 0;
        }
      }
      screenContext.fillStyle = "rgba(0, 0, 0, 0.22)";
      for (let y = 0; y < height; y += 4) screenContext.fillRect(0, y, width, 2);
      screenTexture.needsUpdate = true;
    };

    // The off-air test card, like the colour bars on the TV in the corner
    const paintTestCard = (width: number, height: number) => {
      if (!screenContext) return;
      const colours = ["#c0c0c0", "#c0c000", "#00c0c0", "#00c000", "#c000c0", "#c00000", "#0000c0"];
      const top = height * 0.67;
      colours.forEach((color, i) => {
        screenContext.fillStyle = color;
        screenContext.fillRect((i * width) / colours.length, 0, width / colours.length + 1, top);
      });
      // The thin reversed strip under the bars
      const strip = height * 0.08;
      [...colours].reverse().forEach((color, i) => {
        screenContext.fillStyle = i % 2 ? "#101010" : color;
        screenContext.fillRect((i * width) / colours.length, top, width / colours.length + 1, strip);
      });
      screenContext.fillStyle = "#101010";
      screenContext.fillRect(0, top + strip, width, height - top - strip);
      screenContext.fillStyle = "#e8e8e8";
      screenContext.font = canvasFont(TERMINAL_FONT, 30);
      screenContext.textAlign = "center";
      screenContext.textBaseline = "middle";
      screenContext.fillText("SA-86  CH 03", width / 2, (top + strip + height) / 2);
      screenContext.fillStyle = "rgba(0, 0, 0, 0.22)";
      for (let y = 0; y < height; y += 4) screenContext.fillRect(0, y, width, 2);
      screenTexture.needsUpdate = true;
    };

    const paintScreen = (time: number) => {
      if (!screenContext) return;
      const { width, height } = screenCanvas;
      if (broken) {
        if (screenMaterial && screenMaterial.map !== screenTexture) showOnScreen(screenTexture);
        paintBroken(time, width, height);
        return;
      }
      if (screenHeld) {
        if (screenMaterial && screenMaterial.map !== screenTexture) showOnScreen(screenTexture);
      } else if (screenMode === "video") {
        // Snow until the clip (or its still) has a picture to show; a loading
        // screen only if that takes a while, so a quick load doesn't flash it
        if (!screenVideo) return;
        if (screenVideo.hasPicture()) {
          if (waitingForPicture) {
            waitingForPicture = false;
            showOnScreen(screenVideo.texture);
          }
          return;
        }
        if (time - waitStart > LOADING_AFTER) {
          paintLoading(time);
          return;
        }
      }
      if (!screenHeld && (screenMode === "power" || screenMode === "off")) {
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
      if ((screenHeld || screenMode === "static" || screenMode === "video") && noiseContext) {
        const image = noiseContext.createImageData(noiseCanvas.width, noiseCanvas.height);
        for (let i = 0; i < image.data.length; i += 4) {
          const v = Math.random() * 255;
          image.data[i] = image.data[i + 1] = image.data[i + 2] = v;
          image.data[i + 3] = 255;
        }
        noiseContext.putImageData(image, 0, 0);
        screenContext.imageSmoothingEnabled = false;
        screenContext.drawImage(noiseCanvas, 0, 0, width, height);
        if (screenHeld) paintTouch(time, width, height);
        screenTexture.needsUpdate = true;
        lastIdleBlink = -1;
        return;
      }
      if (screenMode === "mystery") {
        if (mysteryScreen.paint(screenContext, time)) screenTexture.needsUpdate = true;
        return;
      }
      if (screenMode === "soon") {
        paintSoon(time, width, height);
        return;
      }
      if (screenMode === "bars") {
        // Painted once (lastIdleBlink marks it done, like the idle screen's blink)
        if (lastIdleBlink === 2) return;
        lastIdleBlink = 2;
        paintTestCard(width, height);
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
      // "???" has no preview: off air on the shelf, its loading loop once plugged in
      if (game.special === "mystery") {
        const plugged = games.indexOf(game) === insertedIndex;
        screenMode = plugged ? "mystery" : "bars";
        if (plugged) {
          // It takes over the whole machine: the screen, the terminal, the scope
          mysteryScreen.reset(performance.now() / 1000);
          showTerminal({ kind: "takeover", at: nowSeconds(), seed: Math.floor(Math.random() * 0x7fffffff) });
          slotRig?.setPossessed(true);
          marqueePossessed = true;
          nextMarqueeGlitch = performance.now() / 1000 + 0.8;
          // ...but only for a few seconds: then the handshake fails, the whole machine
          // blue-screens and reboots, and spits the cartridge back out
          mysteryCrash?.kill();
          const index = insertedIndex;
          mysteryCrash = gsap.delayedCall(3 + Math.random() * 12, () => {
            if (!disposed && insertedIndex === index && !broken) breakDown(undefined, MYSTERY_STOP_CODE);
          });
        }
        lastIdleBlink = -1;
        showOnScreen(screenTexture);
        return;
      }
      // Not made yet: the cover on the screen, and COMING SOON once it's plugged in
      if (game.special === "soon") {
        screenMode = "soon";
        soonCover = game.videoUrl ? coverFor(stillUrlFor(game.videoUrl)) : null;
        soonPlugged = games.indexOf(game) === insertedIndex;
        soonColor = game.cartridge.color;
        if (soonPlugged) showTerminal({ kind: "message", lines: ["> COMING SOON", "NOT FINISHED YET", "CHECK BACK SOON"], at: nowSeconds() });
        lastSoonFrame = -1;
        showOnScreen(screenTexture);
        return;
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
      waitStart = performance.now() / 1000;
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
    // Poked: the neon stutters and a few of the flaps flip over, back to the same sign
    const jostleMarquee = () => {
      flickerMarquee();
      if (flip.t < 1) return; // mid-flip to a new sign already
      shownSign.getContext("2d")?.drawImage(marqueeCanvas, 0, 0);
      for (let i = 0; i < FLAP_COLUMNS; i += 1) {
        const flips = Math.random() < 0.4;
        flapSpans[i] = flips ? 0.35 + Math.random() * 0.3 : 0.001;
        flapStarts[i] = flips ? Math.random() * (1 - flapSpans[i]) : 0;
      }
      flip.t = 0;
      gsap.to(flip, { t: 1, duration: 0.6, ease: "none", onUpdate: composeMarquee });
    };
    // The "???" cartridge has the sign too: every so often it flips over to
    // something it shouldn't say, in the wrong colour and the wrong hand, or a
    // few flaps turn over on their own, or the neon sags nearly out
    let marqueePossessed = false;
    let nextMarqueeGlitch = 0;
    const POSSESSED_WORDS = ["???", "0CT0VL", "HEXUS", "HANDSHAKE", "LET ME IN", "IT SEES YOU", "NOT YET", "HELLO AGAIN", "LOOK UP", "SC4R3ATH0N"];
    const POSSESSED_COLORS = ["#e9c46a", "#8a5cff", "#ff3b3b", "#e8e4f4", "#39ff88"];
    const POSSESSED_FONTS: ArcadeFont[] = [{ family: "Creepster" }, { family: "Silkscreen" }, { family: "Nosifer" }, { family: "Grenze Gotisch", weight: 700 }];
    const scramble = (length: number) =>
      Array.from({ length }, () => "▓▒░#@%&?!0123456789ABCDEF"[Math.floor(Math.random() * 24)]).join("");
    const possessMarquee = (time: number) => {
      const roll = Math.random();
      if (roll < 0.5) {
        const text = Math.random() < 0.25 ? scramble(4 + Math.floor(Math.random() * 6)) : POSSESSED_WORDS[Math.floor(Math.random() * POSSESSED_WORDS.length)];
        const color = POSSESSED_COLORS[Math.floor(Math.random() * POSSESSED_COLORS.length)];
        paintMarquee(text, color, POSSESSED_FONTS[Math.floor(Math.random() * POSSESSED_FONTS.length)], true);
      } else if (roll < 0.8) {
        jostleMarquee();
      } else {
        // Nearly goes out, then catches again
        gsap.killTweensOf(marqueeBoot);
        gsap.timeline().to(marqueeBoot, { value: 0.06, duration: 0.12 }).to(marqueeBoot, { value: 1, duration: 0.5 }, `+=${0.2 + Math.random() * 0.6}`);
      }
      nextMarqueeGlitch = time + 0.4 + Math.random() * 1.6;
    };
    document.fonts?.load("220px Zombie").then(() => {
      if (!disposed && !marqueeFontName) paintMarquee(marqueeText, marqueeColor);
    }).catch(() => {});

    // --- State filled in once the cabinet model loads --------------------------------
    const holder = new Group(); // the cabinet, moved so it stands on y = 0 centred on x = z = 0
    // Everything bolted to the cabinet, so a poke rocks it all together. It sits at
    // the origin, the cabinet's foot, and is otherwise left untransformed
    const cabinet = new Group();
    scene.add(cabinet);
    cabinet.add(holder);
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
    let terminalScreenNow: TerminalScreen = { kind: "message", lines: ["> INSERT CARTRIDGE"], at: nowSeconds() };
    let terminalOptions: TerminalOptions = terminalOptionsRef.current;
    // Put something on the terminal, and on the card that mirrors it
    const showTerminal = (screen: TerminalScreen) => {
      terminalScreenNow = screen;
      terminal?.show(screen);
      setTerminalScreen(screen);
    };
    // The terminal's details view (the ? key lit), on the card too
    const showDetails = (on: boolean) => {
      terminalOptions = { ...terminalOptions, details: on };
      terminal?.setOptions(terminalOptions);
      setDetails(on);
    };
    const showGameOrIdle = (index: number) =>
      showTerminal(index >= 0 ? { kind: "game", game: games[index], at: nowSeconds() } : { kind: "message", lines: ["> INSERT CARTRIDGE"], at: nowSeconds() });
    let slotRig: SlotRig | null = null;
    // Parts of the cabinet that react to a click or tap
    const joysticks: { pivot: Group; center: Vector3 }[] = []; // each tips over at its base
    const buttonSides: Mesh[][] = []; // each player's buttons, both rows
    let screenMesh: Mesh | null = null;
    let screenHeld = false; // snow on the screen for as long as it's pressed
    // Tapped too hard, the machine crashes: blue screen, dead scope, no scanner,
    // the marquee jammed mid-flip, until the terminal's reboot finishes
    const BREAK_TAPS = 10; // this many pokes...
    const BREAK_WINDOW = 2.5; // ...within this many seconds
    const REBOOT = 8; // seconds until it's back
    let broken = false;
    let brokenAt = 0;
    let pokeTimes: number[] = [];
    let nextGlitch = 0;
    const touch = { u: 0.5, v: 0.5, start: 0 }; // where on the glass, in its UVs
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
      const active = !pausedRef.current && !broken && !inspecting && insertedIndex < 0 && focusedCart?.where === "shelf";
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
      const plankT = h * 0.07; // (no plank any more: the cartridges float where it was)

      pitchX = w * 1.45;
      // Up under the control panel, so screen, controls and cartridges fit a screen together.
      // The cartridges' tops a little way below the controls, so they don't cover them
      const cartTop = Number.isFinite(panelBottom) ? panelBottom - h * 0.4 : seat.y - h * 0.5;
      const ledgeY = Math.max(cabinetSize.y * 0.2, cartTop - h - plankT / 2);
      const depth = d * 3.4;
      shelfGroup.position.set(0, 0, cabinetBox.max.z + d * 6);
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
      if (broken) return;
      if (inspecting) {
        putBack();
        return;
      }
      if (index < 0 || index >= carts.length || index === focusIndex) return;
      if (focusIndex >= 0) gsap.to(carts[focusIndex].focus, { value: 0, duration: 0.2 });
      focusIndex = index;
      gsap.to(carts[index].focus, { value: 1, duration: 0.2 });
      gsap.to(scroll, { x: index * pitchX, duration: 0.35, ease: "power2.out" });
      if (fromUser) playTick();
      setFocused(index);
      showGameOrIdle(index);
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
      cabinet.attach(state.cart.group);
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
      showTerminal({ kind: "message", lines: ["> EJECT", "CARTRIDGE RELEASED"], at: nowSeconds() });
      slotRig?.setPossessed(false);
      marqueePossessed = false;
      mysteryCrash?.kill();
      mysteryCrash = null;
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
      scene.attach(old.cart.group);
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
        showGameOrIdle(focusIndex);
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
        showTerminal({ kind: "loading", title: games[index].name, at: nowSeconds() });
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
      if (index < 0 || broken) return;
      if (inspecting) {
        putBack();
        return;
      }
      // Tapping the one in the slot pops it back out
      if (carts[index]?.where === "slot") eject();
      else insert(index);
    };

    worldRef.current = {
      pressDetails: () => {
        if (inspecting) {
          putBack();
          return;
        }
        const state = focusIndex >= 0 ? carts[focusIndex] : null;
        if (state && state.where === "shelf" && !broken && !busy && insertedIndex < 0) {
          lookAtCart(state);
          return;
        }
        showDetails(!terminalOptions.details);
        if (terminalScreenNow.kind === "game") showTerminal({ ...terminalScreenNow, at: nowSeconds() });
      },
      setTerminalOptions: (options: TerminalOptions) => {
        const detailsChanged = options.details !== terminalOptions.details;
        terminalOptions = options;
        terminal?.setOptions(options);
        // The ? key retypes the game's lines, on both
        if (detailsChanged && terminalScreenNow.kind === "game") showTerminal({ ...terminalScreenNow, at: nowSeconds() });
      },
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
      // The buttons and joysticks come merged into one mesh each; split them up
      const merged: Record<string, Mesh[]> = {};
      model.traverse((child) => {
        const name = child instanceof Mesh ? (child.material as MeshStandardMaterial).name : "";
        if (name.endsWith("Button") || name.startsWith("Joystick")) (merged[name] ??= []).push(child as Mesh);
      });
      const partsOf = (name: string) => (merged[name] ?? []).flatMap(splitParts);
      holder.updateMatrixWorld(true);
      const centerOf = (object: Object3D) => new Box3().setFromObject(object).getCenter(new Vector3());
      // Two players' buttons, split where the gap between them is widest
      const allButtons = [...partsOf("OrangeButton"), ...partsOf("PurpleButton")]
        .map((mesh) => ({ mesh, x: centerOf(mesh).x }))
        .sort((a, b) => a.x - b.x);
      let split = 1;
      allButtons.forEach((button, i) => {
        if (i > 1 && button.x - allButtons[i - 1].x > allButtons[split].x - allButtons[split - 1].x) split = i;
      });
      if (allButtons.length > 1) buttonSides.push(allButtons.slice(0, split).map((b) => b.mesh), allButtons.slice(split).map((b) => b.mesh));
      // Each joystick tips over from the foot of its stick, carrying the ball and the
      // little cap under it (which is part of the base's mesh)
      partsOf("JoystickStick").forEach((stick) => {
        const box = new Box3().setFromObject(stick);
        const center = box.getCenter(new Vector3());
        const pivot = new Group();
        stick.parent!.add(pivot);
        pivot.position.copy(stick.parent!.worldToLocal(center.clone().setY(box.min.y)));
        pivot.updateMatrixWorld(true);
        pivot.attach(stick);
        joysticks.push({ pivot, center });
      });
      [...partsOf("JoystickBall"), ...partsOf("JoystickBase")].forEach((part) => {
        const at = centerOf(part);
        const flat = (v: Vector3) => Math.hypot(v.x - at.x, v.z - at.z);
        const owner = joysticks.reduce<(typeof joysticks)[number] | null>((best, j) => (best && flat(best.center) <= flat(j.center) ? best : j), null);
        // The base's plate stays put; only what sits up by the ball swings
        if (owner && at.y > owner.center.y) owner.pivot.attach(part);
      });
      model.traverse((child) => {
        // (Skips the screen's glow, added below)
        if (!(child instanceof Mesh) || !(child.material instanceof MeshStandardMaterial)) return;
        const material = child.material as MeshStandardMaterial;
        material.emissive = new Color(0x222222);
        material.emissiveIntensity = 0.25;
        if (material.name === "GreyScreen") {
          screenMaterial = material.clone();
          screenMesh = child;
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
      cabinet.add(rig.group);
      slotRig = rig;
      rimMaterial = track(new MeshBasicMaterial({ color: new Color(SHELF_NEON) }));
      const rimThickness = cartSize.depth * 0.18;
      const rimGeometryX = track(new BoxGeometry(cartSize.width * 1.26, rimThickness, rimThickness));
      const rimGeometryZ = track(new BoxGeometry(rimThickness, rimThickness, cartSize.depth * 2.24));
      [-1, 1].forEach((side) => {
        const front = new Mesh(rimGeometryX, rimMaterial!);
        front.position.set(0, portTop, panelCenter.z + side * cartSize.depth * 1.1);
        cabinet.add(front);
        const end = new Mesh(rimGeometryZ, rimMaterial!);
        end.position.set(side * cartSize.width * 0.62, portTop, panelCenter.z);
        cabinet.add(end);
      });
      // The terminal, set into the bottom left of the housing's front face
      const housingFront = panelCenter.z + cartSize.depth * 1.1;
      const faceHeight = portTop - surfaceY;
      const terminalHeight = Math.min(faceHeight * 0.72, cartSize.width * 0.3);
      const terminalWidth = terminalHeight / TERMINAL_ASPECT;
      const terminalDepth = cartSize.depth * 0.25;
      const margin = faceHeight * 0.12;
      terminal = track(createSlotTerminal(terminalWidth, terminalHeight, terminalDepth));
      terminal.group.position.set(
        -cartSize.width * 0.61 + margin + terminalWidth / 2,
        surfaceY + margin + terminalHeight / 2,
        housingFront + terminalDepth / 2
      );
      cabinet.add(terminal.group);
      terminal.show(terminalScreenNow);
      terminal.setOptions(terminalOptions);
      // Sunk far enough that the part left standing stays below the screen
      seat.set(0, portTop + cartSize.height / 2 - cartSize.height * 0.55, panelCenter.z);
      portLight = new PointLight(SHELF_NEON, 0, cartSize.height * 5);
      portLight.position.set(0, portTop + cartSize.height * 0.3, panelCenter.z + cartSize.depth * 3);
      cabinet.add(portLight);

      games.forEach((game, index) => {
        // Neighbours on the shelf never share a shell
        const style = CARTRIDGE_STYLES[index % CARTRIDGE_STYLES.length];
        const clear = index % 4 === 1; // every fourth one's shell is see-through, whatever its style
        const cart = createCartridge(game.name, game.cartridge.color, game.cartridge.font, cartSize, style, {
          clear,
          released: game.cartridge.about.released,
          note: game.cartridge.backNote,
          tape: game.cartridge.backTape,
          untitled: game.special === "mystery",
        });
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

    // --- Inspecting: hold the picked cartridge to lift it up close and spin it --------
    const HOLD = 0.45; // seconds of holding still
    let inspecting: CartState | null = null;
    const inspect = { amount: { value: 0 }, yaw: 0, pitch: 0, spinYaw: 0, spinPitch: 0 };
    // The drag that's spinning it, and whether it's moved (a still tap puts it back)
    let spin: { x: number; y: number; t: number; moved: boolean } | null = null;
    let holdTimer = 0;
    const inspectPoint = new Vector3();
    // While one's up: a dark veil hung just behind it dims everything else, and a
    // spotlight from above and in front picks it out
    const dimmer = new Mesh(
      new PlaneGeometry(1, 1),
      new MeshBasicMaterial({ color: new Color("#000000"), transparent: true, opacity: 0, depthWrite: false })
    );
    dimmer.frustumCulled = false;
    dimmer.visible = false;
    scene.add(dimmer);
    disposables.push(dimmer.geometry, dimmer.material as MeshBasicMaterial);
    const spotlight = new SpotLight(0xfff1dc, 0, 0, 0.32, 0.55, 0);
    scene.add(spotlight, spotlight.target);
    // Around wherever the cartridge is now, on its way up or back down
    const held = new Vector3();
    const placeSpotlight = (k: number) => {
      if (inspecting) inspecting.cart.group.getWorldPosition(held);
      const toCamera = cameraBase.clone().sub(held);
      const distance = toCamera.length();
      const ahead = toCamera.clone().normalize().negate();
      dimmer.visible = k > 0.001;
      if (!dimmer.visible) {
        spotlight.intensity = 0;
        return;
      }
      // Behind the cartridge, square to the view, big enough to fill it
      dimmer.position.copy(held).addScaledVector(ahead, cartSize.width * 0.75);
      dimmer.lookAt(cameraBase);
      dimmer.scale.setScalar(distance * 6);
      (dimmer.material as MeshBasicMaterial).opacity = 0.7 * k;
      spotlight.position.copy(held).addScaledVector(toCamera.normalize(), distance * 0.45);
      spotlight.position.y += distance * 0.7;
      spotlight.target.position.copy(held);
      // Fading out just past the cartridge, so it doesn't light up the room behind
      spotlight.distance = spotlight.position.distanceTo(held) + cartSize.width * 0.8;
      spotlight.intensity = 3.2 * k;
    };
    // Up close, a little above the middle of the view, big but clear of the edges
    const updateInspectPoint = () => {
      const tan = Math.tan((camera.fov * Math.PI) / 360);
      const fit = 0.58; // of the view's width (or height) the cartridge takes up
      const distance = Math.max(cartSize.width / (fit * 2 * tan * camera.aspect), cartSize.height / (fit * 2 * tan));
      const ahead = cameraTarget.clone().sub(cameraBase).normalize();
      inspectPoint.copy(cameraBase).addScaledVector(ahead, distance);
      inspectPoint.y += distance * tan * 0.12;
    };
    const lookAtCart = (state: CartState) => {
      inspecting = state;
      // One full turn as it comes up, to show it off, settling face on
      inspect.yaw = -Math.PI * 2;
      inspect.pitch = 0;
      inspect.spinYaw = 0;
      inspect.spinPitch = 0;
      gsap.killTweensOf(inspect);
      gsap.to(inspect, { yaw: 0, duration: 0.9, ease: "power3.out" });
      gsap.killTweensOf(inspect.amount);
      gsap.to(inspect.amount, { value: 1, duration: 0.5, ease: "power3.out" });
      playWhoosh();
      // Out of the scanner's view: the screen drops the preview and asks for a cartridge
      stopVideo();
      screenGame = -1;
      screenMode = "idle";
      lastIdleBlink = -1;
      showOnScreen(screenTexture);
      // The terminal shows its details while it's up
      showDetails(true);
      showTerminal({ kind: "game", game: games[state.cart.group.userData.cartIndex], at: nowSeconds() });
    };
    const putBack = () => {
      if (!inspecting) return;
      const state = inspecting;
      spin = null;
      gsap.killTweensOf(inspect);
      // Home by the short way round
      inspect.yaw = Math.atan2(Math.sin(inspect.yaw), Math.cos(inspect.yaw));
      inspect.spinYaw = inspect.spinPitch = 0;
      gsap.killTweensOf(inspect.amount);
      gsap.to(inspect.amount, {
        value: 0,
        duration: 0.45,
        ease: "power2.inOut",
        onComplete: () => {
          if (inspecting === state) inspecting = null;
        },
      });
      playTick();
      showDetails(false);
      showGameOrIdle(focusIndex);
      // Back in line: the screen picks its preview up again
      if (insertedIndex < 0 && focusIndex >= 0) tuneScreen(focusIndex, 0.18);
    };
    const cancelHold = () => {
      window.clearTimeout(holdTimer);
      holdTimer = 0;
    };

    // `cart`: the cartridge it started on (-1 if none), which a swipe up plugs in
    let press: { x: number; y: number; scroll: number; dragging: boolean; lastX: number; lastT: number; velocity: number; cart: number } | null = null;
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

    // Poking the cabinet: joysticks jiggle, buttons click in, the scope goes haywire,
    // the vent sparks, the screen snows while held and the marquee stutters
    const pokeRay = new Raycaster();
    const worldCenter = (object: Object3D) => new Box3().setFromObject(object).getCenter(new Vector3());
    // Generous targets: a tap near enough a joystick or button counts as on it
    const cabinetWidth = () => cabinetBox.max.x - cabinetBox.min.x;
    const nearJoystick = (point: Vector3) => joysticks.some((j) => j.center.distanceTo(point) < cabinetWidth() * 0.14);
    const nearButton = (point: Vector3) =>
      buttonSides.some((side) => side.some((button) => worldCenter(button).distanceTo(point) < cabinetWidth() * 0.12));
    const jiggleJoystick = (point: Vector3) => {
      const stick = joysticks.reduce<(typeof joysticks)[number] | null>((best, j) => (best && best.center.distanceTo(point) <= j.center.distanceTo(point) ? best : j), null);
      if (!stick) return;
      // Knocked over about a random level axis, worked into the model's own frame
      const toLocal = stick.pivot.parent!.matrixWorld.clone().invert();
      const heading = Math.random() * Math.PI * 2;
      const axis = new Vector3(Math.cos(heading), 0, Math.sin(heading)).transformDirection(toLocal);
      const tilt = (stick.pivot.userData.tilt ??= { angle: 0 }) as { angle: number };
      gsap.killTweensOf(tilt);
      const timeline = gsap.timeline({
        onUpdate: () => {
          stick.pivot.quaternion.setFromAxisAngle(axis, tilt.angle);
        },
      });
      [0.5, -0.36, 0.22, -0.12, 0.05, 0].forEach((angle, i) => timeline.to(tilt, { angle, duration: i ? 0.09 : 0.05, ease: "sine.inOut" }));
      playTick();
    };
    // A button lights up: the front row brightens its own colour, the dark back
    // row takes on the game's colour for a moment
    const lightButton = (material: MeshStandardMaterial) => {
      const tinted = tintMaterials.includes(material);
      const glow = new Color(tintTarget);
      const dark = new Color(0x222222);
      const lit = (material.userData.lit ??= { value: 0 }) as { value: number };
      gsap.killTweensOf(lit);
      const apply = () => {
        if (!tinted) material.emissive.copy(dark).lerp(glow, lit.value);
        material.emissiveIntensity = 0.25 + lit.value * (tinted ? 4 : 1.6);
      };
      lit.value = 1;
      apply();
      gsap.to(lit, { value: 0, duration: 0.5, delay: 0.1, ease: "power2.out", onUpdate: apply });
    };
    // Hitting any button on a side presses (and lights) every button on that side
    const pressButtons = (point: Vector3) => {
      const reach = (side: Mesh[]) => Math.min(...side.map((button) => worldCenter(button).distanceTo(point)));
      const side = buttonSides.reduce<Mesh[] | null>((best, each) => (best && reach(best) <= reach(each) ? best : each), null);
      side?.forEach((button, i) => {
        const home = (button.userData.rest ??= button.position.clone()) as Vector3;
        // Straight down in the world, however the model is turned
        const parent = button.parent!;
        const top = worldCenter(button);
        const travel = new Box3().setFromObject(button).getSize(new Vector3()).y * 0.4;
        const down = parent.worldToLocal(top.clone().setY(top.y - travel)).sub(parent.worldToLocal(top.clone()));
        const pressed = home.clone().add(down);
        gsap.killTweensOf(button.position);
        gsap.timeline({ delay: i * 0.012 })
          .set(button.position, { x: home.x, y: home.y, z: home.z })
          .to(button.position, { x: pressed.x, y: pressed.y, z: pressed.z, duration: 0.05, ease: "power2.in" })
          .to(button.position, { x: home.x, y: home.y, z: home.z, duration: 0.18, ease: "back.out(3)" });
        lightButton(button.material as MeshStandardMaterial);
      });
      playTick();
    };
    // Anywhere else on the cabinet: it rocks on its foot and a flash lights its face
    const cabinetFlash = new PointLight(0xffffff, 0, 4, 1.5);
    scene.add(cabinetFlash);
    const rock = { angle: 0 };
    // `strength` scales the rock and the flash: taps in quick succession build it up
    const jiggleCabinet = (point: Vector3, strength = 1) => {
      const away = point.x > 0 ? 1 : -1;
      gsap.killTweensOf(rock);
      const timeline = gsap.timeline({
        onUpdate: () => {
          cabinet.rotation.z = rock.angle;
          cabinet.rotation.x = -Math.abs(rock.angle) * 0.5;
        },
      });
      [0.03, -0.022, 0.014, -0.007, 0.003, 0].forEach((angle, i) => timeline.to(rock, { angle: angle * away * strength, duration: i ? 0.08 : 0.05, ease: "sine.inOut" }));
      cabinetFlash.color.set(tintTarget).lerp(new Color("#ffffff"), 0.4);
      cabinetFlash.position.copy(point).add(new Vector3(0, 0, cartSize.depth * 5));
      gsap.killTweensOf(cabinetFlash);
      gsap.fromTo(cabinetFlash, { intensity: 8 * Math.min(strength, 1.2) }, { intensity: 0, duration: 0.4, ease: "power2.out" });
      playClunk();
    };
    // Count pokes; too many too fast and it breaks (true when that's just happened)
    const notePoke = () => {
      const now = performance.now() / 1000;
      pokeTimes = pokeTimes.filter((t) => now - t < BREAK_WINDOW);
      pokeTimes.push(now);
      return pokeTimes.length >= BREAK_TAPS;
    };
    // point: where it was hit (the screen, when nothing hit it). code: the stop code, when it
    // wasn't tapping that did it
    const breakDown = (hitAt?: Vector3, code?: string) => {
      const point = hitAt ?? (screenMesh ? screenMesh.getWorldPosition(new Vector3()) : cabinet.getWorldPosition(new Vector3()));
      crashCode = code ?? null;
      broken = true;
      brokenAt = performance.now() / 1000;
      pokeTimes = [];
      lastBrokenFrame = -1;
      screenHeld = false;
      playStatic();
      playPop();
      // Sparks off the vent, where it was hit, and round the controls
      slotRig?.sparks();
      slotRig?.sparks(point);
      joysticks.forEach((stick, i) => gsap.delayedCall(0.15 + i * 0.2, () => {
        if (!disposed) slotRig?.sparks(stick.center);
      }));
      gsap.delayedCall(0.5, () => {
        if (!disposed) slotRig?.sparks();
      });
      slotRig?.setDead(true);
      jiggleCabinet(point, 1.6);
      gsap.fromTo(shake, { value: cartSize.width * 0.06 }, { value: 0, duration: 0.9, ease: "power2.out" });
      showTerminal({ kind: "reboot", seconds: REBOOT, at: brokenAt, code });
      // The marquee jams halfway through a flip
      shownSign.getContext("2d")?.drawImage(marqueeCanvas, 0, 0);
      gsap.killTweensOf(flip);
      shuffleFlaps();
      flip.t = 0;
      gsap.to(flip, { t: 0.5, duration: 0.35, ease: "none", onUpdate: composeMarquee });
    };
    const recover = () => {
      broken = false;
      slotRig?.setDead(false);
      gsap.killTweensOf(flip);
      gsap.to(flip, { t: 1, duration: 0.5, ease: "none", onUpdate: composeMarquee });
      gsap.killTweensOf(marqueeBoot);
      marqueeBoot.value = 1;
      flickerMarquee();
      lastIdleBlink = -1;
      if (screenMode === "video" && screenVideo?.hasPicture()) showOnScreen(screenVideo.texture);
      const cartridgeCrashedIt = crashCode === MYSTERY_STOP_CODE;
      crashCode = null;
      if (cartridgeCrashedIt && insertedIndex >= 0 && games[insertedIndex]?.special === "mystery") {
        // Back up without it: the machine won't run it again, so out it comes
        slotRig?.setPossessed(false);
        marqueePossessed = false;
        screenMode = "idle";
        eject();
        return;
      }
      showGameOrIdle(insertedIndex >= 0 ? insertedIndex : focusIndex);
      playTick();
    };

    const pokeCabinet = (clientX: number, clientY: number) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
      pokeRay.setFromCamera(pointer, camera);
      const targets: Object3D[] = [holder, ...carts.map((state) => state.cart.group)];
      if (slotRig) targets.push(slotRig.group);
      const hit = pokeRay.intersectObjects(targets, true)[0];
      if (!hit) return;
      const mesh = hit.object as Mesh;
      for (let node: Object3D | null = mesh; node; node = node.parent) {
        if (typeof node.userData.cartIndex === "number") return; // a cartridge in front
      }
      if (broken) {
        // Kicking it while it's down only gets sparks
        slotRig?.sparks(hit.point);
        jiggleCabinet(hit.point, 0.6);
        return;
      }
      if (notePoke()) {
        breakDown(hit.point);
        return;
      }
      // The rig's scope and vent (the vent answers taps anywhere around its opening)
      const poked = slotRig?.poke(mesh, hit.point, performance.now() / 1000);
      if (poked) {
        if (poked === "sparks") playPop();
        return;
      }
      const name = (mesh.material as MeshStandardMaterial).name;
      if (screenMesh && (mesh === screenMesh || mesh.parent === screenMesh)) {
        screenHeld = true;
        touch.start = performance.now() / 1000;
        touchScreen(clientX, clientY);
        playStatic();
      } else if (marqueeMaterial && mesh.material === marqueeMaterial) jostleMarquee();
      else if (name.startsWith("Joystick") || nearJoystick(hit.point)) jiggleJoystick(hit.point);
      else if (name.endsWith("Button") || nearButton(hit.point)) pressButtons(hit.point);
      // Small at first, harder with each tap in a quick run of them
      else jiggleCabinet(hit.point, 0.3 + 0.9 * Math.min((pokeTimes.length - 1) / (BREAK_TAPS - 2), 1));
    };
    // Follow the finger across the glass (the glass itself: its glow has UVs of its own)
    const touchScreen = (clientX: number, clientY: number) => {
      if (!screenMesh) return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
      pokeRay.setFromCamera(pointer, camera);
      const hit = pokeRay.intersectObject(screenMesh, false)[0];
      if (hit?.uv) {
        touch.u = hit.uv.x;
        touch.v = hit.uv.y;
      }
    };
    // How long the screen was held, in seconds (0 if it wasn't)
    const releaseScreen = () => {
      if (!screenHeld) return 0;
      screenHeld = false;
      lastIdleBlink = -1;
      if (screenMode === "video" && screenVideo?.hasPicture()) showOnScreen(screenVideo.texture);
      return performance.now() / 1000 - touch.start;
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === "mouse") event.preventDefault(); // no text selection while held
      if (inspecting) {
        gsap.killTweensOf(inspect); // hands off the turn it came up with
        spin = { x: event.clientX, y: event.clientY, t: event.timeStamp, moved: false };
        renderer.domElement.setPointerCapture(event.pointerId);
        return;
      }
      pokeCabinet(event.clientX, event.clientY);
      if (screenHeld || broken) {
        // Rubbing the screen (or the machine's down), not dragging the row
        renderer.domElement.setPointerCapture(event.pointerId);
        return;
      }
      press = {
        x: event.clientX,
        y: event.clientY,
        scroll: scroll.x,
        dragging: false,
        lastX: event.clientX,
        lastT: event.timeStamp,
        velocity: 0,
        cart: (() => {
          const hit = pick(event.clientX, event.clientY);
          return hit?.kind === "cart" && ["shelf", "slot"].includes(carts[hit.index].where) ? hit.index : -1;
        })(),
      };
      renderer.domElement.setPointerCapture(event.pointerId);
      // Held still on the picked cartridge for a moment: lift it up for a look
      const held = press?.cart ?? -1;
      if (held >= 0 && held === focusIndex && insertedIndex < 0 && !busy) {
        holdTimer = window.setTimeout(() => {
          holdTimer = 0;
          if (!press || press.dragging || press.cart !== held || carts[held].where !== "shelf") return;
          press = null;
          // The finger that's still down carries straight on into spinning it
          spin = { x: event.clientX, y: event.clientY, t: performance.now(), moved: true };
          lookAtCart(carts[held]);
        }, HOLD * 1000);
      }
    };
    const onPointerMove = (event: PointerEvent) => {
      if (spin) {
        const dx = event.clientX - spin.x;
        if (dx || event.clientY - spin.y) gsap.killTweensOf(inspect);
        const dy = event.clientY - spin.y;
        if (Math.abs(dx) + Math.abs(dy) > 6) spin.moved = true;
        const dt = Math.max(event.timeStamp - spin.t, 1) / 1000;
        const perPixel = 0.012;
        inspect.yaw += dx * perPixel;
        inspect.pitch = Math.min(Math.max(inspect.pitch + dy * perPixel, -1.2), 1.2);
        // Carries on spinning when let go, at the speed it was flicked
        inspect.spinYaw = (dx * perPixel) / dt;
        inspect.spinPitch = (dy * perPixel) / dt;
        spin.x = event.clientX;
        spin.y = event.clientY;
        spin.t = event.timeStamp;
        return;
      }
      if (screenHeld) {
        touchScreen(event.clientX, event.clientY);
        return;
      }
      if (press) {
        const dx = event.clientX - press.x;
        const dy = event.clientY - press.y;
        // Swiped the one in the slot, any way: pull it out
        if (!press.dragging && press.cart >= 0 && carts[press.cart].where === "slot" && Math.hypot(dx, dy) > 40) {
          press = null;
          swiped = true;
          eject();
          return;
        }
        // Flicked up (more up than sideways): plug it in
        if (!press.dragging && press.cart >= 0 && dy < -40 && -dy > Math.abs(dx) * 1.5) {
          const index = press.cart;
          press = null;
          swiped = true;
          if (index !== focusIndex) focus(index, true);
          activate(index);
          return;
        }
        if (Math.abs(dx) > 8 || Math.abs(dy) > 8) cancelHold();
        // (A finger on the slotted cartridge is swiping it out, not scrolling the shelf)
        if ((press.dragging || Math.abs(dx) > 8) && carts[press.cart]?.where !== "slot") {
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
    let swiped = false; // the press just plugged a cartridge in: its release does nothing more
    const onPointerUp = (event: PointerEvent) => {
      cancelHold();
      if (inspecting) {
        const tapped = spin && !spin.moved;
        // Let go without a flick: it stops rather than keeping the last drag's speed
        if (spin && event.timeStamp - spin.t > 80) inspect.spinYaw = inspect.spinPitch = 0;
        spin = null;
        if (tapped) putBack();
        return;
      }
      if (swiped) {
        swiped = false;
        return;
      }
      // A long press on the screen was for the static; don't start a game off it
      if (releaseScreen() > 0.3 || broken) return;
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
      if (broken || inspecting || Math.abs(event.deltaX) + Math.abs(event.deltaY) < 4) return;
      moveFocus(Math.sign(event.deltaX || event.deltaY));
    };
    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerup", onPointerUp);
    renderer.domElement.addEventListener("pointercancel", () => {
      press = null;
      spin = null;
      cancelHold();
      releaseScreen();
    });
    renderer.domElement.addEventListener("wheel", onWheel, { passive: true });

    // --- Render loop -----------------------------------------------------------------
    let frame = 0;
    // The cartridges swing with the row: trailing the way it moves, wobbling when it stops
    const sway = { angle: 0, velocity: 0 };
    let lastScroll = 0;
    let lastFrame = 0;
    const animate = () => {
      frame = requestAnimationFrame(animate);
      if (pausedRef.current) return; // a game is open on top; leave the GPU to it
      const time = performance.now() / 1000;
      room?.update(time);
      finish.update(time);
      cabinet.updateMatrixWorld();
      finish.setFrame(cabinet.matrixWorld);
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
      if (broken && time > brokenAt + REBOOT) recover();
      if (broken && time > nextGlitch) {
        flip.t = 0.42 + Math.random() * 0.16;
        composeMarquee();
        marqueeBoot.value = Math.random() < 0.35 ? 0.1 + Math.random() * 0.3 : 1;
        nextGlitch = time + 0.06 + Math.random() * 0.3;
      }
      if (marqueePossessed && !broken && time > nextMarqueeGlitch) possessMarquee(time);
      // Possessed, the neon never quite settles: it sags and surges (slowly, not a strobe)
      const unrest = marqueePossessed && !broken ? 0.72 + 0.28 * Math.sin(time * 5.3) * Math.sin(time * 1.7 + 1) : 1;
      if (marqueeMaterial) marqueeMaterial.emissiveIntensity = MARQUEE_GLOW * marqueeFlicker(time, 0) * marqueeBoot.value * unrest;

      const dt = lastFrame ? Math.min(time - lastFrame, 0.05) : 0;
      lastFrame = time;
      if (dt > 0 && pitchX > 0) {
        const speed = (scroll.x - lastScroll) / dt / pitchX; // cartridges a second
        const target = Math.max(-0.35, Math.min(0.35, -speed * 0.05));
        sway.velocity += ((target - sway.angle) * 160 - sway.velocity * 6) * dt;
        sway.angle += sway.velocity * dt;
      }
      lastScroll = scroll.x;
      shelfGroup.position.x = -scroll.x;
      if (inspecting) {
        // Coasting after a flick, slowing; and it drifts back upright
        if (!spin) {
          const decay = Math.exp(-dt * (Math.abs(inspect.spinYaw) > Math.PI * 1.5 ? 1.2 : 2.5));
          inspect.yaw += inspect.spinYaw * dt;
          inspect.pitch = Math.min(Math.max(inspect.pitch + inspect.spinPitch * dt, -1.2), 1.2);
          inspect.spinYaw *= decay;
          inspect.spinPitch *= decay;
          inspect.pitch *= Math.exp(-dt * 0.8);
        }
        updateInspectPoint();
        shelfGroup.updateMatrixWorld();
      }
      carts.forEach((state, i) => {
        const f = state.focus.value;
        state.cart.setHighlight(state.where === "slot" ? 0.6 + 0.15 * Math.sin(time * 3) : f);
        if (state.where !== "shelf") return;
        const group = state.cart.group;
        const drop = 1 - state.intro.value;
        group.position.set(
          state.home.x,
          state.home.y + cartSize.height * (0.08 * f + 1.4 * drop),
          // The picked one comes forward, a little bigger than the rest
          state.home.z + cartSize.width * 0.9 * f
        );
        // The focused cartridge tips toward you and sways a little, as if held up
        if (!gsap.isTweening(group.scale)) group.scale.setScalar(1 + 0.1 * f);
        group.rotation.x = 0.15 * f;
        group.rotation.y = 0.12 * f * Math.sin(time * 2.2 + i);
        group.rotation.z = 0.25 * drop * (i % 2 ? 1 : -1);
        // Swinging about its bottom edge, each a little differently
        const lean = sway.angle * (0.8 + 0.4 * ((i * 0.618) % 1));
        group.rotation.z += lean;
        group.position.x -= (Math.sin(lean) * cartSize.height) / 2;
        group.position.y -= ((1 - Math.cos(lean)) * cartSize.height) / 2;
        // Bobbing gently in line, each on its own beat
        group.position.y += cartSize.height * 0.02 * Math.sin(time * 1.1 + i * 1.7) * (1 - drop);
        // Up close for a look
        if (state === inspecting) {
          const k = inspect.amount.value;
          group.position.lerp(shelfGroup.worldToLocal(inspectPoint.clone()), k);
          group.rotation.set(
            group.rotation.x * (1 - k) + inspect.pitch * k,
            group.rotation.y * (1 - k) + inspect.yaw * k,
            group.rotation.z * (1 - k)
          );
        }
      });

      placeSpotlight(inspecting ? inspect.amount.value : 0);

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

  useEffect(() => {
    worldRef.current?.setTerminalOptions({ details, phone: tall });
  }, [details, tall]);

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

  return (
    <div className="relative h-[100dvh] w-screen overflow-hidden bg-black">
      <div ref={mountRef} className="absolute inset-0 select-none" style={{ touchAction: "none", WebkitTouchCallout: "none" }} />
      {loading && <LoadingSpinner />}

      {!loading && (
        <GameCard
          screen={terminalScreen}
          details={details}
          onToggleDetails={() => worldRef.current?.pressDetails()}
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
