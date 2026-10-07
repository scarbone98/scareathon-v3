import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  RepeatWrapping,
  Shape,
  ShapeGeometry,
  SRGBColorSpace,
  type Material,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { canvasFont, whenFontReady, type ArcadeFont } from "./arcadeFonts.ts";

// A game cartridge crossed with an audio cassette: a plastic shell in the
// game's colour that tapers at the bottom like a cassette, over a gold edge
// connector for the slot. On the front, a cassette-style paper label with the
// game's name in a colour band and a still from its attract video, and below it
// a smoky window onto two tape reels that turn while the game is picked or playing.
// The plastic has a fine moulded grain and the paper a matte, fibrous one; some
// shells are clear, showing the circuit board and the tape spools inside.

export type CartridgeSize = { width: number; height: number; depth: number };

// Grey noise on a canvas, tiled: the plastic's moulded speckle, or the paper's fibres
function noiseTexture(paint: (context: CanvasRenderingContext2D, size: number) => void) {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const context = canvas.getContext("2d");
  if (context) paint(context, size);
  const texture = new CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = RepeatWrapping;
  return texture;
}
// Shared by every cartridge, made on first use
let plasticGrain: CanvasTexture | null = null;
let paperGrain: CanvasTexture | null = null;
function grains() {
  plasticGrain ??= noiseTexture((context, size) => {
    // Fine speckle over a faint mottle, around mid grey (the roughness map reads it too)
    const image = context.createImageData(size, size);
    for (let i = 0; i < size * size; i += 1) {
      const x = i % size;
      const y = Math.floor(i / size);
      const mottle = Math.sin(x * 0.07) * Math.sin(y * 0.05) * 18;
      const v = 150 + mottle + (Math.random() - 0.5) * 100;
      image.data[i * 4] = image.data[i * 4 + 1] = image.data[i * 4 + 2] = v;
      image.data[i * 4 + 3] = 255;
    }
    context.putImageData(image, 0, 0);
  });
  paperGrain ??= noiseTexture((context, size) => {
    // Short fibres every which way over a pale ground
    context.fillStyle = "rgb(220, 220, 220)";
    context.fillRect(0, 0, size, size);
    context.lineWidth = 1;
    for (let i = 0; i < 2600; i += 1) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const angle = Math.random() * Math.PI;
      const length = 3 + Math.random() * 9;
      context.strokeStyle = Math.random() < 0.5 ? "rgba(90, 90, 90, 0.18)" : "rgba(255, 255, 255, 0.25)";
      context.beginPath();
      context.moveTo(x, y);
      context.lineTo(x + Math.cos(angle) * length, y + Math.sin(angle) * length);
      context.stroke();
    }
  });
  return { plastic: plasticGrain, paper: paperGrain };
}

// The inside of a clear cartridge: a green circuit board with gold traces, a
// row of pads down to the edge connector, and a silkscreened name
function paintBoard(context: CanvasRenderingContext2D, name: string) {
  const { width, height } = context.canvas;
  context.fillStyle = "#0f5a34";
  context.fillRect(0, 0, width, height);
  // Traces: runs across, then turning down to the connector's pads
  context.strokeStyle = "#c9a23c";
  context.lineWidth = 2;
  let seed = [...name].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) >>> 0, 11);
  const random = () => {
    seed = (seed * 1103515245 + 12345) >>> 0;
    return (seed % 1000) / 1000;
  };
  for (let i = 0; i < 26; i += 1) {
    const x = 10 + random() * (width - 20);
    const y = 10 + random() * (height * 0.6);
    const across = (random() - 0.5) * width * 0.4;
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + across, y);
    context.lineTo(x + across, height - 6);
    context.stroke();
    context.fillStyle = "#e0bb55";
    context.beginPath();
    context.arc(x, y, 3, 0, Math.PI * 2);
    context.fill();
  }
  context.fillStyle = "#d8b24a";
  for (let x = 12; x < width - 12; x += 12) context.fillRect(x, height - 14, 7, 14);
  context.fillStyle = "rgba(235, 240, 230, 0.85)";
  context.font = "700 13px ui-monospace, monospace";
  context.fillText(`SCR-86 ${name.replace(/[‘’]/g, "'").toUpperCase().slice(0, 16)}`, 12, 20);
  context.fillText("REV B", width - 58, 20);
}

// The "something new" badge: a yellow dot with a red "!" (one picture, shared by every cartridge)
let badgePicture: CanvasTexture | null = null;
function badgeTexture() {
  if (badgePicture) return badgePicture;
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const context = canvas.getContext("2d");
  if (context) {
    context.fillStyle = "#3a2a00";
    context.beginPath();
    context.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "#ffd21f";
    context.beginPath();
    context.arc(size / 2, size / 2, size / 2 - 4, 0, Math.PI * 2);
    context.fill();
    // The "!": a tapered stroke over a dot
    context.fillStyle = "#e0201b";
    context.beginPath();
    context.moveTo(size / 2 - 6, 12);
    context.lineTo(size / 2 + 6, 12);
    context.lineTo(size / 2 + 3.5, 38);
    context.lineTo(size / 2 - 3.5, 38);
    context.closePath();
    context.fill();
    context.beginPath();
    context.arc(size / 2, 48, 5, 0, Math.PI * 2);
    context.fill();
  }
  badgePicture = new CanvasTexture(canvas);
  badgePicture.colorSpace = SRGBColorSpace;
  return badgePicture;
}

export type Cartridge = {
  group: Group;
  // The "!" badge on the top corner: something new here, not played yet
  setBadge: (on: boolean) => void;
  // Paint a frame from the attract video into the label's picture window.
  setPicture: (source: CanvasImageSource, width: number, height: number) => void;
  // 0 on the shelf, 1 picked; also turns the reels, faster the higher it is
  setHighlight: (amount: number) => void;
  // The barcode sticker on the back, in the cartridge's own space (it faces -z)
  sticker: { width: number; height: number; y: number; z: number };
  dispose: () => void;
};

// Three shell styles, all cassette-meets-cartridge:
//   tape:  the bottom tapers in like an audio cassette, two reels in a window
//   brick: boxy and square-cornered like a chunky VHS cart, grip ridges on top,
//          a full-width window strip along the bottom with its reels far apart
//   disc:  MiniDisc-like and lopsided, a square notch out of one corner, a sliding metal
//          shutter across the bottom with a slot onto a single reel, a
//          write-protect tab, index notches along the top
export type CartridgeStyle = "tape" | "brick" | "disc";
export const CARTRIDGE_STYLES: CartridgeStyle[] = ["tape", "brick", "disc"];

// Cartridges are landscape: height as a fraction of width
export const CARTRIDGE_ASPECT = 0.8;

const STICKER_WIDTH = 256;
const STICKER_HEIGHT = 216;

// Each shell style's tape type, printed on its label
const TAPE_TYPE: Record<CartridgeStyle, string> = { tape: "TYPE I", brick: "TYPE II", disc: "TYPE III" };
// The back sticker's notes are written in by hand
const MARKER = { family: "Permanent Marker" };

// Paper's look, printed over a finished label: faint fibres every which way and a
// fleck or two, so it reads as paper next to the plastic
function paperFibres(context: CanvasRenderingContext2D) {
  const { width, height } = context.canvas;
  context.save();
  context.lineWidth = 1;
  // (dark fibres and light ones gathered into a path each, and stroked once: thousands of
  // separate strokes a label added up across the cartridges)
  const dark = new Path2D();
  const light = new Path2D();
  for (let i = 0; i < (width * height) / 60; i += 1) {
    const x = Math.random() * width;
    const y = Math.random() * height;
    const angle = Math.random() * Math.PI;
    const length = 2 + Math.random() * 7;
    const fibre = Math.random() < 0.55 ? dark : light;
    fibre.moveTo(x, y);
    fibre.lineTo(x + Math.cos(angle) * length, y + Math.sin(angle) * length);
  }
  context.strokeStyle = "rgba(70, 55, 40, 0.07)";
  context.stroke(dark);
  context.strokeStyle = "rgba(255, 255, 255, 0.035)";
  context.stroke(light);
  context.fillStyle = "rgba(60, 45, 30, 0.12)";
  for (let i = 0; i < 40; i += 1) context.fillRect(Math.random() * width, Math.random() * height, 1 + Math.random(), 1 + Math.random());
  context.restore();
}

// The back sticker: white paper, the arcade's name, a barcode and the game's name
// The back sticker: cream paper, the arcade's name and the release year on a
// colour band, a barcode, the game's name, and a box of notes: whatever's been
// written in (a cheat code, a hidden message), or blank lines to write on.
// `title` is what's printed under the barcode (the name, or "Cassette Cart")
function paintSticker(context: CanvasRenderingContext2D, name: string, title: string, color: string, released: string, note: string, developer: string) {
  const { width, height } = context.canvas;
  const ink = "#1a1418";
  context.fillStyle = "#f3efe6";
  context.fillRect(0, 0, width, height);
  context.fillStyle = color;
  context.fillRect(0, 0, width, 20);
  context.textBaseline = "middle";
  if (released) {
    context.fillStyle = "rgba(255, 255, 255, 0.92)";
    context.font = "700 11px ui-monospace, monospace";
    context.textAlign = "right";
    context.fillText(`© ${released.toUpperCase()}`, width - 10, 11);
  }
  // Who made it, shrunk to fit if it's a long credit
  context.fillStyle = ink;
  context.textAlign = "left";
  const credit = (developer || "The Institute").toUpperCase();
  let size = 13;
  context.font = `700 ${size}px system-ui, sans-serif`;
  while (size > 8 && context.measureText(credit).width > width - 24) {
    size -= 1;
    context.font = `700 ${size}px system-ui, sans-serif`;
  }
  context.fillText(credit, 12, 32);
  // Bars from the name, so every cartridge's code is its own
  let seed = [...name].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) >>> 0, 7);
  let x = 14;
  while (x < width - 18) {
    seed = (seed * 1103515245 + 12345) >>> 0;
    const bar = 1 + (seed % 4);
    const gap = 1 + ((seed >> 8) % 3);
    context.fillRect(x, 42, bar, 48);
    x += bar + gap;
  }
  context.font = "600 12px ui-monospace, monospace";
  context.fillText(title.replace(/[‘’]/g, "'").toUpperCase().slice(0, 28), 12, 102);
  context.fillStyle = "rgba(26, 20, 24, 0.55)";
  context.font = "10px ui-monospace, monospace";
  context.fillText(`SCR-${(seed % 90000) + 10000}  NOT FOR RESALE`, 12, 116);

  // The notes box
  const box = { x: 10, y: 126, width: width - 20, height: height - 134 };
  context.strokeStyle = "rgba(26, 20, 24, 0.45)";
  context.lineWidth = 1;
  context.strokeRect(box.x + 0.5, box.y + 0.5, box.width, box.height);
  context.fillStyle = "rgba(26, 20, 24, 0.6)";
  context.font = "700 9px system-ui, sans-serif";
  context.fillText("NOTES", box.x + 6, box.y + 9);
  const lines = [box.y + 42, box.y + 66];
  if (note) {
    // Handwritten in blue marker, wrapped to the box
    context.fillStyle = "#23408e";
    context.font = canvasFont(MARKER, 15);
    const words = note.split(" ");
    const rows: string[] = [];
    let row = "";
    for (const word of words) {
      const next = row ? `${row} ${word}` : word;
      if (context.measureText(next).width > box.width - 16 && row) {
        rows.push(row);
        row = word;
      } else row = next;
    }
    if (row) rows.push(row);
    rows.slice(0, 3).forEach((text, i) => context.fillText(text, box.x + 8, box.y + 26 + i * 19));
  } else {
    context.strokeStyle = "rgba(26, 20, 24, 0.2)";
    lines.forEach((y) => {
      context.beginPath();
      context.moveTo(box.x + 8, y + 0.5);
      context.lineTo(box.x + box.width - 8, y + 0.5);
      context.stroke();
    });
  }
  paperFibres(context);
}

// A strip of masking tape, torn off the roll at both ends, with a word in black
// marker: all some cartridges have on the back
const TAPE_WIDTH = 256;
const TAPE_HEIGHT = 84;
function paintTape(context: CanvasRenderingContext2D, text: string) {
  const { width, height } = context.canvas;
  context.clearRect(0, 0, width, height);
  const top = 12;
  const bottom = height - 12;
  // Ragged torn ends, the long edges straight
  const tornEnd = (x: number, inward: number) => {
    const points: number[][] = [];
    for (let y = top; y <= bottom; y += 6) points.push([x + inward * Math.random() * 7, y]);
    points.push([x + inward * Math.random() * 7, bottom]);
    return points;
  };
  const right = tornEnd(width - 10, -1); // top to bottom
  const left = tornEnd(10, 1).reverse(); // bottom to top
  context.beginPath();
  [...right, ...left].forEach(([x, y], i) => (i ? context.lineTo(x, y) : context.moveTo(x, y)));
  context.closePath();
  context.fillStyle = "rgba(226, 208, 160, 0.94)";
  context.fill();
  context.save();
  context.clip();
  // Crepe paper's crinkle, running across the strip
  for (let x = 0; x < width; x += 3) {
    context.fillStyle = `rgba(120, 95, 50, ${Math.random() * 0.08})`;
    context.fillRect(x, top, 1 + Math.random() * 2, bottom - top);
  }
  // Grime along the edges, where it's been handled
  const grime = context.createLinearGradient(0, top, 0, bottom);
  grime.addColorStop(0, "rgba(90, 70, 40, 0.18)");
  grime.addColorStop(0.2, "rgba(90, 70, 40, 0)");
  grime.addColorStop(0.8, "rgba(90, 70, 40, 0)");
  grime.addColorStop(1, "rgba(90, 70, 40, 0.18)");
  context.fillStyle = grime;
  context.fillRect(0, 0, width, height);
  // Scrawled on in a hurry, a little crooked
  context.translate(width / 2, height / 2 + 2);
  context.rotate(-0.05);
  context.fillStyle = "#141014";
  context.font = canvasFont(MARKER, 40);
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, 0, 0);
  context.restore();
}

// The label, cassette style: the name in a colour band with three stripes under
// it, the picture, then a line of small print, all on cream paper
const LABEL_WIDTH = 400;
const LABEL_HEIGHT = 245;
const BAND = 46;
const PICTURE = { x: 12, y: BAND + 18, width: LABEL_WIDTH - 24, height: 150 };
const TITLE_MAX = 34;
const PAPER = "#efe6d2";
const INK = "#2a2126";
// Stills are copied at about this size: enough for the label, small to keep
const STILL_MAX = 480;

function paintLabel(
  context: CanvasRenderingContext2D,
  type: string,
  name: string,
  color: string,
  font: ArcadeFont,
  picture?: { source: CanvasImageSource; width: number; height: number },
  untitled = false
) {
  const { width, height } = context.canvas;
  if (untitled) {
    // No name, no print: the picture is the whole sticker, edge to edge
    context.fillStyle = "#120d18";
    context.fillRect(0, 0, width, height);
    if (picture) {
      const cover = Math.max(width / picture.width, height / picture.height);
      const w = picture.width * cover;
      const h = picture.height * cover;
      context.drawImage(picture.source, (width - w) / 2, (height - h) / 2, w, h);
    }
    paperFibres(context);
    return;
  }
  context.fillStyle = PAPER;
  context.fillRect(0, 0, width, height);

  // The colour band, and three stripes in its shades under it
  context.fillStyle = color;
  context.fillRect(0, 0, width, BAND);
  const shade = new Color(color);
  [
    [shade.clone().multiplyScalar(0.62), 5],
    [shade.clone().lerp(new Color("#ffffff"), 0.35), 3],
    [shade.clone().multiplyScalar(0.62), 2],
  ].reduce((y, [tone, thickness]) => {
    context.fillStyle = `#${(tone as Color).getHexString()}`;
    context.fillRect(0, y, width, thickness as number);
    return y + (thickness as number) + 2;
  }, BAND + 2);

  // Name, shrunk to fit, in the game's own font
  const label = name.replace(/[‘’]/g, "'").toUpperCase();
  let fontSize = TITLE_MAX;
  context.font = canvasFont(font, fontSize);
  while (context.measureText(label).width > width - 28 && fontSize > 14) {
    fontSize -= 2;
    context.font = canvasFont(font, fontSize);
  }
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.shadowColor = "rgba(0, 0, 0, 0.55)";
  context.shadowBlur = 6;
  context.fillStyle = "#fff8ee";
  context.fillText(label, width / 2, BAND / 2 + 1);
  context.shadowBlur = 0;

  // Picture window: the attract video still, or a dim colour wash until it loads
  context.save();
  context.beginPath();
  context.roundRect(PICTURE.x, PICTURE.y, PICTURE.width, PICTURE.height, 6);
  context.clip();
  if (picture) {
    // Like the cabinet screen: the still blurred behind, then the whole still
    // on top, so portrait games aren't cropped to a thin slice
    const cover = Math.max(PICTURE.width / picture.width, PICTURE.height / picture.height);
    const blur = document.createElement("canvas");
    blur.width = 24;
    blur.height = Math.round((24 * PICTURE.height) / PICTURE.width);
    const blurScale = cover * (blur.width / PICTURE.width);
    blur
      .getContext("2d")
      ?.drawImage(
        picture.source,
        (blur.width - picture.width * blurScale) / 2,
        (blur.height - picture.height * blurScale) / 2,
        picture.width * blurScale,
        picture.height * blurScale
      );
    context.imageSmoothingEnabled = true;
    context.drawImage(blur, PICTURE.x, PICTURE.y, PICTURE.width, PICTURE.height);
    context.fillStyle = "rgba(0, 0, 0, 0.4)";
    context.fillRect(PICTURE.x, PICTURE.y, PICTURE.width, PICTURE.height);
    const fit = Math.min(Math.min(PICTURE.width / picture.width, PICTURE.height / picture.height) * 1.15, cover);
    const w = picture.width * fit;
    const h = picture.height * fit;
    const top = h > PICTURE.height ? (PICTURE.height - h) * 0.2 : (PICTURE.height - h) / 2;
    context.drawImage(picture.source, PICTURE.x + (PICTURE.width - w) / 2, PICTURE.y + top, w, h);
  } else {
    const wash = context.createLinearGradient(0, PICTURE.y, 0, PICTURE.y + PICTURE.height);
    wash.addColorStop(0, `${color}66`);
    wash.addColorStop(1, "#0a060e");
    context.fillStyle = wash;
    context.fillRect(PICTURE.x, PICTURE.y, PICTURE.width, PICTURE.height);
  }
  context.restore();
  context.strokeStyle = INK;
  context.lineWidth = 2;
  context.beginPath();
  context.roundRect(PICTURE.x, PICTURE.y, PICTURE.width, PICTURE.height, 6);
  context.stroke();

  // Small print along the bottom, like a tape's side and length
  const printY = (PICTURE.y + PICTURE.height + height) / 2;
  context.fillStyle = INK;
  context.font = "700 12px ui-monospace, Menlo, Consolas, monospace";
  context.textBaseline = "middle";
  context.textAlign = "left";
  context.fillText("SIDE A", PICTURE.x + 2, printY);
  context.textAlign = "right";
  context.fillText(`SCAREATHON · ${type}`, width - PICTURE.x - 2, printY);
  paperFibres(context);
}

// A blank cassette's sticker, written on: a side letter in its box, ruled lines with
// the title in black marker across them, a stripe in the cart's colour, and the
// tape's small print along the bottom
function paintCassetteLabel(context: CanvasRenderingContext2D, text: string, color: string) {
  const { width, height } = context.canvas;
  context.fillStyle = "#f6f3ec";
  context.fillRect(0, 0, width, height);

  // Side A, printed in a box at the top left
  context.strokeStyle = INK;
  context.lineWidth = 2;
  context.strokeRect(14, 14, 34, 34);
  context.fillStyle = INK;
  context.font = "700 24px system-ui, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText("A", 31, 32);

  // The write-in lines, with the title written across the first
  context.strokeStyle = "rgba(42, 33, 38, 0.35)";
  context.lineWidth = 1.5;
  const rules = [96, 140];
  rules.forEach((y, i) => {
    context.beginPath();
    context.moveTo(i ? 18 : 62, y + 0.5);
    context.lineTo(width - 18, y + 0.5);
    context.stroke();
  });
  context.save();
  const left = 62;
  const room = width - left - 24;
  let size = 52;
  context.font = canvasFont(MARKER, size);
  while (context.measureText(text).width > room && size > 22) {
    size -= 2;
    context.font = canvasFont(MARKER, size);
  }
  context.translate(left + room / 2 + 4, rules[0] - size * 0.42);
  context.rotate(-0.035);
  context.fillStyle = "#141014";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, 0, 0);
  context.restore();

  // The stripe, in the cart's colour and a lighter shade, then the small print
  context.fillStyle = color;
  context.fillRect(0, 168, width, 22);
  context.fillStyle = `#${new Color(color).lerp(new Color("#ffffff"), 0.45).getHexString()}`;
  context.fillRect(0, 192, width, 6);
  context.fillStyle = INK;
  context.font = "700 12px ui-monospace, Menlo, Consolas, monospace";
  context.textAlign = "left";
  context.fillText("C-60", 18, 222);
  context.textAlign = "right";
  context.fillText("NORMAL POSITION · TYPE I", width - 18, 222);
  paperFibres(context);
}

// The shell's outline for a style, centred on the origin, extruded with rounded
// edges. `windowBand` is how far up from the bottom the reel window's band reaches.
// How big the disc shell's notch is, as a share of its width
const DISC_NOTCH = 0.065;

// The shell's face outline, pulled in by `inset` all round
function shellOutline(style: CartridgeStyle, width: number, height: number, windowBand: number, inset: number) {
  const x = width / 2 - inset;
  const top = height / 2 - inset;
  const bottom = -height / 2 + inset;
  const outline = new Shape();
  if (style === "tape") {
    const taper = width * 0.09;
    const corner = width * 0.045;
    outline.moveTo(-x + taper, bottom);
    outline.lineTo(x - taper, bottom);
    outline.lineTo(x, bottom + windowBand);
    outline.lineTo(x, top - corner);
    outline.quadraticCurveTo(x, top, x - corner, top);
    outline.lineTo(-x + corner, top);
    outline.quadraticCurveTo(-x, top, -x, top - corner);
    outline.lineTo(-x, bottom + windowBand);
  } else if (style === "brick") {
    // Square, with just the bottom corners clipped
    const clip = width * 0.03;
    outline.moveTo(-x + clip, bottom);
    outline.lineTo(x - clip, bottom);
    outline.lineTo(x, bottom + clip);
    outline.lineTo(x, top);
    outline.lineTo(-x, top);
    outline.lineTo(-x, bottom + clip);
  } else {
    // Small rounded corners, and a square notch out of the top right
    const corner = width * 0.03;
    const cut = width * DISC_NOTCH;
    outline.moveTo(-x + corner, bottom);
    outline.lineTo(x - corner, bottom);
    outline.quadraticCurveTo(x, bottom, x, bottom + corner);
    outline.lineTo(x, top - cut);
    outline.lineTo(x - cut, top - cut);
    outline.lineTo(x - cut, top);
    outline.lineTo(-x + corner, top);
    outline.quadraticCurveTo(-x, top, -x, top - corner);
    outline.lineTo(-x, bottom + corner);
    outline.quadraticCurveTo(-x, bottom, -x + corner, bottom);
  }
  outline.closePath();
  return outline;
}

function shellGeometry(style: CartridgeStyle, width: number, height: number, depth: number, windowBand: number, bevel = depth * 0.12) {
  const outline = shellOutline(style, width, height, windowBand, bevel);
  const core = depth - bevel * 2;
  const geometry = new ExtrudeGeometry(outline, {
    depth: core,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 3,
    curveSegments: 10,
  });
  geometry.translate(0, 0, -core / 2);
  return geometry;
}

// Where the two halves of the shell meet, halfway through its depth: the halves
// stand a hair apart with rounded edges, and this ring sits back in the gap
// between them, so the seam reads as a groove all round, as if it could clam open
function seamGeometry(style: CartridgeStyle, width: number, height: number, depth: number, windowBand: number) {
  const recess = depth * 0.06; // how far in from the outline the groove's floor sits
  const ring = shellOutline(style, width, height, windowBand, recess);
  ring.holes.push(shellOutline(style, width, height, windowBand, recess + width * 0.03));
  const thickness = depth * 0.08;
  const geometry = new ExtrudeGeometry(ring, { depth: thickness, bevelEnabled: false, curveSegments: 10 });
  geometry.translate(0, 0, -thickness / 2);
  return geometry;
}

// A tape reel's hub: a white ring with teeth pointing into its middle
function hubCanvas() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const context = canvas.getContext("2d")!;
  const c = 64;
  context.fillStyle = "#f4efe4";
  context.beginPath();
  context.arc(c, c, 60, 0, Math.PI * 2);
  context.fill();
  context.globalCompositeOperation = "destination-out";
  context.beginPath();
  context.arc(c, c, 34, 0, Math.PI * 2);
  context.fill();
  context.globalCompositeOperation = "source-over";
  context.fillStyle = "#f4efe4";
  for (let i = 0; i < 6; i += 1) {
    context.save();
    context.translate(c, c);
    context.rotate((i * Math.PI) / 3);
    context.fillRect(-5, -36, 10, 14);
    context.restore();
  }
  context.strokeStyle = "rgba(40, 30, 30, 0.5)";
  context.lineWidth = 3;
  context.beginPath();
  context.arc(c, c, 59, 0, Math.PI * 2);
  context.stroke();
  return canvas;
}

function roundedRect(width: number, height: number, radius: number) {
  const shape = new Shape();
  const x = width / 2;
  const y = height / 2;
  shape.moveTo(-x + radius, -y);
  shape.lineTo(x - radius, -y);
  shape.quadraticCurveTo(x, -y, x, -y + radius);
  shape.lineTo(x, y - radius);
  shape.quadraticCurveTo(x, y, x - radius, y);
  shape.lineTo(-x + radius, y);
  shape.quadraticCurveTo(-x, y, -x, y - radius);
  shape.lineTo(-x, -y + radius);
  shape.quadraticCurveTo(-x, -y, -x + radius, -y);
  return new ShapeGeometry(shape, 4);
}

export function createCartridge(
  name: string,
  color: string,
  font: ArcadeFont,
  size: CartridgeSize,
  style: CartridgeStyle = "tape",
  {
    clear = false,
    released = "",
    note = "",
    developer = "",
    untitled = false,
    tape = "",
    cassette = "",
    hologram = false,
    badge = false,
  }: {
    clear?: boolean; // a see-through shell in the game's colour, showing what's inside
    released?: string; // the release year, for the back sticker
    note?: string; // written in on the back sticker: a cheat code, a hidden message
    developer?: string; // who made it, printed on the back sticker
    untitled?: boolean; // no name on the label: the picture fills it
    tape?: string; // no sticker on the back, just a strip of masking tape with this written on
    cassette?: string; // a blank cassette cart: colourless clear shell, this written on a plain sticker
    hologram?: boolean; // a game that isn't made yet: the cart's only a flickering projection of itself
    badge?: boolean; // starts with the "!" badge on (see setBadge)
  } = {}
): Cartridge {
  const group = new Group();
  const { width, height, depth } = size;
  // A cassette cart's shell is clear and colourless, like a blank tape's, and always
  // the notched one
  if (cassette) {
    clear = true;
    style = "disc";
  }
  const shellColor = new Color(cassette ? "#c9d2d8" : color);

  // The plastic's grain, tiled a couple of times across the face (the shell's UVs are
  // in world units)
  const grain = grains();
  grain.plastic.repeat.set(1 / (width * 0.55), 1 / (width * 0.55));
  // Moulded plastic: a fine speckle, satin with a thin clear coat. A clear shell
  // is smooth, glossy and tinted, and doesn't hide what's behind it.
  const glow = clear ? 0.08 : 0.18;
  const shellMaterial = clear
    ? new MeshPhysicalMaterial({
        color: shellColor.clone().lerp(new Color("#ffffff"), 0.25),
        roughness: 0.12,
        metalness: 0,
        clearcoat: 1,
        clearcoatRoughness: 0.08,
        transparent: true,
        opacity: 0.62,
        depthWrite: false,
        emissive: shellColor.clone().multiplyScalar(glow),
      })
    : new MeshPhysicalMaterial({
        color: shellColor,
        roughness: 1,
        roughnessMap: grain.plastic,
        bumpMap: grain.plastic,
        bumpScale: 1.8,
        metalness: 0.05,
        clearcoat: 0.3,
        clearcoatRoughness: 0.45,
        emissive: shellColor.clone().multiplyScalar(glow),
      });
  const trimMaterial = new MeshStandardMaterial({
    color: shellColor.clone().multiplyScalar(0.45),
    roughness: 1,
    roughnessMap: grain.plastic,
    bumpMap: grain.plastic,
    bumpScale: 1.8,
    emissive: shellColor.clone().multiplyScalar(0.06),
  });
  const connectorMaterial = new MeshStandardMaterial({ color: new Color("#16131b"), roughness: 0.6 });
  const goldMaterial = new MeshStandardMaterial({ color: new Color("#d8a93a"), roughness: 0.3, metalness: 0.9 });
  const geometries: { dispose: () => void }[] = [];
  const addPart = (geometry: BufferGeometry, material: Material, x: number, y: number, z: number) => {
    geometries.push(geometry);
    const mesh = new Mesh(geometry, material);
    mesh.position.set(x, y, z);
    group.add(mesh);
    return mesh;
  };
  // A run of identical small parts (the contacts, the grip ridges, a chip's legs) as one
  // mesh: drawn one at a time they were most of a cartridge's draw calls, and with a row
  // of them flying about that's what slowed phones down
  const addRun = (geometry: BufferGeometry, material: MeshStandardMaterial, spots: [number, number, number][]) => {
    const merged = mergeGeometries(spots.map(([x, y, z]) => geometry.clone().translate(x, y, z)))!;
    geometry.dispose();
    return addPart(merged, material, 0, 0, 0);
  };

  // The shell: a cassette-shaped plastic body above an edge connector that goes into the slot
  const connectorHeight = height * 0.1;
  const bodyHeight = height - connectorHeight;
  const bodyBottom = -height / 2 + connectorHeight;
  const bodyTop = height / 2;
  // The band along the bottom where the reels show; the label fills the face above it
  const windowBand = bodyHeight * (style === "disc" ? 0.26 : style === "brick" ? 0.22 : 0.2);
  const front = depth / 2;
  // Two halves, front and back, a hair apart at the seam
  const gap = depth * 0.04;
  const half = (depth - gap) / 2;
  [-1, 1].forEach((side) => {
    addPart(shellGeometry(style, width, bodyHeight, half, windowBand, depth * 0.1), shellMaterial, 0, bodyBottom + bodyHeight / 2, side * (gap + half) / 2);
  });
  // The groove: the shell's own colour, a touch darker
  const seamMaterial = new MeshStandardMaterial({ color: shellColor.clone().multiplyScalar(0.85), roughness: 0.75 });
  addPart(seamGeometry(style, width, bodyHeight, depth, windowBand), seamMaterial, 0, bodyBottom + bodyHeight / 2, 0);
  // The edge connector: a thin board, striped with gold contacts on both faces
  const connectorDepth = depth * 0.26;
  addPart(new BoxGeometry(width * 0.74, connectorHeight * 1.2, connectorDepth), connectorMaterial, 0, bodyBottom - connectorHeight * 0.5, 0);
  const contacts = 16;
  const pitch = (width * 0.68) / contacts;
  addRun(
    new BoxGeometry(pitch * 0.58, connectorHeight * 0.62, connectorDepth * 1.12),
    goldMaterial,
    Array.from({ length: contacts }, (_, i) => [-width * 0.34 + pitch * (i + 0.5), bodyBottom - connectorHeight * 0.62, 0])
  );

  // The label, set in a darker recess, filling the face above the window band.
  // The brick's top carries grip ridges; the disc's label stops short of its notch.
  const labelWidth = width * (style === "disc" ? 0.8 : 0.86);
  const labelTop = bodyTop - width * (style === "brick" ? 0.085 : 0.035);
  const labelBottom = bodyBottom + windowBand + width * 0.012;
  const labelHeight = labelTop - labelBottom;
  const labelY = (labelTop + labelBottom) / 2;
  // The disc's label sits left, away from its notch
  const labelX = style === "disc" ? -width * 0.06 : 0;
  addPart(new PlaneGeometry(labelWidth + width * 0.03, labelHeight + width * 0.03), trimMaterial, labelX, labelY, front + 0.001);

  // The window onto the tape, in the band along the bottom: reels, each a white
  // hub with tape wound round it
  const windowY = bodyBottom + windowBand * 0.5;
  const windowHeight = windowBand * 0.72;
  // Reels are sized off the tape shell's window, so they match across shells
  const reelSize = bodyHeight * 0.2 * 0.72;
  const windowMaterial = new MeshStandardMaterial({
    color: new Color("#2c2328"),
    roughness: 0.18,
    metalness: 0.1,
    ...(clear ? { transparent: true, opacity: 0.2, depthWrite: false } : {}),
  });
  const tapeMaterial = new MeshStandardMaterial({
    color: new Color("#7a4a2a"),
    roughness: 0.25,
    metalness: 0.35,
    emissive: new Color("#3a1f0e"),
  });
  const hubTexture = new CanvasTexture(hubCanvas());
  hubTexture.colorSpace = SRGBColorSpace;
  const hubMaterial = new MeshStandardMaterial({ map: hubTexture, transparent: true, roughness: 0.5, alphaTest: 0.1 });
  const screwMaterial = new MeshStandardMaterial({ color: new Color("#b9b4ac"), roughness: 0.35, metalness: 0.8 });
  const reelMaterials = [windowMaterial, tapeMaterial, hubMaterial, screwMaterial];
  // Where each style's reels sit, and how much tape is wound on each
  const reels: { x: number; tape: number; hub: number }[] =
    style === "disc"
      ? [
          { x: -width * 0.04, tape: reelSize * 0.47, hub: reelSize * 0.3 },
          { x: width * 0.2, tape: reelSize * 0.36, hub: reelSize * 0.3 },
        ]
      : style === "brick"
        ? [
            { x: -width * 0.27, tape: windowHeight * 0.46, hub: windowHeight * 0.26 },
            { x: width * 0.27, tape: windowHeight * 0.32, hub: windowHeight * 0.26 },
          ]
        : [
            { x: -width * 0.13, tape: windowHeight * 0.47, hub: windowHeight * 0.3 },
            { x: width * 0.13, tape: windowHeight * 0.36, hub: windowHeight * 0.3 },
          ];
  if (style === "disc") {
    // A sliding metal shutter across the band, grooved where it slides, with
    // a slot cut through onto the reels
    const shutter = new MeshStandardMaterial({ color: new Color("#b8bcc2"), roughness: 0.38, metalness: 0.75 });
    reelMaterials.push(shutter);
    // Lined up with the label above it, edge to edge
    const shutterWidth = labelWidth;
    const slotWidth = width * 0.44;
    const reelX = width * 0.08; // the slot's middle, between the reels
    const edgeL = labelX - labelWidth / 2;
    const leftPart = reelX - slotWidth / 2 - edgeL;
    const rightPart = edgeL + shutterWidth - (reelX + slotWidth / 2);
    const shutterZ = front + depth * 0.03;
    const plateDepth = depth * 0.04;
    addPart(new BoxGeometry(leftPart, windowBand * 0.9, plateDepth), shutter, edgeL + leftPart / 2, windowY, shutterZ);
    addPart(new BoxGeometry(rightPart, windowBand * 0.9, plateDepth), shutter, reelX + slotWidth / 2 + rightPart / 2, windowY, shutterZ);
    addPart(new BoxGeometry(slotWidth, windowBand * 0.09, plateDepth), shutter, reelX, windowY + windowBand * 0.405, shutterZ);
    addPart(new BoxGeometry(slotWidth, windowBand * 0.09, plateDepth), shutter, reelX, windowY - windowBand * 0.405, shutterZ);
    addPart(roundedRect(slotWidth, windowHeight, windowHeight * 0.1), windowMaterial, reelX, windowY, front + 0.001);
    // The groove it slides in
    addPart(new BoxGeometry(labelWidth + width * 0.03, width * 0.006, depth * 0.02), trimMaterial, labelX, windowY + windowBand * 0.5, front + depth * 0.01);
    // Grip ridges down the strip right of the label, from under the notch most
    // of the way to the bottom, then the write-protect tab below them
    const ridgeX = labelX + labelWidth / 2 + width * 0.015 + width * 0.05;
    addPart(new BoxGeometry(width * 0.06, width * 0.035, depth * 0.06), trimMaterial, ridgeX, bodyBottom + width * 0.04, front + depth * 0.02);
    const ridges: [number, number, number][] = [];
    for (let y = bodyTop - width * (DISC_NOTCH + 0.03); y > bodyBottom + width * 0.075; y -= width * 0.016) ridges.push([ridgeX, y, front + depth * 0.02]);
    addRun(new BoxGeometry(width * 0.075, width * 0.009, depth * 0.08), trimMaterial, ridges);
  } else {
    const windowWidth = style === "brick" ? width * 0.8 : width * 0.46;
    addPart(roundedRect(windowWidth, windowHeight, windowHeight * (style === "brick" ? 0.12 : 0.3)), windowMaterial, 0, windowY, front + 0.001);
  }
  // The tape's run between the reels, along the bottom of the window (a clear
  // shell shows its whole run inside instead; the disc's slot is too narrow)
  if (!clear && style !== "disc") {
    const [first, last] = [reels[0], reels[reels.length - 1]];
    const from = first.x - first.tape * 0.6;
    const to = last.x + last.tape * 0.6;
    addPart(new PlaneGeometry(to - from, windowHeight * 0.07), tapeMaterial, (from + to) / 2, windowY - windowHeight * 0.36, front + 0.0012);
  }
  const hubs = reels.map((reel) => {
    addPart(new CircleGeometry(reel.tape, 28), tapeMaterial, reel.x, windowY, front + 0.0015);
    return addPart(new CircleGeometry(reel.hub, 20), hubMaterial, reel.x, windowY, front + 0.002);
  });
  // The brick's grip ridges across its top
  if (style === "brick") {
    addRun(
      new BoxGeometry(width * 0.7, width * 0.009, depth * 0.08),
      trimMaterial,
      Array.from({ length: 4 }, (_, i) => [0, bodyTop - width * 0.018 - i * width * 0.016, front + depth * 0.02])
    );
  }
  // A clear shell's insides: the circuit board behind the label, down into the
  // connector, a couple of chips on it, and the tape spools right through the band
  const insideMaterials: MeshStandardMaterial[] = [];
  let boardTexture: CanvasTexture | null = null;
  if (clear) {
    const boardCanvas = document.createElement("canvas");
    boardCanvas.width = 256;
    boardCanvas.height = 160;
    const boardContext = boardCanvas.getContext("2d");
    if (boardContext) paintBoard(boardContext, name);
    boardTexture = new CanvasTexture(boardCanvas);
    boardTexture.colorSpace = SRGBColorSpace;
    const board = new MeshStandardMaterial({ map: boardTexture, roughness: 0.6, side: DoubleSide });
    const chip = new MeshStandardMaterial({ color: new Color("#141216"), roughness: 0.45 });
    const spool = new MeshStandardMaterial({ color: new Color("#e9e4da"), roughness: 0.4 });
    insideMaterials.push(board, chip, spool);
    const boardBottom = bodyBottom - connectorHeight * 0.2;
    const boardTop = labelBottom + labelHeight * 0.85;
    addPart(new PlaneGeometry(width * 0.8, boardTop - boardBottom), board, 0, (boardTop + boardBottom) / 2, -depth * 0.12);
    [
      [-0.2, 0.62, 0.22, 0.2],
      [0.18, 0.7, 0.14, 0.14],
      [0.05, 0.4, 0.3, 0.1],
    ].forEach(([x, y, w, h]) => {
      addPart(
        new BoxGeometry(width * w, labelHeight * h, depth * 0.1),
        chip,
        width * x,
        labelBottom + labelHeight * y,
        -depth * 0.12 + depth * 0.06
      );
    });
    // A microchip on the board's back, above the sticker: a black body with a
    // row of silver legs down each long side and a dot by pin one
    const legMaterial = new MeshStandardMaterial({ color: new Color("#c9ccd1"), roughness: 0.3, metalness: 0.9 });
    const dotMaterial = new MeshStandardMaterial({ color: new Color("#d9d4c8"), roughness: 0.6 });
    insideMaterials.push(legMaterial, dotMaterial);
    const chipWidth = width * 0.24;
    const chipHeight = labelHeight * 0.18;
    const chipX = -width * 0.14;
    const chipY = labelBottom + labelHeight * 0.8;
    const boardBack = -depth * 0.12 - 0.0005;
    const chipDepth = depth * 0.07;
    addPart(new BoxGeometry(chipWidth, chipHeight, chipDepth), chip, chipX, chipY, boardBack - chipDepth / 2);
    addPart(new CircleGeometry(chipHeight * 0.1, 10), dotMaterial, chipX - chipWidth * 0.4, chipY + chipHeight * 0.22, boardBack - chipDepth - 0.0003).rotation.y = Math.PI;
    const legs: [number, number, number][] = [];
    for (let i = 0; i < 9; i += 1) {
      [-1, 1].forEach((side) => legs.push([chipX - chipWidth * 0.42 + (chipWidth * 0.84 * i) / 8, chipY + side * (chipHeight / 2 + chipHeight * 0.12), boardBack - chipDepth * 0.35]));
    }
    addRun(new BoxGeometry(chipWidth * 0.035, chipHeight * 0.28, chipDepth * 0.5), legMaterial, legs);

    // The tape's run, as in a cassette: off the bottom of one spool, round a
    // guide roller in each bottom corner, along the bottom over a felt pressure
    // pad on its spring, and back up onto the other
    const felt = new MeshStandardMaterial({ color: new Color("#b89a6a"), roughness: 1 });
    insideMaterials.push(felt);
    const ribbon = depth * 0.42; // the tape's width, running through the shell
    const tapeY = bodyBottom + windowBand * 0.14;
    const rollerRadius = width * 0.018;
    const [left, right] = [reels[0], reels[reels.length - 1]];
    const rollerX = [left.x - left.tape * 0.9, right.x + right.tape * 0.9];
    rollerX.forEach((x) => {
      addPart(new CylinderGeometry(rollerRadius, rollerRadius, ribbon * 1.15, 14), spool, x, tapeY + rollerRadius, 0).rotation.x = Math.PI / 2;
    });
    const strand = (x0: number, y0: number, x1: number, y1: number) => {
      const length = Math.hypot(x1 - x0, y1 - y0);
      const piece = addPart(new BoxGeometry(length, width * 0.004, ribbon), tapeMaterial, (x0 + x1) / 2, (y0 + y1) / 2, 0);
      piece.rotation.z = Math.atan2(y1 - y0, x1 - x0);
    };
    strand(rollerX[0] - rollerRadius, tapeY + rollerRadius, left.x - left.tape, windowY);
    strand(rollerX[0], tapeY, rollerX[1], tapeY);
    strand(rollerX[1] + rollerRadius, tapeY + rollerRadius, right.x + right.tape, windowY);
    const padX = (rollerX[0] + rollerX[1]) / 2;
    addPart(new BoxGeometry(width * 0.07, windowBand * 0.08, ribbon * 0.8), felt, padX, tapeY + windowBand * 0.06, 0);
    addPart(new BoxGeometry(width * 0.16, width * 0.004, ribbon * 0.6), legMaterial, padX, tapeY + windowBand * 0.12, 0).rotation.z = 0.04;

    // Each reel's tape as a spool through the shell's depth, on a white hub
    reels.forEach((reel) => {
      const spoolDepth = depth * 0.7;
      addPart(new CylinderGeometry(reel.tape, reel.tape, spoolDepth, 28), tapeMaterial, reel.x, windowY, 0).rotation.x = Math.PI / 2;
      addPart(new CylinderGeometry(reel.hub * 1.1, reel.hub * 1.1, spoolDepth * 1.1, 20), spool, reel.x, windowY, 0).rotation.x = Math.PI / 2;
    });
  }

  // Reels turn at a speed set by setHighlight
  let reelAngle = 0;
  let reelTime = performance.now();
  const spinReels = (amount: number) => {
    const now = performance.now();
    reelAngle -= Math.min((now - reelTime) / 1000, 0.1) * amount * 5;
    reelTime = now;
    hubs.forEach((hub) => {
      hub.rotation.z = reelAngle;
    });
  };

  // Screws, like a cassette's
  const screwGeometry = new CylinderGeometry(width * 0.013, width * 0.013, depth * 0.06, 12);
  const screwAt = (x: number, y: number) => {
    addPart(screwGeometry, screwMaterial, x, y, front + depth * 0.01).rotation.x = Math.PI / 2;
  };
  [-1, 1].forEach((side) => {
    if (style === "tape") {
      screwAt(side * width * 0.458, bodyTop - width * 0.022);
      screwAt(side * width * 0.33, windowY);
    } else if (style === "brick") {
      screwAt(side * width * 0.462, bodyTop - width * 0.03);
      screwAt(side * width * 0.462, bodyBottom + width * 0.03);
    } else if (side < 0) {
      screwAt(-width * 0.44, bodyTop - width * 0.028);
    }
  });

  // Little screws in the back's corners, holding the halves together (the tape
  // shell's bottom corners are tucked in by its taper; the disc's top right by its notch)
  const back = -depth / 2 - depth * 0.01;
  const backScrew = (x: number, y: number) => {
    addPart(screwGeometry, screwMaterial, x, y, back).rotation.x = Math.PI / 2;
  };
  const cornerX = width * 0.43;
  const topY = bodyTop - width * 0.04;
  const bottomY = bodyBottom + width * 0.045;
  const bottomX = style === "tape" ? cornerX - width * 0.08 : cornerX;
  backScrew(-cornerX, topY);
  backScrew(cornerX, style === "disc" ? topY - width * DISC_NOTCH : topY);
  backScrew(-bottomX, bottomY);
  backScrew(bottomX, bottomY);

  // The paper label on the front
  const canvas = document.createElement("canvas");
  canvas.width = LABEL_WIDTH;
  canvas.height = LABEL_HEIGHT;
  const context = canvas.getContext("2d");
  let picture: { source: CanvasImageSource; width: number; height: number } | undefined;
  const repaint = () => {
    if (context) {
      if (cassette) paintCassetteLabel(context, cassette, color);
      else paintLabel(context, TAPE_TYPE[style], name, color, font, picture, untitled);
    }
    texture.needsUpdate = true;
  };
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  repaint();
  // The first paint may use a fallback font; repaint once the game's font is ready
  whenFontReady(font).then(repaint);

  // Paper: matte, with a fibrous grain that catches the light differently from the plastic
  const labelMaterial = new MeshStandardMaterial({
    map: texture,
    roughness: 0.92,
    bumpMap: grain.paper,
    bumpScale: 1.2,
    emissive: new Color("#ffffff"),
    emissiveMap: texture,
    emissiveIntensity: 0.35,
  });
  addPart(new PlaneGeometry(labelWidth, labelHeight), labelMaterial, labelX, labelY, depth / 2 + 0.002);

  // A barcode sticker on the back: what the cabinet's scanner reads to preview the game
  // (or, with `tape`, no sticker: a strip of masking tape with a word on it)
  const stickerCanvas = document.createElement("canvas");
  stickerCanvas.width = tape ? TAPE_WIDTH : STICKER_WIDTH;
  stickerCanvas.height = tape ? TAPE_HEIGHT : STICKER_HEIGHT;
  const stickerContext = stickerCanvas.getContext("2d");
  const stickerTexture = new CanvasTexture(stickerCanvas);
  stickerTexture.colorSpace = SRGBColorSpace;
  stickerTexture.anisotropy = 4;
  const paintBack = () => {
    if (stickerContext) {
      if (tape) paintTape(stickerContext, tape);
      else paintSticker(stickerContext, name, cassette ? "Cassette Cart" : name, color, released, note, developer);
    }
    stickerTexture.needsUpdate = true;
  };
  paintBack();
  // The handwriting's font may arrive after the first paint
  if (note || tape || cassette) whenFontReady(MARKER).then(() => {
    paintBack();
    repaint();
  });
  const stickerMaterial = new MeshStandardMaterial({
    map: stickerTexture,
    roughness: tape ? 0.8 : 0.92,
    bumpMap: grain.paper,
    bumpScale: 1.2,
    transparent: Boolean(tape),
    alphaTest: tape ? 0.05 : 0,
  });
  const stickerWidth = width * (tape ? 0.5 : 0.62);
  const sticker = {
    width: stickerWidth,
    height: stickerWidth * (stickerCanvas.height / stickerCanvas.width),
    y: bodyBottom + bodyHeight * (tape ? 0.58 : 0.5),
    z: -depth / 2 - 0.002,
  };
  const backing = addPart(new PlaneGeometry(sticker.width, sticker.height), stickerMaterial, 0, sticker.y, sticker.z);
  backing.rotation.y = Math.PI;
  if (tape) backing.rotation.z = 0.06; // slapped on crooked

  // A hologram: every part see-through and glowing in a cool tint of the game's colour,
  // added onto what's behind it; the label stays readable, with scanlines rolling up it
  const holoTint = new Color(color).lerp(new Color("#7ff3ff"), 0.55);
  const holoMaterials: { material: MeshStandardMaterial; opacity: number }[] = [];
  let scanTexture: CanvasTexture | null = null;
  if (hologram) {
    const seen = new Set<MeshStandardMaterial>();
    group.traverse((child) => {
      const material = (child as Mesh).material as MeshStandardMaterial | undefined;
      if (!(child as Mesh).isMesh || !material || seen.has(material)) return;
      seen.add(material);
      const paper = material === labelMaterial || material === stickerMaterial;
      material.transparent = true;
      material.depthWrite = false;
      material.side = DoubleSide;
      material.alphaTest = 0;
      if (paper) {
        material.emissive = holoTint.clone();
        material.emissiveIntensity = 0.3;
      } else {
        material.blending = AdditiveBlending;
        material.color.copy(holoTint).multiplyScalar(0.25);
        material.emissive = holoTint.clone().multiplyScalar(0.35);
      }
      holoMaterials.push({ material, opacity: paper ? 0.5 : 0.2 });
    });
    const scanCanvas = document.createElement("canvas");
    scanCanvas.width = 4;
    scanCanvas.height = 64;
    const scan = scanCanvas.getContext("2d");
    if (scan) {
      for (let y = 0; y < 64; y += 4) {
        scan.fillStyle = `rgba(160, 250, 255, ${y % 16 === 0 ? 0.5 : 0.18})`;
        scan.fillRect(0, y, 4, 1.5);
      }
    }
    scanTexture = new CanvasTexture(scanCanvas);
    scanTexture.wrapS = scanTexture.wrapT = RepeatWrapping;
    scanTexture.repeat.set(1, 3);
    const scanMaterial = new MeshStandardMaterial({ map: scanTexture, transparent: true, depthWrite: false, blending: AdditiveBlending, emissive: holoTint, emissiveMap: scanTexture, emissiveIntensity: 0.8, color: new Color("#000000") });
    holoMaterials.push({ material: scanMaterial, opacity: 1 });
    addPart(new PlaneGeometry(width * 0.98, bodyHeight), scanMaterial, 0, bodyBottom + bodyHeight / 2, depth / 2 + 0.003);
  }
  // Flickers now and then, the scanlines rolling up
  const shimmer = () => {
    const t = performance.now() / 1000;
    const flicker = Math.sin(t * 37) > 0.97 ? 0.45 : 0.9 + 0.1 * Math.sin(t * 6.3);
    holoMaterials.forEach(({ material, opacity }) => (material.opacity = opacity * flicker));
    if (scanTexture) scanTexture.offset.y = -t * 0.35;
  };
  if (hologram) shimmer();

  // The badge, over the front's top right corner (made the first time it's wanted)
  let badgeMesh: Mesh | null = null;
  let badgeMaterial: MeshBasicMaterial | null = null;
  const setBadge = (on: boolean) => {
    if (on && !badgeMesh) {
      const radius = width * 0.075;
      badgeMaterial = new MeshBasicMaterial({ map: badgeTexture(), transparent: true });
      badgeMesh = addPart(new CircleGeometry(radius, 24), badgeMaterial, width / 2 - radius * 0.7, bodyTop - radius * 0.7, depth / 2 + 0.004);
    }
    if (badgeMesh) badgeMesh.visible = on;
  };
  if (badge) setBadge(true);

  return {
    group,
    sticker,
    setBadge,
    setPicture: (source, w, h) => {
      // Copy the frame now: the video element is released right after
      const copy = document.createElement("canvas");
      const scale = Math.min(1, STILL_MAX / Math.max(w, h));
      copy.width = Math.round(w * scale);
      copy.height = Math.round(h * scale);
      copy.getContext("2d")?.drawImage(source, 0, 0, copy.width, copy.height);
      picture = { source: copy, width: copy.width, height: copy.height };
      repaint();
    },
    setHighlight: (amount) => {
      spinReels(amount);
      if (hologram) {
        labelMaterial.emissiveIntensity = 0.3 + amount * 0.3;
        shellMaterial.emissive.copy(holoTint).multiplyScalar(0.35 + amount * 0.3);
        shimmer();
        return;
      }
      labelMaterial.emissiveIntensity = 0.35 + amount * 0.45;
      shellMaterial.emissive.copy(shellColor).multiplyScalar(glow + amount * 0.35);
    },
    dispose: () => {
      geometries.forEach((geometry) => geometry.dispose());
      [shellMaterial, trimMaterial, seamMaterial, connectorMaterial, goldMaterial, labelMaterial, stickerMaterial, ...reelMaterials, ...insideMaterials].forEach(
        (material) => material.dispose()
      );
      hubTexture.dispose();
      texture.dispose();
      stickerTexture.dispose();
      boardTexture?.dispose();
      scanTexture?.dispose();
      badgeMaterial?.dispose();
      holoMaterials.forEach(({ material }) => material.dispose());
    },
  };
}

// The label still for a video: …/game-recordings/Foo.mp4 → /game-recordings/stills/Foo.jpg,
// made by scripts/make-cartridge-stills.mjs (npm run stills:arcade). The videos are on
// Supabase Storage but the stills are served locally.
export function stillUrlFor(videoUrl: string) {
  return `/game-recordings/stills/${videoUrl.slice(videoUrl.lastIndexOf("/") + 1).replace(/\.mp4$/i, ".jpg")}`;
}

const VIDEO_FALLBACK_TIMEOUT = 8000;

// A picture for each cartridge label. Loads the pre-made stills (small, all at
// once); for any game without one, falls back to grabbing a frame from its
// attract video, one video at a time so phones aren't downloading a dozen clips
// at once. A video that stalls (iOS won't load a video that isn't playing) is
// given up on so it can't hold up the rest. Calls onFrame as each one arrives.
export function loadVideoStills(
  videoUrls: (string | undefined)[],
  onFrame: (index: number, source: CanvasImageSource, width: number, height: number) => void
) {
  let cancelled = false;
  let current: HTMLVideoElement | null = null;
  let timer = 0;
  const images: HTMLImageElement[] = [];
  const needVideo: number[] = [];
  let pending = 0;

  const release = (video: HTMLVideoElement) => {
    video.removeAttribute("src");
    video.load();
  };

  const nextVideo = () => {
    if (cancelled) return;
    const index = needVideo.shift();
    if (index === undefined) return;
    const video = document.createElement("video");
    current = video;
    video.crossOrigin = "anonymous";
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    let finished = false;
    const done = () => {
      if (finished) return;
      finished = true;
      window.clearTimeout(timer);
      release(video);
      nextVideo();
    };
    timer = window.setTimeout(done, VIDEO_FALLBACK_TIMEOUT);
    video.addEventListener("loadedmetadata", () => {
      video.currentTime = Math.min(2, (video.duration || 4) * 0.25);
    }, { once: true });
    video.addEventListener("seeked", () => {
      if (!cancelled && video.videoWidth) onFrame(index, video, video.videoWidth, video.videoHeight);
      done();
    }, { once: true });
    video.addEventListener("error", done, { once: true });
    video.src = videoUrls[index]!;
  };

  // Once every still has loaded or failed, work through the videos that had none
  const settled = () => {
    pending -= 1;
    if (pending === 0) nextVideo();
  };

  videoUrls.forEach((url, index) => {
    if (!url) return;
    pending += 1;
    const image = new Image();
    images.push(image);
    image.decoding = "async";
    image.onload = () => {
      if (!cancelled) onFrame(index, image, image.naturalWidth, image.naturalHeight);
      settled();
    };
    image.onerror = () => {
      needVideo.push(index);
      settled();
    };
    image.src = stillUrlFor(url);
  });

  return () => {
    cancelled = true;
    window.clearTimeout(timer);
    images.forEach((image) => {
      image.onload = image.onerror = null;
    });
    if (current) release(current);
  };
}
