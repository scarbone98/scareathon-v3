import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const SIZE = 64;
const SCALE = 4;
const OUT_SIZE = SIZE * SCALE;
const ROOT = path.resolve("public/avatar");

const slots = {
  body: ["default_body", "pale_body", "green_zombie_body"],
  pants: ["default_pants", "ripped_jeans", "dark_trousers"],
  shirts: ["default_shirt", "striped_shirt", "vampire_jacket", "scareathon_hoodie"],
  shoes: ["default_shoes", "boots", "sneakers"],
  faces: ["default_face", "fang_face", "sleepy_face"],
  hair: ["default_hair", "black_shaggy_hair", "white_witch_hair", "pumpkin_orange_hair"],
  accessories: ["default_accessory_none", "bat_wings", "skull_pin", "pumpkin_hat"],
};

const colors = {
  skin: [211, 151, 113, 255],
  skinShadow: [172, 105, 83, 255],
  pale: [205, 202, 189, 255],
  paleShadow: [160, 158, 152, 255],
  zombie: [112, 168, 105, 255],
  zombieShadow: [68, 119, 78, 255],
  line: [45, 28, 42, 255],
  black: [25, 22, 29, 255],
  white: [232, 226, 212, 255],
  red: [154, 24, 43, 255],
  orange: [219, 96, 31, 255],
  purple: [77, 43, 109, 255],
  blue: [38, 55, 97, 255],
  jean: [44, 77, 118, 255],
  gray: [76, 72, 79, 255],
  boot: [58, 38, 32, 255],
};

function makeCanvas() {
  return new Uint8ClampedArray(SIZE * SIZE * 4);
}

function px(canvas, x, y, color) {
  if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return;
  const i = (y * SIZE + x) * 4;
  canvas[i] = color[0];
  canvas[i + 1] = color[1];
  canvas[i + 2] = color[2];
  canvas[i + 3] = color[3];
}

function rect(canvas, x, y, w, h, color) {
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) px(canvas, xx, yy, color);
  }
}

function ellipse(canvas, cx, cy, rx, ry, color) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      if (dx * dx + dy * dy <= 1) px(canvas, x, y, color);
    }
  }
}

function line(canvas, x0, y0, x1, y1, color) {
  const dx = Math.abs(x1 - x0);
  const sx = x0 < x1 ? 1 : -1;
  const dy = -Math.abs(y1 - y0);
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  while (true) {
    px(canvas, x0, y0, color);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
}

function outlineRect(canvas, x, y, w, h, color) {
  rect(canvas, x, y, w, 1, color);
  rect(canvas, x, y + h - 1, w, 1, color);
  rect(canvas, x, y, 1, h, color);
  rect(canvas, x + w - 1, y, 1, h, color);
}

function drawBody(canvas, base, shadow) {
  ellipse(canvas, 32, 17, 8, 9, colors.line);
  ellipse(canvas, 32, 17, 7, 8, base);
  rect(canvas, 29, 25, 6, 5, base);
  rect(canvas, 22, 30, 20, 18, colors.line);
  rect(canvas, 23, 30, 18, 18, base);
  rect(canvas, 20, 31, 4, 20, colors.line);
  rect(canvas, 40, 31, 4, 20, colors.line);
  rect(canvas, 21, 32, 3, 18, base);
  rect(canvas, 40, 32, 3, 18, base);
  rect(canvas, 24, 47, 7, 14, colors.line);
  rect(canvas, 34, 47, 7, 14, colors.line);
  rect(canvas, 25, 47, 5, 13, base);
  rect(canvas, 35, 47, 5, 13, base);
  rect(canvas, 39, 32, 2, 16, shadow);
  rect(canvas, 34, 47, 2, 12, shadow);
}

function drawPants(canvas, fill, cuffs = colors.line, ripped = false) {
  rect(canvas, 24, 43, 17, 5, colors.line);
  rect(canvas, 25, 44, 15, 4, fill);
  rect(canvas, 24, 48, 7, 12, colors.line);
  rect(canvas, 34, 48, 7, 12, colors.line);
  rect(canvas, 25, 48, 5, 11, fill);
  rect(canvas, 35, 48, 5, 11, fill);
  rect(canvas, 25, 58, 5, 2, cuffs);
  rect(canvas, 35, 58, 5, 2, cuffs);
  if (ripped) {
    rect(canvas, 27, 51, 2, 1, colors.white);
    rect(canvas, 36, 54, 3, 1, colors.white);
  }
}

function drawShirt(canvas, fill, accent = null) {
  rect(canvas, 22, 29, 20, 20, colors.line);
  rect(canvas, 23, 30, 18, 18, fill);
  rect(canvas, 19, 31, 6, 14, colors.line);
  rect(canvas, 39, 31, 6, 14, colors.line);
  rect(canvas, 20, 32, 4, 12, fill);
  rect(canvas, 40, 32, 4, 12, fill);
  if (accent) {
    for (let y = 33; y < 46; y += 4) rect(canvas, 23, y, 18, 2, accent);
  }
}

function drawShoes(canvas, fill, accent = colors.line) {
  rect(canvas, 22, 58, 10, 4, accent);
  rect(canvas, 34, 58, 10, 4, accent);
  rect(canvas, 23, 58, 8, 3, fill);
  rect(canvas, 35, 58, 8, 3, fill);
}

function drawFace(canvas, variant) {
  rect(canvas, 27, 16, 2, 2, colors.black);
  rect(canvas, 35, 16, 2, 2, colors.black);
  if (variant === "fang_face") {
    rect(canvas, 29, 21, 6, 1, colors.black);
    rect(canvas, 30, 22, 1, 2, colors.white);
    rect(canvas, 34, 22, 1, 2, colors.white);
  } else if (variant === "sleepy_face") {
    line(canvas, 26, 16, 29, 15, colors.black);
    line(canvas, 35, 15, 38, 16, colors.black);
    rect(canvas, 30, 22, 5, 1, colors.black);
  } else {
    rect(canvas, 30, 22, 5, 1, colors.black);
    px(canvas, 35, 21, colors.black);
  }
}

function drawHair(canvas, variant) {
  const fill = variant === "white_witch_hair" ? colors.white : variant === "pumpkin_orange_hair" ? colors.orange : colors.black;
  ellipse(canvas, 32, 13, 9, 6, colors.line);
  ellipse(canvas, 32, 13, 8, 5, fill);
  rect(canvas, 24, 14, 4, 10, colors.line);
  rect(canvas, 37, 14, 4, 10, colors.line);
  rect(canvas, 25, 14, 3, 9, fill);
  rect(canvas, 37, 14, 3, 9, fill);
  if (variant === "white_witch_hair") {
    rect(canvas, 23, 20, 4, 15, fill);
    rect(canvas, 38, 20, 4, 15, fill);
  }
  if (variant === "black_shaggy_hair") {
    line(canvas, 27, 18, 24, 25, fill);
    line(canvas, 36, 18, 40, 25, fill);
  }
}

function drawAccessory(canvas, variant) {
  if (variant === "default_accessory_none") return;
  if (variant === "bat_wings") {
    ellipse(canvas, 18, 36, 13, 10, colors.line);
    ellipse(canvas, 46, 36, 13, 10, colors.line);
    ellipse(canvas, 18, 36, 11, 8, colors.purple);
    ellipse(canvas, 46, 36, 11, 8, colors.purple);
    rect(canvas, 21, 31, 8, 14, [0, 0, 0, 0]);
    rect(canvas, 35, 31, 8, 14, [0, 0, 0, 0]);
  }
  if (variant === "skull_pin") {
    ellipse(canvas, 39, 36, 3, 3, colors.white);
    rect(canvas, 38, 39, 3, 2, colors.white);
    px(canvas, 38, 36, colors.black);
    px(canvas, 40, 36, colors.black);
  }
  if (variant === "pumpkin_hat") {
    rect(canvas, 24, 9, 16, 4, colors.line);
    ellipse(canvas, 32, 8, 7, 5, colors.line);
    ellipse(canvas, 32, 8, 6, 4, colors.orange);
    rect(canvas, 31, 3, 2, 3, colors.boot);
  }
}

function drawAsset(key) {
  const c = makeCanvas();
  if (key === "default_body") drawBody(c, colors.skin, colors.skinShadow);
  if (key === "pale_body") drawBody(c, colors.pale, colors.paleShadow);
  if (key === "green_zombie_body") drawBody(c, colors.zombie, colors.zombieShadow);
  if (key === "default_pants") drawPants(c, colors.blue);
  if (key === "ripped_jeans") drawPants(c, colors.jean, colors.line, true);
  if (key === "dark_trousers") drawPants(c, colors.gray);
  if (key === "default_shirt") drawShirt(c, colors.red);
  if (key === "striped_shirt") drawShirt(c, colors.orange, colors.black);
  if (key === "vampire_jacket") {
    drawShirt(c, colors.black);
    rect(c, 29, 30, 6, 16, colors.white);
    rect(c, 31, 32, 2, 8, colors.red);
  }
  if (key === "scareathon_hoodie") {
    drawShirt(c, colors.purple);
    rect(c, 28, 35, 8, 5, colors.orange);
    outlineRect(c, 28, 35, 8, 5, colors.line);
  }
  if (key === "default_shoes") drawShoes(c, colors.black);
  if (key === "boots") drawShoes(c, colors.boot);
  if (key === "sneakers") drawShoes(c, colors.white, colors.line);
  if (key.endsWith("_face")) drawFace(c, key);
  if (key.endsWith("_hair")) drawHair(c, key);
  drawAccessory(c, key);
  return c;
}

function upscale(src) {
  const out = new Uint8ClampedArray(OUT_SIZE * OUT_SIZE * 4);
  for (let y = 0; y < OUT_SIZE; y++) {
    for (let x = 0; x < OUT_SIZE; x++) {
      const sx = Math.floor(x / SCALE);
      const sy = Math.floor(y / SCALE);
      const si = (sy * SIZE + sx) * 4;
      const oi = (y * OUT_SIZE + x) * 4;
      out[oi] = src[si];
      out[oi + 1] = src[si + 1];
      out[oi + 2] = src[si + 2];
      out[oi + 3] = src[si + 3];
    }
  }
  return out;
}

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

function png(canvas) {
  const raw = Buffer.alloc((OUT_SIZE * 4 + 1) * OUT_SIZE);
  for (let y = 0; y < OUT_SIZE; y++) {
    const rowStart = y * (OUT_SIZE * 4 + 1);
    raw[rowStart] = 0;
    for (let x = 0; x < OUT_SIZE; x++) {
      const si = (y * OUT_SIZE + x) * 4;
      const di = rowStart + 1 + x * 4;
      raw[di] = canvas[si];
      raw[di + 1] = canvas[si + 1];
      raw[di + 2] = canvas[si + 2];
      raw[di + 3] = canvas[si + 3];
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(OUT_SIZE, 0);
  ihdr.writeUInt32BE(OUT_SIZE, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

for (const [dir, keys] of Object.entries(slots)) {
  fs.mkdirSync(path.join(ROOT, dir), { recursive: true });
  for (const key of keys) {
    const file = path.join(ROOT, dir, `${key}.png`);
    fs.writeFileSync(file, png(upscale(drawAsset(key))));
  }
}

console.log("Generated avatar PNG layers.");
