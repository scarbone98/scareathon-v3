// Builds the pixel avatar art in pixel-avatar/.
//
//   node scripts/pixel-avatar/build.mjs           validate, export, render previews
//   node scripts/pixel-avatar/build.mjs --check   validate only
//
// Exports public/avatar-px/items/<item>/<part>.png (each part's frames side by
// side, default colours) plus an icon.png per item, public/avatar-px/manifest.json
// for the browser, server/utils/avatarRules.json for the API's validation and
// server/db/avatar_catalog.sql to upsert the catalog. It also renders every
// look in pixel-avatar/outfits/ to pixel-avatar/previews/.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { composeFrame, loadCatalog } from "./catalog.mjs";
import { ART_DIR, CATEGORIES, HEIGHT, SLOTS, WIDTH, encodePng, fillImage, pasteImage, scaleImage, toHex } from "./lib.mjs";

export const ART_VERSION = 3;
const checkOnly = process.argv.includes("--check");
const EXPORT_DIR = path.resolve("public/avatar-px");
const PUBLIC_PATH = "/avatar-px";
const PREVIEW_DIR = path.join(ART_DIR, "previews");
const PREVIEW_BG = [36, 32, 52, 255];
const RULES_FILE = path.resolve("server/utils/avatarRules.json");
const CATALOG_FILE = path.resolve("server/db/avatar_catalog.sql");
const ICON_BODY = "body_kid";

const catalog = loadCatalog();
const { palette, items, outfits, errors } = catalog;

if (errors.length) {
  console.error(errors.map((e) => `  ✗ ${e}`).join("\n"));
  console.error(`\n${errors.length} problem(s) found.`);
  process.exit(1);
}
console.log(`✓ ${Object.keys(items).length} items and ${outfits.length} outfits are valid.`);
if (checkOnly) process.exit(0);

// Start clean so renamed or deleted items don't leave stale files behind.
fs.rmSync(path.join(EXPORT_DIR, "items"), { recursive: true, force: true });
const exported = {};
for (const [key, item] of Object.entries(items)) {
  const dir = path.join(EXPORT_DIR, "items", key);
  fs.mkdirSync(dir, { recursive: true });
  exported[key] = {
    parts: item.parts.map((part, index) => {
      const { width, height, frames } = part.image;
      const strip = new Uint8ClampedArray(width * frames.length * height * 4);
      frames.forEach((frame, f) => {
        for (let y = 0; y < height; y++) {
          strip.set(frame.subarray(y * width * 4, (y + 1) * width * 4), (y * width * frames.length + f * width) * 4);
        }
      });
      const src = writePng(dir, key, `${index}-${part.slot}.png`, strip, width * frames.length, height);
      const payload = { slot: part.slot, anchor: part.anchor, x: part.x, y: part.y, w: width, h: height, frames: frames.length, src };
      if (part.fits) payload.fits = part.fits;
      return payload;
    }),
  };
}
for (const [key, item] of Object.entries(items)) {
  const icon = renderIcon(item);
  exported[key].icon = writePng(path.join(EXPORT_DIR, "items", key), key, "icon.png", icon.rgba, icon.width, icon.height);
}
const rules = colourRules();
writeManifest();
writeRules();
writeCatalogSql();
writePreviews();
console.log(`✓ Exported to ${path.relative(process.cwd(), EXPORT_DIR)}, previews in ${path.relative(process.cwd(), PREVIEW_DIR)}`);

// Writes a PNG and returns its public path with a content hash, so browsers
// pick up new art as soon as it ships.
function writePng(dir, key, file, rgba, width, height) {
  const png = encodePng(rgba, width, height);
  fs.writeFileSync(path.join(dir, file), png);
  const hash = crypto.createHash("sha1").update(png).digest("hex").slice(0, 10);
  return `${PUBLIC_PATH}/items/${key}/${file}?v=${hash}`;
}

// A shop/wardrobe icon: frame 0 of the item on the plain kid (so hair and
// glasses have a head under them), cropped square around the item. Bodies,
// companions and backgrounds show on their own.
function renderIcon(item) {
  const alone = ["body", "background", "companion"].includes(item.category) || !catalog.fitsBody(item, ICON_BODY);
  const look = (keys) => ({
    profile: palette.defaults,
    outfit: keys.map((key) => ({ item: items[key], dyes: {} })),
    body: alone ? (item.category === "body" ? item.key : null) : ICON_BODY,
  });
  const full = composeFrame(catalog, look(alone ? [item.key] : [ICON_BODY, item.key]), 0);
  const own = composeFrame(catalog, look([item.key]), 0);
  let minX = WIDTH, minY = HEIGHT, maxX = -1, maxY = -1;
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      if (own[(y * WIDTH + x) * 4 + 3] === 0) continue;
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
  }
  if (maxX < 0) [minX, minY, maxX, maxY] = [0, 0, WIDTH - 1, HEIGHT - 1];
  // 16, 24 or 32 px square, so icons scale to 96 px in whole pixels. Small
  // things still show a bit of head around them.
  const needed = Math.max(maxX - minX + 1, maxY - minY + 1) + 2;
  const size = [16, 24, 32].find((s) => s >= needed) || WIDTH;
  const left = Math.max(0, Math.min(WIDTH - size, Math.round((minX + maxX + 1 - size) / 2)));
  const top = Math.max(0, Math.min(HEIGHT - size, Math.round((minY + maxY + 1 - size) / 2)));
  const rgba = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    const from = ((top + y) * WIDTH + left) * 4;
    rgba.set(full.subarray(from, from + size * 4), y * size * 4);
  }
  return { rgba, width: size, height: size };
}

function colourRules() {
  return {
    skinTones: palette.choices.skin,
    hairColors: palette.choices.hair,
    eyeColors: palette.choices.eyes,
    dyeColors: [...new Set([...palette.choices.dye1, ...palette.choices.dye2])],
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
    starter: Boolean(item.starter),
    default: Boolean(item.default),
    rarity: item.rarity,
    price: item.price ?? null,
    release: item.release,
  };
}

function writeManifest() {
  const manifest = {
    width: WIDTH,
    height: HEIGHT,
    slots: SLOTS,
    categories: CATEGORIES,
    defaults: palette.defaults,
    choices: palette.choices,
    ...rules,
    ramps: Object.fromEntries(Object.entries(palette.ramps).map(([name, ramp]) => [name, ramp.map(toHex)])),
    // Each body's idle loop: frame count, speed, and per-frame anchor offsets.
    bases: Object.fromEntries(Object.values(items).filter((item) => item.rig).map((item) => [item.key, item.rig])),
    // The whole catalog as the database holds it (handy for tools and tests).
    items: Object.values(items).map(itemPayload),
  };
  fs.mkdirSync(EXPORT_DIR, { recursive: true });
  fs.writeFileSync(path.join(EXPORT_DIR, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
}

// What the API needs to validate a saved outfit.
function writeRules() {
  const serverRules = {
    artVersion: ART_VERSION,
    slots: SLOTS,
    categories: CATEGORIES,
    dyeChannels: ["dye1", "dye2"],
    ...rules,
  };
  fs.writeFileSync(RULES_FILE, JSON.stringify(serverRules, null, 2) + "\n");
}

// Idempotent upsert of every item into avatar_items. It refuses to touch rows
// from older art, so a clashing item_key fails loudly instead.
function writeCatalogSql() {
  const q = (value) => (value === null || value === undefined ? "NULL" : `'${String(value).replace(/'/g, "''")}'`);
  const json = (value) => `${q(JSON.stringify(value))}::jsonb`;
  const arr = (values) => `ARRAY[${values.map(q).join(", ")}]::text[]`;
  const rows = Object.values(items).map((item) => {
    const p = itemPayload(item);
    return `(${[
      q(p.key), q(p.name), q(p.category), q(p.category), p.order, q(p.icon),
      p.default, p.starter, !p.starter, !p.starter, q(p.rarity), p.price ?? "NULL", q(p.release),
      json({ source: "pixel-avatar" }), ART_VERSION, q(p.category), json(p.parts), json(p.dyes), arr(p.hides), arr(p.occupies), p.order,
    ].join(", ")})`;
  });
  const keys = Object.keys(items).map(q).join(", ");
  const sql = `-- Generated by npm run art:avatar from pixel-avatar/. Do not edit by hand.
-- Upserts the pixel avatar catalog (art_version ${ART_VERSION}). Safe to run repeatedly.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.avatar_items WHERE art_version <> ${ART_VERSION} AND item_key IN (${keys})) THEN
        RAISE EXCEPTION 'A pixel-avatar item_key clashes with an older avatar item';
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
WHERE public.avatar_items.art_version = ${ART_VERSION};

-- Items no longer in pixel-avatar/ stop being sold or granted.
UPDATE public.avatar_items
SET release_status = 'retired', is_starter = FALSE, is_default = FALSE
WHERE art_version = ${ART_VERSION} AND item_key NOT IN (${keys});
`;
  fs.writeFileSync(CATALOG_FILE, sql);
}

// Every outfit as an animated strip (all frames side by side) at 6x, plus a
// sheet with every outfit's frames and every item's icon.
function writePreviews() {
  fs.rmSync(PREVIEW_DIR, { recursive: true, force: true });
  fs.mkdirSync(PREVIEW_DIR, { recursive: true });
  const scale = 6;
  const gap = 2;
  const strips = outfits.map((outfit) => {
    const look = catalog.outfitLook(outfit);
    const frames = catalog.rigFor(look.body)?.frames || 1;
    const width = frames * (WIDTH + gap);
    const strip = fillImage(width, HEIGHT, PREVIEW_BG);
    for (let f = 0; f < frames; f++) pasteImage(strip, width, composeFrame(catalog, look, f), WIDTH, HEIGHT, f * (WIDTH + gap), 0);
    fs.writeFileSync(path.join(PREVIEW_DIR, `${outfit.id}.png`), encodePng(scaleImage(strip, width, HEIGHT, scale), width * scale, HEIGHT * scale));
    return { strip, width };
  });
  const icons = Object.values(items).map((item) => renderIcon(item));
  const iconCell = WIDTH;
  const perRow = 10;
  const sheetWidth = Math.max(...strips.map((s) => s.width), perRow * (iconCell + gap));
  const iconRows = Math.ceil(icons.length / perRow);
  const sheetHeight = strips.length * (HEIGHT + gap) + iconRows * (iconCell + gap);
  const sheet = fillImage(sheetWidth, sheetHeight, PREVIEW_BG);
  strips.forEach(({ strip, width }, i) => pasteImage(sheet, sheetWidth, strip, width, HEIGHT, 0, i * (HEIGHT + gap)));
  icons.forEach((icon, i) => {
    const left = (i % perRow) * (iconCell + gap) + Math.floor((iconCell - icon.width) / 2);
    const top = strips.length * (HEIGHT + gap) + Math.floor(i / perRow) * (iconCell + gap) + Math.floor((iconCell - icon.height) / 2);
    pasteImage(sheet, sheetWidth, icon.rgba, icon.width, icon.height, left, top);
  });
  const s = 4;
  fs.writeFileSync(path.join(PREVIEW_DIR, "_sheet.png"), encodePng(scaleImage(sheet, sheetWidth, sheetHeight, s), sheetWidth * s, sheetHeight * s));
}
