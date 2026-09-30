import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CSS3DObject, CSS3DRenderer } from "three/examples/jsm/renderers/CSS3DRenderer.js";
import {
  AdditiveBlending,
  Box3,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  CylinderGeometry,
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
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import gsap from "gsap";
import { isLightweightDevice } from "../pages/Arcade/cabinetParts.ts";
import { HUB, STOPS, VIEWS, type Heading, type StopId } from "./stops.ts";

// The Wayside Station scene, played like Inscryption: the visitor stands on the platform
// and turns between four fixed headings, and walks up to an object to look at it.
// Rendered at a low resolution and scaled up with hard pixels, under a vignette and grain.

type Props = {
  at: StopId | null;
  heading: Heading;
  onSelect: (id: StopId | null) => void;
  onTurn: (direction: 1 | -1) => void;
  boards: Boards;
  paused?: boolean; // a game is playing over the scene
  // What's on each surface (see SURFACES), drawn crisply over it; usable when standing at its object
  surfaces: Record<string, ReactNode>;
  // Whether the surfaces take taps themselves (desktop); on phones a tap picks the thing up instead
  surfacesInteractive: boolean;
  // Share of the screen's height a phone's held card covers at the bottom; the view frames
  // the object in the space above it
  cardFraction: number;
  // At the board: the paper zoomed in on (by index), or null for the whole board
  zoom: number | null;
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
};

const WALL_Z = -2.2;
const EDGE_Z = 3.2; // the platform's edge
const TRACK_Z = EDGE_Z + 2.1; // the middle of the track
const FAR_Z = EDGE_Z + 5.3; // the fence and the name board across the tracks
const SIDE_X = 5.4; // the side wall, just past the pigeonholes, running out from the station wall
const TICKET_Z = 0; // the ticket counter is let into the middle of it
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
// Shown until the real news arrives, and in the gaps if there's little of it
const IDLE_NOTICES = [
  ["NOTICE", "NEWS"],
  ["NOTICE", "LOST: ONE UMBRELLA"],
  ["NOTICE", "LAST TRAIN ??:??"],
  ["EVENT", "SCARE-ATHON"],
  ["NOTICE", "DO NOT WAIT HERE AFTER DARK"],
  ["NOTICE", "FOUND: ONE KEY"],
];

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

// Your left-luggage locker, in the lockers' own space: top row, middle
const MY_LOCKER: [number, number] = [0, 1.58];

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
  onlyAt?: boolean; // shown only when standing at its object (where nothing can be in front of it)
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
  })),
  { id: "departures", stop: "departures", at: [0, 0, 0.062], w: 2.5, px: [750, 435] },
  ...FLYER_SPOTS.map(([x, y, z, lean], i): SurfaceSpec => ({ id: `flyer-${i}`, stop: "events", at: [x, y, z], w: FLYER_W, px: [240, 312], lean, lamplit: true })),
  { id: "locker-photo", stop: "lockers", at: [MY_LOCKER[0] + 0.03, MY_LOCKER[1] + 0.04, -0.06], w: 0.3, px: [176, 232], tilt: 0.05, lamplit: true, onlyAt: true },
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
  group.position.set(1.2, 0, WALL_Z + 0.35);
  const wood = standard("#4a3524");
  // A display stand: a slanted board on two legs, a lip along the bottom, the flyers side
  // by side on it at eye level
  const board = box(1.46, 0.7, 0.04, standard("#3a2a1c"), 0, 1.3, 0.04);
  board.rotation.x = -0.28;
  group.add(board);
  group.add(box(1.46, 0.05, 0.08, wood, 0, 0.99, 0.2));
  [-0.68, 0.68].forEach((x) => group.add(box(0.06, 1.6, 0.06, wood, x, 0.8, 0)));
  group.add(box(1.4, 0.04, 0.04, wood, 0, 0.35, 0));

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
  const posterZ = WALL_Z + 0.03 - group.position.z;
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

function buildArcade() {
  const group = new Group();
  group.position.set(-3.0, 0, -1.75); // against the wall, left of the board
  const placeholder = new Group();
  placeholder.add(box(0.85, 1.9, 0.8, standard("#2b1a3a"), 0, 0.95, 0));
  placeholder.add(plane(0.6, 0.45, new MeshBasicMaterial({ color: "#5cffb1" }), 0, 1.3, 0.41));
  group.add(placeholder);
  // Reuse the arcade's cabinet model; keep the placeholder if it can't load
  new GLTFLoader().load(
    "/models/ArcadeCabinet.glb",
    (gltf) => {
      // The model is authored lying down; stand it up the way CartridgeArcade does
      const model = new Group();
      gltf.scene.rotation.set(Math.PI / 2, Math.PI, 0);
      model.add(gltf.scene);
      const size = new Box3().setFromObject(model).getSize(new Vector3());
      model.scale.setScalar(1.9 / Math.max(size.y, 0.001));
      const bounds = new Box3().setFromObject(model);
      const center = bounds.getCenter(new Vector3());
      model.position.set(-center.x, -bounds.min.y, -center.z);
      group.remove(placeholder);
      group.add(model);
    },
    undefined,
    () => undefined
  );
  // Its sign on the wall above
  // Its sign on the wall high above, over the scoreboard
  group.add(plane(0.84, 0.21, standard("#ffffff", 0.8, signTexture("ARCADE", "#ffd9a0", "#120d08", "700 84px Georgia, serif")), -0.1, SIGN_Y, WALL_Z + 0.03 - group.position.z));
  addLamp(group, 0, 2.6, 1.0);
  group.add(hitBox(1.2, 2.2, 1.1, 1.1));
  group.userData.stopId = "arcade";
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
      group.add(box(LOCKER_W - 0.02, LOCKER_H, 0.46, mine ? dark : steel, x, y, 0));
      if (mine) {
        // The door swung open on its hinge
        const door = new Group();
        door.position.set(x - LOCKER_W / 2 + 0.01, y, 0.24);
        door.rotation.y = -1.25;
        door.add(box(LOCKER_W - 0.03, LOCKER_H - 0.02, 0.02, steel, (LOCKER_W - 0.03) / 2, 0, 0));
        door.add(plane(0.12, 0.08, standard("#ffffff", 0.6, plateTexture(number, "#1d2a3a", "#d9c58a")), (LOCKER_W - 0.03) / 2, 0.3, 0.012));
        group.add(door);
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
  group.add(box(cabinetW + 0.08, cabinetH + 0.08, 0.36, wood, cx, bottom + cabinetH / 2, -0.02));
  group.add(plane(cabinetW, cabinetH, standard("#ffffff", 0.9, front), cx, bottom + cabinetH / 2, 0.165));
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
// nothing to see behind it, a worn counter, and the sign. Tap the window to be served.
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

function buildTickets() {
  const group = new Group();
  group.position.set(SIDE_X - 0.13, 0, TICKET_Z);
  group.rotation.y = -Math.PI / 2; // faces back along the platform, towards the visitor
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
  addLamp(group, 0, 2.4, 1.2);
  const windowHit = hitBox(1.35, 1.0, 0.3, 1.54);
  windowHit.userData.part = "window";
  group.add(windowHit);
  group.add(hitBox(1.9, 2.6, 0.8, 1.3));
  group.userData.stopId = "tickets";
  return group;
}

// The empty train that passes now and then: dark carriages with a few lit windows
function buildTrain() {
  const train = new Group();
  const body = standard("#1b1e24", 0.7);
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

export default function StationScene({ at, heading, onSelect, onTurn, boards, paused = false, surfaces, surfacesInteractive, cardFraction, zoom, onEmptyTap, onPart }: Props) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const surfaceLayerRef = useRef<HTMLDivElement | null>(null);
  const grainRef = useRef<HTMLDivElement | null>(null);
  const [surfaceSlots, setSurfaceSlots] = useState<Record<string, HTMLDivElement>>({});
  const goRef = useRef<((at: StopId | null, heading: Heading) => void) | null>(null);
  const paintBoardsRef = useRef<((boards: Boards) => void) | null>(null);
  const latest = useRef({ at, heading, onSelect, onTurn, onPart, onEmptyTap, boards, paused, cardFraction, zoom });
  latest.current = { at, heading, onSelect, onTurn, onPart, onEmptyTap, boards, paused, cardFraction, zoom };

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
    const overhead = new PointLight("#ffb060", 16, 7, 2); // the lamp over the visitor, which flickers
    // Centred over where you stand, a little way towards the board so it's in view from a phone
    const lampX = HUB.pos[0];
    const lampZ = -0.3;
    overhead.position.set(lampX, 3.5, lampZ);
    scene.add(overhead);
    scene.add(box(0.3, 0.1, 0.3, new MeshBasicMaterial({ color: "#ffe2b8" }), lampX, 3.95, lampZ)); // like the others
    // A lamp either side of where you stand, the same distance off
    [HUB.pos[0] - 4.6, HUB.pos[0] + 4.6].forEach((x) => {
      const lamp = new PointLight("#ffb060", 18, 9, 2);
      lamp.position.set(x, 3.6, -0.6);
      scene.add(lamp);
      scene.add(box(0.3, 0.1, 0.3, new MeshBasicMaterial({ color: "#ffe2b8" }), x, 3.95, -0.6));
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
    scene.add(train);

    // The objects
    const bulletin = buildBulletin();
    const departures = buildDepartures();
    const events = buildEvents();
    const tickets = buildTickets();
    const lockers = buildLockers();
    let lastMinute = 0;
    const mail = buildMail();
    const arcade = buildArcade();
    const objects = [bench, lockers, arcade, bulletin, events, tickets, departures, mail];

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
    const surfaceCentre = new Vector3();
    const toCamera = new Vector3();
    const surfaceNormal = new Vector3();
    const facing = new Vector3();
    const poster = events.userData.poster as Mesh<PlaneGeometry, MeshStandardMaterial>;
    const paintedPoster = poster.material.map as CanvasTexture;
    let posterImage = "";
    paintBoardsRef.current = ({ notices, departures: lines, poster: sheet, unread }) => {
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
        new TextureLoader().setCrossOrigin("anonymous").load(url, (texture) => {
          if (posterImage !== url) return texture.dispose();
          texture.colorSpace = SRGBColorSpace;
          poster.material.map = texture;
          poster.material.needsUpdate = true;
        });
      }
    };
    paintBoardsRef.current(latest.current.boards);
    objects.forEach((o) => scene.add(o));
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
      const zoomed = stopId === "bulletin" ? latest.current.zoom : null;
      if (zoomed !== null && PAPER_SPOTS[zoomed]) {
        const [x, y, , paperW, paperH] = PAPER_SPOTS[zoomed];
        const paper = new Vector3(BOARD_POS.x + x, BOARD_POS.y + y, BOARD_POS.z + 0.07);
        const halfHeight = ((camera.fov * Math.PI) / 180) / 2;
        const halfWidth = Math.atan(Math.tan(halfHeight) * camera.aspect);
        const distance = Math.max((paperW * 1.08) / 2 / Math.tan(halfWidth), (paperH * 1.12) / 2 / Math.tan(halfHeight));
        return { x: paper.x, y: paper.y, z: paper.z + distance, yaw: 0, pitch: 0 };
      }
      const stop = STOPS[stopId];
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
    const goTo = (stopId: StopId | null, facing: Heading, instant = false) => {
      const pose = poseFor(stopId, facing);
      const yaw = cam.yaw + wrapAngle(pose.yaw - cam.yaw); // turn the short way round
      const walking = stopId !== lastAt;
      lastAt = stopId;
      const duration = instant || reduced ? 0 : walking ? 1.0 : 0.55;
      gsap.killTweensOf(cam);
      gsap.to(cam, { ...pose, yaw, duration, ease: walking ? "power1.inOut" : "power2.inOut" });
    };
    goRef.current = (stopId, facing) => goTo(stopId, facing);

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
      down = { x: event.clientX, y: event.clientY, t: performance.now() };
      canvas.setPointerCapture(event.pointerId);
    };
    const onPointerMove = (event: PointerEvent) => {
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
      if (!current && Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
        turn(dx < 0 ? 1 : -1); // drag the world: swiping left turns right
      } else if (Math.hypot(dx, dy) < 10 && performance.now() - down.t < 500) {
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
    canvas.addEventListener("pointercancel", onPointerUp);
    canvas.addEventListener("pointerleave", onPointerLeave);

    // Render loop; paused while the tab is hidden
    let frame = 0;
    const start = performance.now();
    const animate = () => {
      frame = requestAnimationFrame(animate);
      if (document.hidden || latest.current.paused) return;
      const t = (performance.now() - start) / 1000;
      look.yaw += (look.toYaw - look.yaw) * 0.06;
      look.pitch += (look.toPitch - look.pitch) * 0.06;
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

      overhead.intensity = reduced ? 16 : 16 * (0.8 + 0.2 * Math.sin(t * 5.1) * Math.sin(t * 1.7 + 1));
      const current = latest.current.at;
      objects.forEach((o) => {
        const lamp = o.userData.lamp as PointLight;
        const lit = o.userData.stopId === current || o.userData.stopId === hovered;
        lamp.intensity += ((lit ? LAMP_LIT : LAMP_IDLE) - lamp.intensity) * 0.08;
      });

      // The empty train comes through every 45 s (first after about 10 s), at about 80 km/h
      const cycle = (t + 20) % 45;
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
      // camera or seen from the back would draw wrongly); its painted stand-in shows otherwise
      camera.getWorldDirection(facing);
      placed.forEach(({ object, spec }) => {
        object.getWorldPosition(surfaceCentre);
        toCamera.subVectors(camera.position, surfaceCentre).normalize();
        object.getWorldDirection(surfaceNormal);
        object.visible =
          surfaceNormal.dot(toCamera) > 0.12 && -toCamera.dot(facing) > 0.35 && (!spec.onlyAt || latest.current.at === spec.stop);
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
      renderer.dispose();
      mount.removeChild(canvas);
      surfaceLayer.remove();
      setSurfaceSlots({});
    };
  }, []);

  useEffect(() => {
    goRef.current?.(at, heading);
  }, [at, heading, cardFraction, zoom]);

  useEffect(() => {
    paintBoardsRef.current?.(boards);
  }, [boards]);

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
                zoom !== null && spec.id === `paper-${zoom}`
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
