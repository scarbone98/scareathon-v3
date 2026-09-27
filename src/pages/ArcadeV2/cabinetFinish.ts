import { Box3, CanvasTexture, Color, LinearFilter, LinearMipmapLinearFilter, MeshStandardMaterial, RepeatWrapping, Vector3 } from "three";
import { canvasFont, whenFontReady, type ArcadeFont } from "./arcadeFonts.ts";

// The cabinet's black body, dressed as cassette-futurism hardware: graphite
// plastic with a fine pebbled grain, panel seams and screws, cream stencilled
// model numbers and labels, vent slots, amber indicator LEDs and bold 80s
// tri-stripes in the current game's colour.
//
// The model's UVs stretch unevenly, so everything is projected from the world's
// axes instead: a front sheet (x, y), a top sheet (x, z) and a side sheet (z, y),
// each painted in world units against the cabinet's measured parts.
//
// Each sheet packs three things into its channels:
//   red:   lightness, from graphite (0) to cream print (1); for stripes, their shade
//   green: accent mask, where the game's colour shows
//   blue:  height, 0.5 flat: seams and vents cut in, screws stand proud;
//          the very top (1) marks a glowing LED

export const CABINET_FONT: ArcadeFont = { family: "Michroma" };

// What the painter needs to know about the model, all world-space boxes
export type CabinetParts = {
  cabinet: Box3;
  screen: Box3; // the glass
  panel: Box3; // joysticks and buttons
  marquee: Box3;
};

const PX_PER_UNIT = 950; // sheet resolution: about a pixel per millimetre of cabinet

// --- Channel values ----------------------------------------------------------------
const FLAT = 128;
type Ink = { light: number; accent?: boolean; height?: number };
const ink = ({ light, accent = false, height = FLAT }: Ink) =>
  `rgb(${Math.round(light * 255)}, ${accent ? 255 : 0}, ${height})`;
const BASE = ink({ light: 0.04 });
const INSERT = ink({ light: 0.1 }); // the lighter grey of two-tone panels
const PRINT = ink({ light: 0.92, height: 136 });
const PRINT_DIM = ink({ light: 0.55, height: 132 });
const SEAM = ink({ light: 0, height: 60 });
const SLOT = ink({ light: 0, height: 18 });
const LED = ink({ light: 0.9, accent: true, height: 255 });
const STRIPE_SHADES = [1, 0.7, 0.42]; // brightest first

// A canvas laid over one face of the cabinet, drawn in world units
type Sheet = {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  // world (u, v) → canvas px
  x: (u: number) => number;
  y: (v: number) => number;
  s: (length: number) => number; // world length → px
};

function makeSheet(uMin: number, uMax: number, vMin: number, vMax: number, flipU = false): Sheet {
  const canvas = document.createElement("canvas");
  canvas.width = Math.round((uMax - uMin) * PX_PER_UNIT);
  canvas.height = Math.round((vMax - vMin) * PX_PER_UNIT);
  const context = canvas.getContext("2d")!;
  const k = canvas.width / (uMax - uMin);
  return {
    canvas,
    context,
    x: (u) => (flipU ? uMax - u : u - uMin) * k,
    // Canvas rows run down from vMax
    y: (v) => (vMax - v) * k,
    s: (length) => length * k,
  };
}

// --- Drawing helpers, all in world units -------------------------------------------------
function rect(sheet: Sheet, style: string, u0: number, v0: number, u1: number, v1: number) {
  const { context, x, y } = sheet;
  context.fillStyle = style;
  const left = Math.min(x(u0), x(u1));
  const top = Math.min(y(v0), y(v1));
  context.fillRect(left, top, Math.abs(x(u1) - x(u0)), Math.abs(y(v1) - y(v0)));
}

// A recessed seam around a rectangle, with a screw in each corner
function panel(sheet: Sheet, u0: number, v0: number, u1: number, v1: number, fill = INSERT, screws = true) {
  const { context, x, y, s } = sheet;
  rect(sheet, fill, u0, v0, u1, v1);
  context.strokeStyle = SEAM;
  context.lineWidth = Math.max(2, s(0.005));
  const left = Math.min(x(u0), x(u1));
  const top = Math.min(y(v0), y(v1));
  context.strokeRect(left, top, Math.abs(x(u1) - x(u0)), Math.abs(y(v1) - y(v0)));
  if (!screws) return;
  const inset = 0.018;
  for (const u of [u0 + inset * Math.sign(u1 - u0), u1 - inset * Math.sign(u1 - u0)]) {
    for (const v of [v0 + inset * Math.sign(v1 - v0), v1 - inset * Math.sign(v1 - v0)]) screw(sheet, u, v);
  }
}

function screw(sheet: Sheet, u: number, v: number, radius = 0.009) {
  const { context, x, y, s } = sheet;
  const cx = x(u);
  const cy = y(v);
  const r = Math.max(3, s(radius));
  // A domed head, with a cross cut into it
  const dome = context.createRadialGradient(cx, cy, 0, cx, cy, r);
  dome.addColorStop(0, ink({ light: 0.5, height: 230 }));
  dome.addColorStop(0.8, ink({ light: 0.3, height: 170 }));
  dome.addColorStop(1, ink({ light: 0.05, height: 90 }));
  context.fillStyle = dome;
  context.beginPath();
  context.arc(cx, cy, r, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = ink({ light: 0.08, height: 110 });
  context.lineWidth = Math.max(1, r * 0.22);
  context.beginPath();
  context.moveTo(cx - r * 0.55, cy);
  context.lineTo(cx + r * 0.55, cy);
  context.moveTo(cx, cy - r * 0.55);
  context.lineTo(cx, cy + r * 0.55);
  context.stroke();
}

// Rows of vent slots filling a rectangle
function vents(sheet: Sheet, u0: number, v0: number, u1: number, v1: number, pitch = 0.022, slot = 0.009) {
  const { context, x, y, s } = sheet;
  const radius = s(slot) / 2;
  const top = Math.max(v0, v1);
  const bottom = Math.min(v0, v1);
  for (let v = top - pitch / 2; v > bottom; v -= pitch) {
    const left = Math.min(x(u0), x(u1));
    const width = Math.abs(x(u1) - x(u0));
    context.fillStyle = SLOT;
    context.beginPath();
    context.roundRect(left, y(v) - radius, width, radius * 2, radius);
    context.fill();
  }
}

function text(sheet: Sheet, words: string, u: number, v: number, height: number, style = PRINT, align: CanvasTextAlign = "left", spacing = 0.12) {
  const { context, x, y, s } = sheet;
  const size = s(height);
  context.font = canvasFont(CABINET_FONT, size);
  context.fillStyle = style;
  context.textAlign = align;
  context.textBaseline = "alphabetic";
  context.letterSpacing = `${size * spacing}px`;
  context.fillText(words, x(u), y(v));
  context.letterSpacing = "0px";
}

function led(sheet: Sheet, u: number, v: number, radius = 0.006) {
  const { context, x, y, s } = sheet;
  // A dark bezel ring round a lit dot
  context.fillStyle = ink({ light: 0, height: 80 });
  context.beginPath();
  context.arc(x(u), y(v), s(radius * 1.7), 0, Math.PI * 2);
  context.fill();
  context.fillStyle = LED;
  context.beginPath();
  context.arc(x(u), y(v), s(radius), 0, Math.PI * 2);
  context.fill();
}

// Three stripes in the accent's shades, following a path of (u, v) points; each
// stripe runs parallel, stacked below the last
function triStripe(sheet: Sheet, points: [number, number][], widths = [0.04, 0.024, 0.012], gap = 0.01) {
  const { context, x, y, s } = sheet;
  let offset = 0;
  widths.forEach((width, i) => {
    context.strokeStyle = ink({ light: STRIPE_SHADES[i], accent: true, height: 134 });
    context.lineWidth = s(width);
    context.lineJoin = "miter";
    context.lineCap = "butt";
    const shift = offset + width / 2;
    context.beginPath();
    points.forEach(([u, v], j) => {
      const px = x(u);
      const py = y(v - shift);
      if (j === 0) context.moveTo(px, py);
      else context.lineTo(px, py);
    });
    context.stroke();
    offset += width + gap;
  });
}

// Diagonal warning stripes in a rectangle
function hazard(sheet: Sheet, u0: number, v0: number, u1: number, v1: number) {
  const { context, x, y, s } = sheet;
  const left = Math.min(x(u0), x(u1));
  const top = Math.min(y(v0), y(v1));
  const width = Math.abs(x(u1) - x(u0));
  const height = Math.abs(y(v1) - y(v0));
  context.save();
  context.beginPath();
  context.rect(left, top, width, height);
  context.clip();
  context.fillStyle = BASE;
  context.fillRect(left, top, width, height);
  context.fillStyle = PRINT_DIM;
  const band = s(0.014);
  for (let i = -height; i < width + height; i += band * 2) {
    context.beginPath();
    context.moveTo(left + i, top + height);
    context.lineTo(left + i + band, top + height);
    context.lineTo(left + i + band + height, top);
    context.lineTo(left + i + height, top);
    context.fill();
  }
  context.restore();
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
  const { cabinet, screen, panel: controls, marquee } = parts;
  const sheet = makeSheet(cabinet.min.x, cabinet.max.x, cabinet.min.y, cabinet.max.y);
  const { context } = sheet;
  context.fillStyle = BASE;
  context.fillRect(0, 0, sheet.canvas.width, sheet.canvas.height);
  const half = (cabinet.max.x - cabinet.min.x) / 2;
  const cx = (cabinet.min.x + cabinet.max.x) / 2;
  const edge = half * 0.8; // clear of the coloured trim down the sides
  const deck = controls.min.y; // where the control deck sits
  const lower = deck - 0.37; // top of the lower body's flat front

  // Lower body: a two-tone panel, a tri-stripe that kinks up to the right, the
  // model number and a coin door
  const bodyTop = lower - 0.03;
  panel(sheet, cx - edge, 0.07, cx + edge, bodyTop);
  triStripe(sheet, [
    [cx - edge, bodyTop * 0.62],
    [cx + edge * 0.05, bodyTop * 0.62],
    [cx + edge * 0.35, bodyTop * 0.9],
    [cx + edge, bodyTop * 0.9],
  ]);
  text(sheet, "SA-86", cx - edge + 0.035, 0.24, 0.085, PRINT, "left", 0.04);
  text(sheet, "SCAREATHON ARCADE SYSTEM", cx - edge + 0.037, 0.19, 0.017, PRINT_DIM);
  text(sheet, "SOLID STATE · 16-BIT · STEREO", cx - edge + 0.037, 0.16, 0.013, PRINT_DIM);
  // The coin door
  const doorLeft = cx + edge * 0.35;
  const doorRight = cx + edge - 0.035;
  panel(sheet, doorLeft, 0.11, doorRight, 0.36, ink({ light: 0.16 }));
  [0.4, 0.75].forEach((f) => {
    const u = doorLeft + (doorRight - doorLeft) * f;
    rect(sheet, ink({ light: 0.35, height: 170 }), u - 0.03, 0.2, u + 0.03, 0.32);
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

  // The control panel's front lip: the stripe across its full width, player labels under it
  const lipTop = deck - 0.035;
  triStripe(sheet, [[cabinet.min.x, lipTop], [cabinet.max.x, lipTop]], [0.022, 0.013, 0.007], 0.006);
  text(sheet, "PLAYER 1", cx - edge * 0.62, lipTop - 0.062, 0.011, PRINT, "center");
  text(sheet, "PLAYER 2", cx + edge * 0.62, lipTop - 0.062, 0.011, PRINT, "center");

  // The bezel round the screen: a fine frame, the badge above, labels below
  const glass = screen;
  const frame = 0.018;
  context.strokeStyle = PRINT_DIM;
  context.lineWidth = Math.max(1.5, sheet.s(0.0025));
  context.strokeRect(
    sheet.x(glass.min.x - frame),
    sheet.y(glass.max.y + frame),
    sheet.s(glass.max.x - glass.min.x + frame * 2),
    sheet.s(glass.max.y - glass.min.y + frame * 2)
  );
  const badge = glass.max.y + frame + 0.022;
  text(sheet, "SCAREATHON", glass.min.x - frame, badge, 0.02, PRINT, "left", 0.2);
  triStripe(sheet, [[glass.min.x + 0.3, badge + 0.019], [glass.max.x - 0.2, badge + 0.019]], [0.01, 0.006, 0.003], 0.004);
  text(sheet, "SA-86 VIDEO", glass.max.x + frame, badge, 0.014, PRINT_DIM, "right");
  const under = glass.min.y - frame - 0.03;
  led(sheet, glass.min.x + 0.005, under + 0.007);
  text(sheet, "POWER", glass.min.x + 0.02, under, 0.013, PRINT_DIM);
  text(sheet, "CH 03", glass.min.x + 0.12, under, 0.013, PRINT_DIM);
  text(sheet, "AUTO TRACKING", glass.max.x - 0.02, under, 0.013, PRINT_DIM, "right");
  led(sheet, glass.max.x + 0.005 - 0.01, under + 0.007);
  text(sheet, "▼ INSERT CARTRIDGE ▼", cx, under - 0.035, 0.011, PRINT, "center", 0.15);

  // The marquee's housing: screws either side
  [marquee.min.x - 0.022, marquee.max.x + 0.022].forEach((u) => {
    screw(sheet, u, marquee.min.y + 0.02);
    screw(sheet, u, marquee.max.y - 0.02);
  });
  return sheet.canvas;
}

function paintTop(parts: CabinetParts) {
  const { cabinet, panel: controls } = parts;
  // Rows run from the back (top of the canvas) to the front
  const sheet = makeSheet(cabinet.min.x, cabinet.max.x, -cabinet.max.z, -cabinet.min.z);
  const at = (z: number) => -z; // world z → this sheet's v
  const { context } = sheet;
  context.fillStyle = BASE;
  context.fillRect(0, 0, sheet.canvas.width, sheet.canvas.height);
  const cx = (cabinet.min.x + cabinet.max.x) / 2;
  const half = (cabinet.max.x - cabinet.min.x) / 2;
  // A stripe along the deck's front edge, player badges in front of each stick
  const front = controls.max.z + 0.05;
  triStripe(sheet, [[cabinet.min.x, at(front + 0.03)], [cabinet.max.x, at(front + 0.03)]], [0.012, 0.007, 0.004], 0.004);
  const sticks = [controls.min.x + 0.03, cx + (controls.max.x - controls.min.x) * 0.05 + 0.03];
  ["1P", "2P"].forEach((label, i) => {
    const u = sticks[i];
    rect(sheet, ink({ light: 0.92, accent: true, height: 134 }), u - 0.028, at(front - 0.012), u + 0.028, at(front - 0.045));
    text(sheet, label, u, at(front - 0.019), 0.022, ink({ light: 0.02, height: 124 }), "center", 0.05);
  });
  // The roof: a vent grille
  vents(sheet, cx - half * 0.6, at(cabinet.min.z + 0.15), cx + half * 0.6, at(cabinet.min.z + 0.4), 0.03, 0.012);
  return sheet.canvas;
}

function paintSide(parts: CabinetParts) {
  const { cabinet } = parts;
  // Front to the right, as seen from the cabinet's left; the shader mirrors it for the right
  const sheet = makeSheet(cabinet.min.z, cabinet.max.z, cabinet.min.y, cabinet.max.y);
  const { context } = sheet;
  context.fillStyle = BASE;
  context.fillRect(0, 0, sheet.canvas.width, sheet.canvas.height);
  const { min, max } = cabinet;
  // A sweeping stripe, low at the back, rising toward the front
  triStripe(sheet, [
    [min.z, 0.55],
    [min.z + 0.35, 0.55],
    [min.z + 0.75, 1.05],
    [max.z, 1.05],
  ], [0.06, 0.035, 0.018], 0.014);
  text(sheet, "SA-86", min.z + 0.06, 0.3, 0.07, PRINT, "left", 0.04);
  text(sheet, "SCAREATHON ARCADE SYSTEM", min.z + 0.062, 0.25, 0.016, PRINT_DIM);
  vents(sheet, min.z + 0.08, 1.65, min.z + 0.3, 2.05);
  panel(sheet, min.z + 0.06, 1.45, min.z + 0.34, 1.58, INSERT);
  text(sheet, "SERIAL 0013-1986", min.z + 0.08, 1.5, 0.013, PRINT_DIM);
  text(sheet, "120V~ 60Hz 85W", min.z + 0.08, 1.475, 0.011, PRINT_DIM);
  hazard(sheet, min.z + 0.08, 1.525, min.z + 0.32, 1.555);
  return sheet.canvas;
}

function sheetTexture(canvas: HTMLCanvasElement) {
  const texture = new CanvasTexture(canvas);
  texture.minFilter = LinearMipmapLinearFilter;
  texture.magFilter = LinearFilter;
  texture.anisotropy = 8;
  return texture;
}

export function createCabinetFinish() {
  const grain = grainTexture();
  const blank = document.createElement("canvas");
  blank.width = blank.height = 4;
  const blankContext = blank.getContext("2d")!;
  blankContext.fillStyle = BASE;
  blankContext.fillRect(0, 0, 4, 4);
  const sheets = { front: sheetTexture(blank), top: sheetTexture(blank), side: sheetTexture(blank) };
  const accent = new Color("#ff7a1a");
  const uniforms = {
    grainMap: { value: grain },
    frontMap: { value: sheets.front },
    topMap: { value: sheets.top },
    sideMap: { value: sheets.side },
    boxMin: { value: new Vector3() },
    boxSize: { value: new Vector3(1, 1, 1) },
    accent: { value: accent },
  };

  const material = new MeshStandardMaterial({ color: new Color("#ffffff"), roughness: 0.6, metalness: 0.05 });
  material.name = "CabinetFinish";
  material.emissive = new Color(0x222222);
  material.emissiveIntensity = 0.25;
  material.customProgramCacheKey = () => "cabinet-finish";
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vFinishPos;\nvarying vec3 vFinishNormal;")
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvFinishPos = (modelMatrix * vec4(position, 1.0)).xyz;\nvFinishNormal = normalize(mat3(modelMatrix) * normal);"
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
uniform sampler2D grainMap;
uniform sampler2D frontMap;
uniform sampler2D topMap;
uniform sampler2D sideMap;
uniform vec3 boxMin;
uniform vec3 boxSize;
uniform vec3 accent;
varying vec3 vFinishPos;
varying vec3 vFinishNormal;
// The decoration sheets, each on the faces that look its way. Faces looking
// down (under the control panel) take the front sheet, not the top's.
vec3 decorSample(vec3 p, vec3 n) {
  vec3 q = (p - boxMin) / boxSize;
  vec3 w = pow(abs(n), vec3(8.0));
  if (n.y < 0.0) { w.z += w.y; w.y = 0.0; }
  w /= max(w.x + w.y + w.z, 1e-4);
  vec3 front = texture2D(frontMap, q.xy).rgb;
  vec3 top = texture2D(topMap, vec2(q.x, 1.0 - q.z)).rgb;
  vec3 side = texture2D(sideMap, vec2(n.x > 0.0 ? 1.0 - q.z : q.z, q.y)).rgb;
  return front * w.z + top * w.y + side * w.x;
}
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
vec3 decor = decorSample(vFinishPos, finishNormal);
float grain = grainSample(vFinishPos, finishNormal);
float light = decor.r;
vec3 plastic = mix(vec3(0.028, 0.026, 0.033), vec3(0.82, 0.77, 0.66), light);
vec3 stripe = accent * mix(0.35, 1.05, light);
diffuseColor.rgb = mix(plastic, stripe, decor.g) * (0.92 + (grain - 0.5) * 0.35);`
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
// Printed stripes and labels are a little glossier than the grained plastic
float printed = max(decor.g, smoothstep(0.4, 0.8, light));
roughnessFactor = clamp(mix(0.66, 0.42, printed) - (grain - 0.5) * 0.25, 0.3, 0.9);`
      )
      .replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>
float finishHeight = decor.b * 0.8 + grain * 0.12 * (1.0 - printed);
normal = finishPerturb(-vViewPosition, normal, vec2(dFdx(finishHeight), dFdy(finishHeight)) * 0.9, faceDirection);`
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
// Indicator LEDs glow in the accent
totalEmissiveRadiance += accent * smoothstep(0.9, 0.98, decor.b) * decor.g * 2.5;`
      );
  };

  let parts: CabinetParts | null = null;
  const paint = () => {
    if (!parts) return;
    const next = {
      front: sheetTexture(paintFront(parts)),
      top: sheetTexture(paintTop(parts)),
      side: sheetTexture(paintSide(parts)),
    };
    Object.values(sheets).forEach((texture) => texture.dispose());
    Object.assign(sheets, next);
    uniforms.frontMap.value = next.front;
    uniforms.topMap.value = next.top;
    uniforms.sideMap.value = next.side;
  };

  return {
    material,
    // Tween this to recolour the stripes and LEDs
    accent,
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
      Object.values(sheets).forEach((texture) => texture.dispose());
      material.dispose();
    },
  };
}
