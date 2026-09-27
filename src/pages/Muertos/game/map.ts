// The map: a few blocks of Old San Juan on a grid of 2 m cells. North is -z,
// toward the sea. The player starts in Plaza de San José and buys their way
// west down Calle San Sebastián, out onto the Campo del Morro and its
// seaside cemetery, and into El Morro, where the Pack-a-Punch waits.
//
// Cells:
//   x void            # house            C church front     W fortress wall
//   L low sea wall    k garita           H lighthouse       n cannon
//   T tomb            F statue           . cobbles          p plaza paving
//   g grass           d cemetery earth   e dirt path        s fortress floor
//   y grass under a palm
//   a b c   doors, solid until bought
//   B       a boarded window in a house
//   4-7     a wall buy painted on the wall
//   M box   J Coquí Cola   K Piragua Punch   D Café Colao   Q Pack-a-Punch

export const CELL = 2;
export const COLS = 46;
export const ROWS = 30;

export type ZoneId = 1 | 2 | 3 | 4;
export const ZONE_NAMES: Record<ZoneId, string> = {
  1: "Plaza de San José",
  2: "Calle San Sebastián",
  3: "Campo del Morro",
  4: "El Morro",
};

function build(): string[][] {
  const g: string[][] = Array.from({ length: ROWS }, () => Array<string>(COLS).fill("x"));
  const rect = (c0: number, r0: number, c1: number, r1: number, ch: string) => {
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) g[r][c] = ch;
  };
  const set = (c: number, r: number, ch: string) => (g[r][c] = ch);

  // The city: solid blocks of houses, with the street and plaza cut out.
  rect(24, 1, 45, 28, "#");
  rect(24, 18, 35, 21, ".");
  rect(37, 13, 44, 27, "p");
  rect(37, 12, 44, 12, "C");

  // El Morro: sea walls to the north and west, a tall land wall around the rest.
  rect(1, 1, 16, 1, "L");
  rect(1, 1, 1, 12, "L");
  rect(2, 2, 15, 11, "s");
  rect(16, 2, 16, 12, "W");
  rect(2, 12, 16, 12, "W");
  set(1, 1, "k");
  set(16, 1, "k");
  set(1, 12, "k");

  // The cemetery below the walls, by the sea.
  rect(17, 1, 22, 1, "L");
  rect(17, 2, 22, 12, "d");
  rect(23, 1, 23, 28, "W");
  set(23, 1, "k");

  // Campo del Morro: open lawn to the sea wall, closed off by the city wall.
  rect(1, 13, 1, 27, "L");
  rect(2, 13, 22, 27, "g");
  rect(1, 28, 23, 28, "W");
  set(1, 28, "k");
  set(1, 20, "k");

  // A worn path across the lawn from the city gate to El Morro's gate.
  for (let t = 0; t <= 1; t += 0.02) {
    const c = Math.round(22 + (12.5 - 22) * t);
    const r = Math.round(19 + (13 - 19) * t);
    for (const [dc, dr] of [[0, 0], [0, 1]]) if (g[r + dr]?.[c + dc] === "g") g[r + dr][c + dc] = "e";
  }

  // Doors.
  rect(36, 18, 36, 21, "a");
  rect(23, 19, 23, 20, "b");
  rect(12, 12, 13, 12, "c");

  // El Morro's courtyard.
  rect(13, 3, 14, 4, "H");
  for (const [c, r] of [[5, 2], [9, 2], [2, 6], [2, 9]]) set(c, r, "n");
  set(8, 7, "Q");

  // Tombs and palms.
  for (const [c, r] of [[18, 4], [21, 4], [19, 7], [21, 7], [18, 10], [21, 10], [19, 3]]) set(c, r, "T");
  for (const [c, r] of [[6, 15], [16, 17], [8, 23], [18, 25], [4, 26]]) set(c, r, "y");

  // The street and plaza.
  set(27, 17, "B");
  set(31, 22, "B");
  set(36, 15, "B");
  set(36, 25, "B");
  set(45, 16, "B");
  set(45, 23, "B");
  set(41, 28, "B");
  rect(40, 20, 41, 21, "F");

  // Wall buys, perks, the box.
  set(38, 28, "4");
  set(26, 22, "5");
  set(33, 17, "6");
  set(10, 28, "7");
  set(29, 18, "M");
  set(32, 21, "J");
  set(19, 15, "K");
  set(44, 13, "D");
  return g;
}

export const GRID = build();

const WALK = new Set([".", "p", "g", "d", "e", "s", "y"]);
const HOUSE = new Set(["#", "B", "4", "5", "6"]);

export const isWalkChar = (ch: string) => WALK.has(ch);
export const isHouse = (ch: string) => HOUSE.has(ch);
export const at = (c: number, r: number) => (r >= 0 && r < ROWS && c >= 0 && c < COLS ? GRID[r][c] : "x");

// How high a solid cell stands, for bullets. Low things can be shot over.
export function blockHeight(ch: string): number {
  switch (ch) {
    case "L":
      return 1.1;
    case "n":
      return 0.9;
    case "T":
      return 1.3;
    case "M":
      return 1.1;
    case "F":
      return 3.4;
    case "x":
      return 0;
    default:
      return 99;
  }
}

export const cellCenter = (c: number, r: number) => ({ x: (c + 0.5) * CELL, z: (r + 0.5) * CELL });
export const cellOf = (x: number, z: number) => ({ c: Math.floor(x / CELL), r: Math.floor(z / CELL) });

const DIRS: [number, number][] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

// The walkable neighbour of a solid cell, which way it faces.
function openSide(c: number, r: number): [number, number] {
  for (const [dc, dr] of DIRS) if (isWalkChar(at(c + dc, r + dr))) return [dc, dr];
  return [0, 1];
}

// ---------- doors ----------

export type DoorDef = { id: string; cells: [number, number][]; cost: number; zones: [ZoneId, ZoneId]; label: string };

export const DOORS: DoorDef[] = [
  { id: "a", cells: [], cost: 750, zones: [1, 2], label: "Clear the rubble" },
  { id: "b", cells: [], cost: 1000, zones: [2, 3], label: "Open the city gate" },
  { id: "c", cells: [], cost: 1250, zones: [3, 4], label: "Open El Morro" },
];
for (let r = 0; r < ROWS; r++) {
  for (let c = 0; c < COLS; c++) {
    const d = DOORS.find((x) => x.id === GRID[r][c]);
    if (d) d.cells.push([c, r]);
  }
}
export const doorCenter = (d: DoorDef) => {
  const x = d.cells.reduce((s, [c]) => s + (c + 0.5) * CELL, 0) / d.cells.length;
  const z = d.cells.reduce((s, [, r]) => s + (r + 0.5) * CELL, 0) / d.cells.length;
  return { x, z };
};

// ---------- zones ----------

// Every walkable cell's zone, found by flood fill with the doors shut.
export const ZONE: Int8Array = (() => {
  const z = new Int8Array(COLS * ROWS);
  const seeds: [number, number, ZoneId][] = [
    [40, 25, 1],
    [30, 20, 2],
    [10, 20, 3],
    [8, 9, 4],
  ];
  for (const [sc, sr, id] of seeds) {
    const q: [number, number][] = [[sc, sr]];
    z[sr * COLS + sc] = id;
    while (q.length) {
      const [c, r] = q.pop()!;
      for (const [dc, dr] of DIRS) {
        const nc = c + dc;
        const nr = r + dr;
        if (!isWalkChar(at(nc, nr)) || z[nr * COLS + nc]) continue;
        z[nr * COLS + nc] = id;
        q.push([nc, nr]);
      }
    }
  }
  // Door cells belong to both sides; give them the first.
  for (const d of DOORS) for (const [c, r] of d.cells) z[r * COLS + c] = d.zones[0];
  return z;
})();

export const zoneAt = (x: number, z: number): ZoneId | 0 => {
  const { c, r } = cellOf(x, z);
  if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return 0;
  return ZONE[r * COLS + c] as ZoneId | 0;
};

// ---------- spawns ----------

export type SpawnKind = "window" | "climb" | "ground";
export type SpawnDef = {
  kind: SpawnKind;
  zone: ZoneId;
  // Where the zombie appears, where it stops to tear boards or climb, and
  // where it steps into the map.
  from: { x: number; z: number };
  at: { x: number; z: number };
  to: { x: number; z: number };
  face: number; // yaw facing into the map
  cell: [number, number];
};

const yawOf = (dx: number, dz: number) => Math.atan2(dx, -dz);

export const SPAWNS: SpawnDef[] = (() => {
  const list: SpawnDef[] = [];
  const entry = (c: number, r: number, dc: number, dr: number, kind: SpawnKind, back: number): SpawnDef => {
    const ctr = cellCenter(c, r);
    const to = cellCenter(c + dc, r + dr);
    return {
      kind,
      zone: ZONE[(r + dr) * COLS + (c + dc)] as ZoneId,
      from: { x: ctr.x - dc * back, z: ctr.z - dr * back },
      at: { x: ctr.x + dc * (CELL / 2 - 0.35), z: ctr.z + dr * (CELL / 2 - 0.35) },
      to,
      face: yawOf(dc, dr),
      cell: [c, r],
    };
  };
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (GRID[r][c] !== "B") continue;
      const [dc, dr] = openSide(c, r);
      list.push(entry(c, r, dc, dr, "window", 0.6));
    }
  }
  // Up over El Morro's sea wall from the rocks below.
  for (const [c, r] of [[7, 1], [12, 1], [1, 4], [1, 10], [1, 16], [1, 24]] as [number, number][]) {
    const [dc, dr] = openSide(c, r);
    list.push(entry(c, r, dc, dr, "climb", 1.6));
  }
  // Out of the ground in the cemetery and the lawn.
  for (const [c, r] of [[20, 5], [18, 8], [22, 9], [20, 11], [17, 2], [3, 18], [10, 26], [20, 26]] as [number, number][]) {
    const p = cellCenter(c, r);
    list.push({ kind: "ground", zone: ZONE[r * COLS + c] as ZoneId, from: p, at: p, to: p, face: Math.PI, cell: [c, r] });
  }
  return list;
})();

// ---------- things to buy ----------

export type WallBuyDef = { weapon: string; x: number; z: number; face: number; cell: [number, number] };
export type PerkId = "coqui" | "piragua" | "cafe";
export type PerkDef = { id: PerkId; name: string; cost: number; blurb: string; color: string };

export const PERKS: Record<PerkId, PerkDef> = {
  coqui: { id: "coqui", name: "Coquí Cola", cost: 2500, blurb: "Take more hits", color: "#3fd46a" },
  piragua: { id: "piragua", name: "Piragua Punch", cost: 3000, blurb: "Reload faster", color: "#ff4fa0" },
  cafe: { id: "cafe", name: "Café Colao", cost: 2000, blurb: "Shoot faster, hit harder", color: "#c8894a" },
};

const WALLBUY_WEAPON: Record<string, string> = { "4": "carabina", "5": "escopeta", "6": "metralleta", "7": "rifle" };
const PERK_AT: Record<string, PerkId> = { J: "coqui", K: "piragua", D: "cafe" };

export type Spot = { x: number; z: number; face: number; cell: [number, number] };

export const WALLBUYS: WallBuyDef[] = [];
export const PERK_SPOTS: (Spot & { perk: PerkId })[] = [];
export let BOX_SPOT: Spot = { x: 0, z: 0, face: 0, cell: [0, 0] };
export let PAP_SPOT: Spot = { x: 0, z: 0, face: 0, cell: [0, 0] };

for (let r = 0; r < ROWS; r++) {
  for (let c = 0; c < COLS; c++) {
    const ch = GRID[r][c];
    const [dc, dr] = openSide(c, r);
    const ctr = cellCenter(c, r);
    // Where the thing faces: toward the open side.
    const face = yawOf(dc, dr);
    if (WALLBUY_WEAPON[ch]) {
      WALLBUYS.push({ weapon: WALLBUY_WEAPON[ch], x: ctr.x + dc * CELL * 0.5, z: ctr.z + dr * CELL * 0.5, face, cell: [c, r] });
    } else if (PERK_AT[ch]) {
      PERK_SPOTS.push({ perk: PERK_AT[ch], x: ctr.x, z: ctr.z, face, cell: [c, r] });
    } else if (ch === "M") {
      BOX_SPOT = { x: ctr.x, z: ctr.z, face, cell: [c, r] };
    } else if (ch === "Q") {
      PAP_SPOT = { x: ctr.x, z: ctr.z, face: Math.PI, cell: [c, r] };
    }
  }
}

export const PLAYER_START = { x: 40.5 * CELL, z: 25 * CELL, yaw: 0 };

// ---------- lamps ----------

// Wrought-iron lanterns on the walls, and the lights they throw.
export type Lamp = { x: number; y: number; z: number; face: number; color: [number, number, number]; radius: number };

export const LAMPS: Lamp[] = (() => {
  const out: Lamp[] = [];
  const add = (c: number, r: number, y: number, color: [number, number, number] = [1, 0.62, 0.28], radius = 9, side?: [number, number]) => {
    const [dc, dr] = side ?? openSide(c, r);
    const ctr = cellCenter(c, r);
    out.push({ x: ctr.x + dc * (CELL / 2 + 0.3), y, z: ctr.z + dr * (CELL / 2 + 0.3), face: yawOf(dc, dr), color, radius });
  };
  // The street.
  for (const [c, r] of [[25, 17], [30, 17], [35, 17], [28, 22], [34, 22], [24, 22]]) add(c, r, 3.4);
  // The plaza.
  for (const [c, r] of [[36, 13], [36, 23], [45, 13], [45, 20], [45, 27], [37, 28], [43, 28], [39, 12], [42, 12]]) add(c, r, 3.6);
  // El Morro and the campo walls get cooler, dimmer torches.
  for (const [c, r] of [[16, 5], [16, 10]]) add(c, r, 3.2, [1, 0.5, 0.22], 8, [-1, 0]);
  for (const [c, r] of [[4, 12], [10, 12], [15, 12]]) add(c, r, 3.2, [1, 0.5, 0.22], 8, [0, -1]);
  for (const [c, r] of [[5, 12], [11, 12], [14, 12]]) add(c, r, 3.4, [1, 0.55, 0.25], 9, [0, 1]);
  for (const [c, r] of [[23, 14], [23, 18], [23, 21], [23, 26], [6, 28], [15, 28], [20, 28]]) add(c, r, 3.4, [1, 0.55, 0.25], 9);
  return out;
})();

// ---------- walking ----------

// Whether a cell can be walked, given which doors are open.
export function makeWalkable(openDoors: Set<string>) {
  const w = new Uint8Array(COLS * ROWS);
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const ch = GRID[r][c];
      w[r * COLS + c] = isWalkChar(ch) || openDoors.has(ch) ? 1 : 0;
    }
  }
  return w;
}

// Distance in cells from the target over walkable cells, 8-way without
// cutting corners. Zombies walk downhill on it.
export function flowField(walk: Uint8Array, tc: number, tr: number, out: Float32Array) {
  out.fill(1e9);
  if (tc < 0 || tr < 0 || tc >= COLS || tr >= ROWS) return out;
  const i0 = tr * COLS + tc;
  out[i0] = 0;
  // A small binary heap would be neater; a bucketed queue is plenty here.
  const q: number[] = [i0];
  for (let h = 0; h < q.length; h++) {
    const i = q[h];
    const c = i % COLS;
    const r = (i / COLS) | 0;
    const d = out[i];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (!dc && !dr) continue;
        const nc = c + dc;
        const nr = r + dr;
        if (nc < 0 || nr < 0 || nc >= COLS || nr >= ROWS) continue;
        const ni = nr * COLS + nc;
        if (!walk[ni]) continue;
        if (dc && dr && (!walk[r * COLS + nc] || !walk[nr * COLS + c])) continue;
        const nd = d + (dc && dr ? 1.414 : 1);
        if (nd < out[ni] - 1e-4) {
          out[ni] = nd;
          q.push(ni);
        }
      }
    }
  }
  return out;
}

// Push a circle out of solid cells.
export function collide(walk: Uint8Array, p: { x: number; z: number }, rad: number) {
  const { c, r } = cellOf(p.x, p.z);
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const nc = c + dc;
      const nr = r + dr;
      const solid = nc < 0 || nr < 0 || nc >= COLS || nr >= ROWS || !walk[nr * COLS + nc];
      if (!solid) continue;
      const x0 = nc * CELL;
      const z0 = nr * CELL;
      const qx = Math.max(x0, Math.min(p.x, x0 + CELL));
      const qz = Math.max(z0, Math.min(p.z, z0 + CELL));
      const dx = p.x - qx;
      const dz = p.z - qz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= rad * rad) continue;
      if (d2 < 1e-8) {
        // Centre inside the block: push out the nearest side.
        const l = p.x - x0;
        const rr = x0 + CELL - p.x;
        const t = p.z - z0;
        const b = z0 + CELL - p.z;
        const m = Math.min(l, rr, t, b);
        if (m === l) p.x = x0 - rad;
        else if (m === rr) p.x = x0 + CELL + rad;
        else if (m === t) p.z = z0 - rad;
        else p.z = z0 + CELL + rad;
        continue;
      }
      const d = Math.sqrt(d2);
      p.x = qx + (dx / d) * rad;
      p.z = qz + (dz / d) * rad;
    }
  }
}

// Whether a straight line between two points stays over walkable ground.
export function clearLine(walk: Uint8Array, ax: number, az: number, bx: number, bz: number) {
  const len = Math.hypot(bx - ax, bz - az);
  const steps = Math.ceil(len / 0.5);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const { c, r } = cellOf(ax + (bx - ax) * t, az + (bz - az) * t);
    if (c < 0 || r < 0 || c >= COLS || r >= ROWS || !walk[r * COLS + c]) return false;
  }
  return true;
}

// Where a ray first meets something solid (walls and low walls it's below),
// as a distance along it. Walks the grid cell by cell.
export function rayWall(walk: Uint8Array, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, max: number) {
  let best = max;
  if (dy < -1e-6) best = Math.min(best, -oy / dy);
  const hl = Math.hypot(dx, dz);
  if (hl < 1e-6) return best;
  let c = Math.floor(ox / CELL);
  let r = Math.floor(oz / CELL);
  const stepC = dx > 0 ? 1 : -1;
  const stepR = dz > 0 ? 1 : -1;
  const tdC = Math.abs(CELL / (dx || 1e-9));
  const tdR = Math.abs(CELL / (dz || 1e-9));
  let tmC = dx > 0 ? ((c + 1) * CELL - ox) / dx : dx < 0 ? (c * CELL - ox) / dx : Infinity;
  let tmR = dz > 0 ? ((r + 1) * CELL - oz) / dz : dz < 0 ? (r * CELL - oz) / dz : Infinity;
  let t = 0;
  while (t < best) {
    if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return best;
    if (!walk[r * COLS + c]) {
      const ch = GRID[r][c];
      const h = DOORS.some((d) => d.id === ch) ? 99 : blockHeight(ch);
      // The ray's height as it enters and leaves this cell.
      const tOut = Math.min(tmC, tmR);
      const yIn = oy + dy * t;
      const yOut = oy + dy * tOut;
      if (Math.min(yIn, yOut) < h) {
        // Enters the block's top, or hits its side.
        if (yIn < h) return Math.min(best, t);
        return Math.min(best, t + (h - yIn) / (dy || -1e-9));
      }
    }
    if (tmC < tmR) {
      t = tmC;
      tmC += tdC;
      c += stepC;
    } else {
      t = tmR;
      tmR += tdR;
      r += stepR;
    }
  }
  return best;
}
