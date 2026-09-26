// Shared pieces of the avatar art pipeline: palette, part parsing, rendering,
// ramp swapping and PNG encoding. See avatar-art/STYLE.md for the rules.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

export const ART_DIR = path.resolve("avatar-art");
export const WIDTH = 120;
export const HEIGHT = 150;
export const CENTER_X = WIDTH / 2;

// Body builds. Parts can be fitted to one build; unfitted parts suit both.
export const BUILDS = ["f", "m"];

// Draw layers, back to front. An item can put parts in any of these; that is
// how things wrap around the body (a katana on the back puts its scabbard in
// `back` and its strap in `strap`). See STYLE.md for what goes where.
export const SLOTS = [
  "background", // scenes and backdrops, full canvas
  "back_fx", // auras and glows behind the avatar
  "wings", // wings, big tails
  "back", // things worn on the back: sheathed weapons, packs, cape backs, hood insides
  "hair_back", // hair behind the head
  "held_back", // held-item parts behind the body or hand: grips, far-hand props
  "body",
  "face_paint",
  "eyes",
  "mouth",
  "brows",
  "legwear", // stockings, tights, socks
  "legs", // trousers, skirts
  "feet", // shoes, boots
  "torso", // shirts, tops
  "waist", // belts, sashes, hip sheaths, pouches
  "outer", // coats, jackets, cape fronts
  "strap", // straps and bandoliers across the chest
  "neck", // scarves, collars, necklaces
  "hands", // gloves, bracelets, rings
  "face_acc", // masks, glasses, eyepatches
  "hair_front", // fringe and front locks
  "hair_acc", // clips, ribbons, flowers
  "head", // hats, hoods, horns, crowns
  "held", // held items in front of everything
  "companion", // familiars on the shoulder or floating nearby
  "front_fx", // glows and particles over everything
];

// What can be worn together. Each item has one `category`; an outfit can hold
// up to this many items of a category. An item can also `occupy` extra
// categories (a two-handed scythe occupies held_near and held_far).
export const CATEGORIES = {
  body: 1,
  eyes: 1,
  mouth: 1,
  brows: 1,
  face_paint: 2,
  hair: 1,
  hair_acc: 2,
  head: 1,
  face_acc: 1,
  neck: 2,
  torso: 1,
  outer: 1,
  waist: 1,
  hands: 1,
  legs: 1,
  legwear: 1,
  feet: 1,
  back: 1,
  wings: 1,
  held_near: 1,
  held_far: 1,
  companion: 1,
  aura: 1,
  background: 1,
};

export function loadPalette() {
  const raw = JSON.parse(fs.readFileSync(path.join(ART_DIR, "palette.json"), "utf8"));
  const ramps = {};
  for (const [name, hexes] of Object.entries(raw.ramps)) {
    ramps[name] = hexes.map(hexToRgba);
  }
  return { ramps, swappable: raw.swappable };
}

function hexToRgba(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
}

export function rgbKey(r, g, b) {
  return (r << 16) | (g << 8) | b;
}

// Checks the palette itself: ramp sizes and colour uniqueness.
export function validatePalette(palette) {
  const errors = [];
  const seen = new Map();
  for (const [name, ramp] of Object.entries(palette.ramps)) {
    if (ramp.length !== 5) errors.push(`palette: ramp ${name} has ${ramp.length} shades, needs 5`);
    ramp.forEach(([r, g, b], shade) => {
      const key = rgbKey(r, g, b);
      if (seen.has(key)) errors.push(`palette: ${name}.${shade} duplicates ${seen.get(key)}`);
      seen.set(key, `${name}.${shade}`);
    });
  }
  return errors;
}

// Part file format:
//   # comments
//   at: X,Y          top-left of the grid (with mirror, only Y is used)
//   mirror: yes      rows are the left half; the right half is mirrored and
//                    the whole thing is centred on the canvas
//   outline: auto    add a 1px outline in shade 0 of the neighbouring ramp
//   legend:
//     a = skin.3
//   ---
//   ..aa..           '.' is always transparent
export function parsePart(file) {
  const text = fs.readFileSync(file, "utf8");
  const [head, body] = splitOnce(text, /^---\s*$/m);
  if (body === undefined) throw new Error(`${file}: missing '---' before the grid`);

  const part = { file, x: 0, y: 0, mirror: false, outline: "auto", legend: {} };
  let inLegend = false;
  for (const rawLine of head.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trimEnd();
    if (!line.trim()) continue;
    if (inLegend && /^\s+\S/.test(line)) {
      const match = line.trim().match(/^(\S)\s*=\s*([a-z_0-9]+)\.([0-4])$/);
      if (!match) throw new Error(`${file}: bad legend line "${line.trim()}"`);
      part.legend[match[1]] = { ramp: match[2], shade: Number(match[3]) };
      continue;
    }
    inLegend = false;
    const [key, value] = line.split(/:\s*/, 2);
    if (key === "legend") inLegend = true;
    else if (key === "at") [part.x, part.y] = value.split(",").map((v) => Number(v.trim()));
    else if (key === "mirror") part.mirror = value === "yes";
    else if (key === "outline") part.outline = value;
    else throw new Error(`${file}: unknown header "${key}"`);
  }

  part.rows = body.split(/\r?\n/).filter((row) => row.trim() !== "");
  return part;
}

function splitOnce(text, pattern) {
  const match = text.match(pattern);
  if (!match) return [text, undefined];
  return [text.slice(0, match.index), text.slice(match.index + match[0].length)];
}

export function validatePart(part, palette) {
  const errors = [];
  const where = path.relative(process.cwd(), part.file);
  const width = part.rows[0]?.length ?? 0;
  part.rows.forEach((row, i) => {
    if (row.length !== width) errors.push(`${where}: row ${i + 1} is ${row.length} wide, expected ${width}`);
    for (const ch of row) {
      if (ch !== "." && !part.legend[ch]) errors.push(`${where}: row ${i + 1} uses '${ch}' which is not in the legend`);
    }
  });
  for (const [ch, { ramp }] of Object.entries(part.legend)) {
    if (!palette.ramps[ramp]) errors.push(`${where}: legend '${ch}' uses unknown ramp "${ramp}"`);
  }
  const fullWidth = part.mirror ? width * 2 : width;
  const left = part.mirror ? CENTER_X - width : part.x;
  if (left < 0 || left + fullWidth > WIDTH || part.y < 0 || part.y + part.rows.length > HEIGHT) {
    errors.push(`${where}: grid runs off the ${WIDTH}x${HEIGHT} canvas`);
  }
  return errors;
}

// A layer is an RGBA buffer plus, per pixel, which ramp drew it (for outlines).
export function createLayer() {
  return { rgba: new Uint8ClampedArray(WIDTH * HEIGHT * 4), ramp: new Array(WIDTH * HEIGHT).fill(null) };
}

export function drawPart(layer, part, palette) {
  const own = createLayer();
  const rows = part.mirror ? part.rows.map((row) => row + [...row].reverse().join("")) : part.rows;
  const left = part.mirror ? CENTER_X - part.rows[0].length : part.x;

  rows.forEach((row, dy) => {
    [...row].forEach((ch, dx) => {
      if (ch === ".") return;
      const { ramp, shade } = part.legend[ch];
      setPixel(own, left + dx, part.y + dy, palette.ramps[ramp][shade], ramp);
    });
  });

  if (part.outline === "auto") addOutline(own, palette);
  blit(layer, own);
}

function setPixel(layer, x, y, rgba, ramp) {
  if (x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT) return;
  const i = y * WIDTH + x;
  layer.rgba.set(rgba, i * 4);
  layer.ramp[i] = ramp;
}

function addOutline(layer, palette) {
  const additions = [];
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const i = y * WIDTH + x;
      if (layer.ramp[i]) continue;
      for (const [nx, ny] of [[x, y - 1], [x - 1, y], [x + 1, y], [x, y + 1]]) {
        if (nx < 0 || ny < 0 || nx >= WIDTH || ny >= HEIGHT) continue;
        const neighbour = layer.ramp[ny * WIDTH + nx];
        if (neighbour) {
          additions.push([x, y, neighbour]);
          break;
        }
      }
    }
  }
  for (const [x, y, ramp] of additions) setPixel(layer, x, y, palette.ramps[ramp][0], ramp);
}

export function blit(target, source) {
  for (let i = 0; i < WIDTH * HEIGHT; i++) {
    if (source.rgba[i * 4 + 3] === 0) continue;
    target.rgba.set(source.rgba.subarray(i * 4, i * 4 + 4), i * 4);
    target.ramp[i] = source.ramp[i];
  }
}

// Recolours canonical swappable ramps, e.g. { skin: "skin_zombie", dye1: "blood" }.
// Works on raw RGBA by exact colour, the same way the browser will.
export function swapRamps(rgba, swaps, palette) {
  const lookup = new Map();
  for (const [from, to] of Object.entries(swaps)) {
    if (!to || from === to) continue;
    palette.ramps[from].forEach(([r, g, b], shade) => {
      lookup.set(rgbKey(r, g, b), palette.ramps[to][shade]);
    });
  }
  if (!lookup.size) return rgba;
  const out = new Uint8ClampedArray(rgba);
  for (let i = 0; i < out.length; i += 4) {
    if (out[i + 3] === 0) continue;
    const replacement = lookup.get(rgbKey(out[i], out[i + 1], out[i + 2]));
    if (replacement) out.set(replacement.slice(0, 3), i);
  }
  return out;
}

export function scaleImage(rgba, width, height, scale) {
  const out = new Uint8ClampedArray(width * scale * height * scale * 4);
  for (let y = 0; y < height * scale; y++) {
    for (let x = 0; x < width * scale; x++) {
      const si = (Math.floor(y / scale) * width + Math.floor(x / scale)) * 4;
      out.set(rgba.subarray(si, si + 4), (y * width * scale + x) * 4);
    }
  }
  return out;
}

export function fillImage(width, height, rgba) {
  const out = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < out.length; i += 4) out.set(rgba, i);
  return out;
}

// Alpha-over blend (sprites are fully opaque or fully clear, so this is a copy).
export function pasteImage(target, targetWidth, source, sourceWidth, sourceHeight, left, top) {
  for (let y = 0; y < sourceHeight; y++) {
    for (let x = 0; x < sourceWidth; x++) {
      const si = (y * sourceWidth + x) * 4;
      if (source[si + 3] === 0) continue;
      target.set(source.subarray(si, si + 4), ((top + y) * targetWidth + left + x) * 4);
    }
  }
}

export function encodePng(rgba, width, height) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4).copy(raw, y * (width * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  let c = ~0;
  for (const byte of Buffer.concat([typeBuf, data])) c = CRC_TABLE[(c ^ byte) & 255] ^ (c >>> 8);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(~c >>> 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}
