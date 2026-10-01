// Draws Mystery Crypt's placeholder ("stub") sprites: dialogue portraits,
// Wick's sprite and the crowned bosses. They're a first pass for a real
// artist to replace; see mystery-crypt-art/README.md for every file's size
// and layout.
//
//   npm run art:mystery-crypt
//
// Only files listed in mystery-crypt-art/stubs.json are (re)drawn. When a
// real sprite replaces one, delete its line there so this never overwrites it.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { encodePng } from "./pixel-avatar/lib.mjs";

const OUT = path.resolve("public/mystery-crypt");
const STUBS = JSON.parse(fs.readFileSync(path.resolve("mystery-crypt-art/stubs.json"), "utf8"));
const PREVIEW = path.resolve("mystery-crypt-art/preview.png");

// ---------- images ----------

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16), 255];

class Img {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.data = new Uint8Array(w * h * 4);
  }
  get(x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return [0, 0, 0, 0];
    const i = (y * this.w + x) * 4;
    return [...this.data.subarray(i, i + 4)];
  }
  set(x, y, c) {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h || !c) return;
    const rgba = typeof c === "string" ? hex(c) : c;
    this.data.set(rgba, (y * this.w + x) * 4);
  }
  rect(x, y, w, h, c) {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.set(xx, yy, c);
  }
  // Filled ellipse; `shade(x, y)` may pick a colour per pixel.
  ellipse(cx, cy, rx, ry, c, shade) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
        if (d <= 1) this.set(x, y, shade ? shade(x, y, d) : c);
      }
    }
  }
  pixels(x0, y0, rows, colors) {
    rows.forEach((row, y) => [...row].forEach((ch, x) => ch !== "." && this.set(x0 + x, y0 + y, colors[ch])));
  }
  paste(src, x0, y0, scale = 1) {
    for (let y = 0; y < src.h * scale; y++) {
      for (let x = 0; x < src.w * scale; x++) {
        const c = src.get(Math.floor(x / scale), Math.floor(y / scale));
        if (c[3] > 0) this.set(x0 + x, y0 + y, c);
      }
    }
  }
  crop(x, y, w, h) {
    const out = new Img(w, h);
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) out.set(xx, yy, this.get(x + xx, y + yy));
    return out;
  }
  bbox() {
    let x0 = this.w;
    let y0 = this.h;
    let x1 = -1;
    let y1 = -1;
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (this.get(x, y)[3] === 0) continue;
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
    }
    return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  }
  // A 1px dark line round everything drawn.
  outline(c = "#140a1c") {
    const edge = [];
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (this.get(x, y)[3] > 0) continue;
        if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => this.get(x + dx, y + dy)[3] > 0)) edge.push([x, y]);
      }
    }
    for (const [x, y] of edge) this.set(x, y, c);
  }
  save(file) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, encodePng(this.data, this.w, this.h));
  }
}

// Just enough PNG reading for the game's existing sprites (8-bit RGB, RGBA or palette).
function readPng(file) {
  const buf = fs.readFileSync(file);
  let o = 8;
  let w = 0;
  let h = 0;
  let type = 0;
  let palette = null;
  let trns = null;
  const idat = [];
  while (o < buf.length) {
    const len = buf.readUInt32BE(o);
    const kind = buf.toString("ascii", o + 4, o + 8);
    const data = buf.subarray(o + 8, o + 8 + len);
    if (kind === "IHDR") {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      if (data[8] !== 8) throw new Error(`${file}: only 8-bit PNGs`);
      type = data[9];
    } else if (kind === "PLTE") palette = data;
    else if (kind === "tRNS") trns = data;
    else if (kind === "IDAT") idat.push(data);
    o += 12 + len;
  }
  const bpp = { 2: 3, 3: 1, 6: 4, 4: 2, 0: 1 }[type];
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * bpp;
  const px = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const cur = raw[y * (stride + 1) + 1 + x];
      const a = x >= bpp ? px[y * stride + x - bpp] : 0;
      const b = y > 0 ? px[(y - 1) * stride + x] : 0;
      const c = x >= bpp && y > 0 ? px[(y - 1) * stride + x - bpp] : 0;
      const p = a + b - c;
      const pa = Math.abs(p - a);
      const pb = Math.abs(p - b);
      const pc = Math.abs(p - c);
      const paeth = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      px[y * stride + x] = (cur + [0, a, b, (a + b) >> 1, paeth][f]) & 255;
    }
  }
  const img = new Img(w, h);
  for (let i = 0; i < w * h; i++) {
    let rgba;
    if (type === 6) rgba = [px[i * 4], px[i * 4 + 1], px[i * 4 + 2], px[i * 4 + 3]];
    else if (type === 2) rgba = [px[i * 3], px[i * 3 + 1], px[i * 3 + 2], 255];
    else if (type === 4) rgba = [px[i * 2], px[i * 2], px[i * 2], px[i * 2 + 1]];
    else if (type === 0) rgba = [px[i], px[i], px[i], 255];
    else {
      const k = px[i];
      rgba = [palette[k * 3], palette[k * 3 + 1], palette[k * 3 + 2], trns && k < trns.length ? trns[k] : 255];
    }
    img.data.set(rgba, i * 4);
  }
  return img;
}

// ---------- faces ----------

export const FACES = ["normal", "happy", "shock", "sad", "angry"];
const INK = "#140a1c";

// Eyes, brows and mouth for a face centred at (cx, eyeY), mouth at mouthY.
function drawFace(img, face, cx, eyeY, mouthY, { gap = 5, eye = INK, skinShade = "#d8a080", glasses = null } = {}) {
  const L = cx - gap;
  const R = cx + gap;
  const eyes = {
    normal: () => {
      for (const x of [L, R]) {
        img.rect(x - 1, eyeY - 1, 2, 3, eye);
        img.set(x - 1, eyeY - 1, "#ffffff");
      }
    },
    happy: () => {
      for (const x of [L, R]) {
        img.set(x - 2, eyeY + 1, eye);
        img.set(x - 1, eyeY, eye);
        img.set(x, eyeY, eye);
        img.set(x + 1, eyeY + 1, eye);
      }
    },
    shock: () => {
      for (const x of [L, R]) {
        img.rect(x - 2, eyeY - 2, 4, 4, "#ffffff");
        img.rect(x - 1, eyeY - 1, 2, 2, eye);
      }
    },
    sad: () => {
      for (const x of [L, R]) {
        img.rect(x - 1, eyeY, 2, 2, eye);
      }
      // Brows tilted up in the middle.
      img.set(L - 2, eyeY - 2, INK);
      img.set(L - 1, eyeY - 3, INK);
      img.set(L, eyeY - 3, INK);
      img.set(R + 1, eyeY - 2, INK);
      img.set(R, eyeY - 3, INK);
      img.set(R - 1, eyeY - 3, INK);
    },
    angry: () => {
      for (const x of [L, R]) img.rect(x - 1, eyeY, 2, 2, eye);
      // Brows pointing down in the middle.
      img.set(L - 2, eyeY - 3, INK);
      img.set(L - 1, eyeY - 2, INK);
      img.set(L, eyeY - 2, INK);
      img.set(L + 1, eyeY - 1, INK);
      img.set(R + 1, eyeY - 3, INK);
      img.set(R, eyeY - 2, INK);
      img.set(R - 1, eyeY - 2, INK);
      img.set(R - 2, eyeY - 1, INK);
    },
  };
  eyes[face]();
  if (glasses) {
    for (const x of [L, R]) {
      img.rect(x - 3, eyeY - 3, 7, 1, glasses);
      img.rect(x - 3, eyeY + 3, 7, 1, glasses);
      img.rect(x - 3, eyeY - 3, 1, 7, glasses);
      img.rect(x + 3, eyeY - 3, 1, 7, glasses);
    }
    img.rect(L + 4, eyeY - 1, R - L - 7, 1, glasses);
  }
  const mouths = {
    normal: () => img.rect(cx - 1, mouthY, 3, 1, INK),
    happy: () => {
      img.rect(cx - 2, mouthY, 5, 1, INK);
      img.rect(cx - 1, mouthY + 1, 3, 1, "#b0304a");
      img.set(cx - 2, mouthY + 1, INK);
      img.set(cx + 2, mouthY + 1, INK);
      img.rect(cx - 1, mouthY + 2, 3, 1, INK);
    },
    shock: () => {
      img.rect(cx - 1, mouthY - 1, 3, 1, INK);
      img.rect(cx - 2, mouthY, 1, 2, INK);
      img.rect(cx + 2, mouthY, 1, 2, INK);
      img.rect(cx - 1, mouthY, 3, 2, "#5a1a2a");
      img.rect(cx - 1, mouthY + 2, 3, 1, INK);
    },
    sad: () => {
      img.rect(cx - 1, mouthY, 3, 1, INK);
      img.set(cx - 2, mouthY + 1, INK);
      img.set(cx + 2, mouthY + 1, INK);
    },
    angry: () => {
      img.rect(cx - 2, mouthY, 5, 1, INK);
      img.set(cx - 2, mouthY - 1, INK);
      img.set(cx + 2, mouthY - 1, INK);
    },
  };
  mouths[face]();
  void skinShade;
}

// Little marks that make a face read at a glance: sweat, tears, anger.
function drawMarks(img, face, x, y) {
  if (face === "shock") {
    img.pixels(x, y, [".b.", "bbb", "bwb", ".b."], { b: "#6ac8ff", w: "#e0f6ff" });
  } else if (face === "sad") {
    img.pixels(x - 26, y + 14, ["b", "b", "bb"], { b: "#6ac8ff" });
    for (let i = 0; i < 3; i++) img.rect(x - 18 + i * 5, y - 2, 1, 3, "#6a78c8");
  } else if (face === "angry") {
    img.pixels(x - 1, y, ["r.r", ".r.", "r.r"].map((r) => r), { r: "#ff3a4a" });
    img.pixels(x - 2, y - 1, ["rr.rr", "r...r", ".....", "r...r", "rr.rr"], { r: "#ff3a4a" });
  } else if (face === "happy") {
    img.pixels(x, y, [".y.", "yyy", ".y."], { y: "#ffe08a" });
    img.pixels(x - 30, y + 4, [".y.", "yyy", ".y."], { y: "#ffe08a" });
  }
}

// ---------- heroes ----------

const SKIN = "#f2c8a4";
const SKIN_SHADE = "#d8a07e";

const HEROES = {
  alex: {
    hairBack: (img, c) => {
      img.ellipse(24, 24, 15, 17, c.hair);
      img.rect(9, 24, 6, 20, c.hair);
      img.rect(33, 24, 6, 20, c.hair);
      img.rect(10, 30, 2, 14, c.hairShade);
      img.rect(36, 30, 2, 14, c.hairShade);
    },
    hairFront: (img, c) => {
      img.ellipse(24, 14, 13, 7, c.hair);
      img.rect(11, 14, 4, 12, c.hair);
      img.rect(33, 14, 4, 12, c.hair);
      // A side-swept fringe.
      for (let i = 0; i < 9; i++) img.rect(15 + i, 16, 1, 4 - Math.floor(i / 3), c.hair);
      img.rect(14, 12, 18, 1, c.hairLight);
      img.rect(12, 14, 2, 8, c.hairShade);
    },
    colors: { hair: "#f0b830", hairShade: "#c8882a", hairLight: "#ffd870", shirt: "#f0782a", shirtShade: "#c85a1a" },
    blush: true,
  },
  joe: {
    hairFront: (img, c) => {
      img.ellipse(24, 13, 13, 7, c.hair);
      img.rect(11, 12, 3, 9, c.hair);
      img.rect(34, 12, 3, 9, c.hair);
      // Fringe tufts.
      img.pixels(13, 17, ["hh.hhh.hh.hhh.hhh.hhhh", ".h..h...h...h...h....h"], { h: c.hair });
      // The cowlick.
      img.pixels(30, 3, ["..h", ".hh", "hh.", "h.."], { h: c.hair });
      img.rect(15, 9, 16, 1, c.hairLight);
    },
    colors: { hair: "#d8b060", hairShade: "#a88040", hairLight: "#f0d890", shirt: "#3a8a6a", shirtShade: "#2a5a4a" },
    stripes: true,
  },
  matt: {
    hairFront: (img, c) => {
      img.ellipse(24, 13, 13, 7, c.hair);
      img.rect(11, 12, 3, 10, c.hair);
      img.rect(34, 12, 3, 8, c.hair);
      // Swept bangs, heavy on one side.
      for (let i = 0; i < 14; i++) img.rect(13 + i, 15, 1, Math.max(1, 6 - Math.floor(i / 2)), c.hair);
      img.pixels(8, 12, ["hhhh", "hhh.", "hh.."], { h: c.hair });
      img.rect(16, 9, 14, 1, c.hairLight);
    },
    colors: { hair: "#3a4a6a", hairShade: "#2a3450", hairLight: "#5a6a8a", shirt: "#d0405a", shirtShade: "#a02a40", inner: "#e8eaf0" },
    jacket: true,
  },
  jon: {
    hairFront: (img, c) => {
      img.ellipse(24, 13, 13, 7, c.hair);
      img.rect(11, 12, 3, 9, c.hair);
      img.rect(34, 12, 3, 9, c.hair);
      img.pixels(10, 2, ["...h......h.....", "..hh...h.hh..h..", ".hhh..hh.hhh.hh.", "hhhhhhhhhhhhhhhh"], { h: c.hair });
      img.pixels(13, 16, ["hhhhh.hhhhhhhhhhhhhhh", "h.h....h.h....h..h..h"], { h: c.hair });
    },
    colors: { hair: "#1e2238", hairShade: "#141828", hairLight: "#3a4060", shirt: "#2a7ad0", shirtShade: "#1a58a0", inner: "#f0f0f0" },
    glasses: "#e8eef8",
  },
};

function heroPortrait(id, face) {
  const h = HEROES[id];
  const c = h.colors;
  const img = new Img(48, 48);
  h.hairBack?.(img, c);
  // Shoulders and shirt.
  img.ellipse(24, 50, 18, 12, c.shirt, (x) => (x > 32 ? c.shirtShade : c.shirt));
  if (h.stripes) for (let y = 40; y < 48; y += 3) img.rect(7, y, 34, 1, c.shirtShade);
  if (h.jacket) {
    img.rect(20, 39, 8, 9, c.inner);
    img.rect(19, 39, 1, 9, c.shirtShade);
    img.rect(28, 39, 1, 9, c.shirtShade);
  }
  if (c.inner && !h.jacket) img.pixels(19, 38, ["ww....ww", ".ww..ww.", "..wwww.."], { w: c.inner });
  // Neck and head.
  img.rect(21, 33, 6, 6, SKIN_SHADE);
  img.ellipse(24, 23, 12, 13, SKIN, (x, y) => (x > 31 && y > 18 ? SKIN_SHADE : SKIN));
  img.ellipse(12, 24, 2, 3, SKIN);
  img.ellipse(36, 24, 2, 3, SKIN_SHADE);
  h.hairFront(img, c);
  if (h.blush) {
    img.rect(15, 27, 3, 1, "#f09090");
    img.rect(30, 27, 3, 1, "#f09090");
  }
  drawFace(img, face, 24, 23, 30, { glasses: h.glasses });
  img.outline();
  drawMarks(img, face, 38, 6);
  return img;
}

// ---------- Wick ----------

const WAX = "#f4e6c8";
const WAX_SHADE = "#d8c49a";
const WAX_DARK = "#b8a070";

function flame(img, cx, top, frame, big = 1) {
  const flicker = [0, 1, 0, -1][frame % 4];
  const h = Math.round((6 + (frame % 2)) * big);
  for (let y = 0; y < h; y++) {
    const w = Math.max(1, Math.round((Math.sin((y / h) * Math.PI) * 3 + 0.5) * big));
    const x0 = cx - Math.floor(w / 2) + (y < h / 2 ? flicker : 0);
    img.rect(x0, top + y, w, 1, y < h * 0.35 ? "#ffd36a" : "#ff8a1f");
  }
  img.rect(cx, top + Math.round(h * 0.45), 1, Math.max(1, Math.round(h * 0.35)), "#fff4c4");
}

// The partner in the dungeon: a small candle with a face, 16x24, four frames.
function wickSprite() {
  const sheet = new Img(16 * 4, 24);
  for (let f = 0; f < 4; f++) {
    const img = new Img(16, 24);
    const bob = f === 2 ? 1 : 0;
    // Body with a melted rim and drips.
    img.rect(4, 11 + bob, 8, 12 - bob, WAX);
    img.rect(10, 11 + bob, 2, 12 - bob, WAX_SHADE);
    img.rect(3, 11 + bob, 10, 2, WAX);
    img.set(4, 13 + bob, WAX);
    img.set(4, 14 + bob, WAX_SHADE);
    img.set(11, 13 + bob, WAX_SHADE);
    img.set(11, 14 + bob, WAX_SHADE);
    img.set(11, 15 + bob, WAX_DARK);
    img.rect(3, 22, 10, 1, WAX_SHADE);
    // Wick and flame.
    img.rect(7, 9 + bob, 1, 2, "#3a2a20");
    flame(img, 7, 2 + bob, f);
    // Face.
    img.rect(5, 15 + bob, 1, 2, INK);
    img.rect(9, 15 + bob, 1, 2, INK);
    img.set(5, 15 + bob, "#ffffff");
    img.set(9, 15 + bob, "#ffffff");
    img.rect(6, 18 + bob, 3, 1, INK);
    img.set(4, 17 + bob, "#f0a090");
    img.set(10, 17 + bob, "#f0a090");
    img.outline();
    sheet.paste(img, f * 16, 0);
  }
  return sheet;
}

function wickPortrait(face) {
  const img = new Img(48, 48);
  img.rect(12, 20, 24, 28, WAX);
  img.rect(30, 20, 6, 28, WAX_SHADE);
  img.ellipse(24, 20, 14, 4, WAX);
  // Drips down the front.
  img.rect(13, 24, 2, 7, WAX);
  img.rect(33, 24, 2, 10, WAX_SHADE);
  img.rect(13, 30, 2, 1, WAX_SHADE);
  img.rect(22, 14, 2, 5, "#3a2a20");
  flame(img, 22, 1, 0, 2);
  drawFace(img, face, 24, 30, 38, { gap: 6 });
  img.rect(14, 34, 3, 1, "#f0a090");
  img.rect(31, 34, 3, 1, "#f0a090");
  img.outline();
  drawMarks(img, face, 38, 12);
  return img;
}

// ---------- portraits from existing sprites ----------

// A bigger look at a sprite that already exists (camp residents, bosses),
// with marks for the expression. A real artist should draw proper faces.
// `zoom` picks out part of a big sprite: [x, y, w, h] of the first frame.
function spritePortrait(file, fw, fh, face, extra, zoom) {
  const sheet = readPng(file);
  const frame = sheet.crop(0, 0, fw, fh);
  const box = zoom ? { x: zoom[0], y: zoom[1], w: zoom[2], h: zoom[3] } : frame.bbox();
  const tight = frame.crop(box.x, box.y, box.w, box.h);
  const scale = Math.max(1, Math.floor(Math.min(48 / tight.w, 48 / tight.h)));
  const img = new Img(48, 48);
  const w = tight.w * scale;
  const h = tight.h * scale;
  const top = zoom ? Math.floor((48 - h) / 2) : 46 - h;
  img.paste(tight, Math.floor((48 - w) / 2), top, scale);
  extra?.(img, top);
  drawMarks(img, face, 40, 4);
  return img;
}

// ---------- bosses ----------

function crown(img, cx, top) {
  img.pixels(cx - 4, top, ["y.r.y.b.y", "yyyyyyyyy", "yoyyoyyoy", "yyyyyyyyy"], { y: "#ffcf4a", o: "#c88a1a", r: "#ff3a4a", b: "#6ae0ff" });
}

// The monster's own frames with a crown on top (6px taller).
function crowned(file, fw, fh, frames) {
  const src = readPng(file);
  const out = new Img(fw * frames, fh + 6);
  for (let f = 0; f < frames; f++) {
    const frame = src.crop(f * fw, 0, fw, fh);
    const tall = new Img(fw, fh + 6);
    tall.paste(frame, 0, 6);
    const box = frame.bbox();
    if (box) {
      // The crown sits on the tallest point, a little in from the middle.
      let top = 6 + box.y;
      let x = Math.round(box.x + box.w / 2);
      for (let y = box.y; y < box.y + box.h; y++) {
        const row = [...Array(fw).keys()].filter((xx) => frame.get(xx, y)[3] > 0);
        if (row.length) {
          x = Math.round((row[0] + row[row.length - 1]) / 2);
          top = 6 + y;
          break;
        }
      }
      crown(tall, x, top - 4);
    }
    out.paste(tall, f * fw, 0);
  }
  return out;
}

// ---------- build ----------

const P = (f) => path.resolve("public", f);
const BOSSES = {
  rat: ["sprites/rat.png", 16, 16, 6],
  pumpkin: ["sprites/pumpkin.png", 16, 16, 6],
  zombie: ["sprites/zombiesprite-1.png", 16, 24, 6],
  candle: ["sprites/candle.png", 32, 32, 6],
  scarecrow: ["sprites/scarecrow.png", 24, 48, 6],
  werewolf: ["sprites/werewolfsprite.png", 30, 26, 7],
  ufo: ["sprites/ufo.png", 32, 26, 6],
  shadowbeast: ["sprites/shadowbeast.png", 32, 32, 6],
  swampthing: ["sprites/swampthing.png", 34, 58, 6],
};

const portraitStrip = (draw) => {
  const strip = new Img(48 * FACES.length, 48);
  FACES.forEach((face, i) => strip.paste(draw(face), i * 48, 0));
  return strip;
};

const builders = {
  "wick.png": wickSprite,
  "portraits/alex.png": () => portraitStrip((f) => heroPortrait("alex", f)),
  "portraits/joe.png": () => portraitStrip((f) => heroPortrait("joe", f)),
  "portraits/matt.png": () => portraitStrip((f) => heroPortrait("matt", f)),
  "portraits/jon.png": () => portraitStrip((f) => heroPortrait("jon", f)),
  "portraits/wick.png": () => portraitStrip(wickPortrait),
  "portraits/snail.png": () => portraitStrip((f) => spritePortrait(path.join(OUT, "snail_king.png"), 51, 57, f)),
  "portraits/merchant.png": () => portraitStrip((f) => spritePortrait(path.join(OUT, "merchant.png"), 117, 99, f, null, [34, 0, 48, 48])),
  "portraits/owl.png": () => portraitStrip((f) => spritePortrait(path.join(OUT, "owl_tree.png"), 121, 108, f, null, [38, 24, 24, 24])),
  "portraits/ratking.png": () => portraitStrip((f) => spritePortrait(P("sprites/rat.png"), 16, 16, f, (img, top) => crown(img, 22, top - 3))),
  ...Object.fromEntries(Object.entries(BOSSES).map(([id, [file, fw, fh, n]]) => [`bosses/${id}.png`, () => crowned(P(file), fw, fh, n)])),
};

const written = [];
for (const file of STUBS.files) {
  const build = builders[file];
  if (!build) {
    console.error(`  ✗ no stub builder for ${file}`);
    process.exitCode = 1;
    continue;
  }
  build().save(path.join(OUT, file));
  written.push(file);
}
console.log(`drew ${written.length} stub${written.length === 1 ? "" : "s"} into public/mystery-crypt/`);

// A contact sheet of everything, 4x, for checking by eye.
const imgs = STUBS.files.map((f) => readPng(path.join(OUT, f)));
const sheetW = Math.max(...imgs.map((i) => i.w)) * 3;
const sheetH = imgs.reduce((sum, i) => sum + i.h * 3 + 6, 0);
const sheet = new Img(sheetW, sheetH);
sheet.rect(0, 0, sheetW, sheetH, "#2a2238");
let y = 0;
for (const i of imgs) {
  sheet.paste(i, 0, y, 3);
  y += i.h * 3 + 6;
}
sheet.save(PREVIEW);
