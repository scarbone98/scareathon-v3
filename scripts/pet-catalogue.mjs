// Writes the aquarium's shelf at the ticket counter (server/shared/pets/aquarium.js) from the
// catalogue the Pocket Aquarium game makes of its own things, so the names and prices are the
// game's and the two cannot drift.
//   in the game: godot --path . -- --no-save --catalogue=<folder>
//   here:        node scripts/pet-catalogue.mjs <folder>/catalogue.json server/shared/pets/aquarium.js
// (and copy <folder>/icons/*.png to public/pets/aquarium/)
import { readFileSync, writeFileSync } from "node:fs";

const [src, out] = process.argv.slice(2);
const read = JSON.parse(readFileSync(src, "utf8"));
const list = Array.isArray(read) ? read : read.items;
const GROUPS = { animal: "Animal", life: "Plants and small life", gear: "Gear", decor: "Ornament", size: "Bigger tank", home: "Home kit" };
const rows = list.map(
  (item) => `    { id: ${JSON.stringify(item.id)}, name: ${JSON.stringify(item.name)}, group: ${JSON.stringify(GROUPS[item.group] ?? item.group)}, price: ${item.price}, blurb: ${JSON.stringify(item.blurb ?? "")} },`
);
const head = [
  "// What the ticket counter sells for the aquarium on top of the lockers. `id` is the game's own",
  "// id for the thing (Pocket Aquarium: `fish:<kind>`, `tank:<kind>`, `size:<size>`, and its",
  "// goods). Everything here is put into the tank and so used up; each purchase is one.",
  "// Made from the game's own lists by scripts/pet-catalogue.mjs: do not edit by hand.",
  "",
  "export const AQUARIUM_ITEMS = [",
];
writeFileSync(out, [...head, ...rows, "];", ""].join("\r\n"));
console.log(`${list.length} items`);
