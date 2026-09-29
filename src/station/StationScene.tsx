import { useEffect, useRef } from "react";
import {
  AdditiveBlending,
  Box3,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
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
  inset: { right: number; bottom: number }; // screen covered by a panel, in CSS pixels
};

// Live text for the boards in the scene
export type Boards = {
  notices: { kind: string; title: string }[];
  departures: string[];
};

const WALL_Z = -2.2;
const RENDER_HEIGHT = 420; // rows of pixels the scene is drawn at, whatever the screen size
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
  ctx.fillText("DEPARTURES", 20, 40);
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

function buildBulletin() {
  const group = new Group();
  group.position.set(-0.4, 1.72, WALL_Z + 0.05);
  group.add(box(2.4, 1.5, 0.08, standard("#3a2a1c")));
  group.add(plane(2.25, 1.35, standard("#8a6a44", 1, speckle("#8a6a44", ["#755738", "#9c7b52", "#6a4d30"], 900, 3)), 0, 0, 0.045));
  group.userData.notes = PAPERS.map((paper, i) => {
    const [kind, title] = IDLE_NOTICES[i];
    const texture = paint(128, 168, (ctx, w, h) => drawNotice(ctx, w, h, kind, title, paper));
    const note = plane(0.42, 0.55, standard("#ffffff", 1, texture), -0.8 + (i % 3) * 0.8, 0.3 - Math.floor(i / 3) * 0.66, 0.06);
    note.rotation.z = ((i * 37) % 11) / 60 - 0.09;
    group.add(note);
    return texture;
  });
  group.add(plane(1.3, 0.24, standard("#ffffff", 0.8, signTexture("NOTICES", "#ffd9a0", "#120d08", "700 80px Georgia, serif")), 0, 0.95, 0.02));
  addLamp(group, 0, 1.5, 1.1);
  group.add(hitBox(2.6, 1.9, 0.6, 0.1));
  group.userData.stopId = "bulletin";
  return group;
}

function buildEvents() {
  const group = new Group();
  group.position.set(0.9, 0, -1.25);
  const wood = standard("#4a3524");
  group.add(box(1.5, 0.07, 0.8, wood, 0, 0.82, 0));
  [-0.65, 0.65].forEach((x) => [-0.3, 0.3].forEach((z) => group.add(box(0.07, 0.82, 0.07, wood, x, 0.41, z))));
  const flyers: [string, string, string, number][] = [
    ["SCARE-ATHON", "#ff7a1a", "#1a0d05", -0.45],
    ["COMING SOON", "#2a2f3a", "#9aa4b8", 0.05],
    ["COMING SOON", "#2a2f3a", "#9aa4b8", 0.5],
  ];
  flyers.forEach(([title, bg, fg, x], i) => {
    const material = standard("#ffffff", 1, paint(256, 340, (ctx, w, h) => {
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = fg;
      ctx.lineWidth = 6;
      ctx.strokeRect(10, 10, w - 20, h - 20);
      ctx.fillStyle = fg;
      ctx.font = "700 44px Georgia, serif";
      ctx.textAlign = "center";
      ctx.fillText(title, w / 2, h / 2, w - 40);
    }));
    const flyer = plane(0.34, 0.45, material, x, 0.86, 0.05);
    flyer.rotation.x = -Math.PI / 2;
    flyer.rotation.z = (i - 1) * 0.25;
    group.add(flyer);
  });
  // A folded card standing on the table names it
  const card = plane(0.5, 0.14, standard("#ffffff", 1, signTexture("EVENTS", "#2a1d14", "#efe3c8", "700 84px Georgia, serif")), 0, 0.93, -0.22);
  card.rotation.x = -0.25;
  group.add(card);
  addLamp(group, 0, 2.2, 0.7);
  group.add(hitBox(1.7, 0.9, 1.0, 0.6));
  group.userData.stopId = "events";
  return group;
}

function buildArcade() {
  const group = new Group();
  group.position.set(-4.2, 0, 0);
  group.rotation.y = Math.PI / 2; // faces down the platform, towards the visitor
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
  // A sign hung from the canopy above it
  group.add(plane(1.0, 0.25, standard("#ffffff", 0.8, signTexture("ARCADE", "#ffd9a0", "#120d08", "700 84px Georgia, serif")), 0, 2.55, 0));
  [-0.4, 0.4].forEach((x) => group.add(box(0.02, 1.4, 0.02, standard("#222"), x, 3.35, 0)));
  addLamp(group, 0, 2.4, 1.3);
  group.add(hitBox(1.2, 2.2, 1.1, 1.1));
  group.userData.stopId = "arcade";
  return group;
}

function buildDepartures() {
  const group = new Group();
  group.position.set(3.4, 2.95, -0.1);
  group.rotation.y = -Math.PI / 2; // faces back along the platform, towards the visitor
  group.add(box(2.1, 0.85, 0.1, standard("#15181f")));
  const face = paint(512, 200, (ctx, w, h) => drawDepartures(ctx, w, h, ["SCAREBOARD    ON TIME", "CALENDAR      DELAYED", "ARCADE        BOARDING"]));
  group.add(plane(2.0, 0.76, new MeshBasicMaterial({ map: face }), 0, 0, 0.056));
  group.userData.face = face;
  [-0.9, 0.9].forEach((x) => group.add(box(0.03, 0.8, 0.03, standard("#222"), x, 0.8, 0)));
  addLamp(group, 0, -0.3, 1.0);
  group.add(hitBox(2.3, 1.1, 0.6, 0));
  group.userData.stopId = "departures";
  return group;
}

function buildTickets() {
  const group = new Group();
  group.position.set(4.8, 0, -0.1);
  group.rotation.y = -Math.PI / 2;
  group.add(box(1.9, 2.4, 0.9, standard("#2a2f3a"), 0, 1.2, 0));
  group.add(box(2.1, 0.12, 1.1, standard("#1c1f26"), 0, 2.46, 0));
  // Through the window: a lit booth, and someone who may or may not be there
  const windowView = paint(200, 150, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h * 0.3, 10, w / 2, h / 2, w * 0.7);
    g.addColorStop(0, "#ffe3a8");
    g.addColorStop(1, "#b8783a");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "rgba(20,12,8,0.85)";
    ctx.beginPath();
    ctx.arc(w * 0.62, h * 0.42, 17, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(w * 0.62, h * 1.02, 44, 50, 0, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = "#3a2412";
    ctx.font = "700 15px Georgia, serif";
    ctx.fillText("COINS ONLY", 10, 22);
  });
  group.add(plane(1.0, 0.75, new MeshBasicMaterial({ map: windowView }), 0, 1.5, 0.456));
  group.add(box(1.2, 0.06, 0.3, standard("#4a3524"), 0, 1.08, 0.55));
  group.add(plane(1.3, 0.32, standard("#ffffff", 0.8, signTexture("TICKETS", "#ffd9a0", "#120d08", "700 80px Georgia, serif")), 0, 2.12, 0.456));
  addLamp(group, 0, 2.2, 1.2);
  group.add(hitBox(2.1, 2.6, 1.2, 1.3));
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
    train.add(box(11.4, 2.9, 2.8, body, x, 1.0, 3.3));
    for (let w = 0; w < 6; w += 1) {
      const pane = plane(1.1, 0.75, (car * 6 + w) % 4 === 1 ? dark : lit, x - 4.5 + w * 1.8, 1.45, 3.3 - 1.41);
      pane.rotation.y = Math.PI; // face the platform
      train.add(pane);
    }
  }
  const headlight = new Sprite(new SpriteMaterial({ map: glowTexture(), blending: AdditiveBlending, transparent: true, fog: false, depthWrite: false }));
  headlight.scale.set(3, 3, 1);
  headlight.position.set(5.9, 0.4, 3.3);
  train.add(headlight);
  train.visible = false;
  return train;
}

export default function StationScene({ at, heading, onSelect, onTurn, boards, inset }: Props) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const grainRef = useRef<HTMLDivElement | null>(null);
  const goRef = useRef<((at: StopId | null, heading: Heading) => void) | null>(null);
  const paintBoardsRef = useRef<((boards: Boards) => void) | null>(null);
  const latest = useRef({ at, heading, onSelect, onTurn, inset, boards });
  latest.current = { at, heading, onSelect, onTurn, inset, boards };

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
    overhead.position.set(0, 3.5, -0.4);
    scene.add(overhead);
    scene.add(box(0.3, 0.1, 0.3, new MeshBasicMaterial({ color: "#ffe2b8" }), 0, 3.95, -0.4));
    [-9, 9].forEach((x) => {
      const lamp = new PointLight("#ffb060", 18, 9, 2);
      lamp.position.set(x, 3.6, -0.6);
      scene.add(lamp);
      scene.add(box(0.3, 0.1, 0.3, new MeshBasicMaterial({ color: "#ffe2b8" }), x, 3.95, -0.6));
    });

    // Platform, building, canopy
    const floorTex = speckle("#4a4a4c", ["#3c3c3e", "#57575a", "#444"], 1400, 2);
    floorTex.wrapS = floorTex.wrapT = RepeatWrapping;
    floorTex.repeat.set(30, 2);
    scene.add(box(60, 0.85, 3.4, standard("#555", 0.95, floorTex), 0, -0.425, -0.5));
    scene.add(box(60, 5, 0.2, standard("#8a7f78", 1, brickTexture()), 0, 2.5, WALL_Z - 0.1));
    scene.add(box(60, 0.12, 4.2, standard("#1c1f26"), 0, 4.1, -0.3));
    // Posts stand well away from the visitor, so none of them crosses a view
    [-26, -18, -10, 10, 18, 26].forEach((x) => scene.add(box(0.14, 4.1, 0.14, standard("#20232b"), x, 2.05, 1.0)));
    const line = plane(60, 0.12, new MeshBasicMaterial({ color: "#8f741c" }), 0, 0.006, 0.95);
    line.rotation.x = -Math.PI / 2;
    scene.add(line);

    // Tracks: gravel bed, two rails, sleepers running off into the fog
    const bed = plane(200, 40, standard("#25221f", 1, speckle("#25221f", ["#302c28", "#1c1a18"], 700, 2)), 0, -0.85, 21);
    bed.rotation.x = -Math.PI / 2;
    scene.add(bed);
    const railMaterial = standard("#6b6f78", 0.5);
    [2.6, 4.035].forEach((z) => scene.add(box(200, 0.15, 0.1, railMaterial, 0, -0.72, z)));
    const sleepers = new InstancedMesh(new BoxGeometry(0.28, 0.12, 2.3), standard("#2e2218"), 260);
    const m = new Matrix4();
    for (let i = 0; i < 260; i += 1) {
      m.makeTranslation(-90 + i * 0.7, -0.79, 3.3);
      sleepers.setMatrixAt(i, m);
    }
    scene.add(sleepers);

    // The far side: a fence, the station's name, bare trees and the moon
    const fence = new InstancedMesh(new BoxGeometry(0.08, 1.1, 0.08), standard("#2a2622"), 40);
    for (let i = 0; i < 40; i += 1) {
      m.makeTranslation(-30 + i * 1.5, -0.3, 6.5);
      fence.setMatrixAt(i, m);
    }
    scene.add(fence);
    scene.add(box(60, 0.06, 0.05, standard("#2a2622"), 0, 0.05, 6.5));
    const nameSign = plane(2.6, 0.55, standard("#ffffff", 0.8, signTexture("WAYSIDE", "#f2ead2", "#1d2a3a", "700 92px Georgia, serif")), 0.6, 1.3, 6.4);
    nameSign.rotation.y = Math.PI;
    scene.add(nameSign);
    [-0.6, 1.8].forEach((x) => scene.add(box(0.08, 2.2, 0.08, standard("#20232b"), x, 0.2, 6.45)));
    const signLamp = new PointLight("#cfe0ff", 6, 5, 2);
    signLamp.position.set(0.6, 2.4, 5.6);
    scene.add(signLamp);
    const treeMap = treeTexture();
    [-14, -6, 3, 9, 17, 24].forEach((x, i) => {
      const tree = new Sprite(new SpriteMaterial({ map: treeMap, transparent: true, depthWrite: false, fog: false }));
      const size = 6 + (i % 3) * 2;
      tree.scale.set(size, size, 1);
      tree.position.set(x, size / 2 - 0.9, 12 + (i % 2) * 5);
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
    moon.position.set(-16, 17, 70);
    scene.add(moon);

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
    const objects = [bulletin, buildEvents(), buildArcade(), departures, buildTickets()];
    paintBoardsRef.current = ({ notices, departures: lines }) => {
      (bulletin.userData.notes as CanvasTexture[]).forEach((texture, i) => {
        const [kind, title] = notices[i] ? [notices[i].kind, notices[i].title] : IDLE_NOTICES[i];
        repaint(texture, (ctx, w, h) => drawNotice(ctx, w, h, kind, title, PAPERS[i]));
      });
      repaint(departures.userData.face as CanvasTexture, (ctx, w, h) => drawDepartures(ctx, w, h, lines));
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
        const [x, y, z] = HUB.pos;
        const hubZ = z + (pull - 1) * 1.4;
        // Turn to face the view's object, so it is centred on any screen shape
        const focus = VIEWS[facing].focus;
        const yaw = focus ? Math.atan2(-(STOPS[focus].target[0] - x), -(STOPS[focus].target[2] - hubZ)) : HUB.yaw[facing];
        return { x, y, z: hubZ, yaw, pitch: HUB.pitch[facing] };
      }
      const stop = STOPS[stopId];
      const target = new Vector3(...stop.target);
      // Step back further while a panel covers part of the screen
      const { right, bottom } = latest.current.inset;
      const room = right > 0 || bottom > 0 ? 1.35 : 1;
      const pos = new Vector3(...stop.pos).sub(target).multiplyScalar(pull * room).add(target);
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
    const offset = { x: 0, y: 0, dirty: true };
    const onResize = () => {
      width = Math.max(mount.clientWidth, 1);
      height = Math.max(mount.clientHeight, 1);
      offset.dirty = true;
      renderer.setPixelRatio(clamp(RENDER_HEIGHT / height, 0.25, lightweight ? 1 : 2));
      renderer.setSize(width, height);
      const aspect = width / height;
      camera.aspect = aspect;
      camera.fov = aspect < 0.8 ? 80 : aspect < 1.2 ? 68 : 60;
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
    let down: { x: number; y: number; t: number } | null = null;
    const pick = (clientX: number, clientY: number): StopId | null => {
      const rect = canvas.getBoundingClientRect();
      pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(objects, true)[0];
      let node: Object3D | null = hit ? hit.object : null;
      while (node) {
        if (node.userData.stopId) return node.userData.stopId as StopId;
        node = node.parent;
      }
      return null;
    };
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
      const { at: current, onSelect: select, onTurn: turn } = latest.current;
      if (!current && Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
        turn(dx < 0 ? 1 : -1); // drag the world: swiping left turns right
      } else if (Math.hypot(dx, dy) < 10 && performance.now() - down.t < 500) {
        const id = pick(event.clientX, event.clientY);
        if (id && id !== current) select(id);
        else if (!id && current) select(null);
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
      if (document.hidden) return;
      const t = (performance.now() - start) / 1000;
      look.yaw += (look.toYaw - look.yaw) * 0.06;
      look.pitch += (look.toPitch - look.pitch) * 0.06;
      const sway = reduced ? 0 : 1;
      camera.position.set(cam.x, cam.y + Math.sin(t * 0.9) * 0.01 * sway, cam.z);
      camera.rotation.set(cam.pitch + look.pitch + Math.sin(t * 0.5) * 0.004 * sway, cam.yaw + look.yaw + Math.sin(t * 0.37) * 0.006 * sway, 0);

      // The overhead lamp is tired; it stays under three flickers a second
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

      // Slide the picture aside while a panel covers part of the screen
      const { right, bottom } = latest.current.inset;
      const ox = offset.x + (right / 2 - offset.x) * 0.12;
      const oy = offset.y + (bottom / 2 - offset.y) * 0.12;
      if (offset.dirty || Math.abs(ox - offset.x) > 0.05 || Math.abs(oy - offset.y) > 0.05) {
        offset.x = ox;
        offset.y = oy;
        offset.dirty = false;
        if (Math.abs(ox) < 0.5 && Math.abs(oy) < 0.5) camera.clearViewOffset();
        else camera.setViewOffset(width, height, ox, oy, width, height);
      }

      renderer.render(scene, camera);
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
    };
  }, []);

  const panelOpen = inset.right > 0 || inset.bottom > 0;
  useEffect(() => {
    goRef.current?.(at, heading);
  }, [at, heading, panelOpen]);

  useEffect(() => {
    paintBoardsRef.current?.(boards);
  }, [boards]);

  return (
    <div className="absolute inset-0 select-none" style={{ touchAction: "none" }}>
      <style>{`
        @keyframes station-grain { 0% { transform: translate(0, 0) } 25% { transform: translate(-31px, 17px) }
          50% { transform: translate(23px, -41px) } 75% { transform: translate(-13px, -23px) } 100% { transform: translate(0, 0) } }
        @media (prefers-reduced-motion: reduce) { .station-grain { animation: none !important } }
      `}</style>
      <div ref={mountRef} className="absolute inset-0" />
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(ellipse at 50% 45%, transparent 40%, rgba(0,0,0,0.55) 75%, rgba(0,0,0,0.9) 100%)" }}
      />
      <div
        ref={grainRef}
        className="station-grain pointer-events-none absolute -inset-16 opacity-[0.07] mix-blend-overlay"
        style={{ animation: "station-grain 0.5s steps(4) infinite" }}
      />
    </div>
  );
}
