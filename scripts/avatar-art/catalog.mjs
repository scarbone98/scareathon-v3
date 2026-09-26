// Loads, validates and renders the avatar-art catalog. Shared by build.mjs
// (exports) and vet.mjs (clipping checks), so both draw items identically.
import fs from "node:fs";
import path from "node:path";
import {
  ART_DIR,
  BUILDS,
  CATEGORIES,
  SLOTS,
  blit,
  createLayer,
  drawPart,
  loadPalette,
  parsePart,
  swapRamps,
  validatePalette,
  validatePart,
} from "./lib.mjs";

export const RARITIES = ["common", "uncommon", "rare", "epic", "legendary"];
export const RELEASES = ["draft", "released", "retired"];

export function loadCatalog() {
  const palette = loadPalette();
  const errors = validatePalette(palette);
  const items = loadItems(palette, errors);
  const outfits = loadOutfits(palette, items, errors);
  return { palette, items, outfits, errors };
}

export function renderCatalog(items, palette) {
  return Object.fromEntries(Object.entries(items).map(([key, item]) => [key, renderItem(item, palette)]));
}

export function loadItems(palette, errors) {
  const itemsDir = path.join(ART_DIR, "items");
  const result = {};
  for (const key of fs.readdirSync(itemsDir).sort()) {
    const dir = path.join(itemsDir, key);
    const metaFile = path.join(dir, "item.json");
    if (!fs.existsSync(metaFile)) continue;
    const meta = JSON.parse(fs.readFileSync(metaFile, "utf8"));
    const item = { key, ...meta, parts: [] };
    for (const { slot, file, build, masks } of meta.parts) {
      // A "mask" part erases other items' pixels in the slots it lists, e.g.
      // a hat squashing the hair under its crown.
      if (slot === "mask") {
        if (!Array.isArray(masks) || !masks.length || masks.some((target) => !SLOTS.includes(target))) {
          errors.push(`${key}: a mask part needs "masks": [slots it erases]`);
          continue;
        }
      } else if (!SLOTS.includes(slot)) {
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
        item.parts.push({ slot, build, part, masks });
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
    const allowed = ["skin-gaps", "hair-pokes", "stray-bits"];
    for (const check of meta.vet?.ignore || []) {
      if (!allowed.includes(check)) errors.push(`${key}: vet.ignore can only list ${allowed.join(", ")}`);
    }
    if (meta.vet?.ignore?.length && !meta.vet.why) errors.push(`${key}: say why in vet.why when ignoring vet checks`);
    for (const slot of meta.hides || []) {
      if (!SLOTS.includes(slot)) errors.push(`${key}: hides unknown slot "${slot}"`);
    }
    if (typeof meta.starter !== "boolean") errors.push(`${key}: "starter" must be true or false`);
    if (typeof meta.default !== "boolean") errors.push(`${key}: "default" must be true or false`);
    if (meta.default && !meta.starter) errors.push(`${key}: a default item must also be a starter`);
    if (!RARITIES.includes(meta.rarity)) errors.push(`${key}: "rarity" must be one of ${RARITIES.join(", ")}`);
    if (!RELEASES.includes(meta.release)) errors.push(`${key}: "release" must be one of ${RELEASES.join(", ")}`);
    if (meta.price !== null && !(Number.isInteger(meta.price) && meta.price > 0)) {
      errors.push(`${key}: "price" must be a positive whole number of coins, or null if it isn't sold`);
    }
    if (meta.starter && meta.price !== null) errors.push(`${key}: starter items are free, so "price" must be null`);
    result[key] = item;
  }
  const defaults = {};
  for (const item of Object.values(result)) {
    if (!item.default) continue;
    defaults[item.category] = (defaults[item.category] || 0) + 1;
    if (defaults[item.category] > (CATEGORIES[item.category] ?? 1)) {
      errors.push(`too many default ${item.category} items (max ${CATEGORIES[item.category]})`);
    }
  }
  if (!defaults.body) errors.push("the default outfit needs a body item");
  return result;
}

export function loadOutfits(palette, items, errors) {
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
export function renderItem(item, palette) {
  const bySlot = {};
  const fittedSlots = new Set(item.parts.filter((p) => p.build).map((p) => p.slot));
  for (const { slot, build, part } of item.parts) {
    // Mask parts are drawn in black; only where they are opaque matters.
    const keys = !fittedSlots.has(slot) ? [slot] : build ? [`${slot}.${build}`] : BUILDS.map((b) => `${slot}.${b}`);
    for (const key of keys) {
      bySlot[key] ||= createLayer();
      drawPart(bySlot[key], part, palette);
    }
  }
  return bySlot;
}

// Same order of operations the browser compositor uses: per item, apply the
// avatar-wide swaps plus that item's dyes, then stack slots back to front.
export function composeOutfit({ items, rendered, palette }, outfit) {
  const hidden = new Set(outfit.items.flatMap(({ key }) => items[key].hides || []));
  // Within a slot, items stack by their `order` (default 0), never by the
  // order they were put on, so an outfit always looks the same.
  const byOrder = outfit.items
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => (items[a.entry.key].order || 0) - (items[b.entry.key].order || 0) || a.index - b.index)
    .map(({ entry }) => entry);
  const masks = outfitMasks({ items, rendered }, outfit);
  const canvas = createLayer();
  for (const slot of SLOTS) {
    if (hidden.has(slot)) continue;
    for (const entry of byOrder) {
      let layer = rendered[entry.key][`${slot}.${outfit.build}`] ?? rendered[entry.key][slot];
      if (!layer) continue;
      layer = applyMasks(layer, masks[slot], entry.key);
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

// For each slot, the masks worn items put on it: [{ owner, alpha }].
export function outfitMasks({ items, rendered }, outfit) {
  const bySlot = {};
  for (const { key } of outfit.items) {
    const maskLayer = rendered[key][`mask.${outfit.build}`] ?? rendered[key].mask;
    if (!maskLayer) continue;
    const targets = [...new Set(items[key].parts.filter((p) => p.slot === "mask").flatMap((p) => p.masks))];
    for (const slot of targets) (bySlot[slot] ||= []).push({ owner: key, alpha: maskLayer.rgba });
  }
  return bySlot;
}

// Erases a layer's pixels under masks worn by other items.
function applyMasks(layer, masks, key) {
  const others = (masks || []).filter((mask) => mask.owner !== key);
  if (!others.length) return layer;
  const rgba = new Uint8ClampedArray(layer.rgba);
  for (const { alpha } of others) {
    for (let i = 3; i < rgba.length; i += 4) if (alpha[i]) rgba[i - 3] = rgba[i - 2] = rgba[i - 1] = rgba[i] = 0;
  }
  return { rgba, ramp: layer.ramp };
}
