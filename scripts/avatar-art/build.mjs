// Builds avatar art from the text sources in avatar-art/.
//
//   node scripts/avatar-art/build.mjs           validate, export, render previews
//   node scripts/avatar-art/build.mjs --check   validate only
//
// Exports public/avatar-v2/items/<item>/<slot>.png (120x150, canonical colours)
// and an icon.png per item, public/avatar-v2/manifest.json for the browser,
// server/utils/avatarRules.json for the API's validation, and
// server/db/avatar_catalog.sql to upsert the catalog into the database. It also
// renders every outfit in avatar-art/outfits/ to avatar-art/previews/.
import crypto from "node:crypto";
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
const RARITIES = ["common", "uncommon", "rare", "epic", "legendary"];
const RELEASES = ["draft", "released", "retired"];
const RULES_FILE = path.resolve("server/utils/avatarRules.json");
const CATALOG_FILE = path.resolve("server/db/avatar_catalog.sql");
const ICON_BUILD = "f";

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
const exported = {};
// Start clean so renamed or deleted items don't leave stale files behind.
fs.rmSync(path.join(EXPORT_DIR, "items"), { recursive: true, force: true });
for (const [key, item] of Object.entries(items)) {
  rendered[key] = renderItem(item);
  const dir = path.join(EXPORT_DIR, "items", key);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  exported[key] = { parts: [] };
  for (const [layerKey, layer] of Object.entries(rendered[key])) {
    const [slot, build = null] = layerKey.split(".");
    exported[key].parts.push({ slot, build, src: writePng(dir, key, `${layerKey}.png`, layer.rgba, WIDTH, HEIGHT) });
  }
}
for (const [key, item] of Object.entries(items)) {
  const icon = renderIcon(item);
  exported[key].icon = writePng(path.join(EXPORT_DIR, "items", key), key, "icon.png", icon.rgba, icon.width, icon.height);
}
const rules = colourRules();
writeManifest();
writeRules();
writeCatalogSql();

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

// Writes a PNG and returns its public path with a content hash, so browsers
// pick up new art as soon as it ships.
function writePng(dir, key, file, rgba, width, height) {
  const png = encodePng(rgba, width, height);
  fs.writeFileSync(path.join(dir, file), png);
  const hash = crypto.createHash("sha1").update(png).digest("hex").slice(0, 10);
  return `/avatar-v2/items/${key}/${file}?v=${hash}`;
}

// A shop/inventory icon: the item on the plain base body (so faces and hair
// have a head under them), cropped square around the item with a margin.
function renderIcon(item) {
  const base = items.base_body;
  const worn = item.key === base.key ? [item.key] : [base.key, item.key];
  const full = composeOutfit({ build: ICON_BUILD, items: worn.map((key) => ({ key })) });
  const own = composeOutfit({ build: ICON_BUILD, items: [{ key: item.key }] });
  let minX = WIDTH, minY = HEIGHT, maxX = -1, maxY = -1;
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      if (own[(y * WIDTH + x) * 4 + 3] === 0) continue;
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
  }
  const margin = 3;
  const minSize = 30; // small face parts still show a bit of face around them
  const size = Math.min(Math.max(maxX - minX + 1, maxY - minY + 1, minSize - margin * 2) + margin * 2, WIDTH);
  const left = Math.max(0, Math.min(WIDTH - size, Math.round((minX + maxX + 1 - size) / 2)));
  const top = Math.max(0, Math.min(HEIGHT - size, Math.round((minY + maxY + 1 - size) / 2)));
  const rgba = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    const from = ((top + y) * WIDTH + left) * 4;
    rgba.set(full.subarray(from, from + size * 4), y * size * 4);
  }
  return { rgba, width: size, height: size };
}

// Which ramps players may pick for hair, eyes and item dyes: every ramp except
// skin tones and the canonical placeholders.
function colourRules() {
  const placeholders = ["hair", "eyes", "dye1", "dye2"];
  const colours = Object.keys(palette.ramps).filter((name) => !name.startsWith("skin") && !placeholders.includes(name));
  return {
    skinTones: palette.swappable.skin,
    hairColors: ["hair", ...colours],
    eyeColors: ["eyes", ...colours],
    dyeColors: colours,
  };
}

function itemPayload(item) {
  return {
    key: item.key,
    name: item.name,
    category: item.category,
    parts: exported[item.key].parts,
    icon: exported[item.key].icon,
    dyes: item.dyes || {},
    occupies: item.occupies || [],
    hides: item.hides || [],
    order: item.order || 0,
    starter: item.starter,
    default: item.default,
    rarity: item.rarity,
    price: item.price,
    release: item.release,
  };
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
    builds: BUILDS,
    swappable,
    ...rules,
    ramps: Object.fromEntries(
      Object.entries(palette.ramps).map(([name, ramp]) => [name, ramp.map(([r, g, b]) => toHex(r, g, b))])
    ),
    items: Object.values(items).map(itemPayload),
  };
  fs.writeFileSync(path.join(EXPORT_DIR, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
}

// What the API needs to validate a saved outfit.
function writeRules() {
  const serverRules = { builds: BUILDS, slots: SLOTS, categories: CATEGORIES, dyeChannels: ["dye1", "dye2"], ...rules };
  fs.writeFileSync(RULES_FILE, JSON.stringify(serverRules, null, 2) + "\n");
}

// Idempotent upsert of every item into avatar_items. It refuses to touch
// legacy (art_version 1) rows, so a clashing item_key fails loudly instead.
function writeCatalogSql() {
  const q = (value) => (value === null || value === undefined ? "NULL" : `'${String(value).replace(/'/g, "''")}'`);
  const json = (value) => `${q(JSON.stringify(value))}::jsonb`;
  const arr = (values) => `ARRAY[${values.map(q).join(", ")}]::text[]`;
  const rows = Object.values(items).map((item) => {
    const p = itemPayload(item);
    return `(${[
      q(p.key), q(p.name), q(p.category), q(p.category), p.order, q(p.icon),
      p.default, p.starter, !p.starter, !p.starter, q(p.rarity), p.price ?? "NULL", q(p.release),
      json({ source: "avatar-art" }), 2, q(p.category), json(p.parts), json(p.dyes), arr(p.hides), arr(p.occupies), p.order,
    ].join(", ")})`;
  });
  const keys = Object.keys(items).map(q).join(", ");
  const sql = `-- Generated by npm run art:avatar from avatar-art/. Do not edit by hand.
-- Upserts the avatar v2 catalog. Safe to run repeatedly.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.avatar_items WHERE art_version = 1 AND item_key IN (${keys})) THEN
        RAISE EXCEPTION 'An avatar-art item_key clashes with a legacy avatar item';
    END IF;
END $$;

INSERT INTO public.avatar_items (
    item_key, name, slot, equip_group, layer_order, asset_path,
    is_default, is_starter, is_tradeable, is_sellable, rarity, base_price, release_status,
    metadata, art_version, category, parts, dyes, hides, occupies, stack_order
)
VALUES
${rows.join(",\n")}
ON CONFLICT (item_key) DO UPDATE SET
    name = EXCLUDED.name,
    slot = EXCLUDED.slot,
    equip_group = EXCLUDED.equip_group,
    layer_order = EXCLUDED.layer_order,
    asset_path = EXCLUDED.asset_path,
    is_default = EXCLUDED.is_default,
    is_starter = EXCLUDED.is_starter,
    is_tradeable = EXCLUDED.is_tradeable,
    is_sellable = EXCLUDED.is_sellable,
    rarity = EXCLUDED.rarity,
    base_price = EXCLUDED.base_price,
    release_status = EXCLUDED.release_status,
    metadata = public.avatar_items.metadata || EXCLUDED.metadata,
    category = EXCLUDED.category,
    parts = EXCLUDED.parts,
    dyes = EXCLUDED.dyes,
    hides = EXCLUDED.hides,
    occupies = EXCLUDED.occupies,
    stack_order = EXCLUDED.stack_order
WHERE public.avatar_items.art_version = 2;
`;
  fs.writeFileSync(CATALOG_FILE, sql);
}

function toHex(r, g, b) {
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}
