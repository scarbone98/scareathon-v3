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
import { composeOutfit as composeWith, loadCatalog, renderCatalog } from "./catalog.mjs";
import {
  ART_DIR,
  BUILDS,
  CATEGORIES,
  HEIGHT,
  SLOTS,
  WIDTH,
  encodePng,
  fillImage,
  pasteImage,
  scaleImage,
} from "./lib.mjs";

const checkOnly = process.argv.includes("--check");
const EXPORT_DIR = path.resolve("public/avatar-v2");
const PREVIEW_DIR = path.join(ART_DIR, "previews");
const PREVIEW_SCALE = 4;
const PREVIEW_BG = [24, 18, 32, 255];
const RULES_FILE = path.resolve("server/utils/avatarRules.json");
const CATALOG_FILE = path.resolve("server/db/avatar_catalog.sql");
const ICON_BUILD = "f";

const { palette, items, outfits, errors } = loadCatalog();

if (errors.length) {
  console.error(errors.map((e) => `  ✗ ${e}`).join("\n"));
  console.error(`\n${errors.length} problem(s) found.`);
  process.exit(1);
}
console.log(`✓ ${Object.keys(items).length} items and ${outfits.length} outfits are valid.`);
if (checkOnly) process.exit(0);

const rendered = renderCatalog(items, palette);
const composeOutfit = (outfit) => composeWith({ items, rendered, palette }, outfit);
const exported = {};
// Start clean so renamed or deleted items don't leave stale files behind.
fs.rmSync(path.join(EXPORT_DIR, "items"), { recursive: true, force: true });
for (const [key, item] of Object.entries(items)) {
  const dir = path.join(EXPORT_DIR, "items", key);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  exported[key] = { parts: [] };
  for (const [layerKey, layer] of Object.entries(rendered[key])) {
    const [slot, build = null] = layerKey.split(".");
    const src = writePng(dir, key, `${layerKey}.png`, layer.rgba, WIDTH, HEIGHT);
    if (slot === "mask") {
      const masks = [...new Set(item.parts.filter((p) => p.slot === "mask").flatMap((p) => p.masks))];
      exported[key].parts.push({ slot, build, src, masks });
    } else {
      exported[key].parts.push({ slot, build, src });
    }
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
