import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CSS3DObject, CSS3DRenderer } from "three/examples/jsm/renderers/CSS3DRenderer.js";
import {
  AdditiveBlending,
  Box3,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  CircleGeometry,
  CylinderGeometry,
  DoubleSide,
  ExtrudeGeometry,
  Shape,
  SphereGeometry,
  TorusGeometry,
  Color,
  Float32BufferAttribute,
  FogExp2,
  Group,
  HemisphereLight,
  InstancedMesh,
  Material,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  Points,
  PointsMaterial,
  Raycaster,
  RepeatWrapping,
  Scene,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  VideoTexture,
  Vector2,
  Plane,
  Vector3,
  WebGLRenderer,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import gsap from "gsap";
import { isLightweightDevice } from "../pages/Arcade/cabinetParts.ts";
import { MARQUEE_GLOW } from "../pages/Arcade/cabinetParts.ts";
import { CABINET_TRIM, createCabinetFinish } from "../pages/ArcadeV2/cabinetFinish.ts";
import { applyCrtLook } from "../pages/ArcadeV2/crtScreen.ts";
import { dressSlot, focusedPose, shelfLayout, type SlotDressing } from "../pages/ArcadeV2/slotDressing.ts";
import { CARTRIDGE_STYLES, createCartridge, loadVideoStills, type Cartridge } from "../pages/ArcadeV2/cartridge.ts";
import { ROW_CARTS, ROW_DELAY, ROW_FLY, ROW_PICK, ROW_STAGGER } from "./arcadeRow.ts";
import { linkArcadeFonts } from "../pages/ArcadeV2/arcadeFonts.ts";
import type { MachineData } from "../pages/Arcade/games.tsx";
import { HEADINGS, HUB, STOPS, VIEWS, type Heading, type StopId } from "./stops.ts";
import { buildHalloween, isHalloweenSeason } from "./halloween.ts"; // HALLOWEEN
import { drawRuneTablet } from "./runes.ts";

// The Wayside Station scene, played like Inscryption: the visitor stands on the platform
// and turns between four fixed headings, and walks up to an object to look at it.
// Rendered at a low resolution and scaled up with hard pixels, under a vignette and grain.

type Props = {
  at: StopId | null;
  heading: Heading;
  onSelect: (id: StopId | null) => void;
  onTurn: (to: Heading | 1 | -1) => void; // a step either way, or straight to a heading
  boards: Boards;
  paused?: boolean; // the scene is covered (a game, the arcade): draw one last frame, then rest
  // Where the arcade will draw its cabinet on screen, so the walk up to the cabinet ends
  // with this one exactly there; and whether to hide this one (the arcade's is on top)
  arcadeFrame?: { top: number; bottom: number; centerX: number; width: number; height: number; fov?: number } | null;
  hideArcade?: boolean;
  // The game the cabinet shows on its screen and marquee from the platform
  preview?: { name: string; video: string; color: string } | null;
  arcadeGames?: MachineData[]; // the arcade's cartridges, so this cabinet's row matches its
  onReady?: () => void; // the station's drawn, cabinet and all
  // Coming in by train (read once, on the way in): it pulls in with you aboard, stops, opens
  // its doors once the page says so, and you step off onto the platform
  arrive?: boolean;
  doorsMayOpen?: boolean; // the page has done its heavy lifting (the arcade) while you wait
  onTrainStopped?: () => void;
  onArrived?: () => void; // on the platform: the station's yours

  previewPlaying?: boolean; // the cabinet is in view; its preview is paused otherwise
  // What's on each surface (see SURFACES), drawn crisply over it; usable when standing at its object
  surfaces: Record<string, ReactNode>;
  // Whether the surfaces take taps themselves (desktop); on phones a tap picks the thing up instead
  surfacesInteractive: boolean;
  // Share of the screen's height a phone's held card covers at the bottom; the view frames
  // the object in the space above it
  cardFraction: number;
  // The surface the camera has come up to read (e.g. "paper-2", "flyer-1", "poster"), or
  // null for the whole object
  zoom: string | null;
  // A tap on nothing in particular; by default it steps back to the platform
  onEmptyTap?: () => void;
  // A tap on a marked part of the object you're standing at, e.g. the events poster
  onPart: (part: string) => void;
};

// Live text for the boards in the scene
export type Boards = {
  notices: { kind: string; title: string }[];
  departures: string[];
  unread: number; // letters waiting in your pigeonhole
  poster: { image?: string | null; title: string; line: string };
  rune: string | null; // the day's code, for the rune tablet over the track-side arch
};

const WALL_Z = -2.2;
const EDGE_Z = 3.2; // the platform's edge
const TRACK_Z = EDGE_Z + 2.1; // the middle of the track
const FAR_Z = EDGE_Z + 5.3; // the fence and the name board across the tracks
const SIDE_X = 5.4; // the side wall, just past the pigeonholes, running out from the station wall
const TICKET_Z = 0; // the ticket counter is let into the middle of it
const ARCADE_POS = new Vector3(-3.0, 0, -1.75);
const SIGN_Y = 3.22; // the line the signs along the wall hang on, level with the station's name
const END_X = -7.0; // the platform's far end, past the lockers: a railing, and the scenic view
const PLATFORM_W = 30 - END_X; // the platform, wall and canopy run from END_X out of sight to the right
const PLATFORM_MID = (30 + END_X) / 2;
const RENDER_HEIGHT = 640; // rows of pixels the scene is drawn at, whatever the screen size
const LAMP_IDLE = 9;
const LAMP_LIT = 26;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

// A small canvas painter for signs, flyers and textures
function paint(width: number, height: number, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (ctx) draw(ctx, width, height);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

function signTexture(text: string, fg: string, bg: string, font = "700 96px Georgia, serif") {
  return paint(512, 128, (ctx, w, h) => {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = fg;
    ctx.lineWidth = 6;
    ctx.strokeRect(8, 8, w - 16, h - 16);
    ctx.fillStyle = fg;
    ctx.font = font;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, w / 2, h / 2 + 4, w - 40);
  });
}

// A railway name board: cream letters on navy enamel, a cream rule, and four bolts
function stationSign(text: string) {
  return paint(1024, 174, (ctx, w, h) => {
    ctx.fillStyle = "#1d2a3a";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "#f2ead2";
    ctx.lineWidth = 7;
    ctx.strokeRect(14, 14, w - 28, h - 28);
    ctx.fillStyle = "#f2ead2";
    ctx.font = "700 92px Georgia, serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, w / 2, h / 2 + 5, w - 120);
    ctx.fillStyle = "#8a8f98";
    [[34, 34], [w - 34, 34], [34, h - 34], [w - 34, h - 34]].forEach(([x, y]) => {
      ctx.beginPath();
      ctx.arc(x, y, 7, 0, Math.PI * 2);
      ctx.fill();
    });
  });
}

function glowTexture() {
  return paint(128, 128, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, "rgba(255,230,180,1)");
    g.addColorStop(0.25, "rgba(255,190,110,0.6)");
    g.addColorStop(1, "rgba(255,120,40,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
}

// Cork: light and warm, packed with granules of every shade, and the odd old pin hole
function corkTexture() {
  const texture = paint(256, 256, (ctx, w, h) => {
    ctx.fillStyle = "#a9784a";
    ctx.fillRect(0, 0, w, h);
    const shades = ["#946a3f", "#c49a6a", "#7d5732", "#d2ad7c", "#a37446", "#6a4828", "#b98b58"];
    for (let i = 0; i < 9000; i += 1) {
      ctx.fillStyle = shades[i % shades.length];
      const size = 1 + ((i * 7) % 3);
      ctx.fillRect(Math.random() * w, Math.random() * h, size, size);
    }
    ctx.fillStyle = "rgba(40,24,10,0.55)";
    for (let i = 0; i < 40; i += 1) ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
  });
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.repeat.set(2, 3);
  return texture;
}

function speckle(base: string, dots: string[], count: number, size: number) {
  return paint(256, 256, (ctx, w, h) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < count; i += 1) {
      ctx.fillStyle = dots[i % dots.length];
      ctx.fillRect(Math.random() * w, Math.random() * h, size, size);
    }
  });
}

function brickTexture() {
  const texture = paint(256, 256, (ctx, w, h) => {
    ctx.fillStyle = "#1a1512";
    ctx.fillRect(0, 0, w, h);
    const rows = 8;
    const bh = h / rows;
    for (let r = 0; r < rows; r += 1) {
      const bw = w / 4;
      for (let c = -1; c < 5; c += 1) {
        const shade = 34 + Math.floor(Math.random() * 22);
        ctx.fillStyle = `rgb(${shade + 26}, ${shade + 8}, ${shade})`;
        ctx.fillRect(c * bw + (r % 2 ? bw / 2 : 0) + 2, r * bh + 2, bw - 4, bh - 4);
      }
    }
  });
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.repeat.set(24, 3);
  return texture;
}

// Split text into lines that fit a width, at most maxLines (the last one trimmed)
function wrap(ctx: CanvasRenderingContext2D, text: string, width: number, maxLines: number) {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= width || !line) line = next;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    lines[maxLines - 1] = `${lines[maxLines - 1].replace(/\s+\S*$/, "")}…`;
  }
  return lines;
}

// A notice pinned to the board: a small label, a headline, and a few scribbled lines
function drawNotice(ctx: CanvasRenderingContext2D, w: number, h: number, kind: string, title: string, paper: string) {
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(42,29,20,0.6)";
  ctx.font = "700 11px Georgia, serif";
  ctx.fillText(kind, w / 2, 26);
  ctx.fillStyle = "#2a1d14";
  ctx.font = "700 17px Georgia, serif";
  const lines = wrap(ctx, title, w - 18, 4);
  lines.forEach((text, i) => ctx.fillText(text, w / 2, 48 + i * 19));
  ctx.fillStyle = "rgba(42,29,20,0.45)";
  for (let y = 58 + lines.length * 19; y < h - 12; y += 12) ctx.fillRect(16, y, 50 + ((y * 7) % 45), 3);
  ctx.fillStyle = "#8a1d1d";
  ctx.beginPath();
  ctx.arc(w / 2, 9, 5, 0, Math.PI * 2);
  ctx.fill();
}

// The departure board: a header and three lines of amber type
function drawDepartures(ctx: CanvasRenderingContext2D, w: number, h: number, lines: string[]) {
  ctx.fillStyle = "#0a0c10";
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = "left";
  ctx.fillStyle = "#ffb03a";
  ctx.font = "700 30px monospace";
  ctx.fillText("SCOREBOARD", 20, 40);
  ctx.font = "26px monospace";
  lines.slice(0, 3).forEach((line, i) => ctx.fillText(line.toUpperCase(), 20, 88 + i * 40, w - 40));
}

function repaint(texture: CanvasTexture, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void) {
  const canvas = texture.image as HTMLCanvasElement;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  draw(ctx, canvas.width, canvas.height);
  texture.needsUpdate = true;
}

// A bare tree against the sky, for the far side of the tracks
function treeTexture() {
  return paint(256, 256, (ctx, w, h) => {
    ctx.strokeStyle = "#07080c";
    ctx.lineCap = "round";
    const branch = (x: number, y: number, angle: number, length: number, width: number) => {
      if (length < 6) return;
      const x2 = x + Math.cos(angle) * length;
      const y2 = y + Math.sin(angle) * length;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      branch(x2, y2, angle - 0.35 - Math.random() * 0.3, length * 0.72, width * 0.65);
      branch(x2, y2, angle + 0.3 + Math.random() * 0.3, length * 0.68, width * 0.65);
    };
    branch(w / 2, h, -Math.PI / 2, 70, 12);
  });
}

// Film grain for the overlay, tiled and nudged every frame by CSS
function grainDataUrl() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  const image = ctx.createImageData(128, 128);
  for (let i = 0; i < image.data.length; i += 4) {
    const v = Math.random() * 255;
    image.data[i] = image.data[i + 1] = image.data[i + 2] = v;
    image.data[i + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  return canvas.toDataURL();
}

const standard = (color: string, roughness = 0.9, map?: Texture) =>
  new MeshStandardMaterial({ color, roughness, metalness: 0.05, map });

const box = (w: number, h: number, d: number, material: Material, x = 0, y = 0, z = 0) => {
  const mesh = new Mesh(new BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  return mesh;
};

const plane = (w: number, h: number, material: Material, x = 0, y = 0, z = 0) => {
  const mesh = new Mesh(new PlaneGeometry(w, h), material);
  mesh.position.set(x, y, z);
  return mesh;
};

// An invisible, slightly generous box that catches taps for one object
function hitBox(w: number, h: number, d: number, y: number) {
  const mesh = new Mesh(new BoxGeometry(w, h, d), new MeshBasicMaterial({ visible: false }));
  mesh.position.y = y;
  return mesh;
}

// Each object has its own lamp, which brightens when the object is hovered or visited
function addLamp(group: Group, x: number, y: number, z: number) {
  const lamp = new PointLight("#ffb060", LAMP_IDLE, 6, 2);
  lamp.position.set(x, y, z);
  group.add(lamp);
  group.userData.lamp = lamp;
}

const PAPERS = ["#f2ead2", "#e8d9a8", "#d7c9b0", "#f0c9a0", "#e6e2d8", "#cfd8c8"];
// Painted under each paper's crisp HTML until the real news arrives: plain, unwritten notices
const IDLE_NOTICES = Array.from({ length: 6 }, () => ["NOTICE", ""]);

// Where each of the six papers hangs on the board (local x, y, tilt), and its size
// Two columns of three, reading across: a tall board, the shape of a phone's screen
// The papers on the board (local x, y, tilt, width, height): the welcome, a long notice
// across the top, and four below it
const PAPER_SPOTS: [number, number, number, number, number][] = [
  [0, 1.12, -0.006, 1.86, 0.34],
  [-0.49, 0.36, 0.02, 0.86, 1.02],
  [0.49, 0.35, -0.015, 0.86, 1.02],
  [-0.49, -0.74, -0.01, 0.86, 1.02],
  [0.49, -0.75, 0.02, 0.86, 1.02],
];
// Where the board hangs: its centre, just off the wall
const BOARD_POS = new Vector3(-0.9, 1.72, -2.15);
const PAPER_PX_PER_M = 400; // the papers' HTML, in px per metre of paper
// The flyers on the events table, leaning in their stands (local x, y, z, lean back)
// The flyers in their stand, top to bottom (local x, y, z, lean back)
const FLYER_SPOTS: [number, number, number, number][] = [
  [-0.46, 1.3, 0.09, -0.28],
  [0, 1.3, 0.09, -0.28],
  [0.46, 1.3, 0.09, -0.28],
];
const FLYER_W = 0.4;
const FLYER_H = 0.52;
// The events table, and the poster on the wall above it (local to the table)
const EVENTS_POS = new Vector3(1.2, 0, WALL_Z + 0.35);
const POSTER_Y = 2.38;
const POSTER_Z = WALL_Z + 0.03 - EVENTS_POS.z;

// Your left-luggage locker, in the lockers' own space: top row, middle

// Surfaces: HTML laid onto objects in 3D (CSS3D) so their text is crisp. `at` is local to
// the stop's object; px is the HTML's size, which is scaled to w metres across.
type SurfaceSpec = {
  id: string;
  stop: StopId;
  at: [number, number, number];
  w: number;
  px: [number, number];
  lean?: number;
  tilt?: number;
  lamplit?: boolean; // dimmed to the lamps; the departure board glows on its own
  hiddenAt?: StopId[]; // left to its painted stand-in from here (something stands in front of it)
};
const SURFACES: SurfaceSpec[] = [
  ...PAPER_SPOTS.map(([x, y, tilt, w, h], i): SurfaceSpec => ({
    id: `paper-${i}`,
    stop: "bulletin",
    at: [x, y, 0.07],
    w,
    px: [Math.round(w * PAPER_PX_PER_M), Math.round(h * PAPER_PX_PER_M)],
    tilt,
    lamplit: true,
    // (from the arcade, the cartridges riding into the row pass in front of the board)
    hiddenAt: ["arcade"],
  })),
  { id: "departures", stop: "departures", at: [0, 0, 0.062], w: 2.5, px: [750, 435], hiddenAt: ["arcade"] },
  // More pixels than the face needs (it is scaled up to fit), so read up close the whole
  // flyer has room
  ...FLYER_SPOTS.map(([x, y, z, lean], i): SurfaceSpec => ({ id: `flyer-${i}`, stop: "events", at: [x, y, z], w: FLYER_W, px: [400, 520], lean, lamplit: true })),
  // Tonight's film, over the painted poster, only while it's being read
  { id: "poster", stop: "events", at: [0, POSTER_Y, POSTER_Z + 0.03], w: 0.88, px: [440, 640], lamplit: true },
];

function buildBulletin() {
  const group = new Group();
  group.position.copy(BOARD_POS);
  group.add(box(2.12, 2.86, 0.08, standard("#3a2a1c")));
  group.add(plane(1.98, 2.72, standard("#ffffff", 1, corkTexture()), 0, 0, 0.045));
  // Painted papers: the picture from afar, and a stand-in whenever the HTML can't line up
  group.userData.notes = PAPER_SPOTS.map(([x, y, tilt, w, h], i) => {
    const [kind, title] = IDLE_NOTICES[i];
    const texture = paint(176, 160, (ctx, w, h) => drawNotice(ctx, w, h, kind, title, PAPERS[i]));
    const note = plane(w, h, standard("#ffffff", 1, texture), x, y, 0.06);
    note.userData.part = `paper-${i}`;
    note.rotation.z = tilt;
    group.add(note);
    return texture;
  });
  // The station's name, in enamel, over the board
  group.add(box(1.84, 0.35, 0.04, standard("#11161e"), 0, 1.66, 0.0));
  // Unlit, so the lamps' warm light doesn't turn the navy enamel brown
  group.add(plane(1.76, 0.3, new MeshBasicMaterial({ map: stationSign("WAYSIDE STATION"), color: "#c9c9c9" }), 0, 1.66, 0.025));
  addLamp(group, 0, 1.9, 1.9); // far enough out to light the whole board evenly
  group.add(hitBox(2.4, 3.6, 0.6, 0.3));
  group.userData.stopId = "bulletin";
  return group;
}

// The poster frame over the events table shows tonight's film, or the event's own poster
function drawEventPoster(ctx: CanvasRenderingContext2D, w: number, h: number, title: string, line: string) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#1a0d05");
  g.addColorStop(1, "#3a1405");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#ff7a1a";
  ctx.beginPath();
  ctx.arc(w / 2, h * 0.36, w * 0.28, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#1a0d05";
  ctx.beginPath();
  ctx.moveTo(0, h * 0.62);
  for (let x = 0; x <= w; x += 16) ctx.lineTo(x, h * 0.56 - Math.abs(Math.sin(x * 0.07)) * 26 - (x % 48 === 0 ? 30 : 0));
  ctx.lineTo(w, h * 0.62);
  ctx.fill();
  ctx.textAlign = "center";
  ctx.fillStyle = "#ffd9a0";
  ctx.font = "700 40px Georgia, serif";
  wrap(ctx, title.toUpperCase(), w - 30, 2).forEach((text, i) => ctx.fillText(text, w / 2, h * 0.72 + i * 42, w - 30));
  ctx.font = "italic 20px Georgia, serif";
  ctx.fillText(line, w / 2, h - 28, w - 30);
  ctx.strokeStyle = "#ffd9a0";
  ctx.lineWidth = 4;
  ctx.strokeRect(10, 10, w - 20, h - 20);
}

function buildEvents() {
  const group = new Group();
  group.position.copy(EVENTS_POS);
  const wood = standard("#4a3524");
  // A writing desk: its slanted top at eye level with the flyers side by side on it, a lip
  // along the bottom, and a solid body under it, drawers and cupboard doors in front
  const board = box(1.46, 0.7, 0.04, standard("#3a2a1c"), 0, 1.3, 0.04);
  board.rotation.x = -0.28;
  group.add(board);
  group.add(box(1.46, 0.05, 0.08, wood, 0, 0.99, 0.2));
  // Its sides, cut to the slope of the top (the profile drawn in z and y)
  const profile = new Shape();
  [[0.25, 0], [0.25, 0.97], [0.15, 0.97], [-0.05, 1.64], [-0.2, 1.64], [-0.2, 0]].forEach(([z, y], i) =>
    i ? profile.lineTo(-z, y) : profile.moveTo(-z, y)
  );
  [-0.75, 0.71].forEach((x) => {
    const side = new Mesh(new ExtrudeGeometry(profile, { depth: 0.04, bevelEnabled: false }), wood);
    side.rotation.y = Math.PI / 2;
    side.position.x = x;
    group.add(side);
  });
  group.add(box(1.42, 1.64, 0.03, wood, 0, 0.82, -0.19)); // the back
  const face = standard("#4e3826", 0.75);
  const brass = standard("#b08a3a", 0.35);
  group.add(box(1.42, 0.92, 0.03, standard("#33251a", 0.8), 0, 0.5, 0.24)); // the front
  group.add(box(1.5, 0.06, 0.52, standard("#241a12", 0.9), 0, 0.03, 0.03)); // the plinth
  [-0.36, 0.36].forEach((x) => {
    group.add(box(0.66, 0.2, 0.03, face, x, 0.8, 0.26)); // a drawer
    group.add(box(0.07, 0.025, 0.03, brass, x, 0.8, 0.285));
    group.add(box(0.62, 0.52, 0.03, face, x, 0.36, 0.26)); // a cupboard door
    group.add(box(0.025, 0.06, 0.03, brass, x + (x < 0 ? 0.26 : -0.26), 0.4, 0.285));
  });

  // The flyers (their text is HTML laid over these, see SURFACES)
  const flyers: [string, string, string][] = [
    ["SCARE-ATHON", "#ff7a1a", "#1a0d05"],
    ["THE RULES", "#efe3c8", "#2a1d14"],
    ["OCTOBER", "#1d2a3a", "#f2ead2"],
  ];
  flyers.forEach(([title, bg, fg], i) => {
    const [x, y, z, lean] = FLYER_SPOTS[i];
    const material = standard("#ffffff", 1, paint(240, 312, (ctx, w, h) => {
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = fg;
      ctx.font = "700 40px Georgia, serif";
      ctx.textAlign = "center";
      ctx.fillText(title, w / 2, h / 3, w - 30);
    }));
    const flyer = plane(FLYER_W, FLYER_H, material, x, y, z);
    flyer.userData.part = `flyer-${i}`;
    flyer.rotation.x = lean;
    group.add(flyer);
  });
  // The poster on the wall above the stand
  const posterZ = POSTER_Z;
  group.add(box(1.0, 1.4, 0.04, standard("#2a1d14", 0.7), 0, 2.38, posterZ));
  const posterTexture = paint(256, 384, (ctx, w, h) => drawEventPoster(ctx, w, h, "Scare-athon", "October 1 to 31"));
  const poster = plane(0.88, 1.28, standard("#ffffff", 0.8, posterTexture), 0, 2.38, posterZ + 0.025);
  group.add(poster);
  group.userData.poster = poster;
  group.add(plane(1.1, 0.21, standard("#ffffff", 0.8, signTexture("SCAREATHON", "#ffd9a0", "#120d08", "700 72px Georgia, serif")), 0, SIGN_Y, posterZ + 0.02));
  addLamp(group, 0, 2.4, 1.0);
  group.add(hitBox(1.55, 1.7, 0.5, 0.85));
  // Tapping the poster up close picks it up (see `part` in pick)
  const posterHit = hitBox(1.1, 1.5, 0.3, 2.38);
  posterHit.position.z = posterZ + 0.1;
  posterHit.userData.part = "poster";
  group.add(posterHit);
  group.userData.stopId = "events";
  return group;
}

// Painted as the arcade paints its cabinet (the same finish, trim, bezels and buttons), with
// the preview game on its screen and marquee, so the arcade's own can take over unnoticed
// The arcade sign's bulbs: lit, and the dim ones of the chase
const BULB_ON = new MeshBasicMaterial({ color: "#ffe2a0", fog: false });
const BULB_OFF = new MeshBasicMaterial({ color: "#6a4a26", fog: false });

function buildArcade(preview: { name: string; video: string; color: string } | null, games: MachineData[]) {
  const group = new Group();
  group.position.copy(ARCADE_POS); // against the wall, left of the board
  const placeholder = new Group();
  placeholder.add(box(0.85, 1.9, 0.8, standard("#2b1a3a"), 0, 0.95, 0));
  group.add(placeholder);
  const finish = createCabinetFinish();
  group.userData.finish = finish;
  new GLTFLoader().load(
    "/models/ArcadeCabinet.glb",
    (gltf) => {
      // Set up as CartridgeArcade does: the model scaled and stood up in a holder, centred
      const model = gltf.scene;
      model.scale.set(0.5, 0.5, 0.5);
      model.rotation.set(Math.PI / 2, Math.PI, -Math.PI * 2);
      const holder = new Group();
      holder.add(model);
      holder.updateMatrixWorld(true);
      const raw = new Box3().setFromObject(holder);
      const rawCenter = raw.getCenter(new Vector3());
      holder.position.set(-rawCenter.x, -raw.min.y, -rawCenter.z);
      const cabinet = new Group();
      cabinet.add(holder);
      cabinet.updateMatrixWorld(true);
      const cabinetBox = new Box3().setFromObject(cabinet);
      const screenBox = new Box3();
      const panelBox = new Box3();
      const marqueeBox = new Box3();
      let video: HTMLVideoElement | null = null;
      let glassMaterial: MeshStandardMaterial | null = null;
      const screenTexture = (() => {
        if (!preview) return null;
        const clip = document.createElement("video");
        video = clip;
        clip.muted = true;
        clip.defaultMuted = true;
        clip.loop = true;
        clip.playsInline = true;
        clip.autoplay = true;
        clip.preload = "auto";
        clip.setAttribute("muted", "");
        clip.setAttribute("playsinline", "");
        clip.setAttribute("webkit-playsinline", "");
        clip.src = preview.video;
        const start = () => void clip.play().catch(() => undefined);
        start();
        clip.addEventListener("canplay", start, { once: true });
        window.addEventListener("pointerdown", start, { once: true });
        window.addEventListener("touchend", start, { once: true });
        const texture = new VideoTexture(video);
        texture.colorSpace = SRGBColorSpace;
        return texture;
      })();
      const marquee = paint(512, 128, (ctx, w, h) => {
        ctx.fillStyle = "#0c0a0a";
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = preview?.color ?? "#f2c14e";
        ctx.lineWidth = 5;
        ctx.strokeRect(14, 14, w - 28, h - 28);
        ctx.fillStyle = "#fff4d0";
        ctx.shadowColor = preview?.color ?? "#f2c14e";
        ctx.shadowBlur = 18;
        ctx.font = "700 58px 'Michroma', 'Arial Black', sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText((preview?.name ?? "ARCADE").replace(/’/g, "'").toUpperCase(), w / 2, h / 2 + 3, w - 60);
      });
      model.traverse((child) => {
        const mesh = child as Mesh;
        if (!mesh.isMesh || !(mesh.material instanceof MeshStandardMaterial)) return;
        const material = mesh.material;
        material.emissive = new Color(0x222222);
        material.emissiveIntensity = 0.25;
        if (material.name === "GreyScreen") {
          const glass = material.clone();
          if (screenTexture) {
            glass.map = screenTexture;
            glass.emissiveMap = screenTexture;
          }
          glass.color = new Color("#ffffff");
          glass.emissive = new Color("#ffffff");
          glass.emissiveIntensity = 1.1;
          applyCrtLook(glass);
          mesh.material = glass;
          glassMaterial = glass;
          screenBox.setFromObject(mesh, true);
        } else if (material.name === "Marque") {
          const sign = material.clone();
          sign.map = marquee;
          sign.emissiveMap = marquee;
          sign.color = new Color("#ffffff");
          sign.emissive = new Color("#ffffff");
          sign.emissiveIntensity = MARQUEE_GLOW;
          mesh.material = sign;
          marqueeBox.setFromObject(mesh, true);
        } else if (material.name === "Panels.001") {
          mesh.material = finish.material;
        } else if (material.name === "Lining") {
          const trim = material.clone();
          trim.color.set(CABINET_TRIM);
          trim.emissive.set(CABINET_TRIM).multiplyScalar(0.08);
          trim.metalness = 0.35;
          trim.roughness = 0.32;
          mesh.material = trim;
        } else if (material.name === "PurpleButton") {
          const bezel = material.clone();
          bezel.color.set("#2a2226");
          mesh.material = bezel;
        } else if (material.name === "OrangeButton") {
          const own = material.clone();
          own.color.set(preview?.color ?? "#ff7a1a");
          own.emissive.set(preview?.color ?? "#ff7a1a").multiplyScalar(0.35);
          mesh.material = own;
        }
        if (["JoystickBase", "JoystickStick", "JoystickBall", "OrangeButton", "PurpleButton"].includes(material.name)) panelBox.union(new Box3().setFromObject(mesh));
      });
      finish.accent.set(preview?.color ?? "#ff7a1a");
      finish.decorate({ cabinet: cabinetBox, screen: screenBox, panel: panelBox, marquee: marqueeBox });
      // What the arcade bolts on round its slot, built by the same code in the same places
      const dressing = dressSlot({ model, cabinetBox, panelBox, screenBox, screenMaterial: glassMaterial });
      cabinet.add(dressing.rig.group, dressing.terminal.group, ...dressing.rims);
      group.userData.dressing = dressing;
      // The terminal shows the game the arcade will open on, as the arcade's will
      const start = Math.max(
        games.findIndex((game) => game.name === preview?.name),
        preview ? -1 : games.findIndex((game) => game.special === "shuffle"),
        0
      );
      const phone = window.innerWidth / Math.max(window.innerHeight, 1) < 0.8;
      if (games[start]) dressing.terminal.show({ kind: "game", game: games[start], at: 0 });
      dressing.terminal.setOptions({ details: false, phone });
      // ...and the row of cartridges floating in front, the picked one up (only shown on
      // the way to the cabinet: from the platform, the rack beside it stands in for them)
      if (games.length) {
        linkArcadeFonts(games.map((game) => game.cartridge.font));
        const layout = shelfLayout(dressing.cartSize, cabinetBox, panelBox.isEmpty() ? Infinity : panelBox.min.y, dressing.seat.y);
        const row = new Group();
        row.visible = false;
        const carts: Cartridge[] = [];
        const shown: number[] = [];
        const side = Math.floor(ROW_CARTS / 2);
        for (let i = Math.max(0, start - side); i <= Math.min(games.length - 1, start + side); i += 1) {
          const game = games[i];
          const cart = createCartridge(game.name, game.cartridge.color, game.cartridge.font, dressing.cartSize, CARTRIDGE_STYLES[i % CARTRIDGE_STYLES.length], {
            clear: i % 4 === 1,
            released: game.cartridge.about.released,
            developer: game.cartridge.about.developer,
            note: game.cartridge.backNote,
            tape: game.cartridge.backTape,
            untitled: game.special === "mystery",
          });
          cart.group.userData.restBase = new Vector3((i - start) * layout.pitchX, layout.homeY, layout.z);
          cart.group.userData.rest = cart.group.userData.restBase.clone();
          cart.group.userData.front = cabinetBox.max.z;
          if (i === start) cart.group.userData.pick = focusedPose(dressing.cartSize, 1);
          cart.group.userData.gameIndex = i;
          cart.setHighlight(i === start ? 1 : 0);
          row.add(cart.group);
          carts.push(cart);
          shown.push(i);
        }
        cabinet.add(row);
        group.userData.cartWidth = dressing.cartSize.width;
        const stopStills = loadVideoStills(shown.map((i) => games[i].videoUrl), (n, source, width, height) => carts[n]?.setPicture(source, width, height));
        group.userData.row = row;
        group.userData.disposeRow = () => {
          stopStills();
          carts.forEach((cart) => cart.dispose());
        };
      }
      // Then sized to stand 1.9 m tall on the platform
      cabinet.scale.setScalar(1.9 / Math.max(cabinetBox.getSize(new Vector3()).y, 0.001));
      group.remove(placeholder);
      group.add(cabinet);
      group.userData.cabinet = cabinet;
      group.userData.video = video;
    },
    undefined,
    (error) => {
      // The placeholder box stays; the station carries on without the real cabinet
      console.error("[station] the arcade cabinet model didn't load", error);
      group.userData.failed = true;
    }
  );
  // Its sign on the wall above
  // Its sign on the wall high above, over the scoreboard, on a board ringed with bulbs
  // like an old picture house's, chasing round (see the animation loop)
  const signZ = WALL_Z + 0.03 - group.position.z;
  group.add(box(1.08, 0.4, 0.02, standard("#3a1a10", 0.7), -0.1, SIGN_Y, signZ - 0.02));
  group.add(plane(0.84, 0.21, standard("#ffffff", 0.8, signTexture("ARCADE", "#ffd9a0", "#120d08", "700 84px Georgia, serif")), -0.1, SIGN_Y, signZ));
  const bulbGeometry = new SphereGeometry(0.014, 8, 6);
  const bulbs: Mesh[] = [];
  const [ringW, ringH, spacing] = [0.98, 0.32, 0.07];
  const perimeter = 2 * (ringW + ringH);
  for (let d = 0; d < perimeter - spacing / 2; d += spacing) {
    // Round the rectangle, from its top left corner
    const [x, y] =
      d < ringW ? [d - ringW / 2, ringH / 2]
      : d < ringW + ringH ? [ringW / 2, ringH / 2 - (d - ringW)]
      : d < 2 * ringW + ringH ? [ringW / 2 - (d - ringW - ringH), -ringH / 2]
      : [-ringW / 2, -ringH / 2 + (d - 2 * ringW - ringH)];
    const bulb = new Mesh(bulbGeometry, BULB_ON);
    bulb.position.set(-0.1 + x, SIGN_Y + y, signZ + 0.01);
    group.add(bulb);
    bulbs.push(bulb);
  }
  group.userData.bulbs = bulbs;
  // Their light on the wall round the board
  group.add(plane(1.6, 0.9, new MeshBasicMaterial({ map: glowTexture(), color: "#ffb15a", transparent: true, opacity: 0.18, blending: AdditiveBlending, depthWrite: false }), -0.1, SIGN_Y, signZ - 0.005));
  addLamp(group, 0, 2.6, 1.0);
  group.add(hitBox(1.2, 2.2, 1.1, 1.1));
  group.userData.stopId = "arcade";
  return group;
}

// The path the arcade's cartridges take from the rack to their places in the row, in the
// cabinet's space: a lift up out of the rack, one gentle arc over to the row's left end, then
// along the row to its own place. Every cartridge's path shares the same arc, so in a line
// they look like a little train.
function cartTrainPath(row: Group, cart: Object3D, from: Vector3, rack: Vector3, w: number): CatmullRomCurve3 {
  const rests = row.children.map((child) => child.userData.rest as Vector3);
  const left = rests.reduce((a, b) => (b.x < a.x ? b : a), rests[0]);
  const pitch = rests.length > 1 ? Math.abs(rests[1].x - rests[0].x) : w * 1.2;
  const rest = cart.userData.rest as Vector3;
  const entry = left.clone().add(new Vector3(-pitch, 0, 0));
  const lift = rack.clone().add(new Vector3(w * 0.2, w * 0.7, w * 0.6));
  const top = lift.clone().lerp(entry, 0.5).add(new Vector3(0, w * 1.1, w * 0.4));
  return new CatmullRomCurve3([from, lift, top, entry, rest], false, "centripetal");
}

// A little wall rack beside the arcade: every cartridge on it, stood on end like tapes,
// its spine in its game's colour
function buildCartRack(games: MachineData[]) {
  const group = new Group();
  const tiers = 3;
  const width = 0.5;
  const tierH = 0.15;
  const depth = 0.13;
  group.position.set(-4.02, 1.05, WALL_Z + depth / 2 + 0.01);
  const wood = standard("#4a3322", 0.8);
  // The back board, the shelves and the sides
  group.add(box(width + 0.04, tiers * tierH + 0.04, 0.015, standard("#3a281b", 0.9), 0, (tiers * tierH) / 2, -depth / 2));
  for (let t = 0; t <= tiers; t += 1) group.add(box(width + 0.04, 0.015, depth, wood, 0, t * tierH, 0));
  [-1, 1].forEach((side) => group.add(box(0.015, tiers * tierH + 0.015, depth, wood, side * (width / 2 + 0.012), (tiers * tierH) / 2, 0)));
  // The cartridges, left to right and top to bottom, in the arcade's order; where each
  // stands, so the arcade's can fly out of it
  const spots: { at: Vector3; height: number; meshes: Object3D[] }[] = [];
  group.userData.spots = spots;
  const perTier = Math.max(1, Math.ceil(games.length / tiers));
  const spine = Math.min(0.032, (width - 0.02) / perTier);
  games.forEach((game, i) => {
    const tier = tiers - 1 - Math.floor(i / perTier);
    const col = i % perTier;
    const h = tierH * (0.68 + ((i * 37) % 7) / 70);
    const x = -width / 2 + 0.01 + spine * (col + 0.5);
    const cart = box(spine - 0.004, h, depth * 0.8, standard(game.cartridge.color, 0.55), x, tier * tierH + 0.0075 + h / 2, 0.005);
    group.add(cart);
    // A pale label band across each spine
    const label = box(spine - 0.003, h * 0.22, 0.002, standard("#efe6cf", 0.8), x, tier * tierH + 0.0075 + h * 0.62, 0.005 + depth * 0.4);
    group.add(label);
    spots[i] = { at: cart.position.clone(), height: h, meshes: [cart, label] };
  });
  group.add(hitBox(width + 0.1, tiers * tierH + 0.1, depth + 0.1, (tiers * tierH) / 2));
  group.userData.stopId = "arcade"; // a tap walks you over to the machine
  return group;
}

function buildDepartures() {
  const group = new Group();
  // On the wall over the arcade, under its sign; its face is HTML laid over this (SURFACES)
  group.position.set(-3.1, 2.4, WALL_Z + 0.08);
  group.scale.setScalar(0.6);
  group.add(box(2.65, 1.6, 0.1, standard("#15181f")));
  const face = paint(750, 435, (ctx, w, h) => drawDepartures(ctx, w, h, ["SCAREBOARD    ON TIME", "CALENDAR      DELAYED", "ARCADE        BOARDING"]));
  const faceMesh = plane(2.5, 1.45, new MeshBasicMaterial({ map: face }), 0, 0, 0.056);
  faceMesh.userData.part = "departures";
  group.add(faceMesh);
  group.userData.face = face;
  addLamp(group, 0, -0.5, 1.0);
  group.add(hitBox(2.8, 1.75, 0.6, 0));
  group.userData.stopId = "departures";
  return group;
}

// A little painted enamel plate, e.g. a locker's number
function plateTexture(text: string, fg: string, bg: string) {
  return paint(96, 64, (ctx, w, h) => {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = fg;
    ctx.font = "700 38px Georgia, serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, w / 2, h / 2 + 2);
  });
}

// Left luggage: a bank of six lockers. Yours (No. 13) stands open, with a photo of how
// you look taped inside (HTML, see SURFACES); it's where your clothes are kept.
const LOCKER_W = 0.5;
const LOCKER_H = 0.95;
// A railway clock face: cream, Roman-free bold numerals, minute ticks, black hands
function drawClock(ctx: CanvasRenderingContext2D, w: number, h: number, now: Date) {
  const c = Math.min(w, h) / 2;
  ctx.fillStyle = "#f2ead2";
  ctx.beginPath();
  ctx.arc(c, c, c - 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#1a1512";
  for (let i = 0; i < 60; i += 1) {
    const a = (i / 60) * Math.PI * 2;
    const long = i % 5 === 0;
    ctx.save();
    ctx.translate(c, c);
    ctx.rotate(a);
    ctx.fillRect(-(long ? 3 : 1), -(c - 10), long ? 6 : 2, long ? 18 : 8);
    ctx.restore();
  }
  ctx.font = "700 26px Georgia, serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let n = 1; n <= 12; n += 1) {
    const a = (n / 12) * Math.PI * 2;
    ctx.fillText(String(n), c + Math.sin(a) * (c - 46), c - Math.cos(a) * (c - 46));
  }
  ctx.font = "italic 13px Georgia, serif";
  ctx.fillText("WAYSIDE", c, c + 40);
  const hand = (angle: number, length: number, width: number) => {
    ctx.save();
    ctx.translate(c, c);
    ctx.rotate(angle);
    ctx.fillRect(-width / 2, -length, width, length + 14);
    ctx.restore();
  };
  const minutes = now.getMinutes() + now.getSeconds() / 60;
  hand(((now.getHours() % 12) + minutes / 60) / 12 * Math.PI * 2, c * 0.5, 9);
  hand((minutes / 60) * Math.PI * 2, c * 0.75, 6);
  ctx.beginPath();
  ctx.arc(c, c, 8, 0, Math.PI * 2);
  ctx.fill();
}

function buildLockers() {
  const group = new Group();
  group.position.set(-5.3, 0, WALL_Z + 0.25); // left of the arcade
  const steel = standard("#26302c", 0.55);
  const dark = standard("#0e1014", 1);
  group.add(box(3 * LOCKER_W + 0.08, 0.12, 0.5, standard("#23272e"), 0, 0.06, 0));
  [-1, 0, 1].forEach((col) =>
    [0, 1].forEach((row) => {
      const x = col * LOCKER_W;
      const y = 0.12 + LOCKER_H / 2 + row * (LOCKER_H + 0.02);
      const number = String(9 + row * 3 + col + 1); // 9 to 14; yours is 13
      const mine = col === 0 && row === 1;
      if (!mine) group.add(box(LOCKER_W - 0.02, LOCKER_H, 0.46, steel, x, y, 0));
      if (mine) {
        // Yours is hollow, so you can see in: back, sides, top and bottom, and a shelf
        const inner = standard("#3a3f3b", 0.8);
        group.add(box(LOCKER_W - 0.02, LOCKER_H, 0.02, inner, x, y, -0.22));
        [-1, 1].forEach((side) => group.add(box(0.02, LOCKER_H, 0.46, steel, x + side * (LOCKER_W / 2 - 0.02), y, 0)));
        [-1, 1].forEach((end) => group.add(box(LOCKER_W - 0.02, 0.02, 0.46, steel, x, y + end * (LOCKER_H / 2 - 0.01), 0)));
        group.add(box(LOCKER_W - 0.06, 0.015, 0.42, inner, x, y + 0.3, 0));
        // The door, on its hinge: shut, and swung open while you're at your locker
        const door = new Group();
        door.position.set(x - LOCKER_W / 2 + 0.01, y, 0.24);
        door.add(box(LOCKER_W - 0.03, LOCKER_H - 0.02, 0.02, steel, (LOCKER_W - 0.03) / 2, 0, 0));
        door.add(plane(0.12, 0.08, standard("#ffffff", 0.6, plateTexture(number, "#1d2a3a", "#d9c58a")), (LOCKER_W - 0.03) / 2, 0.3, 0.012));
        [0.3, 0.26, 0.22].forEach((dy) => door.add(box(0.26, 0.012, 0.01, dark, (LOCKER_W - 0.03) / 2, dy, 0.012)));
        group.add(door);
        group.userData.myDoor = door;
        // A coat on a hanger, dimly
        group.add(box(0.28, 0.02, 0.02, standard("#6b5a3a"), x, y + 0.33, -0.05));
        group.add(box(0.3, 0.5, 0.06, standard("#2a2238", 1), x, y + 0.05, -0.1));
        const inside = hitBox(LOCKER_W - 0.04, LOCKER_H - 0.04, 0.1, y);
        inside.position.set(x, y, 0.2);
        inside.userData.part = "locker";
        group.add(inside);
      } else {
        // Louvres and a number plate on the closed ones
        [0.3, 0.26, 0.22].forEach((dy) => group.add(box(0.26, 0.012, 0.01, dark, x, y + dy, 0.235)));
        group.add(plane(0.12, 0.08, standard("#ffffff", 0.6, plateTexture(number, "#1d2a3a", "#d9c58a")), x, y - 0.05, 0.232));
      }
    })
  );
  // An old station clock, keeping real time, hung out from the wall above on a scrolled
  // iron bracket, with a face on each side
  const clockFace = paint(256, 256, (ctx, w, h) => drawClock(ctx, w, h, new Date()));
  // In the corner, towards the end of the platform
  const hanger = new Group();
  hanger.position.x = -1.3;
  group.add(hanger);
  const iron = standard("#1c1a17", 0.5);
  const wallZ = -0.25; // the wall, in the lockers' own space
  const armY = 3.62; // high up, just under the canopy
  const out = 0.55; // how far the clock hangs out from the wall
  hanger.add(box(0.16, 0.36, 0.03, iron, 0, armY - 0.1, wallZ + 0.015)); // the plate on the wall
  hanger.add(box(0.035, 0.035, out + 0.05, iron, 0, armY, wallZ + (out + 0.05) / 2)); // the arm
  const brace = box(0.03, 0.03, 0.5, iron, 0, armY - 0.18, wallZ + 0.2); // the diagonal brace
  brace.rotation.x = 0.75;
  hanger.add(brace);
  // Scrolls, curling under the arm
  [[0.14, 0.07], [0.33, 0.055]].forEach(([z, r]) => {
    const curl = new Mesh(new TorusGeometry(r, 0.012, 6, 16, Math.PI * 1.5), iron);
    curl.rotation.y = Math.PI / 2;
    curl.position.set(0, armY - r - 0.01, wallZ + z);
    hanger.add(curl);
  });
  hanger.add(box(0.02, 0.1, 0.02, iron, 0, armY - 0.07, wallZ + out)); // the rod it hangs from
  const clock = new Group();
  clock.position.set(0, armY - 0.47, wallZ + out);
  clock.rotation.y = Math.PI / 2; // face across the platform, not out from the wall
  const rim = new Mesh(new CylinderGeometry(0.34, 0.34, 0.09, 32), standard("#2a1d14", 0.6));
  rim.rotation.x = Math.PI / 2;
  clock.add(rim);
  [0.047, -0.047].forEach((z) => {
    const face = new Mesh(new CircleGeometry(0.3, 32), new MeshBasicMaterial({ map: clockFace, color: "#d8d0bc" }));
    face.position.z = z;
    if (z < 0) face.rotation.y = Math.PI;
    clock.add(face);
  });
  clock.add(new Mesh(new SphereGeometry(0.03, 8, 6), iron).translateY(0.36));
  hanger.add(clock);
  group.userData.clockFace = clockFace;
  addLamp(group, 0, 2.6, 1.0);
  group.add(hitBox(1.7, 2.3, 0.7, 1.1));
  group.userData.stopId = "lockers";
  return group;
}

// The pigeonhole wall: a cabinet of named cubbyholes. Yours has a brass plate, and
// envelopes stick out of it when you have letters. Beside it the station register lies
// open on a lectern.
// Your cubbyhole: third row down, fifth across (see the painted grid in buildMail)
const MY_CUBBY: [number, number] = [0.125, 1.45];
function buildMail() {
  const group = new Group();
  group.position.set(3.75, 0, WALL_Z + 0.2); // next to the flyer stand
  const cols = 6;
  const rows = 5;
  const cabinetW = 1.9;
  const cabinetH = 1.7;
  const cx = -0.35;
  const bottom = 0.6;
  const wood = standard("#4a3524", 0.85);
  // The cubbyholes, painted: dark holes, name labels, the odd letter left behind
  const names = ["ASH", "VOSS", "M. GRAY", "HOLLIS", "E. MOR", "", "CRANE", "", "DELL", "PIKE", "", "OKAFOR", "BRAM", "QUILL", "", "SAGE", "", "", "", "LUND", "WREN", "", "HART", "", "KESTREL", "", "NOLL", "", "FENN", "ORR"];
  const front = paint(570, 510, (ctx, w, h) => {
    ctx.fillStyle = "#4a3524";
    ctx.fillRect(0, 0, w, h);
    const cw = w / cols;
    const ch = h / rows;
    for (let r = 0; r < rows; r += 1)
      for (let c = 0; c < cols; c += 1) {
        ctx.fillStyle = "#0f0a07";
        ctx.fillRect(c * cw + 6, r * ch + 6, cw - 12, ch - 26);
        if ((r * 7 + c * 3) % 5 === 0) {
          ctx.fillStyle = "#d8ccb0";
          ctx.fillRect(c * cw + 16, r * ch + ch - 44, cw - 40, 14);
        }
        ctx.fillStyle = "#c8b98f";
        ctx.fillRect(c * cw + 14, r * ch + ch - 18, cw - 28, 12);
        ctx.fillStyle = "#2a1d14";
        ctx.font = "700 10px Georgia, serif";
        ctx.textAlign = "center";
        ctx.fillText(names[r * cols + c] ?? "", c * cw + cw / 2, r * ch + ch - 9, cw - 30);
      }
  });
  // The whole cabinet takes you to your letters, not just your cubbyhole
  const cabinet = box(cabinetW + 0.08, cabinetH + 0.08, 0.36, wood, cx, bottom + cabinetH / 2, -0.02);
  cabinet.userData.part = "letters";
  group.add(cabinet);
  const cabinetFront = plane(cabinetW, cabinetH, standard("#ffffff", 0.9, front), cx, bottom + cabinetH / 2, 0.165);
  cabinetFront.userData.part = "letters";
  group.add(cabinetFront);
  // Yours: a brass plate, lit a little brighter, and envelopes when there's mail
  const [mx, my] = MY_CUBBY;
  group.add(plane(0.22, 0.06, new MeshBasicMaterial({ map: plateTexture("YOU", "#2a1d14", "#e2b659") }), mx, my - 0.14, 0.17));
  const envelopes = [0, 1, 2].map((i) => {
    const envelope = box(0.22, 0.14, 0.01, standard("#efe3c8", 1), mx - 0.02 + i * 0.02, my + 0.02 + i * 0.02, 0.17 + i * 0.012);
    envelope.rotation.z = (i - 1) * 0.12;
    envelope.visible = false;
    group.add(envelope);
    return envelope;
  });
  group.userData.envelopes = envelopes;
  const cubby = hitBox(0.36, 0.34, 0.2, my);
  cubby.position.set(mx, my, 0.2);
  cubby.userData.part = "letters";
  group.add(cubby);
  group.add(plane(1.2, 0.3, new MeshBasicMaterial({ map: stationSign("INBOX"), color: "#c9c9c9" }), cx, bottom + cabinetH + 0.3, -0.18));
  // The station register on its lectern
  const lectern = new Group();
  // Tucked into the corner by the side wall, turned to face the platform
  lectern.position.set(1.28, 0, 0.1);
  lectern.rotation.y = -Math.PI / 4;
  lectern.add(box(0.1, 1.0, 0.1, wood, 0, 0.5, 0));
  lectern.add(box(0.5, 0.05, 0.36, wood, 0, 1.02, 0));
  const ledger = paint(300, 210, (ctx, w, h) => {
    ctx.fillStyle = "#e9dcbc";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#2a1d14";
    ctx.fillRect(w / 2 - 1, 0, 2, h);
    ctx.font = "700 14px Georgia, serif";
    ctx.textAlign = "center";
    ctx.fillText("REGISTER", w / 4, 20);
    ctx.fillStyle = "rgba(42,29,20,0.35)";
    for (let y = 34; y < h - 8; y += 14) {
      ctx.fillRect(10, y, w / 2 - 20, 1);
      ctx.fillRect(w / 2 + 10, y, w / 2 - 20, 1);
    }
    ctx.fillStyle = "rgba(20,30,70,0.7)";
    ctx.font = "italic 13px Georgia, serif";
    ctx.textAlign = "left";
    ["E. Vane", "the gardener", "no one", "M.", "Hollis"].forEach((n, i) => ctx.fillText(n, 16 + (i % 2) * w / 2, 46 + i * 28));
  });
  const book = plane(0.5, 0.35, standard("#ffffff", 0.9, ledger), 0, 1.08, 0);
  book.rotation.x = -1.0;
  book.userData.part = "register";
  lectern.add(book);
  const bookHit = hitBox(0.55, 0.3, 0.4, 1.1);
  bookHit.userData.part = "register";
  lectern.add(bookHit);
  group.add(lectern);
  addLamp(group, 0.2, 2.6, 1.0);
  group.add(hitBox(3.0, 2.4, 0.9, 1.3));
  group.userData.stopId = "mail";
  return group;
}

// The ticket counter, built into the side wall past the pigeonholes: a dark window with
// nothing to see behind it but a pair of eyes, a pale hand drumming its fingers on the
// worn counter, and the sign. Tap the window to be served.
// Adverts pasted up over the ticket counter: the arcade's games, old railway style, a
// different three each day. Tap one to go and play it.
const ADVERTS: [string, string, string][] = [
  ["Ooidash", "Dash! Dodge! Survive!", "#c8452d"],
  ["FrogBall", "Two frogs. One ball.", "#3f7d4a"],
  ["GhostRidge", "Ride the haunted hills.", "#3d5a80"],
  ["HordeRush", "Hold the line.", "#8a3b2a"],
  ["DeepTime", "A prehistoric heist.", "#b07a2a"],
  ["Muertos", "Dance with the dead.", "#a0467a"],
  ["SalmonRun2", "Upstream, with style.", "#2f6f8f"],
];
function advertTexture(name: string, tagline: string, colour: string) {
  const draw = (ctx: CanvasRenderingContext2D, w: number, h: number, still?: HTMLImageElement) => {
    ctx.fillStyle = "#e7d9b6";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = colour;
    ctx.fillRect(10, 10, w - 20, 44);
    ctx.fillStyle = "#f4ead0";
    ctx.font = "700 20px Georgia, serif";
    ctx.textAlign = "center";
    ctx.fillText("NOW IN THE ARCADE", w / 2, 39, w - 30);
    ctx.fillStyle = "#3a2a1a";
    ctx.fillRect(18, 66, w - 36, 150);
    if (still) {
      ctx.filter = "sepia(0.85) contrast(1.1) brightness(0.9)";
      const scale = Math.max((w - 36) / still.width, 150 / still.height);
      const sw = (w - 36) / scale;
      const sh = 150 / scale;
      ctx.drawImage(still, (still.width - sw) / 2, (still.height - sh) / 2, sw, sh, 18, 66, w - 36, 150);
      ctx.filter = "none";
    }
    ctx.fillStyle = "#2a1d14";
    ctx.font = "700 30px Georgia, serif";
    ctx.fillText(name.replace(/([a-z])([A-Z0-9])/g, "$1 $2").toUpperCase(), w / 2, 256, w - 24);
    ctx.font = "italic 17px Georgia, serif";
    ctx.fillText(tagline, w / 2, 284, w - 24);
    ctx.fillStyle = colour;
    ctx.fillRect(10, h - 22, w - 20, 10);
  };
  const texture = paint(220, 310, (ctx, w, h) => draw(ctx, w, h));
  const still = new Image();
  still.onload = () => repaint(texture, (ctx, w, h) => draw(ctx, w, h, still));
  still.src = `/game-recordings/stills/${name}.jpg`;
  return texture;
}

// One glowing eye: an almond of sickly yellow with a slit for a pupil
function eyeTexture() {
  return paint(64, 32, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, "rgba(250,255,190,1)");
    g.addColorStop(0.55, "rgba(215,240,90,0.95)");
    g.addColorStop(1, "rgba(160,200,40,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(2, h / 2);
    ctx.quadraticCurveTo(w / 2, -h * 0.35, w - 2, h / 2);
    ctx.quadraticCurveTo(w / 2, h * 1.35, 2, h / 2);
    ctx.fill();
    ctx.fillStyle = "rgba(10,12,4,0.9)";
    ctx.beginPath();
    ctx.ellipse(w / 2, h / 2, 2.5, h * 0.38, 0, 0, Math.PI * 2);
    ctx.fill();
  });
}

// Something behind the glass: two eyes in the dark, and a pale bony hand resting on the
// counter, its fingers drumming (see the animation loop)
function buildClerk() {
  const eyes = new Group();
  eyes.position.set(0, 1.66, -0.012);
  const eye = new MeshBasicMaterial({ map: eyeTexture(), transparent: true, depthWrite: false, fog: false });
  const halo = new MeshBasicMaterial({ map: glowTexture(), color: "#c8ff60", transparent: true, opacity: 0.22, blending: AdditiveBlending, depthWrite: false, fog: false });
  [-0.1, 0.1].forEach((x) => {
    eyes.add(plane(0.075, 0.038, eye, x, 0, 0.002));
    eyes.add(plane(0.26, 0.2, halo, x, 0, 0));
  });
  const bone = new MeshStandardMaterial({ color: "#ece8dd", roughness: 0.6, emissive: new Color("#3a3833") });
  const hand = new Group();
  // Just the hand, big, its wrist going back in under the window into the dark
  const scale = 2.2;
  hand.scale.setScalar(scale);
  hand.position.set(0.3, 1.095, 0.07 - 0.155 * scale);
  hand.add(box(0.06, 0.03, 0.07, bone, 0, 0.016, 0.12)); // the wrist
  hand.add(box(0.085, 0.022, 0.09, bone, 0, 0.013, 0.2)); // the back of the hand
  const thumb = box(0.016, 0.014, 0.06, bone, -0.05, 0.009, 0.215);
  thumb.rotation.y = 0.5;
  hand.add(thumb);
  // Four long fingers, each on its knuckle, so they can lift and tap
  const fingers = [0.032, 0.011, -0.011, -0.032].map((x, i) => {
    const knuckle = new Group();
    knuckle.position.set(x, 0.013, 0.243);
    const length = [0.06, 0.075, 0.078, 0.07][i];
    knuckle.add(box(0.015, 0.013, length, bone, 0, -0.002, length / 2));
    knuckle.add(box(0.017, 0.016, 0.014, bone, 0, 0, 0)); // the knuckle
    hand.add(knuckle);
    return knuckle;
  });
  hand.userData.fingers = fingers;
  return { eyes, hand };
}

function buildTickets() {
  const group = new Group();
  group.position.set(SIDE_X - 0.13, 0, TICKET_Z);
  group.rotation.y = -Math.PI / 2; // faces back along the platform, towards the visitor
  // A worn red runner in front of the counter, its middle trodden pale
  const mat = paint(256, 128, (ctx, w, h) => {
    ctx.fillStyle = "#5a1d17";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "#c9a45a";
    ctx.lineWidth = 5;
    ctx.strokeRect(12, 12, w - 24, h - 24);
    ctx.lineWidth = 2;
    ctx.strokeRect(22, 22, w - 44, h - 44);
    const worn = ctx.createRadialGradient(w / 2, h / 2, 6, w / 2, h / 2, w * 0.42);
    worn.addColorStop(0, "rgba(150,110,90,0.45)");
    worn.addColorStop(1, "rgba(150,110,90,0)");
    ctx.fillStyle = worn;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i += 1) {
      ctx.fillStyle = Math.random() < 0.5 ? "rgba(0,0,0,0.18)" : "rgba(255,220,180,0.08)";
      ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
    ctx.fillStyle = "#c9a45a";
    for (let x = 4; x < w; x += 8) {
      ctx.fillRect(x, 0, 3, 5);
      ctx.fillRect(x, h - 5, 3, 5);
    }
  });
  const rug = plane(1.9, 0.95, standard("#ffffff", 1, mat), 0, 0.012, 0.95);
  rug.rotation.x = -Math.PI / 2;
  group.add(rug);
  const wood = standard("#3a2a1c", 0.8);
  // The frame round the opening
  group.add(box(1.5, 0.1, 0.12, wood, 0, 2.02, 0));
  group.add(box(1.5, 0.12, 0.12, wood, 0, 1.06, 0));
  [-0.7, 0.7].forEach((x) => group.add(box(0.1, 1.06, 0.12, wood, x, 1.54, 0)));
  // The void: black, a faint grille, and a slot at the bottom for coins
  const voidTexture = paint(64, 48, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#07080b");
    g.addColorStop(1, "#010102");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "rgba(160,150,120,0.07)";
    for (let x = 4; x < w; x += 6) ctx.fillRect(x, 0, 1, h - 6);
  });
  const windowMesh = plane(1.3, 0.92, new MeshBasicMaterial({ map: voidTexture }), 0, 1.54, -0.02);
  windowMesh.userData.part = "window";
  group.add(windowMesh);
  group.add(box(0.36, 0.035, 0.02, standard("#050506"), 0, 1.14, 0.065));
  // The counter
  group.add(box(1.7, 0.07, 0.45, standard("#4a3524", 0.7), 0, 1.06, 0.26));
  group.add(box(1.5, 1.04, 0.05, wood, 0, 0.52, 0.06));
  group.add(plane(1.3, 0.32, standard("#ffffff", 0.8, signTexture("TICKETS", "#ffd9a0", "#120d08", "700 80px Georgia, serif")), 0, 2.3, 0.02));
  // Three adverts pasted up above
  const day = Math.floor(Date.now() / 86_400_000);
  [-0.72, 0, 0.72].forEach((x, i) => {
    const [name, tagline, colour] = ADVERTS[(day + i * 2) % ADVERTS.length];
    const ad = plane(0.58, 0.82, standard("#ffffff", 0.95, advertTexture(name, tagline, colour)), x, 3.08, 0.015);
    ad.rotation.z = [0.02, -0.012, 0.018][i];
    ad.userData.part = `advert-${name}`;
    group.add(ad);
  });
  const clerk = buildClerk();
  group.add(clerk.eyes, clerk.hand);
  group.userData.clerk = clerk;
  addLamp(group, 0, 2.4, 1.2);
  const windowHit = hitBox(1.35, 1.0, 0.3, 1.54);
  windowHit.userData.part = "window";
  group.add(windowHit);
  group.add(hitBox(1.9, 2.6, 0.8, 1.3));
  group.userData.stopId = "tickets";
  return group;
}

// The carriage you arrive in: a lit shell of thin walls (so it reads from inside and out),
// its doors in the middle of the platform side, with a dark carriage coupled either end.
// Its own x is 0 at the doors. Outside it wears the light-rail livery (see liveryTexture);
// inside, painted like the rest of the station: wood below the windows, cream paint above, adverts over the windows,
// moquette seats, and glass that's been leaned on for years.
const CAR_LEN = 12;
const CAR_NEAR = EDGE_Z + 0.3; // its platform-side wall
const CAR_FAR = TRACK_Z + 1.35;
const CAR_H = 2.4;
const DOOR_W = 1.3;
const DOOR_H = 2.1;
const CAR_SILL = 0.95;
const CAR_HEAD = 1.8;

// A box with its own material on each face (+x, -x, +y, -y, +z, -z)
function faced(w: number, h: number, d: number, materials: Material[], x = 0, y = 0, z = 0) {
  const mesh = new Mesh(new BoxGeometry(w, h, d), materials);
  mesh.position.set(x, y, z);
  return mesh;
}

// A repeat of a painted tile over a surface `w` by `h` metres, `size` metres a tile
function tiled(texture: Texture, w: number, h: number, size: number | [number, number]) {
  const [sx, sy] = typeof size === "number" ? [size, size] : size;
  const copy = texture.clone();
  copy.wrapS = copy.wrapT = RepeatWrapping;
  copy.repeat.set(Math.max(w / sx, 1), Math.max(h / sy, 1));
  copy.needsUpdate = true;
  return copy;
}

// Grime: soft dark blotches and a few streaks running down
function grime(ctx: CanvasRenderingContext2D, w: number, h: number, amount: number, fromTop = false) {
  for (let i = 0; i < amount; i += 1) {
    const x = Math.random() * w;
    const y = fromTop ? Math.random() * h * 0.35 : Math.random() * h;
    const r = 6 + Math.random() * 26;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, "rgba(20,14,8,0.16)");
    g.addColorStop(1, "rgba(20,14,8,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  ctx.fillStyle = "rgba(25,18,10,0.12)";
  for (let i = 0; i < amount / 3; i += 1) ctx.fillRect(Math.random() * w, Math.random() * h * 0.6, 1 + Math.random() * 2, 10 + Math.random() * 40);
}

function wainscotTexture() {
  return paint(256, 256, (ctx, w, h) => {
    ctx.fillStyle = "#3b2416";
    ctx.fillRect(0, 0, w, h);
    // Two raised panels across, each with its grain
    [0, 128].forEach((x) => {
      ctx.fillStyle = "#4e301c";
      ctx.fillRect(x + 12, 22, 104, h - 44);
      ctx.strokeStyle = "rgba(0,0,0,0.35)";
      ctx.lineWidth = 3;
      ctx.strokeRect(x + 12, 22, 104, h - 44);
      for (let i = 0; i < 40; i += 1) {
        ctx.strokeStyle = `rgba(${20 + Math.random() * 30},${12 + Math.random() * 14},6,0.35)`;
        ctx.lineWidth = 1;
        const y = 26 + Math.random() * (h - 52);
        ctx.beginPath();
        ctx.moveTo(x + 14, y);
        ctx.bezierCurveTo(x + 40, y + 4, x + 80, y - 4, x + 114, y + 2);
        ctx.stroke();
      }
    });
    // The brass rail along the top, and scuffs from knees and bags
    ctx.fillStyle = "#8c6a2e";
    ctx.fillRect(0, 0, w, 7);
    ctx.fillStyle = "#c9a35a";
    ctx.fillRect(0, 1, w, 2);
    ctx.fillStyle = "rgba(210,180,140,0.12)";
    for (let i = 0; i < 30; i += 1) ctx.fillRect(Math.random() * w, h * 0.3 + Math.random() * h * 0.5, 8 + Math.random() * 20, 1);
    grime(ctx, w, h, 10);
  });
}

function creamPaintTexture() {
  return paint(256, 256, (ctx, w, h) => {
    ctx.fillStyle = "#cdbf9c";
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 2500; i += 1) {
      ctx.fillStyle = Math.random() < 0.5 ? "rgba(255,250,235,0.06)" : "rgba(60,45,25,0.06)";
      ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
    grime(ctx, w, h, 16);
  });
}

// The strip over the windows: one framed advert for every window
const CAR_ADVERTS: [string, string, string][] = [
  ["MIND THE GAP", "Between this world and the next", "#7a1f1a"],
  ["THE ARCADE", "Open all night on the platform", "#1f3a5a"],
  ["SCAREATHON", "A film every night in October", "#b4501a"],
  ["LOST PROPERTY", "Ask at the counter. Do not ask what", "#2f4a2f"],
];
function advertStripTexture() {
  return paint(1024, 256, (ctx, w, h) => {
    ctx.fillStyle = "#cdbf9c";
    ctx.fillRect(0, 0, w, h);
    const cardW = w / CAR_ADVERTS.length;
    CAR_ADVERTS.forEach(([title, line, colour], i) => {
      const x = i * cardW + 22;
      const cw = cardW - 44;
      ctx.fillStyle = "#6b5232";
      ctx.fillRect(x - 6, 34, cw + 12, h - 62);
      ctx.fillStyle = "#efe2c2";
      ctx.fillRect(x, 40, cw, h - 74);
      ctx.fillStyle = colour;
      ctx.fillRect(x, 40, cw, 64);
      ctx.fillStyle = "#f5ecd6";
      ctx.font = "700 34px Georgia, serif";
      ctx.textAlign = "center";
      ctx.fillText(title, x + cw / 2, 84, cw - 16);
      ctx.fillStyle = "#2a1d14";
      ctx.font = "italic 21px Georgia, serif";
      wrap(ctx, line, cw - 24, 2).forEach((text, k) => ctx.fillText(text, x + cw / 2, 136 + k * 26, cw - 24));
    });
    grime(ctx, w, h, 40, true);
  });
}

function ceilingTexture() {
  return paint(256, 256, (ctx, w, h) => {
    ctx.fillStyle = "#d8cdb0";
    ctx.fillRect(0, 0, w, h);
    // Ribs across the roof, each catching the light on one side
    for (let x = 0; x < w; x += 64) {
      ctx.fillStyle = "rgba(60,48,30,0.35)";
      ctx.fillRect(x, 0, 6, h);
      ctx.fillStyle = "rgba(255,250,235,0.35)";
      ctx.fillRect(x + 6, 0, 2, h);
    }
    grime(ctx, w, h, 14);
  });
}

function carFloorTexture() {
  return paint(256, 256, (ctx, w, h) => {
    for (let i = 0; i < 8; i += 1) {
      const tone = 34 + Math.floor(Math.random() * 12);
      ctx.fillStyle = `rgb(${tone + 10}, ${tone + 2}, ${tone - 6})`;
      ctx.fillRect(0, i * 32, w, 30);
      ctx.fillStyle = "#14100c";
      ctx.fillRect(0, i * 32 + 30, w, 2);
    }
    // Worn pale down the middle where everyone walks
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0.2, "rgba(150,130,100,0)");
    g.addColorStop(0.5, "rgba(150,130,100,0.18)");
    g.addColorStop(0.8, "rgba(150,130,100,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    grime(ctx, w, h, 18);
  });
}

function moquetteTexture() {
  return paint(128, 128, (ctx, w, h) => {
    ctx.fillStyle = "#5b1f22";
    ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 16) {
      for (let x = (y / 16) % 2 ? 8 : 0; x < w; x += 16) {
        ctx.fillStyle = "#b08a3a";
        ctx.beginPath();
        ctx.moveTo(x + 8, y + 3);
        ctx.lineTo(x + 13, y + 8);
        ctx.lineTo(x + 8, y + 13);
        ctx.lineTo(x + 3, y + 8);
        ctx.fill();
        ctx.fillStyle = "#2a5a5a";
        ctx.fillRect(x + 7, y + 7, 2, 2);
      }
    }
    for (let i = 0; i < 600; i += 1) {
      ctx.fillStyle = "rgba(0,0,0,0.12)";
      ctx.fillRect(Math.random() * w, Math.random() * h, 1, 1);
    }
  });
}

function doorTexture(plate: boolean) {
  return paint(128, 256, (ctx, w, h) => {
    ctx.fillStyle = "#6e2620";
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i += 1) {
      ctx.fillStyle = Math.random() < 0.5 ? "rgba(255,220,200,0.04)" : "rgba(0,0,0,0.07)";
      ctx.fillRect(Math.random() * w, Math.random() * h, 2, 1);
    }
    // Scratches where hands push and bags catch
    ctx.strokeStyle = "rgba(210,170,140,0.3)";
    for (let i = 0; i < 12; i += 1) {
      const x = Math.random() * w;
      const y = h * 0.3 + Math.random() * h * 0.5;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 6 + Math.random() * 14, y + (Math.random() - 0.5) * 6);
      ctx.stroke();
    }
    if (plate) {
      ctx.fillStyle = "#e9dfc6";
      ctx.fillRect(14, 30, w - 28, 54);
      ctx.fillStyle = "#2a1d14";
      ctx.font = "700 15px Georgia, serif";
      ctx.textAlign = "center";
      ctx.fillText("PLEASE STAND", w / 2, 52, w - 36);
      ctx.fillText("CLEAR OF THE DOORS", w / 2, 72, w - 36);
    }
    grime(ctx, w, h, 8);
  });
}

// Window glass: mostly clear, a haze of grime round the edges, smudges, and scratches
function carGlassTexture() {
  return paint(256, 256, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "rgba(170,190,205,0.08)";
    ctx.fillRect(0, 0, w, h);
    const edge = ctx.createLinearGradient(0, 0, 0, h);
    edge.addColorStop(0, "rgba(70,60,45,0.35)");
    edge.addColorStop(0.18, "rgba(70,60,45,0)");
    edge.addColorStop(0.75, "rgba(70,60,45,0)");
    edge.addColorStop(1, "rgba(70,60,45,0.45)");
    ctx.fillStyle = edge;
    ctx.fillRect(0, 0, w, h);
    // Smudges: hands and foreheads
    for (let i = 0; i < 7; i += 1) {
      const x = 30 + Math.random() * (w - 60);
      const y = 50 + Math.random() * (h - 100);
      const r = 14 + Math.random() * 22;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, "rgba(220,215,200,0.16)");
      g.addColorStop(1, "rgba(220,215,200,0)");
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // A long reflection, and fine scratches
    ctx.fillStyle = "rgba(255,245,225,0.07)";
    ctx.beginPath();
    ctx.moveTo(w * 0.15, 0);
    ctx.lineTo(w * 0.32, 0);
    ctx.lineTo(w * 0.12, h);
    ctx.lineTo(-w * 0.05, h);
    ctx.fill();
    ctx.strokeStyle = "rgba(240,235,220,0.22)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 18; i += 1) {
      const x = Math.random() * w;
      const y = Math.random() * h;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (Math.random() - 0.5) * 50, y + (Math.random() - 0.5) * 18);
      ctx.stroke();
    }
  });
}

function buildArrivalCar() {
  const car = new Group();
  const cream = creamPaintTexture();
  const wood = wainscotTexture();
  const adverts = advertStripTexture();
  // Outside, the light-rail livery, each piece showing its own slice of it
  const livery = liveryTexture(CAR_H, CAR_SILL, CAR_HEAD);
  const outside = (w: number, h: number, x = 0, y = h / 2) => liveryFor(livery, CAR_H, w, h, y - h / 2, x - w / 2);
  const plain = standard("#2b3038", 0.6);
  // A wall piece of the platform side: the livery outside (-z), its own look inside (+z)
  const wallPiece = (w: number, h: number, inside: Material, x: number, y: number) => {
    return faced(w, h, 0.06, [plain, plain, plain, plain, inside, outside(w, h, x, y)], x, y, CAR_NEAR);
  };
  const trim = standard("#8b8f94", 0.4);
  const glass = new MeshBasicMaterial({ map: carGlassTexture(), transparent: true, depthWrite: false });
  const depth = CAR_FAR - CAR_NEAR;
  const midZ = (CAR_NEAR + CAR_FAR) / 2;
  // The platform side: wood under the windows, adverts over them, cream pillars between,
  // the doorway open
  const side = (from: number, to: number, firstAdvert: number) => {
    const dir = Math.sign(to - from);
    const len = Math.abs(to - from);
    const mid = (from + to) / 2;
    car.add(wallPiece(len, CAR_SILL, standard("#ffffff", 0.8, tiled(wood, len, CAR_SILL, [0.9, CAR_SILL])), mid, CAR_SILL / 2));
    // The adverts, one over each window: slide the strip so a card's middle sits over the
    // window nearest this piece's left end
    const stripW = 1.7 * CAR_ADVERTS.length;
    const strip = tiled(adverts, len, CAR_H - CAR_HEAD, [stripW, CAR_H - CAR_HEAD]);
    const nearestWindow = Math.min(from + dir * 1.05, from + dir * (Math.floor((len - 1.7) / 1.7) * 1.7 + 1.05));
    strip.offset.x = (0.85 + firstAdvert * 1.7 - (nearestWindow - (mid - len / 2))) / stripW;
    car.add(wallPiece(len, CAR_H - CAR_HEAD, standard("#ffffff", 0.85, strip), mid, (CAR_HEAD + CAR_H) / 2));
    // Windows 1.3 wide with 0.4 pillars, starting from the doorway
    for (let at = 0; at < len; at += 1.7) {
      const pillarAt = from + dir * (at + 0.2);
      car.add(wallPiece(0.4, CAR_HEAD - CAR_SILL, standard("#ffffff", 0.85, cream), pillarAt, (CAR_SILL + CAR_HEAD) / 2));
      const paneAt = from + dir * (at + 0.4 + 0.65);
      if (at + 1.7 <= len) car.add(plane(1.3, CAR_HEAD - CAR_SILL, glass, paneAt, (CAR_SILL + CAR_HEAD) / 2, CAR_NEAR - 0.01));
    }
  };
  side(-DOOR_W / 2, -CAR_LEN / 2, 0);
  side(DOOR_W / 2, CAR_LEN / 2, 1);
  car.add(wallPiece(DOOR_W, CAR_H - DOOR_H, standard("#ffffff", 0.85, cream), 0, (DOOR_H + CAR_H) / 2));
  // The rest of the shell
  car.add(faced(CAR_LEN, 0.08, depth, [plain, plain, standard("#ffffff", 0.95, tiled(carFloorTexture(), CAR_LEN, depth, 1.6)), plain, plain, plain], 0, -0.04, midZ));
  car.add(faced(CAR_LEN, 0.08, depth, [plain, plain, standard("#d9dbd6", 0.5), standard("#ffffff", 0.9, tiled(ceilingTexture(), CAR_LEN, depth, [2, depth])), plain, plain], 0, CAR_H + 0.04, midZ));
  car.add(box(CAR_LEN, CAR_H, 0.06, standard("#ffffff", 0.85, tiled(cream, CAR_LEN, CAR_H, 1.2)), 0, CAR_H / 2, CAR_FAR)); // far wall
  [-1, 1].forEach((end) => car.add(box(0.06, CAR_H, depth, standard("#ffffff", 0.85, tiled(cream, depth, CAR_H, 1.2)), (end * CAR_LEN) / 2, CAR_H / 2, midZ)));
  // A strip light down the middle, bench seats along the far wall, poles by the doors
  car.add(box(CAR_LEN - 1, 0.04, 0.22, new MeshBasicMaterial({ color: "#ffe6bf" }), 0, CAR_H - 0.03, midZ));
  const seat = standard("#ffffff", 0.95, tiled(moquetteTexture(), 4.2, 0.5, 0.35));
  [-1, 1].forEach((end) => {
    car.add(box(4.2, 0.12, 0.5, seat, end * 3.3, 0.48, CAR_FAR - 0.3));
    car.add(box(4.2, 0.5, 0.1, seat, end * 3.3, 0.8, CAR_FAR - 0.08));
    car.add(box(0.04, CAR_H, 0.04, trim, end * (DOOR_W / 2 + 0.25), CAR_H / 2, CAR_NEAR + 0.35));
  });
  car.add(box(CAR_LEN - 1, 0.03, 0.03, trim, 0, 2.0, CAR_NEAR + 0.55)); // the grab rail
  const light = new PointLight("#ffd9a8", 7, 7, 2);
  light.position.set(0, CAR_H - 0.3, midZ);
  car.add(light);
  // The doors: two leaves, each with a window, sliding apart along the outside
  const leaves = [-1, 1].map((dir) => {
    const leaf = new Group();
    const w = DOOR_W / 2;
    const lower = standard("#ffffff", 0.7, doorTexture(dir < 0));
    const painted = standard("#ffffff", 0.7, doorTexture(false));
    const white = standard("#e6e8e3", 0.45);
    leaf.add(faced(w, 1.05, 0.04, [painted, painted, painted, painted, lower, white], 0, 0.525, 0));
    leaf.add(faced(w, DOOR_H - 1.8, 0.04, [painted, painted, painted, painted, painted, white], 0, (1.8 + DOOR_H) / 2, 0));
    leaf.add(box(0.09, 0.75, 0.04, painted, -w / 2 + 0.045, 1.425, 0));
    leaf.add(box(0.09, 0.75, 0.04, painted, w / 2 - 0.045, 1.425, 0));
    leaf.add(plane(w - 0.18, 0.75, glass, 0, 1.425, 0.021));
    leaf.add(box(0.03, DOOR_H, 0.05, standard("#111", 1), -dir * (w / 2 - 0.015), DOOR_H / 2, 0)); // the rubber edge
    leaf.position.set((dir * w) / 2, 0, CAR_NEAR - 0.06);
    car.add(leaf);
    return leaf;
  });
  car.userData.leaves = leaves;
  // Dark carriages coupled either end
  // (2.5 m bottom to roof, from just under the floor; windows 1.05 to 1.9 m up that)
  const body = liveryFor(liveryTexture(CAR_H + 0.1, 1.05, 1.9), CAR_H + 0.1, CAR_LEN, CAR_H + 0.1, 0);
  const lit = new MeshBasicMaterial({ color: "#ffd9a0" });
  [-1, 1].forEach((end) => {
    const x = end * (CAR_LEN + 0.4);
    car.add(box(CAR_LEN, CAR_H + 0.1, depth, body, x, CAR_H / 2, midZ));
    for (let w = 0; w < 6; w += 1) {
      const pane = plane(1.1, 0.75, w % 3 === 1 ? lit : standard("#0c0e12", 1), x - 4.5 + w * 1.8, 1.4, CAR_NEAR - 0.02);
      pane.rotation.y = Math.PI;
      car.add(pane);
    }
  });
  return car;
}

// The trains' livery, after Denver's light rail: white sides, a black band through the
// windows, and a blue and a green stripe under it. One tile is `TILE` metres along a side
// `height` metres tall, its window band from `bandFrom` to `bandTo` up from the bottom.
const LIVERY_TILE = 2;
function liveryTexture(height: number, bandFrom: number, bandTo: number) {
  return paint(256, 256, (ctx, w, h) => {
    const y = (metres: number) => h - (metres / height) * h; // canvas y of a height up the side
    ctx.fillStyle = "#e6e8e3";
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 1600; i += 1) {
      ctx.fillStyle = Math.random() < 0.5 ? "rgba(255,255,255,0.05)" : "rgba(40,40,30,0.05)";
      ctx.fillRect(Math.random() * w, Math.random() * h, 3, 1);
    }
    ctx.fillStyle = "#121417";
    ctx.fillRect(0, y(bandTo), w, y(bandFrom) - y(bandTo));
    ctx.fillStyle = "#1f5aa6";
    ctx.fillRect(0, y(bandFrom - 0.06), w, y(bandFrom - 0.2) - y(bandFrom - 0.06));
    ctx.fillStyle = "#3f9a52";
    ctx.fillRect(0, y(bandFrom - 0.24), w, y(bandFrom - 0.29) - y(bandFrom - 0.24));
    // A panel seam, and road grime thickening towards the bottom
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.fillRect(0, 0, 2, h);
    const grime = ctx.createLinearGradient(0, y(0.5), 0, h);
    grime.addColorStop(0, "rgba(70,62,50,0)");
    grime.addColorStop(1, "rgba(70,62,50,0.45)");
    ctx.fillStyle = grime;
    ctx.fillRect(0, y(0.5), w, h - y(0.5));
  });
}
// The livery over one piece of a side: `w` by `h` metres, its bottom `y0` up the side and
// its left end `x0` along it, so the stripes and band carry on from piece to piece
function liveryFor(livery: Texture, sideHeight: number, w: number, h: number, y0: number, x0 = 0) {
  const copy = livery.clone();
  copy.wrapS = copy.wrapT = RepeatWrapping;
  copy.repeat.set(w / LIVERY_TILE, h / sideHeight);
  copy.offset.set(x0 / LIVERY_TILE, y0 / sideHeight);
  copy.needsUpdate = true;
  return standard("#ffffff", 0.45, copy);
}

// The empty train that passes now and then: white carriages with a few lit windows
function buildTrain() {
  const train = new Group();
  // Its sides are 2.9 m from bottom to roof; the windows sit 1.5 to 2.25 m up that
  const body = liveryFor(liveryTexture(2.9, 1.45, 2.35), 2.9, 11.4, 2.9, 0);
  const lit = new MeshBasicMaterial({ color: "#ffd9a0" });
  const dark = new MeshBasicMaterial({ color: "#0c0e12" });
  for (let car = 0; car < 3; car += 1) {
    const x = -car * 12;
    train.add(box(11.4, 2.9, 2.8, body, x, 1.0, TRACK_Z));
    for (let w = 0; w < 6; w += 1) {
      const pane = plane(1.1, 0.75, (car * 6 + w) % 4 === 1 ? dark : lit, x - 4.5 + w * 1.8, 1.45, TRACK_Z - 1.41);
      pane.rotation.y = Math.PI; // face the platform
      train.add(pane);
    }
  }
  const headlight = new Sprite(new SpriteMaterial({ map: glowTexture(), blending: AdditiveBlending, transparent: true, fog: false, depthWrite: false }));
  headlight.scale.set(3, 3, 1);
  headlight.position.set(5.9, 0.4, TRACK_Z);
  train.add(headlight);
  train.visible = false;
  return train;
}

export default function StationScene({ at, heading, onSelect, onTurn, boards, paused = false, arcadeFrame = null, hideArcade = false, preview = null, arcadeGames = [], onReady, arrive = false, doorsMayOpen = false, onTrainStopped, onArrived, previewPlaying = true, surfaces, surfacesInteractive, cardFraction, zoom, onEmptyTap, onPart }: Props) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const surfaceLayerRef = useRef<HTMLDivElement | null>(null);
  const grainRef = useRef<HTMLDivElement | null>(null);
  const [surfaceSlots, setSurfaceSlots] = useState<Record<string, HTMLDivElement>>({});
  const goRef = useRef<((at: StopId | null, heading: Heading) => void) | null>(null);
  const paintBoardsRef = useRef<((boards: Boards) => void) | null>(null);
  const sceneArcadeRef = useRef<Group | null>(null);
  const latest = useRef({ at, heading, onSelect, onTurn, onPart, onEmptyTap, boards, paused, cardFraction, zoom, arcadeFrame, hideArcade, preview, arcadeGames, onReady, arrive, doorsMayOpen, onTrainStopped, onArrived });
  latest.current = { at, heading, onSelect, onTurn, onPart, onEmptyTap, boards, paused, cardFraction, zoom, arcadeFrame, hideArcade, preview, arcadeGames, onReady, arrive, doorsMayOpen, onTrainStopped, onArrived };

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const lightweight = isLightweightDevice();
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (grainRef.current) grainRef.current.style.backgroundImage = `url(${grainDataUrl()})`;

    // Drawn small and scaled up with hard pixels: the look, and cheap on phones
    const renderer = new WebGLRenderer({ antialias: false });
    renderer.domElement.style.imageRendering = "pixelated";
    mount.appendChild(renderer.domElement);

    const scene = new Scene();
    // A night sky that is a little lighter at the horizon, so silhouettes read against it
    scene.background = paint(4, 256, (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "#020308");
      g.addColorStop(0.55, "#0b1020");
      g.addColorStop(0.72, "#1a2236");
      g.addColorStop(1, "#07090e");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    });
    scene.fog = new FogExp2(new Color("#0c1019"), 0.08);
    const camera = new PerspectiveCamera(60, 1, 0.1, 200);
    camera.rotation.order = "YXZ";

    // Light: a faint cold wash; the warm light comes from the lamps
    scene.add(new HemisphereLight("#6f7fa8", "#1a120c", 0.45));
    // The canopy's lamps, all alike: a dim glass behind a wire guard
    const lampGuard = standard("#1c1a17", 0.5);
    const lampGlass = new MeshBasicMaterial({ color: "#9a8158" });
    // Each lamp: its glass (its own, to dim), its light, and a generous box to tap it by.
    // Tapped, it stutters off and on for a moment; now and then it does so by itself. And
    // some of the time, a few moths come to it.
    type Lamp = { light: PointLight; glass: MeshBasicMaterial; base: number; tappedAt: number; seed: number; hit: Mesh; nextFlicker: number; moths: Group };
    const lamps: Lamp[] = [];
    const mothWing = new MeshBasicMaterial({ color: "#d9cfb4", side: DoubleSide, transparent: true, opacity: 0.85 });
    const ceilingLamp = (x: number, z: number, light: PointLight) => {
      const glass = lampGlass.clone();
      scene.add(box(0.3, 0.1, 0.3, glass, x, 3.95, z));
      [-0.1, 0, 0.1].forEach((dx) => scene.add(box(0.012, 0.11, 0.32, lampGuard, x + dx, 3.93, z)));
      const hit = hitBox(0.9, 0.6, 0.9, 3.85);
      hit.position.x = x;
      hit.position.z = z;
      scene.add(hit);
      const moths = new Group();
      moths.position.set(x, 3.78, z);
      for (let i = 0; i < 3; i += 1) moths.add(new Mesh(new PlaneGeometry(0.035, 0.022), mothWing));
      moths.visible = false;
      scene.add(moths);
      lamps.push({ light, glass, base: light.intensity, tappedAt: -10, seed: 0, hit, nextFlicker: 12 + Math.random() * 40, moths });
    };
    const LAMP_FLICKER = 1.1; // s
    // How lit a tapped lamp is, t seconds after the tap: mostly out, catching now and then
    const flickerAt = (t: number, seed: number) => {
      if (t >= LAMP_FLICKER) return 1;
      if (t > 0.85) return 0.5 + 0.5 * ((t - 0.85) / (LAMP_FLICKER - 0.85)); // coming back up
      const step = Math.floor(t * 16);
      const roll = Math.abs(Math.sin(step * 12.9898 + seed) * 43758.5453) % 1;
      return roll > 0.62 ? 0.85 : roll > 0.4 ? 0.3 : 0.03;
    };
    const overhead = new PointLight("#ffb060", 11, 7, 2); // the lamp over the visitor, which flickers
    // Centred over where you stand, a little way towards the board so it's in view from a phone
    const lampX = HUB.pos[0];
    const lampZ = -0.3;
    overhead.position.set(lampX, 3.5, lampZ);
    scene.add(overhead);
    ceilingLamp(lampX, lampZ, overhead);

    // Underfoot: a soft pool of the lamp's light, a few dead leaves blown in off the
    // tracks, and a dropped ticket
    const pool = plane(3.2, 3.2, new MeshBasicMaterial({ map: glowTexture(), transparent: true, opacity: 0.22, depthWrite: false, blending: AdditiveBlending }), lampX, 0.012, lampZ + 0.4);
    pool.rotation.x = -Math.PI / 2;
    scene.add(pool);
    const leafTexture = paint(32, 32, (ctx) => {
      ctx.fillStyle = "#8a5a2c";
      ctx.beginPath();
      ctx.ellipse(16, 16, 13, 7, 0.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#3a2410";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(6, 23);
      ctx.lineTo(26, 9);
      ctx.stroke();
    });
    const leafMaterial = new MeshStandardMaterial({ map: leafTexture, transparent: true, alphaTest: 0.3, roughness: 1 });
    // (Litter: see below, once the stub and the scraps are painted too)
    const stubTexture = paint(64, 32, (ctx, w, h) => {
      ctx.fillStyle = "#cdbf9a";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#8a2a1f";
      ctx.fillRect(0, 0, w, 6);
      ctx.strokeStyle = "rgba(60,40,20,0.6)";
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(18, 6);
      ctx.lineTo(18, h);
      ctx.stroke();
      ctx.fillStyle = "#3a2a1a";
      ctx.font = "700 9px Georgia, serif";
      ctx.fillText("ADMIT ONE", 22, 20);
    });
    const stubMaterial = standard("#ffffff", 1, stubTexture);
    // A torn scrap of newspaper, and a folded timetable
    const scrapTexture = paint(64, 64, (ctx, w, h) => {
      ctx.fillStyle = "#d8cfb8";
      ctx.beginPath();
      ctx.moveTo(4, 6);
      ctx.lineTo(58, 2);
      ctx.lineTo(62, 40);
      ctx.lineTo(50, 60);
      ctx.lineTo(8, 58);
      ctx.lineTo(2, 30);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "rgba(40,30,20,0.55)";
      for (let y = 12; y < h - 10; y += 6) ctx.fillRect(10, y, w - 22 - ((y * 7) % 11), 2);
    });
    const scrapMaterial = new MeshStandardMaterial({ map: scrapTexture, transparent: true, alphaTest: 0.3, roughness: 1 });
    // The litter: a handful of leaves, a couple of stubs and scraps, strewn somewhere new each
    // visit over the open platform. Tapped, one skips away; swept by a finger, it's pushed along.
    const litter: { mesh: Mesh; vx: number; vz: number; spin: number; y: number; vy: number; rest: number }[] = [];
    const strew = (width: number, depth: number, material: Material, count: number) => {
      for (let i = 0; i < count; i += 1) {
        const size = 0.8 + Math.random() * 0.45;
        const rest = 0.013 + litter.length * 0.0004; // a hair apart, so none flicker through another
        const mesh = plane(width * size, depth * size, material, -5.6 + Math.random() * 9.5, rest, 0.1 + Math.random() * 2.8);
        mesh.rotation.set(-Math.PI / 2, 0, Math.random() * Math.PI * 2);
        scene.add(mesh);
        litter.push({ mesh, vx: 0, vz: 0, spin: 0, y: 0, vy: 0, rest });
      }
    };
    strew(0.16, 0.16, leafMaterial, 9);
    strew(0.16, 0.08, stubMaterial, 2);
    strew(0.22, 0.22, scrapMaterial, 2);
    const floorPlane = new Plane(new Vector3(0, 1, 0), 0);
    const floorAt = (clientX: number, clientY: number) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      return raycaster.ray.intersectPlane(floorPlane, new Vector3());
    };
    // A tap on (or right by) a piece: it skips off, away from you, turning as it goes
    const flickLitter = (clientX: number, clientY: number) => {
      const at = floorAt(clientX, clientY);
      if (!at) return false;
      let nearest: (typeof litter)[number] | null = null;
      let best = 0.32;
      litter.forEach((piece) => {
        const d = Math.hypot(piece.mesh.position.x - at.x, piece.mesh.position.z - at.z);
        if (d < best) {
          best = d;
          nearest = piece;
        }
      });
      if (!nearest) return false;
      const piece = nearest as (typeof litter)[number];
      const away = new Vector3(piece.mesh.position.x - camera.position.x, 0, piece.mesh.position.z - camera.position.z).normalize();
      const angle = Math.atan2(away.z, away.x) + (Math.random() - 0.5) * 1.2;
      const speed = 1.4 + Math.random() * 1.2;
      piece.vx = Math.cos(angle) * speed;
      piece.vz = Math.sin(angle) * speed;
      piece.vy = 1.1 + Math.random() * 0.8;
      piece.spin = (Math.random() - 0.5) * 18;
      return true;
    };
    // A finger dragged across the floor pushes along whatever it passes over
    let sweptFrom: { at: Vector3; t: number } | null = null;
    const sweepLitter = (clientX: number, clientY: number) => {
      const at = floorAt(clientX, clientY);
      const now = performance.now() / 1000;
      if (!at) return;
      if (sweptFrom && now > sweptFrom.t) {
        const dt = Math.max(now - sweptFrom.t, 1 / 120);
        const vx = (at.x - sweptFrom.at.x) / dt;
        const vz = (at.z - sweptFrom.at.z) / dt;
        const fast = Math.hypot(vx, vz);
        const scale = fast > 5 ? 5 / fast : 1;
        litter.forEach((piece) => {
          if (Math.hypot(piece.mesh.position.x - at.x, piece.mesh.position.z - at.z) > 0.3) return;
          piece.vx = vx * scale * 0.8;
          piece.vz = vz * scale * 0.8;
          if (piece.y <= 0) piece.vy = 0.4 + Math.random() * 0.4;
          piece.spin += (Math.random() - 0.5) * 10;
        });
      }
      sweptFrom = { at, t: now };
    };
    let lastLitter = performance.now() / 1000;
    const moveLitter = () => {
      const now = performance.now() / 1000;
      const dt = Math.min(now - lastLitter, 0.05);
      lastLitter = now;
      litter.forEach((piece) => {
        if (!piece.vx && !piece.vz && !piece.vy && piece.y <= 0 && !piece.spin) return;
        const p = piece.mesh.position;
        p.x += piece.vx * dt;
        p.z += piece.vz * dt;
        // Airborne a moment, then sliding to a stop on the slabs
        piece.vy -= 9 * dt;
        piece.y = Math.max(0, piece.y + piece.vy * dt);
        if (piece.y === 0) piece.vy = 0;
        const drag = Math.exp(-(piece.y > 0 ? 1.2 : 4.5) * dt);
        piece.vx *= drag;
        piece.vz *= drag;
        piece.spin *= Math.exp(-3 * dt);
        piece.mesh.rotation.z += piece.spin * dt;
        // Kept on the open platform: off the walls and the edge
        if (p.x < END_X + 0.3 || p.x > SIDE_X - 0.3) {
          p.x = Math.min(Math.max(p.x, END_X + 0.3), SIDE_X - 0.3);
          piece.vx *= -0.4;
        }
        if (p.z < WALL_Z + 0.35 || p.z > EDGE_Z - 0.4) {
          p.z = Math.min(Math.max(p.z, WALL_Z + 0.35), EDGE_Z - 0.4);
          piece.vz *= -0.4;
        }
        p.y = piece.rest + piece.y;
        if (Math.hypot(piece.vx, piece.vz) < 0.01) piece.vx = piece.vz = 0;
        if (Math.abs(piece.spin) < 0.05) piece.spin = 0;
      });
    };

    // Overhead: cobwebs in the corners where the canopy's beams meet the wall
    // Each web its own: its own number of spokes, spacing and sag, and a torn edge
    const webTexture = (spokes: number, gap: number, sag: number, torn: number) =>
      paint(128, 128, (ctx, w, h) => {
        ctx.strokeStyle = "rgba(210,205,190,0.55)";
        ctx.lineWidth = 1;
        const angle = (i: number) => (i / spokes) * (Math.PI / 2) * (1 + 0.08 * Math.sin(i * 1.7));
        for (let i = 0; i <= spokes; i += 1) {
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(Math.cos(angle(i)) * w, Math.sin(angle(i)) * h);
          ctx.stroke();
        }
        for (let r = gap; r < w * torn; r += gap) {
          ctx.beginPath();
          for (let i = 0; i <= spokes; i += 1) {
            const rr = r * (1 - sag * Math.sin((i / spokes) * Math.PI)) * (0.94 + 0.06 * Math.sin(i * 2.3 + r));
            if (i === 0) ctx.moveTo(Math.cos(angle(i)) * rr, Math.sin(angle(i)) * rr);
            else ctx.lineTo(Math.cos(angle(i)) * rr, Math.sin(angle(i)) * rr);
          }
          ctx.stroke();
        }
      });
    const webs: [number, number, number, number, number, number, number][] = [
      // x, size, corner (1 = top left, -1 = top right), spokes, gap, sag, torn
      [lampX - 1.75, 0.8, 1, 7, 15, 0.12, 1],
      [lampX + 1.3, 0.48, -1, 5, 21, 0.2, 0.7],
    ];
    webs.forEach(([x, size, corner, spokes, gap, sag, torn]) => {
      const material = new MeshBasicMaterial({ map: webTexture(spokes, gap, sag, torn), transparent: true, opacity: 0.5, depthWrite: false, side: DoubleSide });
      const web = plane(size, size, material, x + (corner > 0 ? -size / 2 : size / 2), 3.72 - (size - 0.7) / 2, WALL_Z + 0.02);
      web.rotation.z = corner > 0 ? Math.PI / 2 : Math.PI;
      scene.add(web);
    });
    // A lamp either side of where you stand, the same distance off
    [HUB.pos[0] - 4.6, HUB.pos[0] + 4.6].forEach((x) => {
      const lamp = new PointLight("#ffb060", 18, 9, 2);
      lamp.position.set(x, 3.6, -0.6);
      scene.add(lamp);
      ceilingLamp(x, -0.6, lamp);
    });

    // Platform, building, canopy
    // Worn stone slabs, a little uneven in tone, with dark joints
    const floorTex = paint(256, 256, (ctx, w, h) => {
      ctx.fillStyle = "#1c1b1a";
      ctx.fillRect(0, 0, w, h);
      for (let r = 0; r < 4; r += 1)
        for (let c = 0; c < 4; c += 1) {
          const tone = 78 + Math.floor(Math.random() * 7);
          ctx.fillStyle = `rgb(${tone}, ${tone - 2}, ${tone - 6})`;
          ctx.fillRect(c * 64 + 2, r * 64 + 2, 61, 61);
        }
      for (let i = 0; i < 2600; i += 1) {
        const v = 50 + Math.random() * 60;
        ctx.fillStyle = `rgba(${v}, ${v - 3}, ${v - 8}, 0.5)`;
        ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
      }
      ctx.strokeStyle = "rgba(20,18,16,0.6)";
      ctx.beginPath();
      ctx.moveTo(40, 150);
      ctx.lineTo(70, 170);
      ctx.lineTo(96, 166);
      ctx.stroke();
    });
    floorTex.wrapS = floorTex.wrapT = RepeatWrapping;
    floorTex.repeat.set(PLATFORM_W / 2.8, (EDGE_Z - WALL_Z) / 2.8);
    scene.add(box(PLATFORM_W, 0.85, EDGE_Z - WALL_Z, standard("#bdb5aa", 0.95, floorTex), PLATFORM_MID, -0.425, (EDGE_Z + WALL_Z) / 2));
    scene.add(box(PLATFORM_W, 5, 0.2, standard("#8a7f78", 1, brickTexture()), PLATFORM_MID, 2.5, WALL_Z - 0.1));
    const sideBricks = brickTexture();
    sideBricks.repeat.set(2, 3);
    scene.add(box(0.2, 5, 4.4, standard("#8a7f78", 1, sideBricks), SIDE_X + 0.1, 2.5, WALL_Z + 2.2));
    // The canopy's underside: painted boards on beams
    const boardsTex = paint(256, 256, (ctx, w, h) => {
      for (let i = 0; i < 8; i += 1) {
        const tone = 44 + Math.floor(Math.random() * 14);
        ctx.fillStyle = `rgb(${tone}, ${tone + 4}, ${tone + 10})`;
        ctx.fillRect(0, i * 32, w, 30);
        ctx.fillStyle = "rgba(0,0,0,0.25)";
        for (let k = 0; k < 20; k += 1) ctx.fillRect(Math.random() * w, i * 32 + Math.random() * 30, 20 + Math.random() * 40, 1);
      }
      ctx.fillStyle = "#101216";
      for (let i = 0; i < 8; i += 1) ctx.fillRect(0, i * 32 + 30, w, 2);
      ctx.fillStyle = "#15171c";
      ctx.fillRect(0, 0, 14, h);
    });
    boardsTex.wrapS = boardsTex.wrapT = RepeatWrapping;
    boardsTex.repeat.set(PLATFORM_W / 2.5, 2);
    scene.add(box(PLATFORM_W, 0.12, EDGE_Z - WALL_Z + 0.8, standard("#b8bcc6", 0.9, boardsTex), PLATFORM_MID, 4.1, (EDGE_Z + WALL_Z) / 2 + 0.4));

    // The end of the platform: a railing, a bench and a lamp, and the night beyond
    const iron = standard("#1a1d22", 0.6);
    for (let z = WALL_Z + 0.15; z <= EDGE_Z - 0.05; z += 0.45) scene.add(box(0.05, 1.05, 0.05, iron, END_X + 0.08, 0.52, z));
    [0.5, 1.02].forEach((y) => scene.add(box(0.06, 0.05, EDGE_Z - WALL_Z - 0.15, iron, END_X + 0.08, y, (EDGE_Z + WALL_Z) / 2 + 0.05)));
    const bench = new Group();
    bench.position.set(END_X + 1.2, 0, 0.3);
    bench.rotation.y = Math.PI / 2; // facing out over the railing
    bench.add(box(1.4, 0.06, 0.42, standard("#4a3524"), 0, 0.45, 0));
    [-0.6, 0.6].forEach((x) => bench.add(box(0.06, 0.45, 0.4, iron, x, 0.22, 0)));
    bench.add(hitBox(1.6, 0.9, 0.7, 0.4));
    bench.userData.stopId = "bench";
    addLamp(bench, 0, 1.6, 0.6);
    scene.add(bench);
    // Posts stand well away from the visitor, so none of them crosses a view
    // An arcade along the track side holding up the canopy: stone columns, and round
    // arches between them
    // Dressed stone: courses of blocks, each a little different, with pale mortar and wear
    const stoneBlocks = (repeatX: number, repeatY: number) => {
      const texture = paint(256, 256, (ctx, w, h) => {
        ctx.fillStyle = "#3b342f";
        ctx.fillRect(0, 0, w, h);
        const rows = 4;
        const rh = h / rows;
        for (let r = 0; r < rows; r += 1) {
          const bw = w / 2;
          for (let c = -1; c < 3; c += 1) {
            const tone = 88 + Math.floor(Math.random() * 26);
            ctx.fillStyle = `rgb(${tone}, ${tone - 8}, ${tone - 16})`;
            ctx.fillRect(c * bw + (r % 2 ? bw / 2 : 0) + 3, r * rh + 3, bw - 6, rh - 6);
          }
        }
        for (let i = 0; i < 1400; i += 1) {
          ctx.fillStyle = `rgba(${Math.random() < 0.5 ? "30,24,20" : "160,150,135"}, 0.25)`;
          ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
        }
      });
      texture.wrapS = texture.wrapT = RepeatWrapping;
      texture.repeat.set(repeatX, repeatY);
      return texture;
    };
    // The arches' faces are measured in metres, one texture to a metre; the columns' are one to a face
    const stone = standard("#ffffff", 0.95, stoneBlocks(1, 1));
    const columnStone = standard("#ffffff", 0.95, stoneBlocks(0.4, 2));
    // From a column in the corner by the railing, bays spaced so the view behind you
    // looks out through the middle of one
    const firstCol = END_X + 0.2;
    const bay = (HUB.pos[0] - firstCol) / 2.5;
    const archR = bay / 2 - 0.18; // the arch's inner radius
    const spring = 2.0; // where each arch springs from its columns; the wall runs on up above
    const archShape = new Shape();
    archShape.moveTo(-bay / 2, 0);
    archShape.lineTo(-archR, 0);
    archShape.absarc(0, 0, archR, Math.PI, 0, true);
    archShape.lineTo(bay / 2, 0);
    archShape.lineTo(bay / 2, 4.04 - spring);
    archShape.lineTo(-bay / 2, 4.04 - spring);
    archShape.closePath();
    const archGeometry = new ExtrudeGeometry(archShape, { depth: 0.28, bevelEnabled: false, curveSegments: 16 });
    const colZ = EDGE_Z - 0.2;
    for (let x = firstCol; x <= 30; x += bay) {
      scene.add(box(0.36, spring, 0.36, columnStone, x, spring / 2, colZ));
      scene.add(box(0.46, 0.1, 0.46, stone, x, spring - 0.05, colZ)); // a capital
      if (x + bay <= 30.5) {
        const arch = new Mesh(archGeometry, stone);
        arch.position.set(x + bay / 2, spring, colZ - 0.14);
        scene.add(arch);
      }
    }
    // Over the arch you look out through from the platform: the rune tablet, carved with the
    // day's code (painted in with the boards)
    const runeTexture = paint(768, 256, (ctx, w, h) => drawRuneTablet(ctx, w, h, null));
    const runeArchX = firstCol + Math.floor((HUB.pos[0] - firstCol) / bay) * bay + bay / 2;
    const runeTablet = plane(1.5, 0.5, standard("#ffffff", 0.9, runeTexture), runeArchX, (spring + archR + 4.04) / 2, colZ - 0.15);
    runeTablet.rotation.y = Math.PI; // facing the platform
    scene.add(runeTablet);
    let runeCarved: string | null = null;
    const line = plane(PLATFORM_W, 0.12, new MeshBasicMaterial({ color: "#8f741c" }), PLATFORM_MID, 0.006, EDGE_Z - 0.25);
    line.rotation.x = -Math.PI / 2;
    scene.add(line);

    // Tracks: gravel bed, two rails, sleepers running off into the fog
    // The fields all round: dark earth and dead grass, reaching well past the platform's end
    const fieldTex = speckle("#1d1f17", ["#252a1c", "#16170f", "#2b2a1d", "#1a1c14"], 1800, 3);
    fieldTex.wrapS = fieldTex.wrapT = RepeatWrapping;
    fieldTex.repeat.set(40, 30);
    const fields = plane(260, 200, standard("#8a8a7a", 1, fieldTex), 0, -0.9, 0);
    fields.rotation.x = -Math.PI / 2;
    scene.add(fields);
    // The gravel bed, only under the line
    const ballast = speckle("#25221f", ["#302c28", "#1c1a18"], 700, 2);
    ballast.wrapS = ballast.wrapT = RepeatWrapping;
    ballast.repeat.set(60, 1.5);
    const bed = plane(200, 4.6, standard("#25221f", 1, ballast), 0, -0.85, TRACK_Z);
    bed.rotation.x = -Math.PI / 2;
    scene.add(bed);
    const railMaterial = standard("#6b6f78", 0.5);
    [TRACK_Z - 0.7175, TRACK_Z + 0.7175].forEach((z) => scene.add(box(200, 0.15, 0.1, railMaterial, 0, -0.72, z)));
    const sleepers = new InstancedMesh(new BoxGeometry(0.28, 0.12, 2.3), standard("#2e2218"), 260);
    const m = new Matrix4();
    for (let i = 0; i < 260; i += 1) {
      m.makeTranslation(-90 + i * 0.7, -0.79, TRACK_Z);
      sleepers.setMatrixAt(i, m);
    }
    scene.add(sleepers);

    // The far side: a fence, the station's name, bare trees and the moon
    const fence = new InstancedMesh(new BoxGeometry(0.08, 1.1, 0.08), standard("#2a2622"), 40);
    for (let i = 0; i < 40; i += 1) {
      m.makeTranslation(-30 + i * 1.5, -0.3, FAR_Z);
      fence.setMatrixAt(i, m);
    }
    scene.add(fence);
    scene.add(box(60, 0.06, 0.05, standard("#2a2622"), 0, 0.05, FAR_Z));
    const nameSign = plane(2.6, 0.55, standard("#ffffff", 0.8, signTexture("WAYSIDE", "#f2ead2", "#1d2a3a", "700 92px Georgia, serif")), 0.6, 1.3, FAR_Z - 0.1);
    nameSign.rotation.y = Math.PI;
    scene.add(nameSign);
    [-0.6, 1.8].forEach((x) => scene.add(box(0.08, 2.2, 0.08, standard("#20232b"), x, 0.2, FAR_Z - 0.05)));
    const signLamp = new PointLight("#cfe0ff", 6, 5, 2);
    signLamp.position.set(0.6, 2.4, FAR_Z - 0.9);
    scene.add(signLamp);
    const treeMap = treeTexture();
    [-14, -6, 3, 9, 17, 24].forEach((x, i) => {
      const tree = new Sprite(new SpriteMaterial({ map: treeMap, transparent: true, depthWrite: false, fog: false }));
      const size = 6 + (i % 3) * 2;
      tree.scale.set(size, size, 1);
      tree.position.set(x, size / 2 - 0.9, FAR_Z + 5.5 + (i % 2) * 5);
      scene.add(tree);
    });
    const moon = new Sprite(new SpriteMaterial({ map: paint(128, 128, (ctx) => {
      ctx.fillStyle = "#e8e2cf";
      ctx.beginPath();
      ctx.arc(64, 64, 50, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(160,150,130,0.5)";
      [[48, 50, 10], [80, 76, 7], [70, 40, 5]].forEach(([x, y, r]) => { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); });
    }), fog: false, depthWrite: false }));
    moon.scale.set(7, 7, 1);
    // Low over the fields past the end of the platform, where the scenic view looks
    moon.position.set(-75, 19, 8);
    scene.add(moon);

    // The scenic view: bare trees in the fields, and a signal by the line, its lamp red
    [[-16, -6], [-22, 4], [-30, -12], [-38, 9], [-47, -3], [-26, 16]].forEach(([x, z], i) => {
      const tree = new Sprite(new SpriteMaterial({ map: treeMap, transparent: true, depthWrite: false, fog: false }));
      const size = 5 + (i % 3) * 2.5;
      tree.scale.set(size, size, 1);
      tree.position.set(x, size / 2 - 0.9, z);
      scene.add(tree);
    });
    const signal = new Group();
    signal.position.set(END_X - 3.6, -0.85, TRACK_Z - 1.6);
    signal.add(box(0.12, 4.2, 0.12, standard("#1a1d22", 0.6), 0, 2.1, 0));
    signal.add(box(0.45, 0.8, 0.3, standard("#101216", 0.7), 0, 4.0, 0));
    signal.add(box(0.14, 0.14, 0.05, new MeshBasicMaterial({ color: "#ff3a2a" }), 0, 4.15, -0.16));
    const signalGlow = new Sprite(new SpriteMaterial({ map: glowTexture(), color: "#ff4a3a", blending: AdditiveBlending, transparent: true, depthWrite: false }));
    signalGlow.scale.set(1.6, 1.6, 1);
    signalGlow.position.set(0, 4.15, -0.2);
    signal.add(signalGlow);
    scene.add(signal);

    // Stars
    const starPositions: number[] = [];
    for (let i = 0; i < 160; i += 1) {
      const a = Math.random() * Math.PI * 2;
      const e = 0.12 + Math.random() * 1.2;
      starPositions.push(Math.cos(a) * Math.cos(e) * 90, Math.sin(e) * 90, Math.sin(a) * Math.cos(e) * 90);
    }
    const starGeometry = new BufferGeometry();
    starGeometry.setAttribute("position", new Float32BufferAttribute(starPositions, 3));
    scene.add(new Points(starGeometry, new PointsMaterial({ color: "#cfd8ff", size: 1.5, sizeAttenuation: false, fog: false })));

    const train = buildTrain();
    // Arriving: riding in, stopped (doors shut till the page is ready), doors opening, stepping
    // off, then the train pulls away behind you
    const DOOR_X = HUB.pos[0];
    const arrivalCar = buildArrivalCar();
    scene.add(arrivalCar);
    const leaves = arrivalCar.userData.leaves as Group[];
    const arrival = {
      active: latest.current.arrive,
      phase: "riding" as "riding" | "stopped" | "opening" | "stepping" | "leaving" | "gone",
      since: performance.now() / 1000,
      from: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 },
      to: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 },
      warmed: false,
    };
    const RIDE = 3.0; // s pulling in
    const RIDE_FROM = 34; // m down the line it starts
    // Where you stand in the carriage: back from the doors, but on a phone (a narrow view)
    // close enough that the doors and the poles either side fill the screen
    const insideZ = () => {
      const back = CAR_FAR - 0.55;
      if (camera.aspect >= 0.8) return back;
      const halfWidth = Math.atan(Math.tan(((camera.fov * Math.PI) / 180) / 2) * camera.aspect);
      return Math.min(back, CAR_NEAR + 0.8 / Math.tan(halfWidth));
    };
    if (!arrival.active) {
      arrival.phase = "gone";
      arrivalCar.visible = false;
    }
    const setPhase = (phase: typeof arrival.phase) => {
      arrival.phase = phase;
      arrival.since = performance.now() / 1000;
    };
    const updateArrival = (now: number) => {
      if (arrival.phase === "gone") return;
      const t = now - arrival.since;
      const clamp01 = (v: number) => Math.min(Math.max(v, 0), 1);
      if (arrival.phase === "riding") {
        const k = reduced ? 1 : clamp01(t / RIDE);
        const along = RIDE_FROM * (1 - k) ** 3; // braking all the way in
        arrivalCar.position.x = DOOR_X + along;
        Object.assign(cam, { x: DOOR_X + along, y: HUB.pos[1] + Math.sin(t * 23) * 0.006 * (1 - k), z: insideZ(), yaw: 0, pitch: -0.02 });
        if (k >= 1) {
          setPhase("stopped");
          latest.current.onTrainStopped?.();
        }
      } else if (arrival.phase === "stopped") {
        // The lurch as it stops, then waiting on the station
        cam.z = insideZ() + Math.sin(Math.min(t / 0.35, 1) * Math.PI) * 0.06;
        const cabinetIn = Boolean(arcadeObject.userData.cabinet || arcadeObject.userData.failed);
        // Meanwhile, get the arcade's cartridges onto the graphics card, so the first walk
        // over to it doesn't stall putting them there
        const row = arcadeObject.userData.row as Group | undefined;
        if (cabinetIn && row && !arrival.warmed) {
          arrival.warmed = true;
          row.traverse((node) => {
            const mesh = node as Mesh;
            const materials = mesh.isMesh ? ([] as Material[]).concat(mesh.material) : [];
            materials.forEach((material) => {
              const map = (material as MeshStandardMaterial).map;
              if (map) renderer.initTexture(map);
            });
          });
        }
        if ((cabinetIn && latest.current.doorsMayOpen && t > 0.5) || t > 8) setPhase("opening");
      } else if (arrival.phase === "opening") {
        const k = reduced ? 1 : clamp01(t / 0.8);
        const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
        leaves.forEach((leaf, i) => (leaf.position.x = (i ? 1 : -1) * (DOOR_W / 4 + (DOOR_W / 2 + 0.05) * e)));
        if (k >= 1) {
          setPhase("stepping");
          arrival.from = { ...cam };
          arrival.to = poseFor(null, latest.current.heading);
        }
      } else if (arrival.phase === "stepping") {
        const k = reduced ? 1 : clamp01(t / 1.5);
        const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
        const { from, to } = arrival;
        cam.x = from.x + (to.x - from.x) * e;
        cam.z = from.z + (to.z - from.z) * e;
        cam.y = from.y + (to.y - from.y) * e + Math.abs(Math.sin(e * Math.PI * 3)) * 0.035 * (1 - e); // footsteps
        cam.yaw = from.yaw + wrapAngle(to.yaw - from.yaw) * e;
        cam.pitch = from.pitch + (to.pitch - from.pitch) * e;
        if (k >= 1) {
          // On the platform: the camera's the visitor's again
          arrival.active = false;
          goal = to;
          lastAt = null;
          setPhase("leaving");
          latest.current.onArrived?.();
          goTo(latest.current.at, latest.current.heading);
        }
      } else if (arrival.phase === "leaving") {
        // The doors shut, and it pulls away
        const shut = clamp01(t / 0.6);
        leaves.forEach((leaf, i) => (leaf.position.x = (i ? 1 : -1) * (DOOR_W / 4 + (DOOR_W / 2 + 0.05) * (1 - shut))));
        const k = clamp01((t - 1.2) / 6);
        arrivalCar.position.x = DOOR_X - 60 * k * k;
        if (k >= 1) {
          arrivalCar.visible = false;
          setPhase("gone");
        }
      }
    };
    scene.add(train);

    // The objects
    const bulletin = buildBulletin();
    const departures = buildDepartures();
    const events = buildEvents();
    const tickets = buildTickets();
    const lockers = buildLockers();
    let lastMinute = 0;
    const mail = buildMail();
    const arcade = buildArcade(latest.current.preview, latest.current.arcadeGames);
    const cartRack = buildCartRack(latest.current.arcadeGames);
    const arcadeObject = arcade;
    sceneArcadeRef.current = arcade;
    const objects = [bench, lockers, arcade, cartRack, bulletin, events, tickets, departures, mail];

    // Surfaces: the things you read (papers, the board's face, flyers, the kiosk window)
    // are HTML placed in 3D over their painted stand-ins, so their text is crisp
    const surfaceRenderer = new CSS3DRenderer();
    const surfaceLayer = surfaceRenderer.domElement;
    surfaceLayer.style.position = "absolute";
    surfaceLayer.style.inset = "0";
    surfaceLayer.style.pointerEvents = "none";
    surfaceLayerRef.current?.appendChild(surfaceLayer);
    const parents: Record<StopId, Group> = { bench, lockers, arcade, bulletin, events, tickets, departures, mail };
    const placed = SURFACES.map((spec) => {
      const slot = document.createElement("div");
      slot.style.width = `${spec.px[0]}px`;
      slot.style.height = `${spec.px[1]}px`;
      const object = new CSS3DObject(slot);
      // CSS3DObject makes its element catch clicks; the content inside decides (see the portals)
      slot.style.pointerEvents = "none";
      object.scale.setScalar(spec.w / spec.px[0]);
      object.position.set(...spec.at);
      object.rotation.set(spec.lean ?? 0, 0, spec.tilt ?? 0);
      parents[spec.stop].add(object);
      return { spec, slot, object };
    });
    setSurfaceSlots(Object.fromEntries(placed.map(({ spec, slot }) => [spec.id, slot])));
    // How far each surface has faded in (0 to 1): they ease in over their painted stand-ins
    // rather than appearing all at once
    const surfaceFade = new Map<string, number>();
    let surfaceClock = performance.now();
    const surfaceCentre = new Vector3();
    const toCamera = new Vector3();
    const surfaceNormal = new Vector3();
    const facing = new Vector3();
    const poster = events.userData.poster as Mesh<PlaneGeometry, MeshStandardMaterial>;
    const paintedPoster = poster.material.map as CanvasTexture;
    let posterImage = "";
    paintBoardsRef.current = ({ notices, departures: lines, poster: sheet, unread, rune }) => {
      if (rune !== runeCarved) {
        runeCarved = rune;
        repaint(runeTexture, (ctx, w, h) => drawRuneTablet(ctx, w, h, rune));
      }
      (mail.userData.envelopes as Mesh[]).forEach((envelope, i) => (envelope.visible = i < unread));
      (bulletin.userData.notes as CanvasTexture[]).forEach((texture, i) => {
        const [kind, title] = notices[i] ? [notices[i].kind, notices[i].title] : IDLE_NOTICES[i];
        repaint(texture, (ctx, w, h) => drawNotice(ctx, w, h, kind, title, PAPERS[i]));
      });
      repaint(departures.userData.face as CanvasTexture, (ctx, w, h) => drawDepartures(ctx, w, h, lines));
      // The poster: a real one-sheet when there is an image, the painted event poster otherwise
      repaint(paintedPoster, (ctx, w, h) => drawEventPoster(ctx, w, h, sheet.title, sheet.line));
      if (sheet.image === posterImage) return;
      posterImage = sheet.image ?? "";
      if (poster.material.map !== paintedPoster) poster.material.map?.dispose();
      poster.material.map = paintedPoster;
      if (sheet.image) {
        const url = sheet.image;
        // Its own address: the flyers show the same poster in plain <img>s, and TMDB only
        // sends CORS headers when asked, so the browser's cached copy would taint the texture
        const textureUrl = `${url}${url.includes("?") ? "&" : "?"}texture=1`;
        new TextureLoader().setCrossOrigin("anonymous").load(textureUrl, (texture) => {
          if (posterImage !== url) return texture.dispose();
          texture.colorSpace = SRGBColorSpace;
          poster.material.map = texture;
          poster.material.needsUpdate = true;
        });
      }
    };
    paintBoardsRef.current(latest.current.boards);
    objects.forEach((o) => scene.add(o));
    // HALLOWEEN: bats and jack-o'-lanterns, in October only (see halloween.ts)
    const halloween = isHalloweenSeason() ? buildHalloween({ wallZ: WALL_Z, sideX: SIDE_X, endX: END_X, ceilingY: 4.04, ticketsAt: [SIDE_X - 0.13, 1.095, TICKET_Z] }) : null;
    if (halloween) scene.add(halloween); // HALLOWEEN
    let hovered: StopId | null = null;

    // Camera: a pose (position, yaw, pitch) tweened between the hub's headings and the stops.
    // `pull` backs close-ups off, and moves the hub towards the platform edge, on tall screens.
    const cam = { x: HUB.pos[0], y: HUB.pos[1], z: HUB.pos[2], yaw: 0, pitch: 0 };
    const look = { yaw: 0, pitch: 0, toYaw: 0, toPitch: 0 };
    let pull = 1;
    const poseFor = (stopId: StopId | null, facing: Heading) => {
      if (!stopId) {
        const { focus, aim } = VIEWS[facing];
        const [x, y, z] = HUB.pos;
        // Phones stand further back, to take in as much as a wide screen does; looking out
        // over the tracks, you step back from the arcade so its arches frame the view
        const hubZ = facing === "back" ? (pull > 1 ? 0.5 : -0.1) : pull > 1 ? EDGE_Z - 0.5 : z;
        const point = aim ?? (focus ? STOPS[focus].target : null);
        const yaw = point ? Math.atan2(-(point[0] - x), -(point[2] - hubZ)) : HUB.yaw[facing];
        return { x, y, z: hubZ, yaw, pitch: HUB.pitch[facing] };
      }
      // Reading something up close: square on to it (a leaning flyer is looked down at),
      // just far enough back that all of it fits
      const zoomed = latest.current.zoom ? placed.find(({ spec }) => spec.id === latest.current.zoom && spec.stop === stopId) : null;
      if (zoomed) {
        const { spec, object } = zoomed;
        const centre = object.getWorldPosition(new Vector3());
        const lean = spec.lean ?? 0;
        const [w, h] = [spec.w, (spec.w * spec.px[1]) / spec.px[0]];
        const halfHeight = ((camera.fov * Math.PI) / 180) / 2;
        const halfWidth = Math.atan(Math.tan(halfHeight) * camera.aspect);
        const distance = Math.max((w * 1.08) / 2 / Math.tan(halfWidth), (h * 1.12) / 2 / Math.tan(halfHeight));
        const normal = new Vector3(0, -Math.sin(lean), Math.cos(lean));
        const eye = centre.add(normal.multiplyScalar(distance));
        return { x: eye.x, y: eye.y, z: eye.z, yaw: 0, pitch: lean };
      }
      const stop = STOPS[stopId];
      // The arcade: stand where this cabinet fills the same part of the screen the
      // arcade's will, looking straight at it, so the one hands over to the other
      const frame = latest.current.arcadeFrame;
      if (stopId === "arcade" && frame && frame.bottom > frame.top) {
        const tan = Math.tan(((camera.fov * Math.PI) / 180) / 2);
        const cabinetH = 1.9;
        const front = new Vector3(...STOPS.arcade.target).setY(0);
        front.z = ARCADE_POS.z + 0.4;
        const distance = (cabinetH * frame.height) / (2 * tan * (frame.bottom - frame.top));
        const y = cabinetH - ((frame.height / 2 - frame.top) * 2 * distance * tan) / frame.height;
        const x = front.x - ((frame.centerX - frame.width / 2) * 2 * distance * tan * camera.aspect) / frame.width;
        return { x, y, z: front.z + distance, yaw: 0, pitch: 0 };
      }
      const target = new Vector3(...stop.target);
      const pos = new Vector3(...stop.pos).sub(target).multiplyScalar(stop.seat ? 1 : pull).add(target);
      if (stop.fit || stop.fitHeight) {
        // Far enough back that the whole object fits the view, across and top to bottom
        const halfHeight = ((camera.fov * Math.PI) / 180) / 2;
        const halfWidth = Math.atan(Math.tan(halfHeight) * camera.aspect);
        const needed = Math.max(
          stop.fit ? stop.fit / 2 / Math.tan(halfWidth) : 0,
          stop.fitHeight ? stop.fitHeight / 2 / (Math.tan(halfHeight) * (1 - latest.current.cardFraction)) : 0
        );
        const away = pos.clone().sub(target);
        if (stop.snug || away.length() < needed) pos.copy(target).add(away.setLength(needed));
      }
      const dir = target.clone().sub(pos);
      return { x: pos.x, y: pos.y, z: pos.z, yaw: Math.atan2(-dir.x, -dir.z), pitch: Math.atan2(dir.y, Math.hypot(dir.x, dir.z)) };
    };
    let lastAt: StopId | null = latest.current.at;
    let goal: { x: number; y: number; z: number; yaw: number; pitch: number } | null = null;
    const goTo = (stopId: StopId | null, facing: Heading, instant = false) => {
      if (arrival.active) return; // riding in: where to go is picked up on stepping off
      const pose = poseFor(stopId, facing);
      const same =
        goal && Math.abs(goal.x - pose.x) + Math.abs(goal.y - pose.y) + Math.abs(goal.z - pose.z) + Math.abs(wrapAngle(goal.yaw - pose.yaw)) + Math.abs(goal.pitch - pose.pitch) < 1e-4;
      if (same && !instant && gsap.isTweening(cam)) return;
      goal = pose;
      const yaw = cam.yaw + wrapAngle(pose.yaw - cam.yaw); // turn the short way round
      const walking = stopId !== lastAt;
      lastAt = stopId;
      const duration = instant || reduced ? 0 : walking ? 1.0 : 0.55;
      gsap.killTweensOf(cam);
      gsap.to(cam, { ...pose, yaw, duration, ease: walking ? "power1.inOut" : "power2.inOut" });
    };
    goRef.current = (stopId, facing) => {
      aimed = facing;
      goTo(stopId, facing);
    };

    let width = 1;
    let height = 1;
    let shift = 0;
    const onResize = () => {
      width = Math.max(mount.clientWidth, 1);
      height = Math.max(mount.clientHeight, 1);
      renderer.setPixelRatio(clamp(RENDER_HEIGHT / height, 0.25, lightweight ? 1 : 2));
      renderer.setSize(width, height);
      surfaceRenderer.setSize(width, height);
      const aspect = width / height;
      camera.aspect = aspect;
      camera.fov = aspect < 0.8 ? 86 : aspect < 1.2 ? 68 : 60;
      pull = aspect < 0.8 ? 1.5 : aspect < 1.2 ? 1.2 : 1;
      camera.updateProjectionMatrix();
      goTo(latest.current.at, latest.current.heading, true);
    };
    const resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(mount);
    onResize();

    // Input: tap an object to walk to it, swipe to turn, and on desktop the view leans
    // a little towards the pointer
    const raycaster = new Raycaster();
    const pointer = new Vector2();
    const canvas = renderer.domElement;
    canvas.style.touchAction = "none";
    let down: { x: number; y: number; t: number } | null = null;
    // Where the last swipe sent the view: quick swipes count on from here, not from the
    // heading the page last settled on
    let aimed: Heading = latest.current.heading;
    // The object under the pointer, and the marked part of it (e.g. "poster"), if any
    const pickPart = (clientX: number, clientY: number): { stop: StopId; part?: string } | null => {
      const rect = canvas.getBoundingClientRect();
      pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      const owner = (object: Object3D) => {
        let node: Object3D | null = object;
        let part: string | undefined;
        while (node) {
          part ??= node.userData.part;
          if (node.userData.stopId) return { stop: node.userData.stopId as StopId, part };
          node = node.parent;
        }
        return null;
      };
      const hits = raycaster.intersectObjects(objects, true);
      const first = hits[0] ? owner(hits[0].object) : null;
      if (!first || first.part) return first;
      // The generous tap boxes sit in front; look behind them for the part that was tapped
      for (const hit of hits) {
        const found = owner(hit.object);
        if (found?.stop === first.stop && found.part) return found;
      }
      return first;
    };
    const pick = (clientX: number, clientY: number) => pickPart(clientX, clientY)?.stop ?? null;
    const onPointerDown = (event: PointerEvent) => {
      if (arrival.active) return;
      sweptFrom = null;
      down = { x: event.clientX, y: event.clientY, t: performance.now() };
      canvas.setPointerCapture(event.pointerId);
    };
    const onPointerMove = (event: PointerEvent) => {
      if (down) sweepLitter(event.clientX, event.clientY);
      if (event.pointerType !== "mouse" || down) return;
      const rect = canvas.getBoundingClientRect();
      look.toYaw = -(((event.clientX - rect.left) / rect.width) * 2 - 1) * 0.06;
      look.toPitch = -(((event.clientY - rect.top) / rect.height) * 2 - 1) * 0.04;
      hovered = pick(event.clientX, event.clientY);
      canvas.style.cursor = hovered ? "pointer" : "default";
    };
    const onPointerUp = (event: PointerEvent) => {
      if (!down) return;
      const dx = event.clientX - down.x;
      const dy = event.clientY - down.y;
      const { at: current, onSelect: select, onTurn: turn, onPart: partTapped, onEmptyTap: emptyTapped } = latest.current;
      const quick = Math.abs(dx) / Math.max(performance.now() - down.t, 1) > 0.3; // a flick
      if (!current && (Math.abs(dx) > 40 || (quick && Math.abs(dx) > 20)) && Math.abs(dx) > Math.abs(dy)) {
        // Drag the world: swiping left turns right. Start turning now; the page catches up
        const index = HEADINGS.indexOf(aimed);
        if (index >= 0) {
          aimed = HEADINGS[(index + (dx < 0 ? 1 : -1) + HEADINGS.length) % HEADINGS.length];
          goTo(null, aimed);
          turn(aimed);
        }
      } else if (Math.hypot(dx, dy) < 10 && performance.now() - down.t < 500) {
        const rect = canvas.getBoundingClientRect();
        pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
        raycaster.setFromCamera(pointer, camera);
        if (flickLitter(event.clientX, event.clientY)) {
          down = null;
          return;
        }
        raycaster.setFromCamera(pointer, camera);
        const lampHit = raycaster.intersectObjects(lamps.map((lamp) => lamp.hit), false)[0];
        const lamp = lampHit && lamps.find((each) => each.hit === lampHit.object);
        if (lamp) {
          lamp.tappedAt = performance.now() / 1000;
          lamp.seed = Math.random() * 100;
          down = null;
          return;
        }
        const hit = pickPart(event.clientX, event.clientY);        if (hit && hit.stop !== current) select(hit.stop);
        else if (hit?.part) partTapped(hit.part);
        else if (!hit && current) (emptyTapped ?? (() => select(null)))();
      }
      down = null;
    };
    const onPointerLeave = () => {
      look.toYaw = look.toPitch = 0;
      hovered = null;
    };
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    const onPointerCancel = () => {
      down = null;
    };
    canvas.addEventListener("pointercancel", onPointerCancel);
    canvas.addEventListener("pointercancel", onPointerUp);
    canvas.addEventListener("pointerleave", onPointerLeave);

    // Render loop; paused while the tab is hidden
    let frame = 0;
    let restingDrawn = false;
    // How far along the cartridges' trip out of the rack is, in seconds: it runs forward
    // while walking to the arcade and back again when walking away
    let rowClock = 0;
    let rowLast = performance.now() / 1000;
    let rowCovered = false;
    let reported = false; // told the page it's ready
    const start = performance.now();
    const animate = () => {
      frame = requestAnimationFrame(animate);
      if (document.hidden) return;
      // The cartridges' clock runs on real time, not frames (so a slow phone doesn't leave
      // the train half out when the arcade takes over), and keeps time while covered
      const rowNow = performance.now() / 1000;
      const rowDt = Math.min(rowNow - rowLast, 0.5);
      rowLast = rowNow;
      // Covered by the arcade: its own row is showing, so as far as the walk back is
      // concerned they've all landed
      if (latest.current.paused && latest.current.at === "arcade") rowCovered = true;
      // Covered: one last frame (with the cabinet hidden, if the arcade's is over it), then rest
      if (latest.current.paused) {
        if (restingDrawn) return;
        restingDrawn = true;
      } else restingDrawn = false;
      arcadeObject.visible = !latest.current.hideArcade;
      // Your locker's door opens as you get to it, and shuts behind you
      const myDoor = lockers.userData.myDoor as Group;
      // (swung right round to the left, out of the way of looking in)
      const doorTo = latest.current.at === "lockers" ? -2.6 : 0;
      if (Math.abs(myDoor.rotation.y - doorTo) > 0.001) myDoor.rotation.y += (doorTo - myDoor.rotation.y) * (reduced ? 1 : 0.08);
      // Ready once the cabinet's in (the last thing to load); this frame draws it
      if (!reported && arcadeObject.userData.cabinet) {
        reported = true;
        requestAnimationFrame(() => latest.current.onReady?.());
      }
      // The arcade's own parts: its scope and terminal keep ticking; its row of cartridges
      // shows on the way up to it
      const dressing = arcadeObject.userData.dressing as SlotDressing | undefined;
      if (dressing) {
        const now = performance.now() / 1000;
        dressing.rig.update(now);
        dressing.terminal.update(now);
      }
      // The row of cartridges: nothing from across the platform; near the end of the walk up
      // they come out of the rack in a line, along one path, settling as the arcade takes over;
      // walking away, the same trip runs backwards and they're home in the rack
      const row = arcadeObject.userData.row as Group | undefined;
      if (row) {
        const walking = latest.current.at === "arcade";
        const count = row.children.length;
        const whole = ROW_DELAY + (count - 1) * ROW_STAGGER + ROW_FLY + ROW_PICK;
        if (rowCovered) rowClock = whole;
        rowCovered = false;
        rowClock = Math.min(Math.max(rowClock + (walking ? rowDt : -rowDt), 0), whole);
        const spots = cartRack.userData.spots as { at: Vector3; height: number; meshes: Object3D[] }[];
        const cabinetNode = arcadeObject.userData.cabinet as Group | undefined;
        const cabinetScale = cabinetNode?.scale.x ?? 1;
        const cartWidth = arcadeObject.userData.cartWidth as number;
        row.visible = rowClock > 0;
        // The cabinet fills the same part of the screen here as in the arcade, but through a
        // different lens (a wider one on phones), so the row floating in front of it would
        // look bigger here. Set it back toward the cabinet until it matches the arcade's:
        // a point d in front of the cabinet looks the same here at d * tan(theirs) / tan(ours)
        const frameFov = latest.current.arcadeFrame?.fov;
        const depthScale = frameFov ? Math.tan((frameFov * Math.PI) / 360) / Math.tan((camera.fov * Math.PI) / 360) : 1;
        if (Math.abs((row.userData.depthScale ?? 1) - depthScale) > 1e-4) {
          row.userData.depthScale = depthScale;
          row.children.forEach((cart) => {
            const base = cart.userData.restBase as Vector3;
            const front = cart.userData.front as number;
            (cart.userData.rest as Vector3).set(base.x, base.y, front + (base.z - front) * depthScale);
            delete cart.userData.path;
          });
        }
        row.children.forEach((cart, n) => {
          const spot = spots[cart.userData.gameIndex as number];
          // The rightmost leads (it has furthest to go), so none overtakes another
          const place = count - 1 - n;
          const k = Math.min(Math.max((rowClock - ROW_DELAY - place * ROW_STAGGER) / ROW_FLY, 0), 1);
          spot?.meshes.forEach((mesh) => (mesh.visible = k === 0));
          cart.visible = k > 0;
          if (!cart.visible || !spot || !cabinetNode) return;
          const path = (cart.userData.path ??= cartTrainPath(row, cart, cabinetNode.worldToLocal(cartRack.localToWorld(spot.at.clone())), cabinetNode.worldToLocal(cartRack.localToWorld(new Vector3(0, 0.22, 0.05))), cartWidth)) as CatmullRomCurve3;
          const e = k < 0.5 ? 4 * k ** 3 : 1 - (-2 * k + 2) ** 3 / 2;
          cart.position.copy(path.getPointAt(e));
          // A little bounce as it lands in its place
          const land = Math.min(Math.max((k - 0.84) / 0.16, 0), 1);
          cart.position.y += Math.sin(Math.PI * land) * cartWidth * 0.22 * (1 - land * 0.5);
          // Stood on end and small in the rack, face on and full size once it's out
          const out = Math.min(e / 0.3, 1);
          const small = spot.height / (cartWidth * cabinetScale);
          cart.scale.setScalar(small + (1 - small) * out);
          // Turned face on as it leaves the rack, leaning a touch into the arc
          const lean = Math.sin(Math.PI * e) * 0.12;
          cart.rotation.set(0, (Math.PI / 2) * (1 - out), (Math.PI / 2) * (1 - out) + lean);
          // The picked one tips forward once it's landed, as the arcade shows it
          const pick = cart.userData.pick as ReturnType<typeof focusedPose> | undefined;
          if (pick && k === 1) {
            const f = Math.min(Math.max((rowClock - ROW_DELAY - place * ROW_STAGGER - ROW_FLY) / ROW_PICK, 0), 1);
            cart.position.y += pick.lift * f;
            cart.position.z += pick.forward * f * depthScale;
            cart.scale.setScalar(1 + (pick.scale - 1) * f);
            cart.rotation.x = pick.tip * f;
          }
        });
      }
      // The cabinet's finish shimmers with time, and is painted in the cabinet's own frame
      const cabinetFinish = arcadeObject.userData.finish as ReturnType<typeof createCabinetFinish>;
      const cabinetNode = arcadeObject.userData.cabinet as Group | undefined;
      cabinetFinish.update(performance.now() / 1000);
      if (cabinetNode) {
        cabinetNode.updateMatrixWorld();
        cabinetFinish.setFrame(cabinetNode.matrixWorld);
      }
      const t = (performance.now() - start) / 1000;
      look.yaw += (look.toYaw - look.yaw) * 0.06;
      look.pitch += (look.toPitch - look.pitch) * 0.06;
      updateArrival(performance.now() / 1000);
      moveLitter();
      const sway = reduced ? 0 : 1;
      camera.position.set(cam.x, cam.y + Math.sin(t * 0.9) * 0.01 * sway, cam.z);
      camera.rotation.set(cam.pitch + look.pitch + Math.sin(t * 0.5) * 0.004 * sway, cam.yaw + look.yaw + Math.sin(t * 0.37) * 0.006 * sway, 0);

      // The overhead lamp is tired; it stays under three flickers a second
      // The clock moves on each minute
      const minute = Math.floor(Date.now() / 60_000);
      if (minute !== lastMinute) {
        lastMinute = minute;
        repaint(lockers.userData.clockFace as CanvasTexture, (ctx, w, h) => drawClock(ctx, w, h, new Date()));
      }

      overhead.intensity = reduced ? 11 : 11 * (0.8 + 0.2 * Math.sin(t * 5.1) * Math.sin(t * 1.7 + 1));
      halloween?.userData.update(t, reduced); // HALLOWEEN
      // The arcade sign's bulbs chase round, two lit to one dark
      if (!reduced) {
        const chase = Math.floor(t * 7);
        (arcadeObject.userData.bulbs as Mesh[] | undefined)?.forEach((bulb, i) => {
          bulb.material = (i + chase) % 3 === 0 ? BULB_OFF : BULB_ON;
        });
      }
      // The ticket clerk: eyes that wander and now and then blink, fingers drumming the
      // counter (little finger first) in rolls with a pause between
      const clerk = tickets.userData.clerk as { eyes: Group; hand: Group };
      if (!reduced) {
        clerk.eyes.position.x = Math.sin(t * 0.35) * 0.05 + Math.sin(t * 1.3) * 0.008;
        clerk.eyes.position.y = 1.66 + Math.sin(t * 0.23) * 0.015;
        const sinceBlink = (t + 2) % 5.3;
        clerk.eyes.scale.y = sinceBlink < 0.16 ? Math.max(0.08, Math.abs(Math.cos((sinceBlink / 0.16) * Math.PI))) : 1;
        const roll = t % 1.9;
        (clerk.hand.userData.fingers as Group[]).forEach((finger, i) => {
          const k = (roll - i * 0.11) / 0.2;
          finger.rotation.x = k > 0 && k < 1 ? -0.55 * Math.sin(k * Math.PI) : 0;
        });
      }
      // Tapped lamps stutter
      const nowSec = performance.now() / 1000;
      lamps.forEach((lamp, index) => {
        if (!reduced && nowSec > lamp.nextFlicker) {
          lamp.tappedAt = nowSec;
          lamp.seed = Math.random() * 100;
          lamp.nextFlicker = nowSec + 20 + Math.random() * 50;
        }
        // Moths: about half the time, three of them, looping round the glass, wings beating
        lamp.moths.visible = !reduced && (t + index * 23) % 80 < 40;
        if (lamp.moths.visible) {
          lamp.moths.children.forEach((moth, i) => {
            const phase = index * 3.1 + i * 2.1;
            const speed = 1.6 + i * 0.45;
            moth.position.set(
              Math.sin(t * speed + phase) * (0.18 + 0.06 * Math.sin(t * 0.7 + i)),
              Math.sin(t * speed * 1.7 + phase) * 0.07,
              Math.cos(t * speed * 0.9 + phase) * (0.18 + 0.05 * Math.cos(t * 0.5 + i))
            );
            moth.rotation.y = t * speed + phase;
            moth.scale.x = 0.35 + 0.65 * Math.abs(Math.sin(t * 38 + i));
          });
        }
        const f = flickerAt(nowSec - lamp.tappedAt, lamp.seed);
        const base = lamp.light === overhead ? overhead.intensity : lamp.base;
        lamp.light.intensity = base * f;
        lamp.glass.color.copy(lampGlass.color).multiplyScalar(0.25 + 0.75 * f);
      });
      const current = latest.current.at;
      objects.forEach((o) => {
        const lamp = o.userData.lamp as PointLight | undefined;
        if (!lamp) return; // (the cartridge rack shares the arcade's)
        const lit = o.userData.stopId === current || o.userData.stopId === hovered;
        lamp.intensity += ((lit ? LAMP_LIT : LAMP_IDLE) - lamp.intensity) * 0.08;
      });

      // The empty train comes through every 45 s (first after about 25 s), at about 80 km/h
      const cycle = (t + 5) % 45;
      train.visible = cycle > 30;
      if (train.visible) train.position.x = -60 + (cycle - 30) * 22;

      // Ease the picture up above the held card (or back down), in step with the walk
      const wantShift = (latest.current.cardFraction * height) / 2;
      if (Math.abs(wantShift - shift) > 0.3) {
        shift += (wantShift - shift) * 0.1;
        if (Math.abs(shift) < 0.5) camera.clearViewOffset();
        else camera.setViewOffset(width, height, 0, shift, width, height); // the HTML layer follows this too
      }

      renderer.render(scene, camera);

      // Each surface only while it's ahead of the camera and facing it (HTML behind the
      // camera or seen from the back would draw wrongly, so then it goes at once); its
      // painted stand-in shows otherwise. Coming and going otherwise, it fades.
      camera.getWorldDirection(facing);
      const onTrain = arrival.active && !(arrival.phase === "stepping" && cam.z < CAR_NEAR - 0.2);
      const clock = performance.now();
      const dt = Math.min((clock - surfaceClock) / 1000, 0.1);
      surfaceClock = clock;
      placed.forEach(({ object, spec, slot }) => {
        object.getWorldPosition(surfaceCentre);
        toCamera.subVectors(camera.position, surfaceCentre).normalize();
        object.getWorldDirection(surfaceNormal);
        const inView = surfaceNormal.dot(toCamera) > 0.12 && -toCamera.dot(facing) > 0.35;
        const wanted =
          inView &&
          !(latest.current.at && spec.hiddenAt?.includes(latest.current.at)) &&
          // (Still aboard the train: its walls would be behind them otherwise)
          !onTrain;
        const was = surfaceFade.get(spec.id) ?? 0;
        const fade = !inView ? 0 : wanted ? Math.min(1, was + dt / 0.45) : Math.max(0, was - dt / 0.2);
        surfaceFade.set(spec.id, fade);
        object.visible = fade > 0;
        if (fade !== was) slot.style.opacity = fade >= 1 ? "" : fade.toFixed(3);
      });
      surfaceRenderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerCancel);
      canvas.removeEventListener("pointercancel", onPointerUp);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      gsap.killTweensOf(cam);
      goRef.current = null;
      paintBoardsRef.current = null;
      scene.traverse((object) => {
        const item = object as Mesh;
        item.geometry?.dispose();
        const materials = Array.isArray(item.material) ? item.material : item.material ? [item.material] : [];
        materials.forEach((material) => {
          (material as MeshStandardMaterial).map?.dispose();
          material.dispose();
        });
      });
      (arcadeObject.userData.video as HTMLVideoElement | undefined)?.pause();
      (arcadeObject.userData.dressing as SlotDressing | undefined)?.dispose();
      (arcadeObject.userData.disposeRow as (() => void) | undefined)?.();
      (arcadeObject.userData.finish as ReturnType<typeof createCabinetFinish>).dispose?.();
      renderer.dispose();
      mount.removeChild(canvas);
      surfaceLayer.remove();
      setSurfaceSlots({});
    };
  }, []);

  useEffect(() => {
    goRef.current?.(at, heading);
  }, [at, heading, cardFraction, zoom, arcadeFrame]);

  useEffect(() => {
    paintBoardsRef.current?.(boards);
  }, [boards]);

  // The cabinet's preview only plays while the cabinet's in view
  const previewRef = useRef(previewPlaying);
  previewRef.current = previewPlaying;
  useEffect(() => {
    const check = window.setInterval(() => {
      const clip = sceneArcadeRef.current?.userData.video as HTMLVideoElement | undefined;
      if (!clip) return;
      if (previewRef.current && clip.paused) void clip.play().catch(() => undefined);
      else if (!previewRef.current && !clip.paused) clip.pause();
    }, 400);
    return () => window.clearInterval(check);
  }, []);

  return (
    <div className="absolute inset-0 select-none">
      <style>{`
        @keyframes station-grain { 0% { transform: translate(0, 0) } 25% { transform: translate(-31px, 17px) }
          50% { transform: translate(23px, -41px) } 75% { transform: translate(-13px, -23px) } 100% { transform: translate(0, 0) } }
        @media (prefers-reduced-motion: reduce) { .station-grain { animation: none !important } }
      `}</style>
      <div ref={mountRef} className="absolute inset-0" />
      <div ref={surfaceLayerRef} className="pointer-events-none absolute inset-0 overflow-hidden" />
      {SURFACES.map((spec) => {
        const slot = surfaceSlots[spec.id];
        const content = surfaces[spec.id];
        if (!slot || !content) return null;
        return createPortal(
          <div
            className="h-full w-full"
            aria-hidden={!surfacesInteractive || at !== spec.stop}
            style={{
              // Standing at its object you can use it; from further off a tap walks you there
              pointerEvents: surfacesInteractive && at === spec.stop ? "auto" : "none",
              // Dim to the lamplight around it
              filter:
                zoom === spec.id
                  ? "brightness(0.97) sepia(0.08)"
                  : spec.lamplit
                    ? "brightness(0.88) sepia(0.2) contrast(1.05)"
                    : undefined,
            }}
          >
            {content}
          </div>,
          slot,
          spec.id
        );
      })}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(ellipse at 50% 45%, transparent 55%, rgba(0,0,0,0.3) 82%, rgba(0,0,0,0.6) 100%)" }}
      />
      <div
        ref={grainRef}
        className="station-grain pointer-events-none absolute -inset-16 mix-blend-overlay transition-opacity duration-500"
        style={{ animation: "station-grain 0.5s steps(4) infinite", opacity: zoom !== null ? 0.015 : 0.045 }}
      />
    </div>
  );
}
