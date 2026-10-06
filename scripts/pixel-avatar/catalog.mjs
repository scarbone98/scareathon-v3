// Loads and validates the pixel-avatar catalog, and composes looks the same
// way the browser does (src/components/avatar/compose.ts).
import fs from "node:fs";
import path from "node:path";
import {
  ANCHORS,
  ART_DIR,
  CATEGORIES,
  CHANNELS,
  HEIGHT,
  SLOTS,
  WIDTH,
  drawOver,
  holdPose,
  loadPalette,
  normalizeRig,
  parseTextPart,
  readPngStrip,
  renderTextPart,
  swapTable,
  validatePalette,
  validateTextPart,
} from "./lib.mjs";

export const RARITIES = ["common", "uncommon", "rare", "epic", "legendary"];
export const RELEASES = ["draft", "released", "retired"];

export function loadCatalog() {
  const palette = loadPalette();
  const errors = validatePalette(palette);
  const items = loadItems(palette, errors);
  const catalog = {
    palette,
    items,
    errors,
    rigFor: (bodyKey) => items[bodyKey]?.rig || null,
    fitsBody: (item, bodyKey) => item.parts.some((part) => !part.fits || part.fits.includes(bodyKey)),
    outfitLook: (outfit) => ({
      profile: { skin: outfit.skin, hair: outfit.hair, eyes: outfit.eyes },
      outfit: outfit.items.map(({ key, dyes }) => ({ item: items[key], dyes: dyes || {} })),
      body: outfit.items.map(({ key }) => items[key]).find((item) => item?.category === "body")?.key,
    }),
  };
  // Preview-only looks (the four kids, shop items on each body). Players'
  // starting looks are generated in the browser (randomLook in look.ts).
  catalog.outfits = loadOutfits(palette, items, errors);
  return catalog;
}

function loadItems(palette, errors) {
  const itemsDir = path.join(ART_DIR, "items");
  const result = {};
  for (const key of fs.readdirSync(itemsDir).sort()) {
    const dir = path.join(itemsDir, key);
    const metaFile = path.join(dir, "item.json");
    if (!fs.existsSync(metaFile)) continue;
    const where = `items/${key}`;
    const meta = JSON.parse(fs.readFileSync(metaFile, "utf8"));
    const item = { key, ...meta, parts: [] };
    if (!/^[a-z0-9_]+$/.test(key)) errors.push(`${where}: item keys are lower_snake_case`);
    if (!meta.name) errors.push(`${where}: needs a name`);
    if (!(meta.category in CATEGORIES)) errors.push(`${where}: unknown category "${meta.category}"`);
    for (const category of meta.occupies || []) {
      if (!(category in CATEGORIES)) errors.push(`${where}: occupies unknown category "${category}"`);
    }
    for (const slot of meta.hides || []) {
      if (!SLOTS.includes(slot)) errors.push(`${where}: hides unknown slot "${slot}"`);
    }
    if (meta.category === "body") {
      item.rig = normalizeRig(meta.rig, where, errors);
    } else if (meta.rig) {
      errors.push(`${where}: only bodies have a rig`);
    }

    for (const spec of meta.parts || []) {
      if (!SLOTS.includes(spec.slot)) {
        errors.push(`${where}: unknown slot "${spec.slot}"`);
        continue;
      }
      const anchor = spec.anchor || "body";
      if (!ANCHORS.includes(anchor)) errors.push(`${where}: unknown anchor "${anchor}"`);
      const fits = spec.fits ?? meta.fits;
      try {
        let image, x, y;
        if (spec.png) {
          image = readPngStrip(path.join(dir, spec.png), spec.frameWidth);
          [x, y] = spec.at || [0, 0];
          if (x < 0 || y < 0 || x + image.width > WIDTH || y + image.height > HEIGHT) {
            errors.push(`${where}: ${spec.png} runs off the ${WIDTH}x${HEIGHT} canvas`);
          }
        } else {
          const part = parseTextPart(path.join(dir, spec.file));
          const partErrors = validateTextPart(part, palette);
          errors.push(...partErrors);
          if (partErrors.length) continue;
          image = renderTextPart(part, palette);
          ({ x, y } = part);
        }
        item.parts.push({ slot: spec.slot, anchor, x, y, image, fits });
      } catch (error) {
        errors.push(`${where}: ${error.message}`);
      }
    }
    if (!item.parts.length) errors.push(`${where}: has no parts`);

    for (const [channel, ramp] of Object.entries(meta.dyes || {})) {
      if (!["dye1", "dye2"].includes(channel)) errors.push(`${where}: dyes can only set dye1/dye2, not ${channel}`);
      else if (!palette.choices[channel].includes(ramp)) errors.push(`${where}: default ${channel} "${ramp}" is not a ${channel} choice`);
    }
    if (!RARITIES.includes(meta.rarity)) errors.push(`${where}: rarity must be one of ${RARITIES.join(", ")}`);
    if (!RELEASES.includes(meta.release)) errors.push(`${where}: release must be one of ${RELEASES.join(", ")}`);
    if (meta.starter && meta.price != null) errors.push(`${where}: starter items are free (price: null)`);
    if (!meta.starter && !(Number.isInteger(meta.price) && meta.price > 0)) errors.push(`${where}: shop items need a whole-number price`);
    result[key] = item;
  }
  for (const item of Object.values(result)) {
    for (const part of item.parts) {
      for (const body of part.fits || []) {
        if (result[body]?.category !== "body") errors.push(`items/${item.key}: fits "${body}", which is not a body`);
      }
      // A body without the anchor simply doesn't draw the part, but a part
      // fitted to a body by name must have somewhere to hang.
      for (const body of part.fits || []) {
        const rig = result[body]?.rig;
        if (rig && !rig.anchors[part.anchor]) errors.push(`items/${item.key}: ${body} has no "${part.anchor}" anchor to hang a part on`);
      }
    }
  }
  return result;
}

function loadOutfits(palette, items, errors) {
  const dir = path.join(ART_DIR, "outfits");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith(".json"))
    .sort()
    .map((file) => {
      const outfit = { id: path.basename(file, ".json"), ...JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")) };
      const where = `outfits/${file}`;
      for (const [field, channel] of [["skin", "skin"], ["hair", "hair"], ["eyes", "eyes"]]) {
        if (!palette.choices[channel].includes(outfit[field])) errors.push(`${where}: ${field} "${outfit[field]}" is not a ${channel} choice`);
      }
      let bodies = 0;
      for (const { key, dyes } of outfit.items) {
        const item = items[key];
        if (!item) {
          errors.push(`${where}: unknown item "${key}"`);
          continue;
        }
        if (item.category === "body") bodies += 1;
        for (const [channel, ramp] of Object.entries(dyes || {})) {
          if (!(channel in (item.dyes || {}))) errors.push(`${where}: ${key} has no ${channel} to dye`);
          else if (!palette.choices[channel].includes(ramp)) errors.push(`${where}: ${key} ${channel} "${ramp}" is not a choice`);
        }
      }
      if (bodies !== 1) errors.push(`${where}: needs exactly one body`);
      return outfit;
    });
}

// One frame of a look ({ profile, outfit: [{ item, dyes }] }) as WIDTH x HEIGHT RGBA.
export function composeFrame(catalog, look, frame) {
  const { palette } = catalog;
  const canvas = new Uint8ClampedArray(WIDTH * HEIGHT * 4);
  const body = look.body !== undefined ? look.body : look.outfit.find(({ item }) => item.category === "body")?.item.key;
  const rig = body ? catalog.rigFor(body) : null;
  const hidden = new Set(look.outfit.flatMap(({ item }) => item.hides || []));
  const outfit = look.outfit
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => (a.entry.item.order || 0) - (b.entry.item.order || 0) || a.index - b.index)
    .map(({ entry }) => entry);
  // Holding something (that shows on this body): the near arm swings out to hold it
  const holding = look.outfit.some(({ item }) => item.category === "held" && (!body || catalog.fitsBody(item, body)));
  const hold = holding ? rig?.hold : null;
  for (const slot of SLOTS) {
    if (hidden.has(slot)) continue;
    for (const { item, dyes } of outfit) {
      for (const part of item.parts) {
        if (part.slot !== slot) continue;
        if (body && part.fits && !part.fits.includes(body)) continue;
        const offset = rig ? rig.anchors[part.anchor]?.[frame % rig.frames] : [0, 0];
        if (!offset) continue;
        const { width, height, frames } = part.image;
        const swaps = Object.fromEntries(CHANNELS.map((c) => [c, look.profile[c]]));
        swaps.dye1 = dyes?.dye1 || item.dyes?.dye1;
        swaps.dye2 = dyes?.dye2 || item.dyes?.dye2;
        const posed = hold && part.anchor === "body" && hold.slots.includes(slot) ? holdPose(hold, frames[frame % frames.length], width, height, part.x, part.y) : null;
        if (posed) drawOver(canvas, posed, WIDTH, HEIGHT, offset[0], offset[1], swapTable(palette, swaps));
        else drawOver(canvas, frames[frame % frames.length], width, height, part.x + offset[0], part.y + offset[1], swapTable(palette, swaps));
      }
    }
  }
  return canvas;
}
