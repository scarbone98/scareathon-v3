// Regenerates sculpted parts. A part in item.json that says
//   { "slot": "torso", "file": "sweater.m.txt", "build": "m", "sculpt": "clothing.mjs#sweater" }
// is rendered from avatar-art/sculpts/clothing.mjs, part "sweater", for build m.
//
//   node scripts/avatar-art/resculpt.mjs            every sculpted part
//   node scripts/avatar-art/resculpt.mjs horns tee  only these items
//
// Never hand-edit a sculpted .txt: put hand-drawn detail in its own part
// (same slot, listed after it) so re-sculpting can't wipe it.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ART_DIR, BUILDS } from "./lib.mjs";
import { renderPart } from "./sculpt.mjs";

export async function loadSculpt(specFile, partName, build = BUILDS[0]) {
  const spec = await import(pathToFileURL(specFile).href);
  const parts = typeof spec.parts === "function" ? spec.parts(build) : spec.parts;
  const part = parts?.[partName];
  if (!part) throw new Error(`No part "${partName}" in ${specFile}`);
  return part;
}

async function main(only) {
  const itemsDir = path.join(ART_DIR, "items");
  let count = 0;
  for (const key of fs.readdirSync(itemsDir).sort()) {
    if (only.length && !only.includes(key)) continue;
    const metaFile = path.join(itemsDir, key, "item.json");
    if (!fs.existsSync(metaFile)) continue;
    const meta = JSON.parse(fs.readFileSync(metaFile, "utf8"));
    for (const part of meta.parts) {
      if (!part.sculpt) continue;
      const [specName, partName] = part.sculpt.split("#");
      const sculpt = await loadSculpt(path.join(ART_DIR, "sculpts", specName), partName, part.build);
      fs.writeFileSync(path.join(itemsDir, key, part.file), renderPart(sculpt.shapes, sculpt));
      count++;
    }
  }
  console.log(`✓ Re-sculpted ${count} part(s).`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main(process.argv.slice(2));
}
