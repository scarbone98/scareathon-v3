import { Box3, CanvasTexture, Color, LinearFilter, LinearMipmapLinearFilter, Matrix4, MeshStandardMaterial, RepeatWrapping, SRGBColorSpace, Vector3 } from "three";
import { canvasFont, whenFontReady, type ArcadeFont } from "./arcadeFonts.ts";

// The cabinet's black body, dressed as cassette-futurism hardware: graphite
// plastic with a fine pebbled grain, panel seams and screws, cream stencilled
// model numbers and labels, vent slots, and 70s stripes in mustard, orange,
// rust and brown. The only thing that follows the current game is its LEDs,
// which run as chaser lights in the game's colour.
//
// The model's UVs stretch unevenly, so everything is projected from the world's
// axes instead: a front sheet (x, y), a top sheet (x, z) and a side sheet (z, y),
// each painted in world units against the cabinet's measured parts. Every sheet
// is two canvases painted together:
//   colour: what the surface looks like
//   data:   red is height (0.5 flat: seams and vents cut in, screws stand proud),
//           green marks an LED, blue marks glossy print

export const CABINET_FONT: ArcadeFont = { family: "Michroma" };
// The trim down the cabinet's edges: brushed aluminium T-moulding
export const CABINET_TRIM = "#b4b1aa";
// 70s stripes, top to bottom
const STRIPES = ["#f2b33d", "#e8772e", "#c9452c", "#7b3a1e"];

// What the painter needs to know about the model, all world-space boxes
export type CabinetParts = {
  cabinet: Box3;
  screen: Box3; // the glass
  panel: Box3; // joysticks and buttons
  marquee: Box3;
};

const PX_PER_UNIT = 820; // sheet resolution: nearly a pixel per millimetre of cabinet

// --- Paints ------------------------------------------------------------------------------
type Paint = { color: string; height?: number; led?: boolean; gloss?: boolean };
const BASE: Paint = { color: "#131116" };
const INSERT: Paint = { color: "#1e1b21" }; // the lighter grey of two-tone panels
const PRINT: Paint = { color: "#eadcc0", height: 136, gloss: true };
const PRINT_DIM: Paint = { color: "#a09481", height: 132, gloss: true };
const SEAM: Paint = { color: "#060507", height: 60 };
const SLOT: Paint = { color: "#040304", height: 18 };
// Dark lenses, so the glow shows in the game's colour rather than washing out white
const LED: Paint = { color: "#3a2c2e", height: 160, led: true, gloss: true };
const stripePaint = (color: string): Paint => ({ color, height: 134, gloss: true });

const dataStyle = ({ height = 128, led = false, gloss = false }: Paint) => `rgb(${height}, ${led ? 255 : 0}, ${gloss ? 255 : 0})`;

// A face of the cabinet: its two canvases, drawn in world units
type Sheet = {
  layers: { context: CanvasRenderingContext2D; data: boolean }[];
  canvases: [HTMLCanvasElement, HTMLCanvasElement];
  // world (u, v) → canvas px
  x: (u: number) => number;
  y: (v: number) => number;
  s: (length: number) => number; // world length → px
};

function makeSheet(uMin: number, uMax: number, vMin: number, vMax: number): Sheet {
  const make = () => {
    const canvas = document.createElement("canvas");
    canvas.width = Math.round((uMax - uMin) * PX_PER_UNIT);
    canvas.height = Math.round((vMax - vMin) * PX_PER_UNIT);
    return canvas;
  };
  const canvases: [HTMLCanvasElement, HTMLCanvasElement] = [make(), make()];
  const k = canvases[0].width / (uMax - uMin);
  const sheet: Sheet = {
    canvases,
    layers: canvases.map((canvas, i) => ({ context: canvas.getContext("2d")!, data: i === 1 })),
    x: (u) => (u - uMin) * k,
    // Canvas rows run down from vMax
    y: (v) => (vMax - v) * k,
    s: (length) => length * k,
  };
  fillAll(sheet, BASE);
  return sheet;
}

// Run a drawing on both canvases, with the paint's colour or data as the style
function draw(sheet: Sheet, paint: Paint, drawing: (context: CanvasRenderingContext2D) => void) {
  sheet.layers.forEach(({ context, data }) => {
    context.fillStyle = context.strokeStyle = data ? dataStyle(paint) : paint.color;
    drawing(context);
  });
}

function fillAll(sheet: Sheet, paint: Paint) {
  draw(sheet, paint, (context) => context.fillRect(0, 0, context.canvas.width, context.canvas.height));
}

// --- Drawing helpers, all in world units -------------------------------------------------
function rect(sheet: Sheet, paint: Paint, u0: number, v0: number, u1: number, v1: number) {
  const { x, y } = sheet;
  const left = Math.min(x(u0), x(u1));
  const top = Math.min(y(v0), y(v1));
  draw(sheet, paint, (context) => context.fillRect(left, top, Math.abs(x(u1) - x(u0)), Math.abs(y(v1) - y(v0))));
}

function outline(sheet: Sheet, paint: Paint, u0: number, v0: number, u1: number, v1: number, width: number) {
  const { x, y, s } = sheet;
  const left = Math.min(x(u0), x(u1));
  const top = Math.min(y(v0), y(v1));
  draw(sheet, paint, (context) => {
    context.lineWidth = Math.max(1.5, s(width));
    context.strokeRect(left, top, Math.abs(x(u1) - x(u0)), Math.abs(y(v1) - y(v0)));
  });
}

// A recessed seam around a rectangle, with a screw in each corner
function panel(sheet: Sheet, u0: number, v0: number, u1: number, v1: number, fill = INSERT, screws = true) {
  rect(sheet, fill, u0, v0, u1, v1);
  outline(sheet, SEAM, u0, v0, u1, v1, 0.005);
  if (!screws) return;
  const inset = 0.018;
  for (const u of [u0 + inset * Math.sign(u1 - u0), u1 - inset * Math.sign(u1 - u0)]) {
    for (const v of [v0 + inset * Math.sign(v1 - v0), v1 - inset * Math.sign(v1 - v0)]) screw(sheet, u, v);
  }
}

function screw(sheet: Sheet, u: number, v: number, radius = 0.009) {
  const cx = sheet.x(u);
  const cy = sheet.y(v);
  const r = Math.max(3, sheet.s(radius));
  sheet.layers.forEach(({ context, data }) => {
    // A domed head, with a cross cut into it
    const dome = context.createRadialGradient(cx - r * 0.3, cy - r * 0.3, 0, cx, cy, r);
    dome.addColorStop(0, data ? dataStyle({ color: "", height: 230, gloss: true }) : "#b8b2a6");
    dome.addColorStop(0.7, data ? dataStyle({ color: "", height: 180, gloss: true }) : "#6e6a64");
    dome.addColorStop(1, data ? dataStyle({ color: "", height: 90 }) : "#1a181b");
    context.fillStyle = dome;
    context.beginPath();
    context.arc(cx, cy, r, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = data ? dataStyle({ color: "", height: 110 }) : "#2a2729";
    context.lineWidth = Math.max(1, r * 0.22);
    context.beginPath();
    context.moveTo(cx - r * 0.55, cy);
    context.lineTo(cx + r * 0.55, cy);
    context.moveTo(cx, cy - r * 0.55);
    context.lineTo(cx, cy + r * 0.55);
    context.stroke();
  });
}

// Rows of vent slots filling a rectangle
function vents(sheet: Sheet, u0: number, v0: number, u1: number, v1: number, pitch = 0.022, slot = 0.009) {
  const { x, y, s } = sheet;
  const radius = s(slot) / 2;
  const left = Math.min(x(u0), x(u1));
  const width = Math.abs(x(u1) - x(u0));
  const bottom = Math.min(v0, v1);
  for (let v = Math.max(v0, v1) - pitch / 2; v > bottom; v -= pitch) {
    draw(sheet, SLOT, (context) => {
      context.beginPath();
      context.roundRect(left, y(v) - radius, width, radius * 2, radius);
      context.fill();
    });
  }
}

function text(sheet: Sheet, words: string, u: number, v: number, height: number, paint = PRINT, align: CanvasTextAlign = "left", spacing = 0.12) {
  const size = sheet.s(height);
  draw(sheet, paint, (context) => {
    context.font = canvasFont(CABINET_FONT, size);
    context.textAlign = align;
    context.textBaseline = "alphabetic";
    context.letterSpacing = `${size * spacing}px`;
    context.fillText(words, sheet.x(u), sheet.y(v));
    context.letterSpacing = "0px";
  });
}

function led(sheet: Sheet, u: number, v: number, radius = 0.006) {
  const circle = (r: number) => (context: CanvasRenderingContext2D) => {
    context.beginPath();
    context.arc(sheet.x(u), sheet.y(v), sheet.s(r), 0, Math.PI * 2);
    context.fill();
  };
  // A dark bezel ring round a lens
  draw(sheet, { color: "#050405", height: 90 }, circle(radius * 1.7));
  draw(sheet, LED, circle(radius));
}

// A row of LEDs, e.g. chaser lights or a level meter
function ledRow(sheet: Sheet, u0: number, u1: number, v: number, count: number, radius = 0.005) {
  for (let i = 0; i < count; i += 1) led(sheet, u0 + ((u1 - u0) * i) / Math.max(count - 1, 1), v, radius);
}

// The 70s stripes, following a path of (u, v) points; each runs parallel,
// stacked below the last. Widths are world units, one per colour.
function stripes(sheet: Sheet, points: [number, number][], widths = [0.03, 0.024, 0.018, 0.012], gap = 0.006) {
  let offset = 0;
  widths.forEach((width, i) => {
    const shift = offset + width / 2;
    draw(sheet, stripePaint(STRIPES[i % STRIPES.length]), (context) => {
      context.lineWidth = sheet.s(width);
      context.lineJoin = "miter";
      context.lineCap = "butt";
      context.beginPath();
      points.forEach(([u, v], j) => {
        if (j === 0) context.moveTo(sheet.x(u), sheet.y(v - shift));
        else context.lineTo(sheet.x(u), sheet.y(v - shift));
      });
      context.stroke();
    });
    offset += width + gap;
  });
}

// Diagonal warning stripes in a rectangle
function hazard(sheet: Sheet, u0: number, v0: number, u1: number, v1: number) {
  const { x, y, s } = sheet;
  const left = Math.min(x(u0), x(u1));
  const top = Math.min(y(v0), y(v1));
  const width = Math.abs(x(u1) - x(u0));
  const height = Math.abs(y(v1) - y(v0));
  rect(sheet, BASE, u0, v0, u1, v1);
  const band = s(0.014);
  draw(sheet, { color: STRIPES[0], height: 132, gloss: true }, (context) => {
    context.save();
    context.beginPath();
    context.rect(left, top, width, height);
    context.clip();
    for (let i = -height; i < width + height; i += band * 2) {
      context.beginPath();
      context.moveTo(left + i, top + height);
      context.lineTo(left + i + band, top + height);
      context.lineTo(left + i + band + height, top);
      context.lineTo(left + i + height, top);
      context.fill();
    }
    context.restore();
  });
}

// A scatter of fine pebbled grain, as a tiling height map (red channel)
function grainTexture() {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const context = canvas.getContext("2d")!;
  const random = seeded(7);
  context.fillStyle = "rgb(128, 128, 128)";
  context.fillRect(0, 0, size, size);
  const dot = (cx: number, cy: number, radius: number, rgb: string, alpha: number) => {
    for (const dx of [-size, 0, size]) {
      for (const dy of [-size, 0, size]) {
        const gradient = context.createRadialGradient(cx + dx, cy + dy, 0, cx + dx, cy + dy, radius);
        gradient.addColorStop(0, `rgba(${rgb}, ${alpha})`);
        gradient.addColorStop(1, `rgba(${rgb}, 0)`);
        context.fillStyle = gradient;
        context.fillRect(cx + dx - radius, cy + dy - radius, radius * 2, radius * 2);
      }
    }
  };
  for (let i = 0; i < 2600; i++) dot(random() * size, random() * size, 1.5 + random() * 2.5, "255, 255, 255", 0.25 + random() * 0.35);
  for (let i = 0; i < 1600; i++) dot(random() * size, random() * size, 1.5 + random() * 2, "0, 0, 0", 0.2 + random() * 0.3);
  const texture = new CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

// --- The sheets ---------------------------------------------------------------------------
function paintFront(parts: CabinetParts) {
  const { cabinet, screen: glass, panel: controls, marquee } = parts;
  const sheet = makeSheet(cabinet.min.x, cabinet.max.x, cabinet.min.y, cabinet.max.y);
  const half = (cabinet.max.x - cabinet.min.x) / 2;
  const cx = (cabinet.min.x + cabinet.max.x) / 2;
  const edge = half * 0.8; // clear of the trim down the sides
  const deck = controls.min.y; // where the control deck sits
  const lower = deck - 0.37; // top of the lower body's flat front

  // Lower body: a two-tone panel, stripes that kink up to the right, the model
  // number and a coin door
  const bodyTop = lower - 0.03;
  panel(sheet, cx - edge, 0.07, cx + edge, bodyTop);
  stripes(sheet, [
    [cx - edge, bodyTop * 0.66],
    [cx + edge * 0.02, bodyTop * 0.66],
    [cx + edge * 0.34, bodyTop * 0.93],
    [cx + edge, bodyTop * 0.93],
  ]);
  text(sheet, "SA-86", cx - edge + 0.035, 0.24, 0.085, PRINT, "left", 0.04);
  text(sheet, "SCAREATHON ARCADE SYSTEM", cx - edge + 0.037, 0.19, 0.017, PRINT_DIM);
  text(sheet, "SOLID STATE · 16-BIT · STEREO", cx - edge + 0.037, 0.16, 0.013, PRINT_DIM);
  // The coin door, with a pair of lit coin slots
  const doorLeft = cx + edge * 0.35;
  const doorRight = cx + edge - 0.035;
  panel(sheet, doorLeft, 0.11, doorRight, 0.36, { color: "#2a2629" });
  [0.4, 0.75].forEach((f) => {
    const u = doorLeft + (doorRight - doorLeft) * f;
    rect(sheet, { color: "#5f5a55", height: 170, gloss: true }, u - 0.03, 0.2, u + 0.03, 0.32);
    rect(sheet, SLOT, u - 0.005, 0.22, u + 0.005, 0.3);
    text(sheet, "25¢", u, 0.175, 0.016, PRINT, "center");
    led(sheet, u, 0.335, 0.005);
  });
  vents(sheet, cx - edge + 0.03, 0.035, cx + edge - 0.03, 0.065, 0.015, 0.007);

  // Under the control panel's overhang: vents either side, a warning label in the middle
  const underTop = deck - 0.12;
  vents(sheet, cx - edge + 0.02, lower + 0.02, cx - 0.14, underTop);
  vents(sheet, cx + 0.14, lower + 0.02, cx + edge - 0.02, underTop);
  hazard(sheet, cx - 0.11, lower + 0.05, cx + 0.11, lower + 0.08);
  text(sheet, "OPTICAL SCANNER · DO NOT STARE INTO BEAM", cx, lower + 0.025, 0.0085, PRINT_DIM, "center", 0.08);

  // The control panel's front lip: the stripes across its full width, player labels under them
  const lipTop = deck - 0.032;
  stripes(sheet, [[cabinet.min.x, lipTop], [cabinet.max.x, lipTop]], [0.011, 0.009, 0.007, 0.005], 0.003);
  text(sheet, "PLAYER 1", cx - edge * 0.62, lipTop - 0.062, 0.011, PRINT, "center");
  text(sheet, "PLAYER 2", cx + edge * 0.62, lipTop - 0.062, 0.011, PRINT, "center");

  // The bezel round the screen: a fine frame, the badge above, a level meter and labels below
  const frame = 0.018;
  outline(sheet, PRINT_DIM, glass.min.x - frame, glass.min.y - frame, glass.max.x + frame, glass.max.y + frame, 0.0025);
  const badge = glass.max.y + frame + 0.022;
  text(sheet, "SCAREATHON", glass.min.x - frame, badge, 0.02, PRINT, "left", 0.2);
  stripes(sheet, [[glass.min.x + 0.3, badge + 0.02], [glass.max.x - 0.2, badge + 0.02]], [0.006, 0.005, 0.004, 0.003], 0.002);
  text(sheet, "SA-86 VIDEO", glass.max.x + frame, badge, 0.014, PRINT_DIM, "right");
  const under = glass.min.y - frame - 0.03;
  led(sheet, glass.min.x + 0.005, under + 0.007);
  text(sheet, "POWER", glass.min.x + 0.02, under, 0.013, PRINT_DIM);
  text(sheet, "CH 03", glass.min.x + 0.12, under, 0.013, PRINT_DIM);
  text(sheet, "AUTO TRACKING", glass.max.x - 0.02, under, 0.013, PRINT_DIM, "right");
  led(sheet, glass.max.x - 0.005, under + 0.007);
  text(sheet, "L", glass.max.x - 0.42, under, 0.011, PRINT_DIM, "right");
  ledRow(sheet, glass.max.x - 0.41, glass.max.x - 0.28, under + 0.005, 8, 0.0035);
  text(sheet, "▼ INSERT CARTRIDGE ▼", cx, under - 0.035, 0.011, PRINT, "center", 0.15);

  // The marquee's housing: screws either side and a row of chaser lights under it
  [marquee.min.x - 0.022, marquee.max.x + 0.022].forEach((u) => {
    screw(sheet, u, marquee.min.y + 0.02);
    screw(sheet, u, marquee.max.y - 0.02);
  });
  ledRow(sheet, marquee.min.x + 0.01, marquee.max.x - 0.01, marquee.min.y - 0.016, 24, 0.0045);
  return sheet;
}

function paintTop(parts: CabinetParts) {
  const { cabinet, panel: controls } = parts;
  // Rows run from the back (top of the canvas) to the front
  const sheet = makeSheet(cabinet.min.x, cabinet.max.x, -cabinet.max.z, -cabinet.min.z);
  const at = (z: number) => -z; // world z → this sheet's v
  const cx = (cabinet.min.x + cabinet.max.x) / 2;
  const half = (cabinet.max.x - cabinet.min.x) / 2;
  // Stripes along the deck's front edge, player badges in front of each stick
  const front = controls.max.z + 0.05;
  stripes(sheet, [[cabinet.min.x, at(front + 0.03)], [cabinet.max.x, at(front + 0.03)]], [0.007, 0.006, 0.005, 0.004], 0.003);
  const sticks = [controls.min.x + 0.03, cx + (controls.max.x - controls.min.x) * 0.05 + 0.03];
  ["1P", "2P"].forEach((label, i) => {
    const u = sticks[i];
    rect(sheet, stripePaint(STRIPES[1]), u - 0.03, at(front - 0.01), u + 0.03, at(front - 0.048));
    text(sheet, label, u, at(front - 0.02), 0.024, { color: "#1a1418", height: 124 }, "center", 0.05);
  });
  // The roof: a vent grille
  vents(sheet, cx - half * 0.6, at(cabinet.min.z + 0.15), cx + half * 0.6, at(cabinet.min.z + 0.4), 0.03, 0.012);
  return sheet;
}

function paintSide(parts: CabinetParts) {
  const { cabinet } = parts;
  // Front to the right, as seen from the cabinet's left; the shader mirrors it for the right
  const sheet = makeSheet(cabinet.min.z, cabinet.max.z, cabinet.min.y, cabinet.max.y);
  const { min, max } = cabinet;
  // A sweeping band, low at the back, rising toward the front
  stripes(sheet, [
    [min.z, 0.6],
    [min.z + 0.35, 0.6],
    [min.z + 0.75, 1.08],
    [max.z, 1.08],
  ], [0.05, 0.04, 0.03, 0.02], 0.012);
  text(sheet, "SA-86", min.z + 0.06, 0.3, 0.07, PRINT, "left", 0.04);
  text(sheet, "SCAREATHON ARCADE SYSTEM", min.z + 0.062, 0.25, 0.016, PRINT_DIM);
  vents(sheet, min.z + 0.08, 1.65, min.z + 0.3, 2.05);
  panel(sheet, min.z + 0.06, 1.45, min.z + 0.34, 1.58, INSERT);
  text(sheet, "SERIAL 0013-1986", min.z + 0.08, 1.5, 0.013, PRINT_DIM);
  text(sheet, "120V~ 60Hz 85W", min.z + 0.08, 1.475, 0.011, PRINT_DIM);
  hazard(sheet, min.z + 0.08, 1.525, min.z + 0.32, 1.555);
  return sheet;
}

function sheetTextures(sheet: Sheet) {
  return sheet.canvases.map((canvas, i) => {
    const texture = new CanvasTexture(canvas);
    if (i === 0) texture.colorSpace = SRGBColorSpace;
    texture.minFilter = LinearMipmapLinearFilter;
    texture.magFilter = LinearFilter;
    texture.anisotropy = 8;
    return texture;
  }) as [CanvasTexture, CanvasTexture];
}

export function createCabinetFinish() {
  const grain = grainTexture();
  const blank = makeSheet(0, 4 / PX_PER_UNIT, 0, 4 / PX_PER_UNIT);
  let textures = { front: sheetTextures(blank), top: sheetTextures(blank), side: sheetTextures(blank) };
  const accent = new Color("#ff7a1a");
  const uniforms = {
    grainMap: { value: grain },
    frontColor: { value: textures.front[0] },
    frontData: { value: textures.front[1] },
    topColor: { value: textures.top[0] },
    topData: { value: textures.top[1] },
    sideColor: { value: textures.side[0] },
    sideData: { value: textures.side[1] },
    boxMin: { value: new Vector3() },
    boxSize: { value: new Vector3(1, 1, 1) },
    accent: { value: accent },
    time: { value: 0 },
    // World → the cabinet's resting frame, so the decals move with it when it rocks
    frame: { value: new Matrix4() },
  };

  const material = new MeshStandardMaterial({ color: new Color("#ffffff"), roughness: 0.6, metalness: 0.05 });
  material.name = "CabinetFinish";
  material.emissive = new Color(0x222222);
  material.emissiveIntensity = 0.25;
  material.customProgramCacheKey = () => "cabinet-finish-3";
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform mat4 frame;\nvarying vec3 vFinishPos;\nvarying vec3 vFinishNormal;")
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvFinishPos = (frame * modelMatrix * vec4(position, 1.0)).xyz;\nvFinishNormal = normalize(mat3(frame) * mat3(modelMatrix) * normal);"
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
uniform sampler2D grainMap;
uniform sampler2D frontColor;
uniform sampler2D frontData;
uniform sampler2D topColor;
uniform sampler2D topData;
uniform sampler2D sideColor;
uniform sampler2D sideData;
uniform vec3 boxMin;
uniform vec3 boxSize;
uniform vec3 accent;
uniform float time;
varying vec3 vFinishPos;
varying vec3 vFinishNormal;
// Each sheet on the faces that look its way. Faces looking down (under the
// control panel) take the front sheet, not the top's.
vec3 sheetWeights(vec3 n) {
  vec3 w = pow(abs(n), vec3(8.0));
  if (n.y < 0.0) { w.z += w.y; w.y = 0.0; }
  return w / max(w.x + w.y + w.z, 1e-4);
}
vec2 frontUv(vec3 q) { return q.xy; }
vec2 topUv(vec3 q) { return vec2(q.x, 1.0 - q.z); }
vec2 sideUv(vec3 q, vec3 n) { return vec2(n.x > 0.0 ? 1.0 - q.z : q.z, q.y); }
float grainSample(vec3 p, vec3 n) {
  vec3 w = pow(abs(n), vec3(4.0));
  w /= (w.x + w.y + w.z);
  float scale = 1.6;
  return texture2D(grainMap, p.zy * scale).r * w.x + texture2D(grainMap, p.xz * scale).r * w.y + texture2D(grainMap, p.xy * scale).r * w.z;
}
// Tilts the normal down a height map's slope (three's bump mapping, without UVs)
vec3 finishPerturb(vec3 surfPos, vec3 surfNormal, vec2 dHdxy, float face) {
  vec3 sigmaX = normalize(dFdx(surfPos));
  vec3 sigmaY = normalize(dFdy(surfPos));
  vec3 r1 = cross(sigmaY, surfNormal);
  vec3 r2 = cross(surfNormal, sigmaX);
  float det = dot(sigmaX, r1) * face;
  vec3 grad = sign(det) * (dHdxy.x * r1 + dHdxy.y * r2);
  return normalize(abs(det) * surfNormal - grad);
}`
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
vec3 finishNormal = normalize(vFinishNormal);
vec3 q = (vFinishPos - boxMin) / boxSize;
vec3 w = sheetWeights(finishNormal);
vec3 paint = texture2D(frontColor, frontUv(q)).rgb * w.z + texture2D(topColor, topUv(q)).rgb * w.y
  + texture2D(sideColor, sideUv(q, finishNormal)).rgb * w.x;
vec3 data = texture2D(frontData, frontUv(q)).rgb * w.z + texture2D(topData, topUv(q)).rgb * w.y
  + texture2D(sideData, sideUv(q, finishNormal)).rgb * w.x;
float grain = grainSample(vFinishPos, finishNormal);
diffuseColor.rgb = paint * (0.92 + (grain - 0.5) * 0.35 * (1.0 - data.b));`
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
// Printed stripes and labels are a little glossier than the grained plastic
roughnessFactor = clamp(mix(0.66, 0.4, data.b) - (grain - 0.5) * 0.25, 0.3, 0.9);`
      )
      .replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>
float finishHeight = data.r * 0.8 + grain * 0.12 * (1.0 - data.b);
normal = finishPerturb(-vViewPosition, normal, vec2(dFdx(finishHeight), dFdy(finishHeight)) * 0.9, faceDirection);`
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
// LEDs glow in the game's colour, chasing along each row
float chase = 0.35 + 0.65 * pow(0.5 + 0.5 * sin(time * 6.0 - vFinishPos.x * 45.0), 2.0);
totalEmissiveRadiance += accent * data.g * chase * 3.0;`
      );
  };

  let parts: CabinetParts | null = null;
  const paint = () => {
    if (!parts) return;
    const next = {
      front: sheetTextures(paintFront(parts)),
      top: sheetTextures(paintTop(parts)),
      side: sheetTextures(paintSide(parts)),
    };
    Object.values(textures).flat().forEach((texture) => texture.dispose());
    textures = next;
    uniforms.frontColor.value = next.front[0];
    uniforms.frontData.value = next.front[1];
    uniforms.topColor.value = next.top[0];
    uniforms.topData.value = next.top[1];
    uniforms.sideColor.value = next.side[0];
    uniforms.sideData.value = next.side[1];
  };

  return {
    material,
    // Tween this to recolour the LEDs
    accent,
    update(seconds: number) {
      uniforms.time.value = seconds;
    },
    // Where the cabinet stands now (its group's world matrix), so the paint moves with it
    setFrame(cabinetMatrix: Matrix4) {
      uniforms.frame.value.copy(cabinetMatrix).invert();
    },
    // Paint the sheets for the loaded model; again once the lettering's font arrives
    decorate(cabinetParts: CabinetParts) {
      parts = cabinetParts;
      uniforms.boxMin.value.copy(parts.cabinet.min);
      uniforms.boxSize.value.copy(parts.cabinet.getSize(new Vector3()));
      paint();
      whenFontReady(CABINET_FONT).then(paint);
    },
    dispose() {
      parts = null;
      grain.dispose();
      Object.values(textures).flat().forEach((texture) => texture.dispose());
      material.dispose();
    },
  };
}
