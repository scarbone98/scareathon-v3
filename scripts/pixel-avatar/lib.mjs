// Shared pieces of the pixel avatar pipeline: palette, parts (text grids or
// PNG strips), rigs, rendering and PNG encoding. See pixel-avatar/STYLE.md.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

export const ART_DIR = path.resolve("pixel-avatar");
// One avatar frame. The kid base stands 16x24 with its top-left at (8, 24),
// leaving headroom for hats and room either side for wings and held things.
export const WIDTH = 32;
export const HEIGHT = 48;

// Draw layers, back to front.
export const SLOTS = [
  "background", // backdrops, full canvas
  "back_fx", // auras behind the avatar
  "shadow", // the body's shadow on the ground
  "wings",
  "back", // capes, packs
  "hair_back", // hair that falls behind the body
  "body",
  "face_paint", // blush, stitches, war paint
  "legs", // trousers, skirts
  "feet", // shoes
  "torso", // shirts, sweaters
  "outer", // jackets, coats
  "neck", // scarves, collars
  "hair",
  "face_acc", // glasses, masks
  "head", // hats, horns, ears
  "held",
  "companion", // pets that float or sit beside you
  "front_fx", // sparkles over everything
];

// What can be worn together: up to this many items of a category.
export const CATEGORIES = {
  body: 1,
  face_paint: 2,
  hair: 1,
  head: 1,
  face_acc: 1,
  neck: 1,
  torso: 1,
  outer: 1,
  legs: 1,
  feet: 1,
  back: 1,
  wings: 1,
  held: 1,
  companion: 1,
  aura: 1,
  background: 1,
};

// Where a part hangs. A body's rig moves each anchor per frame, so one hat
// fits every body that has a head.
//   head    hair, hats, glasses: follows the head
//   body    the upper body: tops, jackets, held things
//   ground  legs, feet, shadow: stays put
//   free    never moves (backgrounds, companions with their own frames)
export const ANCHORS = ["head", "body", "ground", "free"];

export const CHANNELS = ["skin", "hair", "eyes", "dye1", "dye2"];

export function loadPalette() {
  const raw = JSON.parse(fs.readFileSync(path.join(ART_DIR, "palette.json"), "utf8"));
  const ramps = {};
  for (const [name, hexes] of Object.entries(raw.ramps)) ramps[name] = hexes.map(hexToRgba);
  return { ramps, defaults: raw.defaults, choices: raw.choices };
}

export function hexToRgba(hex) {
  const n = parseInt(hex.slice(1, 7), 16);
  const alpha = hex.length === 9 ? parseInt(hex.slice(7, 9), 16) : 255;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, alpha];
}

export function toHex([r, g, b, a = 255]) {
  const hex = [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
  return `#${hex}${a === 255 ? "" : a.toString(16).padStart(2, "0")}`;
}

export function rgbKey(r, g, b) {
  return (r << 16) | (g << 8) | b;
}

// Ramps are 4 shades, 0 darkest to 3 lightest. A channel's default ramp is
// what parts are drawn in, and the browser recolours it by exact RGB, so its
// colours must not turn up in any other ramp.
export function validatePalette(palette) {
  const errors = [];
  for (const [name, ramp] of Object.entries(palette.ramps)) {
    if (ramp.length !== 4) errors.push(`palette: ramp ${name} has ${ramp.length} shades, needs 4`);
  }
  for (const channel of CHANNELS) {
    const ramp = palette.defaults[channel];
    if (!palette.ramps[ramp]) {
      errors.push(`palette: default ${channel} ramp "${ramp}" does not exist`);
      continue;
    }
    const keys = new Set(palette.ramps[ramp].map(([r, g, b]) => rgbKey(r, g, b)));
    if (keys.size !== 4) errors.push(`palette: ${ramp} repeats a colour; as the ${channel} default it can't`);
    for (const [name, other] of Object.entries(palette.ramps)) {
      if (name === ramp) continue;
      other.forEach(([r, g, b], shade) => {
        if (keys.has(rgbKey(r, g, b))) errors.push(`palette: ${name}.${shade} reuses a colour of ${ramp}, the ${channel} default`);
      });
    }
    for (const choice of palette.choices[channel] || []) {
      if (!palette.ramps[choice]) errors.push(`palette: ${channel} choice "${choice}" does not exist`);
    }
  }
  return errors;
}

// Text part format:
//   # comments
//   at: X,Y        canvas position of the grid's top-left, on the kid in frame 0
//   legend:
//     a = skin.3   a ramp and shade; a channel name (skin, hair, eyes, dye1,
//     b = ink.1    dye2) means "recoloured by the player"
//   --- 0          frame 0's grid ('.' is clear)
//   ...
//   --- 4          optional: frame 4 differs (blinks, swaying hair)
// Frames without a grid repeat frame 0.
export function parseTextPart(file) {
  const text = fs.readFileSync(file, "utf8");
  const sections = text.split(/^---[ \t]*(\d*)[ \t]*$/m);
  const head = sections[0];
  const part = { file, x: 0, y: 0, legend: {}, grids: {} };
  let inLegend = false;
  for (const rawLine of head.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trimEnd();
    if (!line.trim()) continue;
    if (inLegend && /^\s+\S/.test(line)) {
      const match = line.trim().match(/^(\S)\s*=\s*([a-z_0-9]+)\.([0-3])$/);
      if (!match) throw new Error(`${file}: bad legend line "${line.trim()}"`);
      part.legend[match[1]] = { ramp: match[2], shade: Number(match[3]) };
      continue;
    }
    inLegend = false;
    const [key, value] = line.split(/:\s*/, 2);
    if (key === "legend") inLegend = true;
    else if (key === "at") [part.x, part.y] = value.split(",").map((v) => Number(v.trim()));
    else throw new Error(`${file}: unknown header "${key}"`);
  }
  for (let i = 1; i < sections.length; i += 2) {
    const frame = sections[i] === "" ? 0 : Number(sections[i]);
    part.grids[frame] = sections[i + 1].split(/\r?\n/).map((row) => row.trimEnd()).filter((row) => row !== "");
  }
  if (!part.grids[0]) throw new Error(`${file}: needs a '--- 0' grid`);
  // Rows may leave off trailing '.'s.
  const width = Math.max(...Object.values(part.grids).flat().map((row) => row.length));
  for (const frame of Object.keys(part.grids)) part.grids[frame] = part.grids[frame].map((row) => row.padEnd(width, "."));
  return part;
}

export function validateTextPart(part, palette) {
  const errors = [];
  const where = path.relative(process.cwd(), part.file);
  const width = part.grids[0][0]?.length ?? 0;
  const height = part.grids[0].length;
  for (const [frame, rows] of Object.entries(part.grids)) {
    if (rows.length !== height) errors.push(`${where}: frame ${frame} is ${rows.length} tall, frame 0 is ${height}`);
    rows.forEach((row, i) => {
      if (row.length !== width) errors.push(`${where}: frame ${frame} row ${i + 1} is ${row.length} wide, expected ${width}`);
      for (const ch of row) {
        if (ch !== "." && !part.legend[ch]) errors.push(`${where}: frame ${frame} row ${i + 1} uses '${ch}', not in the legend`);
      }
    });
  }
  for (const [ch, { ramp }] of Object.entries(part.legend)) {
    if (!palette.ramps[ramp] && !CHANNELS.includes(ramp)) errors.push(`${where}: legend '${ch}' uses unknown ramp "${ramp}"`);
  }
  if (part.x < 0 || part.y < 0 || part.x + width > WIDTH || part.y + height > HEIGHT) {
    errors.push(`${where}: grid runs off the ${WIDTH}x${HEIGHT} canvas`);
  }
  return errors;
}

// Renders a text part to RGBA frames of its own size.
export function renderTextPart(part, palette) {
  const width = part.grids[0][0].length;
  const height = part.grids[0].length;
  const count = Math.max(...Object.keys(part.grids).map(Number)) + 1;
  const frames = [];
  for (let f = 0; f < count; f++) {
    const rows = part.grids[f] || part.grids[0];
    const rgba = new Uint8ClampedArray(width * height * 4);
    rows.forEach((row, y) => {
      [...row].forEach((ch, x) => {
        if (ch === ".") return;
        const { ramp, shade } = part.legend[ch];
        const name = CHANNELS.includes(ramp) ? palette.defaults[ramp] : ramp;
        rgba.set(palette.ramps[name][shade], (y * width + x) * 4);
      });
    });
    frames.push(rgba);
  }
  return { width, height, frames };
}

// PNG strip parts: frames side by side, `frameWidth` wide. Used for sprites
// imported as painted (the ghost), which keep their own colours.
export function readPngStrip(file, frameWidth) {
  const { width, height, rgba } = decodePng(fs.readFileSync(file));
  const count = Math.floor(width / frameWidth);
  const frames = [];
  for (let f = 0; f < count; f++) {
    const out = new Uint8ClampedArray(frameWidth * height * 4);
    for (let y = 0; y < height; y++) {
      out.set(rgba.subarray((y * width + f * frameWidth) * 4, (y * width + (f + 1) * frameWidth) * 4), y * frameWidth * 4);
    }
    frames.push(out);
  }
  return { width: frameWidth, height, frames };
}

// A rig: how many frames a body's idle loop has, how fast it plays, and where
// each anchor sits per frame relative to the kid. An anchor is one dy for
// every frame, or a list with an offset per frame (dy, or [dx, dy]).
export function normalizeRig(rig, where, errors) {
  const frames = rig?.frames;
  if (!Number.isInteger(frames) || frames < 1) {
    errors.push(`${where}: rig.frames must be a positive whole number`);
    return null;
  }
  if (!(rig.fps > 0)) errors.push(`${where}: rig.fps must be positive`);
  const anchors = {};
  for (const anchor of ANCHORS) {
    const given = rig.anchors?.[anchor] ?? (anchor === "free" ? 0 : undefined);
    if (given === undefined) continue;
    const list = Array.isArray(given) ? given : Array(frames).fill(given);
    if (list.length !== frames) errors.push(`${where}: rig anchor ${anchor} has ${list.length} offsets for ${frames} frames`);
    anchors[anchor] = Array.from({ length: frames }, (_, f) => {
      const o = list[f] ?? 0;
      return Array.isArray(o) ? o : [0, o];
    });
  }
  for (const anchor of Object.keys(rig.anchors || {})) {
    if (!ANCHORS.includes(anchor)) errors.push(`${where}: unknown rig anchor "${anchor}"`);
  }
  return { frames, fps: rig.fps, anchors };
}

// Recolours the channel defaults to the chosen ramps by exact RGB, the same
// way the browser does.
export function swapTable(palette, swaps) {
  const table = new Map();
  for (const [channel, target] of Object.entries(swaps)) {
    const from = palette.ramps[palette.defaults[channel]];
    const to = target && palette.ramps[target];
    if (!from || !to || target === palette.defaults[channel]) continue;
    from.forEach(([r, g, b], shade) => table.set(rgbKey(r, g, b), to[shade]));
  }
  return table;
}

// Alpha-over draw of `src` (w x h) onto a WIDTH x HEIGHT canvas at (left, top).
export function drawOver(target, src, w, h, left, top, table) {
  for (let y = 0; y < h; y++) {
    const ty = top + y;
    if (ty < 0 || ty >= HEIGHT) continue;
    for (let x = 0; x < w; x++) {
      const tx = left + x;
      if (tx < 0 || tx >= WIDTH) continue;
      const si = (y * w + x) * 4;
      const alpha = src[si + 3];
      if (!alpha) continue;
      let r = src[si], g = src[si + 1], b = src[si + 2];
      const swapped = table?.get(rgbKey(r, g, b));
      if (swapped) [r, g, b] = swapped;
      const ti = (ty * WIDTH + tx) * 4;
      if (alpha === 255) {
        target[ti] = r;
        target[ti + 1] = g;
        target[ti + 2] = b;
        target[ti + 3] = 255;
        continue;
      }
      const a = alpha / 255;
      const below = target[ti + 3] / 255;
      const out = a + below * (1 - a);
      target[ti] = Math.round((r * a + target[ti] * below * (1 - a)) / out);
      target[ti + 1] = Math.round((g * a + target[ti + 1] * below * (1 - a)) / out);
      target[ti + 2] = Math.round((b * a + target[ti + 2] * below * (1 - a)) / out);
      target[ti + 3] = Math.round(out * 255);
    }
  }
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

// Copies source onto target with alpha-over.
export function pasteImage(target, targetWidth, source, sourceWidth, sourceHeight, left, top) {
  for (let y = 0; y < sourceHeight; y++) {
    for (let x = 0; x < sourceWidth; x++) {
      const si = (y * sourceWidth + x) * 4;
      const a = source[si + 3] / 255;
      if (!a) continue;
      const ti = ((top + y) * targetWidth + left + x) * 4;
      for (let c = 0; c < 3; c++) target[ti + c] = Math.round(source[si + c] * a + target[ti + c] * (1 - a));
      target[ti + 3] = Math.max(target[ti + 3], source[si + 3]);
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

// Decodes 8-bit PNGs (RGBA, RGB, grey, grey+alpha or palette), which covers
// sprites exported from Aseprite and Godot projects.
export function decodePng(buffer) {
  let offset = 8;
  let width, height, colorType, palette, transparency;
  const idat = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      colorType = data[9];
      if (data[8] !== 8 || data[12] !== 0) throw new Error("Only 8-bit, non-interlaced PNGs are supported");
    } else if (type === "PLTE") palette = data;
    else if (type === "tRNS") transparency = data;
    else if (type === "IDAT") idat.push(data);
    offset += 12 + length;
  }
  const bpp = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const rgba = new Uint8ClampedArray(width * height * 4);
  const stride = width * bpp;
  let previous = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? line[i - bpp] : 0;
      const b = previous[i];
      const c = i >= bpp ? previous[i - bpp] : 0;
      let add = 0;
      if (filter === 1) add = a;
      else if (filter === 2) add = b;
      else if (filter === 3) add = (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        add = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      line[i] = (line[i] + add) & 255;
    }
    previous = line;
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      if (colorType === 6) rgba.set(line.subarray(x * 4, x * 4 + 4), o);
      else if (colorType === 2) rgba.set([...line.subarray(x * 3, x * 3 + 3), 255], o);
      else if (colorType === 3) {
        const k = line[x];
        rgba.set([...palette.subarray(k * 3, k * 3 + 3), transparency && k < transparency.length ? transparency[k] : 255], o);
      } else if (colorType === 4) rgba.set([line[x * 2], line[x * 2], line[x * 2], line[x * 2 + 1]], o);
      else rgba.set([line[x], line[x], line[x], 255], o);
    }
  }
  return { width, height, rgba };
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
