// Writes the aquarium's shelf at the ticket counter (server/shared/pets/aquarium.js) from the
// catalogue the Pocket Aquarium game makes of its own things, so the names are the game's and
// the two cannot drift. The game no longer shows a price for anything, so what things cost is
// the counter's to say: the game's old prices, marked up by kind (MARK_UP): a new animal is a
// big purchase, ornaments are dear, and the rest is as it was.
//   in the game: godot --path . -- --no-save --catalogue=<folder>
//   here:        node scripts/pet-catalogue.mjs <folder>/catalogue.json server/shared/pets/aquarium.js
// (and copy <folder>/icons/*.png to public/pets/aquarium/)
import { readFileSync, writeFileSync } from "node:fs";

const [src, out] = process.argv.slice(2);
const read = JSON.parse(readFileSync(src, "utf8"));
const list = Array.isArray(read) ? read : read.items;
const GROUPS = { animal: "Animal", life: "Plants and small life", gear: "Gear", decor: "Ornament", size: "Bigger tank", home: "Home kit" };
const MARK_UP = { animal: 5, decor: 4 };
const priced = (item) => Math.max(Math.round((item.price * (MARK_UP[item.group] ?? 1)) / 10) * 10, 10);
const rows = list.map(
  (item) => `    { id: ${JSON.stringify(item.id)}, name: ${JSON.stringify(item.name)}, group: ${JSON.stringify(GROUPS[item.group] ?? item.group)}, price: ${priced(item)}, blurb: ${JSON.stringify(item.blurb ?? "")} },`
);
const head = [
  "// What the ticket counter sells for the aquarium on top of the lockers. `id` is the game's own",
  "// id for the thing (Pocket Aquarium: `fish:<kind>`, `tank:<kind>`, `size:<size>`, and its",
  "// goods). Everything here is put into the tank and so used up; each purchase is one.",
  "// Made from the game's own lists by scripts/pet-catalogue.mjs (which sets the prices): do not edit by hand.",
  "",
  "export const AQUARIUM_ITEMS = [",
];
writeFileSync(out, [...head, ...rows, "];", ""].join("\r\n"));
console.log(`${list.length} items`);
