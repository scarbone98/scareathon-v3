// Prints a part file from a sculpt spec. See sculpt.mjs.
//   node scripts/avatar-art/sculpt-cli.mjs <spec.mjs> [part-name]
import path from "node:path";
import { pathToFileURL } from "node:url";
import { renderPart } from "./sculpt.mjs";

const [specFile, partName] = process.argv.slice(2);
const spec = await import(pathToFileURL(path.resolve(specFile)).href);
const part = partName ? spec.parts?.[partName] : spec.default;
if (!part) throw new Error(`No part "${partName || "default"}" in ${specFile}`);
process.stdout.write(renderPart(part.shapes, part));
