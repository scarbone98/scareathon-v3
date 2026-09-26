// Prints one sculpted part file. See sculpt.mjs. Normally you want
// resculpt.mjs, which does this for every item part that names a sculpt.
//   node scripts/avatar-art/sculpt-cli.mjs <spec.mjs> <part> [build]
import path from "node:path";
import { loadSculpt } from "./resculpt.mjs";
import { renderPart } from "./sculpt.mjs";

const [specFile, partName, build] = process.argv.slice(2);
const part = await loadSculpt(path.resolve(specFile), partName, build);
process.stdout.write(renderPart(part.shapes, part));
