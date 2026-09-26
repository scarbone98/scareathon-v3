// Vets items for clipping before they ship.
//
//   node scripts/avatar-art/vet.mjs                 vet every item
//   node scripts/avatar-art/vet.mjs witch_hat ...   vet only these
//
// For each item it renders a contact sheet (avatar-art/previews/vet/<item>.png):
// both builds, worn alone on the default outfit and with every item it is
// likely to overlap (hats with every hairstyle, tops with every coat, ...).
// Suspect pixels are painted magenta on a second copy of each tile. It also
// runs automatic checks and prints them:
//   skin gaps   skin showing through a narrow gap inside the garment
//   hair pokes  hair sticking out above a hat/hood in the columns it covers
//   stray bits  specks of an item not connected to the rest of it
// Look at every sheet: the checks catch the common mistakes, not all of them.
import fs from "node:fs";
import path from "node:path";
import { composeOutfit, loadCatalog, renderCatalog } from "./catalog.mjs";
import { ART_DIR, BUILDS, HEIGHT, WIDTH, encodePng, fillImage, pasteImage, rgbKey, scaleImage } from "./lib.mjs";

const SCALE = 3;
const GAP = 6;
const BG = [24, 18, 32, 255];
const FLAG = [255, 0, 220, 255];
const OUT_DIR = path.join(ART_DIR, "previews", "vet");
const FX_SLOTS = new Set(["front_fx", "back_fx", "background"]);
// Skin inside these is expected (eyes, mouths, masks sit on the face).
const FACE_CATEGORIES = new Set(["body", "eyes", "mouth", "brows", "face_paint", "face_acc"]);
// Categories drawn as loose dots or strands, where gaps and specks are the design.
const LOOSE_CATEGORIES = new Set(["face_paint", "hair"]);
// The top of the skull: an item covering any of this is a hat or hood, and
// hair must not stick out above it.
const CROWN = { x0: 62, x1: 64, y0: 30, y1: 35 };

// The outfit every item is tried on. The vetted item and its partner replace
// whatever these wear in the same category.
const BASE = ["base_body", "eyes_wide", "brows_soft", "mouth_smile", "hair_long_wisp", "grave_tee", "patched_trousers", "buckle_boots"];

// Which categories an item is tried against.
const PARTNERS = {
  head: ["hair", "face_acc"],
  hair_acc: ["hair", "head"],
  face_acc: ["hair", "eyes", "head"],
  hair: ["head", "face_acc", "outer", "neck"],
  torso: ["outer", "neck", "back", "legs", "hair"],
  outer: ["torso", "hair", "held_near", "back", "wings", "neck"],
  neck: ["torso", "outer", "hair"],
  hands: ["torso", "outer", "held_near"],
  waist: ["torso", "outer", "legs"],
  back: ["outer", "torso", "hair", "wings"],
  wings: ["outer", "back", "hair"],
  legs: ["legwear", "feet", "torso"],
  legwear: ["legs", "feet"],
  feet: ["legs", "legwear"],
  held_near: ["outer", "torso", "hair"],
  held_far: ["outer", "torso", "held_near"],
  companion: ["hair", "head", "outer"],
  eyes: ["face_paint", "face_acc", "hair", "brows"],
  mouth: ["face_paint", "face_acc", "hair"],
  brows: ["hair", "eyes", "face_acc"],
  face_paint: ["eyes", "mouth", "face_acc", "hair"],
  aura: ["outer", "hair"],
  background: ["hair"],
};

const { palette, items, errors } = loadCatalog();
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
const rendered = renderCatalog(items, palette);
const compose = (outfit) => composeOutfit({ items, rendered, palette }, outfit);
const skinColours = new Set(palette.ramps.skin.map(([r, g, b]) => rgbKey(r, g, b)));
const hairColours = new Set(palette.ramps.hair.map(([r, g, b]) => rgbKey(r, g, b)));

function wear(keys, key) {
  const item = items[key];
  const taken = new Set([item.category, ...(item.occupies || [])]);
  return [...keys.filter((k) => !taken.has(items[k].category) && !(items[k].occupies || []).some((c) => taken.has(c))), key];
}

// Every pixel the item itself draws for a build (fx excluded).
function ownMask(key, build) {
  const mask = new Uint8Array(WIDTH * HEIGHT);
  for (const [layerKey, layer] of Object.entries(rendered[key])) {
    const [slot, layerBuild] = layerKey.split(".");
    if (FX_SLOTS.has(slot) || slot === "mask" || (layerBuild && layerBuild !== build)) continue;
    for (let i = 0; i < WIDTH * HEIGHT; i++) if (layer.rgba[i * 4 + 3]) mask[i] = 1;
  }
  return mask;
}

const colourAt = (rgba, i) => rgbKey(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]);

// Skin pixels boxed in by the item within 2px on both sides (left/right or
// above/below): gaps where the body shows through the garment.
function skinGaps(image, mask) {
  const found = [];
  const inMask = (x, y) => x >= 0 && y >= 0 && x < WIDTH && y < HEIGHT && mask[y * WIDTH + x];
  const near = (x, y, dx, dy) => [1, 2].some((d) => inMask(x + dx * d, y + dy * d));
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const i = y * WIDTH + x;
      if (mask[i] || image[i * 4 + 3] === 0 || !skinColours.has(colourAt(image, i))) continue;
      if ((near(x, y, -1, 0) && near(x, y, 1, 0)) || (near(x, y, 0, -1) && near(x, y, 0, 1))) found.push(i);
    }
  }
  return found;
}

// Hair above the topmost pixel of the item, in the columns the item covers.
function hairPokes(image, mask) {
  const found = [];
  for (let x = 0; x < WIDTH; x++) {
    let top = -1;
    for (let y = 0; y < HEIGHT; y++) if (mask[y * WIDTH + x]) { top = y; break; }
    if (top < 0) continue;
    for (let y = 0; y < top; y++) {
      const i = y * WIDTH + x;
      if (image[i * 4 + 3] && hairColours.has(colourAt(image, i))) found.push(i);
    }
  }
  return found;
}

// Specks of 1-2 pixels not touching the rest of the item (8-connected).
function strayBits(mask) {
  const seen = new Uint8Array(WIDTH * HEIGHT);
  const found = [];
  for (let start = 0; start < WIDTH * HEIGHT; start++) {
    if (!mask[start] || seen[start]) continue;
    const stack = [start];
    const blob = [];
    seen[start] = 1;
    while (stack.length) {
      const i = stack.pop();
      blob.push(i);
      const x = i % WIDTH, y = Math.floor(i / WIDTH);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy, n = ny * WIDTH + nx;
        if (nx < 0 || ny < 0 || nx >= WIDTH || ny >= HEIGHT || seen[n] || !mask[n]) continue;
        seen[n] = 1;
        stack.push(n);
      }
    }
    if (blob.length <= 2) found.push(...blob);
  }
  return found;
}

function flagged(image, pixels) {
  const copy = new Uint8ClampedArray(image);
  for (const i of pixels) copy.set(FLAG, i * 4);
  return copy;
}

function vet(key) {
  const item = items[key];
  const partners = (PARTNERS[item.category] || [])
    .flatMap((category) => Object.values(items).filter((other) => other.category === category && other.key !== key))
    .map((other) => other.key);
  const contexts = [null, ...partners];
  const coversCrown = (mask) => {
    for (let y = CROWN.y0; y <= CROWN.y1; y++) for (let x = CROWN.x0; x <= CROWN.x1; x++) if (mask[y * WIDTH + x]) return true;
    return false;
  };
  const ignore = new Set(item.vet?.ignore || []);
  const problems = [];
  const tiles = [];
  const closeUps = [];

  for (const build of BUILDS) {
    const mask = ownMask(key, build);
    const checksHair = !ignore.has("hair-pokes") && !FACE_CATEGORIES.has(item.category) && item.category !== "hair" && coversCrown(mask);
    const stray = LOOSE_CATEGORIES.has(item.category) || ignore.has("stray-bits") ? [] : strayBits(mask);
    if (stray.length) problems.push(`${build}: ${stray.length} stray pixel(s)`);
    for (const partner of contexts) {
      let keys = [...BASE];
      if (partner) keys = wear(keys, partner);
      keys = wear(keys, key);
      if (partner && !keys.includes(partner)) continue; // the item replaces it
      const image = compose({ build, items: keys.map((k) => ({ key: k })) });
      const label = `${build}${partner ? ` + ${partner}` : ""}`;
      const gaps = FACE_CATEGORIES.has(item.category) || LOOSE_CATEGORIES.has(item.category) || ignore.has("skin-gaps") ? [] : skinGaps(image, mask);
      const pokes = checksHair ? hairPokes(image, mask) : [];
      if (gaps.length > 2) problems.push(`${label}: ${gaps.length} skin-gap pixel(s)`);
      if (pokes.length > 0) problems.push(`${label}: ${pokes.length} hair pixel(s) poke out`);
      const marked = flagged(image, [...gaps, ...pokes, ...stray]);
      tiles.push({ build, image, marked });
      if (gaps.length > 2 || pokes.length > 0) closeUps.push({ label, image, marked });
    }
  }

  // Sheet: one row per build; each context shows the plain tile and the marked one.
  const perRow = tiles.length / BUILDS.length;
  const w = WIDTH * SCALE, h = HEIGHT * SCALE;
  const sheetWidth = perRow * (w * 2 + GAP * 2) + GAP;
  const sheetHeight = BUILDS.length * (h + GAP) + GAP;
  const sheet = fillImage(sheetWidth, sheetHeight, BG);
  tiles.forEach((tile, index) => {
    const col = index % perRow, row = Math.floor(index / perRow);
    const left = GAP + col * (w * 2 + GAP * 2), top = GAP + row * (h + GAP);
    pasteImage(sheet, sheetWidth, scaleImage(tile.image, WIDTH, HEIGHT, SCALE), w, h, left, top);
    pasteImage(sheet, sheetWidth, scaleImage(tile.marked, WIDTH, HEIGHT, SCALE), w, h, left + w + GAP / 2, top);
  });
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, `${key}.png`), encodePng(sheet, sheetWidth, sheetHeight));

  // Close-ups of each flagged look: plain and marked side by side at 4x.
  const closeDir = path.join(OUT_DIR, key);
  fs.rmSync(closeDir, { recursive: true, force: true });
  if (closeUps.length) fs.mkdirSync(closeDir, { recursive: true });
  for (const { label, image, marked } of closeUps) {
    const cw = WIDTH * 4, ch = HEIGHT * 4;
    const pair = fillImage(cw * 2 + GAP, ch, BG);
    pasteImage(pair, cw * 2 + GAP, scaleImage(image, WIDTH, HEIGHT, 4), cw, ch, 0, 0);
    pasteImage(pair, cw * 2 + GAP, scaleImage(marked, WIDTH, HEIGHT, 4), cw, ch, cw + GAP, 0);
    fs.writeFileSync(path.join(closeDir, `${label.replace(/ \+ /g, "+")}.png`), encodePng(pair, cw * 2 + GAP, ch));
  }
  return { key, contexts: perRow, problems };
}

const only = process.argv.slice(2);
const keys = only.length ? only : Object.keys(items);
let flaggedItems = 0;
for (const key of keys) {
  if (!items[key]) {
    console.error(`unknown item ${key}`);
    process.exitCode = 1;
    continue;
  }
  const { contexts, problems } = vet(key);
  if (problems.length) flaggedItems++;
  console.log(`${problems.length ? "!" : "✓"} ${key} (${contexts} looks per build)${problems.length ? "\n    " + [...new Set(problems)].join("\n    ") : ""}`);
}
console.log(`\n${keys.length - flaggedItems} clean, ${flaggedItems} flagged. Sheets in ${path.relative(process.cwd(), OUT_DIR)}/`);
