// Sculpting helper for first-pass art. Describe a part as rough 3D shapes
// (ellipsoids and tapered capsules), and this lights them all the same way and
// snaps the result to palette shades, printing a part file to refine by hand.
//
//   node scripts/avatar-art/sculpt-cli.mjs avatar-art/sculpts/base_body.mjs > avatar-art/items/base_body/body.txt
//
// Coordinates are canvas pixels: x right, y down, z toward the viewer.
// Shapes in the same group melt into each other (smooth union, `blend` px);
// different groups overlap with a hard edge and get a contact line.
// The .txt it prints becomes the source; see STYLE.md before re-running a
// sculpt over a part that has been touched up by hand.
import { HEIGHT, WIDTH } from "./lib.mjs";

// Light from the upper left, slightly in front (matches STYLE.md).
const LIGHT = normalize([-0.5, -0.62, 0.6]);
const Z_NEAR = 80;
const Z_FAR = -80;

export function normalize([x, y, z]) {
  const len = Math.hypot(x, y, z) || 1;
  return [x / len, y / len, z / len];
}

function rotateY([x, y, z], degrees) {
  const a = (degrees * Math.PI) / 180;
  const c = Math.cos(a), s = Math.sin(a);
  return [c * x + s * z, y, -s * x + c * z];
}

// Ellipsoid, optionally turned around the vertical axis (rotY, degrees).
export function ellipsoid(center, radii, options = {}) {
  const r = Math.max(...radii);
  return {
    ...options,
    bounds: [center[0] - r, center[1] - radii[1], center[0] + r, center[1] + radii[1]],
    sdf(p) {
      const q = rotateY([p[0] - center[0], p[1] - center[1], p[2] - center[2]], -(options.rotY || 0));
      const k0 = Math.hypot(q[0] / radii[0], q[1] / radii[1], q[2] / radii[2]);
      const k1 = Math.hypot(q[0] / radii[0] ** 2, q[1] / radii[1] ** 2, q[2] / radii[2] ** 2);
      return k1 === 0 ? -Math.min(...radii) : (k0 * (k0 - 1)) / k1;
    },
  };
}

export function sphere(center, radius, options = {}) {
  return ellipsoid(center, [radius, radius, radius], options);
}

// Round-ended tube from a to b whose radius goes from ra to rb.
export function capsule(a, b, ra, rb, options = {}) {
  const ba = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const baa = ba[0] ** 2 + ba[1] ** 2 + ba[2] ** 2;
  const r = Math.max(ra, rb);
  return {
    ...options,
    bounds: [Math.min(a[0], b[0]) - r, Math.min(a[1], b[1]) - r, Math.max(a[0], b[0]) + r, Math.max(a[1], b[1]) + r],
    sdf(p) {
      const pa = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
      const h = Math.min(1, Math.max(0, (pa[0] * ba[0] + pa[1] * ba[1] + pa[2] * ba[2]) / baa));
      return Math.hypot(pa[0] - ba[0] * h, pa[1] - ba[1] * h, pa[2] - ba[2] * h) - (ra + (rb - ra) * h);
    },
  };
}

function smin(a, b, k) {
  if (k <= 0) return Math.min(a, b);
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - (h * h * k) / 4;
}

function groupSdf(shapes, blend) {
  return (p) => shapes.reduce((d, s) => smin(d, s.sdf(p), s.blend ?? blend), Infinity);
}

// Lambert shading snapped to shades 1..4. `highlight: false` caps at 3.
export function shadeFor(normal, { highlight = true, bias = 0 } = {}) {
  const d = normal[0] * LIGHT[0] + normal[1] * LIGHT[1] + normal[2] * LIGHT[2] + bias;
  if (d > 0.93 && highlight) return 4;
  if (d > 0.45) return 3;
  if (d > 0.04) return 2;
  return 1;
}

// Renders shapes to a part file. Each shape needs:
//   group     shapes in the same group blend together
//   material  ramp name, or (x, y, z) => ramp name, or { ramp, shift } to push the
//             shade up or down (stripes, ribbing, folds); null cuts the pixel
// optional: blend (px, default 4), highlight, bias, clip (x, y, z) => true to cut.
// Part options: outline, contactLines, blend, despeckle (default true).
export function renderPart(shapes, { comment = "", outline = "auto", contactLines = true, blend = 4, despeckle: cleanUp = true } = {}) {
  const groups = new Map();
  for (const s of shapes) {
    if (!groups.has(s.group)) groups.set(s.group, []);
    groups.get(s.group).push(s);
  }
  const groupList = [...groups].map(([name, members]) => ({
    name,
    members,
    sdf: groupSdf(members, blend),
    bounds: members.reduce(
      (acc, s) => [Math.min(acc[0], s.bounds[0]), Math.min(acc[1], s.bounds[1]), Math.max(acc[2], s.bounds[2]), Math.max(acc[3], s.bounds[3])],
      [Infinity, Infinity, -Infinity, -Infinity]
    ),
  }));

  const cells = new Map();
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      let best = null;
      for (const group of groupList) {
        const [bx0, by0, bx1, by1] = group.bounds;
        if (x < bx0 - 6 || x > bx1 + 6 || y < by0 - 6 || y > by1 + 6) continue;
        const hit = march(group, x + 0.5, y + 0.5);
        if (hit && (!best || hit.z > best.z)) best = hit;
      }
      if (!best) continue;
      const cell = shadePixel(best, x, y);
      if (!cell) continue;
      cells.set(y * WIDTH + x, cell);
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
  }

  // Textures made of single-pixel speckle (stubble) opt out with despeckle: false.
  if (cleanUp) despeckle(cells);

  if (contactLines) {
    const darken = [];
    for (const [i, cell] of cells) {
      const x = i % WIDTH, y = Math.floor(i / WIDTH);
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        const other = cells.get(ny * WIDTH + nx);
        if (other && other.group !== cell.group && other.z > cell.z + 2) {
          darken.push(cell);
          break;
        }
      }
    }
    for (const cell of darken) cell.shade = 1;
  }

  return formatPart(cells, { minX, minY, maxX, maxY }, comment, outline);
}

// Removes stray pixels: a pixel whose shade matches none of its same-group
// neighbours takes the shade most of them share (if at least three agree).
function despeckle(cells) {
  const changes = [];
  for (const [i, cell] of cells) {
    const x = i % WIDTH, y = Math.floor(i / WIDTH);
    const shades = [];
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      const other = cells.get(ny * WIDTH + nx);
      if (other && other.group === cell.group && other.ramp === cell.ramp) shades.push(other.shade);
    }
    if (shades.length < 3 || shades.includes(cell.shade)) continue;
    const counts = {};
    for (const shade of shades) counts[shade] = (counts[shade] || 0) + 1;
    const [best, count] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    if (count >= 3) changes.push([cell, Number(best)]);
  }
  for (const [cell, shade] of changes) cell.shade = shade;
}

function march(group, px, py) {
  let z = Z_NEAR;
  for (let i = 0; i < 160 && z > Z_FAR; i++) {
    const d = group.sdf([px, py, z]);
    if (d < 0.05) {
      // The nearest member decides material, clip and shading options.
      const p = [px, py, z];
      let owner = group.members[0];
      let ownerD = Infinity;
      for (const s of group.members) {
        const sd = s.sdf(p);
        if (sd < ownerD) { ownerD = sd; owner = s; }
      }
      if (owner.clip && owner.clip(px, py, z)) return null;
      const e = 0.2;
      const normal = normalize([
        group.sdf([px + e, py, z]) - group.sdf([px - e, py, z]),
        group.sdf([px, py + e, z]) - group.sdf([px, py - e, z]),
        group.sdf([px, py, z + e]) - group.sdf([px, py, z - e]),
      ]);
      return { z, normal, owner, group: group.name };
    }
    z -= Math.max(d, 0.05);
  }
  return null;
}

function shadePixel(hit, x, y) {
  const { owner } = hit;
  const result = typeof owner.material === "function" ? owner.material(x, y, hit.z) : owner.material;
  if (!result) return null;
  const { ramp, shift = 0 } = typeof result === "string" ? { ramp: result } : result;
  const shade = Math.min(4, Math.max(1, shadeFor(hit.normal, owner) + shift));
  return { ramp, shade, z: hit.z, group: hit.group };
}

function formatPart(cells, { minX, minY, maxX, maxY }, comment, outline) {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const legend = new Map();
  const rows = [];
  for (let y = minY; y <= maxY; y++) {
    let row = "";
    for (let x = minX; x <= maxX; x++) {
      const cell = cells.get(y * WIDTH + x);
      if (!cell) { row += "."; continue; }
      const key = `${cell.ramp}.${cell.shade}`;
      if (!legend.has(key)) legend.set(key, chars[legend.size]);
      row += legend.get(key);
    }
    rows.push(row);
  }
  const legendLines = [...legend].sort((a, b) => a[0].localeCompare(b[0])).map(([key, ch]) => `  ${ch} = ${key}`);
  return [
    ...comment.split("\n").filter(Boolean).map((line) => `# ${line}`),
    `at: ${minX},${minY}`,
    `outline: ${outline}`,
    "legend:",
    ...legendLines,
    "---",
    ...rows,
    "",
  ].join("\n");
}
