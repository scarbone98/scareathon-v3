// Builds avatar art from the text sources in avatar-art/.
//
//   node scripts/avatar-art/build.mjs           validate, export, render previews
//   node scripts/avatar-art/build.mjs --check   validate only
//
// Exports public/avatar-v2/items/<item>/<slot>.png (120x150, canonical colours)
// plus public/avatar-v2/manifest.json, and renders every outfit in
// avatar-art/outfits/ to avatar-art/previews/ for eyeballing.
import fs from "node:fs";
import path from "node:path";
import {
  ART_DIR,
  BUILDS,
  CATEGORIES,
  HEIGHT,
  SLOTS,
  WIDTH,
  blit,
  createLayer,
  drawPart,
  encodePng,
  fillImage,
  loadPalette,
  parsePart,
  pasteImage,
  scaleImage,
  swapRamps,
  validatePalette,
  validatePart,
} from "./lib.mjs";

const checkOnly = process.argv.includes("--check");
const EXPORT_DIR = path.resolve("public/avatar-v2");
const PREVIEW_DIR = path.join(ART_DIR, "previews");
const PREVIEW_SCALE = 4;
const PREVIEW_BG = [24, 18, 32, 255];

const palette = loadPalette();
const errors = validatePalette(palette);
const items = loadItems(errors);
const outfits = loadOutfits(items, errors);

if (errors.length) {
  console.error(errors.map((e) => `  ✗ ${e}`).join("\n"));
  console.error(`\n${errors.length} problem(s) found.`);
  process.exit(1);
}
console.log(`✓ ${Object.keys(items).length} items and ${outfits.length} outfits are valid.`);
if (checkOnly) process.exit(0);

const rendered = {};
for (const [key, item] of Object.entries(items)) {
  rendered[key] = renderItem(item);
  const dir = path.join(EXPORT_DIR, "items", key);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  for (const [slot, layer] of Object.entries(rendered[key])) {
    fs.writeFileSync(path.join(dir, `${slot}.png`), encodePng(layer.rgba, WIDTH, HEIGHT));
  }
}
writeManifest();

fs.mkdirSync(PREVIEW_DIR, { recursive: true });
const previews = outfits.map((outfit) => {
  const image = scaleImage(composeOutfit(outfit), WIDTH, HEIGHT, PREVIEW_SCALE);
  const bg = fillImage(WIDTH * PREVIEW_SCALE, HEIGHT * PREVIEW_SCALE, PREVIEW_BG);
  pasteImage(bg, WIDTH * PREVIEW_SCALE, image, WIDTH * PREVIEW_SCALE, HEIGHT * PREVIEW_SCALE, 0, 0);
  fs.writeFileSync(
    path.join(PREVIEW_DIR, `${outfit.id}.png`),
    encodePng(bg, WIDTH * PREVIEW_SCALE, HEIGHT * PREVIEW_SCALE)
  );
  return composeOutfit(outfit);
});
writeSheet(previews);
console.log(`✓ Exported to ${path.relative(process.cwd(), EXPORT_DIR)}, previews in ${path.relative(process.cwd(), PREVIEW_DIR)}`);

function loadItems(errors) {
  const itemsDir = path.join(ART_DIR, "items");
  const result = {};
  for (const key of fs.readdirSync(itemsDir).sort()) {
    const dir = path.join(itemsDir, key);
    const metaFile = path.join(dir, "item.json");
    if (!fs.existsSync(metaFile)) continue;
    const meta = JSON.parse(fs.readFileSync(metaFile, "utf8"));
    const item = { key, ...meta, parts: [] };
    for (const { slot, file, build } of meta.parts) {
      if (!SLOTS.includes(slot)) {
        errors.push(`${key}: unknown slot "${slot}"`);
        continue;
      }
      if (build && !BUILDS.includes(build)) {
        errors.push(`${key}: unknown build "${build}" (use ${BUILDS.join(" or ")})`);
        continue;
      }
      try {
        const part = parsePart(path.join(dir, file));
        errors.push(...validatePart(part, palette));
        item.parts.push({ slot, build, part });
      } catch (error) {
        errors.push(error.message);
      }
    }
    for (const [channel, ramp] of Object.entries(meta.dyes || {})) {
      if (!["dye1", "dye2"].includes(channel)) errors.push(`${key}: dyes can only set dye1/dye2, not ${channel}`);
      if (!palette.ramps[ramp]) errors.push(`${key}: default ${channel} ramp "${ramp}" does not exist`);
    }
    for (const category of [meta.category, ...(meta.occupies || [])]) {
      if (!(category in CATEGORIES)) errors.push(`${key}: unknown category "${category}"`);
    }
    for (const slot of meta.hides || []) {
      if (!SLOTS.includes(slot)) errors.push(`${key}: hides unknown slot "${slot}"`);
    }
    result[key] = item;
  }
  return result;
}

function loadOutfits(items, errors) {
  const dir = path.join(ART_DIR, "outfits");
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((file) => {
      const outfit = { id: file.replace(/\.json$/, ""), ...JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")) };
      outfit.items = outfit.items.map((entry) => (typeof entry === "string" ? { key: entry } : entry));
      outfit.build ||= BUILDS[0];
      if (!BUILDS.includes(outfit.build)) errors.push(`outfit ${outfit.id}: unknown build "${outfit.build}"`);
      const worn = {};
      for (const { key } of outfit.items) {
        if (!items[key]) {
          errors.push(`outfit ${outfit.id}: unknown item "${key}"`);
          continue;
        }
        for (const category of [items[key].category, ...(items[key].occupies || [])]) {
          worn[category] = (worn[category] || 0) + 1;
          if (worn[category] > (CATEGORIES[category] ?? 1)) {
            errors.push(`outfit ${outfit.id}: too many ${category} items (max ${CATEGORIES[category]})`);
          }
        }
      }
      for (const channel of ["skin", "hair", "eyes"]) {
        if (outfit[channel] && !palette.ramps[outfit[channel]]) {
          errors.push(`outfit ${outfit.id}: ${channel} ramp "${outfit[channel]}" does not exist`);
        }
      }
      return outfit;
    });
}

// Layers are keyed "<slot>" when every part in that slot suits both builds,
// and "<slot>.<build>" when any part in it is fitted to one build. A fitted
// slot also includes that slot's shared parts, drawn in the order listed.
function renderItem(item) {
  const bySlot = {};
  const fittedSlots = new Set(item.parts.filter((p) => p.build).map((p) => p.slot));
  for (const { slot, build, part } of item.parts) {
    const keys = !fittedSlots.has(slot) ? [slot] : build ? [`${slot}.${build}`] : BUILDS.map((b) => `${slot}.${b}`);
    for (const key of keys) {
      bySlot[key] ||= createLayer();
      drawPart(bySlot[key], part, palette);
    }
  }
  return bySlot;
}

// Same order of operations the browser compositor will use: per item, apply
// the avatar-wide swaps plus that item's dyes, then stack slots back to front.
function composeOutfit(outfit) {
  const hidden = new Set(outfit.items.flatMap(({ key }) => items[key].hides || []));
  // Within a slot, items stack by their `order` (default 0), never by the
  // order they were put on, so an outfit always looks the same.
  const byOrder = outfit.items
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => (items[a.entry.key].order || 0) - (items[b.entry.key].order || 0) || a.index - b.index)
    .map(({ entry }) => entry);
  const canvas = createLayer();
  for (const slot of SLOTS) {
    if (hidden.has(slot)) continue;
    for (const entry of byOrder) {
      const layer = rendered[entry.key][`${slot}.${outfit.build}`] ?? rendered[entry.key][slot];
      if (!layer) continue;
      const swaps = {
        skin: outfit.skin,
        hair: outfit.hair,
        eyes: outfit.eyes,
        dye1: entry.dye1 || items[entry.key].dyes?.dye1,
        dye2: entry.dye2 || items[entry.key].dyes?.dye2,
      };
      blit(canvas, { rgba: swapRamps(layer.rgba, swaps, palette), ramp: layer.ramp });
    }
  }
  return canvas.rgba;
}

function writeSheet(images) {
  const scale = 3;
  const gap = 8;
  const perRow = 6;
  const w = WIDTH * scale;
  const h = HEIGHT * scale;
  const sheetWidth = Math.min(images.length, perRow) * (w + gap) + gap;
  const sheetHeight = Math.ceil(images.length / perRow) * (h + gap) + gap;
  const sheet = fillImage(sheetWidth, sheetHeight, PREVIEW_BG);
  images.forEach((image, i) => {
    const left = gap + (i % perRow) * (w + gap);
    const top = gap + Math.floor(i / perRow) * (h + gap);
    pasteImage(sheet, sheetWidth, scaleImage(image, WIDTH, HEIGHT, scale), w, h, left, top);
  });
  fs.writeFileSync(path.join(PREVIEW_DIR, "_sheet.png"), encodePng(sheet, sheetWidth, sheetHeight));
}

function writeManifest() {
  const swappable = {};
  for (const channel of Object.keys(palette.swappable)) {
    swappable[channel] = palette.ramps[channel].map(([r, g, b]) => toHex(r, g, b));
  }
  const manifest = {
    width: WIDTH,
    height: HEIGHT,
    slots: SLOTS,
    categories: CATEGORIES,
    swappable,
    skinTones: palette.swappable.skin,
    ramps: Object.fromEntries(
      Object.entries(palette.ramps).map(([name, ramp]) => [name, ramp.map(([r, g, b]) => toHex(r, g, b))])
    ),
    builds: BUILDS,
    items: Object.values(items).map((item) => ({
      key: item.key,
      name: item.name,
      category: item.category,
      slots: Object.keys(rendered[item.key]),
      dyes: item.dyes || {},
      occupies: item.occupies || [],
      hides: item.hides || [],
      order: item.order || 0,
    })),
  };
  fs.writeFileSync(path.join(EXPORT_DIR, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
}

function toHex(r, g, b) {
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}
