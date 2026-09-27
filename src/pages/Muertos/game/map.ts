// The map: Old San Juan on a grid of 2 m cells. North is -z, toward the
// sea. The player starts in Plaza de San José. The city loops two ways:
// south down Calle del Cristo past the Cathedral to Parque de las Palomas,
// west along Calle Fortaleza under its umbrellas, and back up Calle San
// Justo to Calle San Sebastián; or north up an alley to Calle Norzagaray on
// the sea wall, through a gate into the cemetery, and back across the Campo
// del Morro. West of the Campo, over the moat, stands El Morro. The fort stands in
// terraces: the Plaza de Armas in the middle, ringed by casemates; a ramp
// up to the Santa Bárbara battery and the lighthouse; and, through one more
// gate, a ramp down to the water battery on the rocks, where the
// Pack-a-Punch waits.
//
// Cells:
//   x void            # house            C church front     W fortress wall
//   L low sea wall    k garita           H lighthouse       n cannon
//   T tomb            F statue           . cobbles          p plaza paving
//   g grass           d cemetery earth   e dirt path        y grass under a palm
//   P fort plaza      U upper battery    V water battery    t fort passage
//   = bridge          m dry moat         S fort masonry     A casemate
//   R ramp wall       o cistern          r ramp up north    v ramp down south
//   Z cathedral front
//   I bar floor       E rooftop terrace  & bar counter      s u bar stairs
//   X Mofongo Mule    N bar stair rail
//   a b c w f h i j l   doors, solid until bought
//   B Y       a boarded window, in a house or a casemate
//   4-9       a wall buy painted on the wall
//   M box   J Coquí Cola   K Piragua Punch   D Café Colao   Q Pack-a-Punch

export const CELL = 2;
export const COLS = 90;
export const ROWS = 56;

export type ZoneId = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
export const ZONE_NAMES: Record<ZoneId, string> = {
  1: "Plaza de San José",
  2: "Calle San Sebastián",
  3: "Campo del Morro",
  4: "El Morro",
  5: "Batería del Agua",
  6: "Calle del Cristo",
  7: "Calle Fortaleza",
  8: "Calle Norzagaray",
};

function build(): string[][] {
  const g: string[][] = Array.from({ length: ROWS }, () => Array<string>(COLS).fill("x"));
  const rect = (c0: number, r0: number, c1: number, r1: number, ch: string) => {
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) g[r][c] = ch;
  };
  const set = (c: number, r: number, ch: string) => (g[r][c] = ch);
  const each = (cells: number[][], ch: string) => cells.forEach(([c, r]) => set(c, r, ch));

  // The city: solid blocks of houses, with the streets and plazas cut out.
  rect(54, 12, 89, 54, "#");
  rect(54, 28, 65, 31, ".");
  rect(67, 23, 74, 37, "p");
  rect(67, 22, 74, 22, "C");

  // Calle Norzagaray along the sea wall, and the alley down beside the
  // church to the plaza.
  rect(54, 11, 87, 11, "L");
  rect(54, 12, 86, 14, ".");
  rect(76, 15, 78, 25, ".");
  each([[88, 11]], "k");

  // Calle del Cristo south past the Cathedral to Parque de las Palomas,
  // over the bay.
  rect(69, 39, 71, 48, ".");
  rect(68, 40, 68, 44, "Z");
  rect(64, 49, 77, 53, "p");
  rect(63, 54, 78, 54, "L");
  each([[63, 54], [78, 54]], "k");

  // Calle Fortaleza west under the umbrellas, and Calle San Justo back up.
  rect(55, 45, 67, 47, ".");
  rect(55, 33, 57, 44, ".");

  // Campo del Morro: a wide lawn from the city wall to the moat, with the
  // cemetery below the walls by the sea.
  rect(27, 11, 52, 11, "L");
  rect(27, 12, 52, 37, "g");
  rect(47, 12, 52, 22, "d");
  rect(53, 11, 53, 38, "W");
  rect(53, 39, 53, 54, "#");
  rect(25, 38, 53, 38, "W");
  each([[27, 11], [37, 11], [53, 11], [53, 38]], "k");

  // A worn path across the lawn from the city gate to the bridge.
  for (let t = 0; t <= 1; t += 0.01) {
    const c = Math.round(52 + (27 - 52) * t);
    const r = Math.round(29 + (20 - 29) * t);
    for (const [dc, dr] of [[0, 0], [0, 1]]) if (g[r + dr]?.[c + dc] === "g") g[r + dr][c + dc] = "e";
  }

  // El Morro. Sea walls on three sides, the land wall facing the campo
  // behind a dry moat, and solid masonry that the terraces are cut from.
  rect(2, 5, 23, 35, "S");
  rect(1, 4, 23, 4, "L");
  rect(1, 4, 1, 36, "L");
  rect(1, 36, 23, 36, "L");
  rect(24, 4, 24, 36, "W");
  rect(25, 12, 26, 37, "m");
  rect(25, 20, 26, 21, "=");
  each([[1, 4], [24, 4], [1, 36], [24, 36], [1, 22]], "k");

  // The Santa Bárbara battery up top, with its parapet over the plaza.
  rect(2, 5, 23, 10, "U");
  rect(2, 11, 23, 11, "L");
  rect(17, 6, 18, 7, "H");
  each([[4, 5], [8, 5], [13, 5], [22, 5]], "n");

  // The Plaza de Armas, casemates round it, the passage in from the gate,
  // and the ramp up.
  rect(8, 12, 19, 27, "P");
  rect(7, 12, 7, 27, "A");
  rect(20, 12, 20, 27, "A");
  rect(7, 28, 20, 28, "A");
  rect(20, 20, 23, 21, "t");
  rect(13, 19, 14, 20, "o");
  rect(12, 11, 13, 14, "r");
  rect(11, 12, 11, 14, "R");
  rect(14, 12, 14, 14, "R");
  each([[7, 16], [7, 24], [20, 15], [20, 25], [13, 28], [17, 28]], "Y");

  // The water battery, down on the rocks along the west and south walls,
  // and the ramp down to it.
  rect(2, 13, 5, 32, "V");
  rect(2, 33, 22, 35, "V");
  rect(9, 29, 10, 32, "v");
  each([[2, 19], [2, 27], [6, 35], [13, 35], [20, 35]], "n");
  set(3, 14, "Q");

  // Doors.
  rect(66, 28, 66, 31, "a");
  rect(53, 29, 53, 30, "b");
  rect(24, 20, 24, 21, "c");
  rect(9, 28, 10, 28, "w");
  rect(69, 38, 71, 38, "f");
  rect(68, 45, 68, 47, "h");
  rect(55, 32, 57, 32, "i");
  rect(75, 24, 75, 25, "j");
  rect(53, 12, 53, 14, "l");

  // Tombs and palms.
  each([[48, 14], [51, 14], [49, 17], [51, 17], [48, 20], [51, 20], [49, 13]], "T");
  each([[36, 25], [46, 27], [38, 33], [48, 35], [34, 36], [31, 15], [40, 14], [33, 20], [29, 31], [43, 19]], "y");

  // The street and plaza.
  each([[57, 27], [61, 32], [66, 25], [66, 35], [75, 27], [75, 33], [73, 38]], "B");
  rect(70, 30, 71, 31, "F");
  // Windows on the new streets.
  each([[60, 15], [68, 15], [84, 15], [66, 11 + 4], [79, 18], [79, 23], [75, 19]], "B");
  each([[72, 41], [72, 46], [68, 48], [66, 48], [74, 48], [78, 51], [63, 51]], "B");
  each([[60, 44], [65, 44], [58, 48], [64, 48], [54, 36], [54, 41], [58, 35], [58, 40]], "B");
  each([[67, 51], [73, 51]], "y");

  // Two of the old city's bars. La Factoría, on San Sebastián: a bar room,
  // and stairs up to a rooftop terrace over Norzagaray and the sea.
  rect(60, 27, 61, 27, "I");
  rect(59, 24, 61, 26, "I");
  set(62, 26, "I");
  rect(62, 24, 62, 25, "N");
  rect(63, 23, 63, 26, "s");
  rect(59, 23, 62, 23, "L");
  rect(58, 16, 64, 22, "E");
  rect(58, 15, 64, 15, "L");
  rect(59, 24, 60, 24, "&");
  set(58, 16, "X");
  set(57, 19, "2");
  // El Batey, on Calle del Cristo: a dive bar, and a terrace over the park.
  rect(72, 41, 72, 42, "I");
  rect(73, 40, 74, 42, "I");
  set(75, 40, "I");
  rect(75, 41, 75, 42, "N");
  rect(76, 40, 76, 43, "u");
  rect(73, 43, 75, 43, "L");
  rect(73, 44, 77, 47, "E");
  rect(73, 48, 77, 48, "L");
  set(73, 42, "&");
  set(78, 44, "1");
  set(78, 46, "B");
  set(72, 46, "#");

  // Wall buys, perks, the box.
  set(68, 38, "4");
  set(59, 32, "5");
  set(61, 48, "8");
  set(72, 15, "9");
  set(65, 27, "6");
  set(40, 38, "7");
  set(59, 28, "M");
  set(62, 31, "J");
  set(49, 25, "K");
  set(67, 23, "D");
  return g;
}

export const GRID = build();

const WALK = new Set([".", "p", "g", "d", "e", "y", "P", "U", "V", "t", "=", "r", "v", "I", "E", "s", "u"]);
const HOUSE = new Set(["#", "B", "1", "2", "4", "5", "6", "8", "9"]);
const DOOR_CHARS = new Set(["a", "b", "c", "w", "f", "h", "i", "j", "l"]);

export const isWalkChar = (ch: string) => WALK.has(ch);
export const isHouse = (ch: string) => HOUSE.has(ch);
export const isDoor = (ch: string) => DOOR_CHARS.has(ch);
export const at = (c: number, r: number) => (r >= 0 && r < ROWS && c >= 0 && c < COLS ? GRID[r][c] : "x");

// ---------- heights ----------

// Floors: the terraces, and the two ramps, which climb along z.
const FLAT: Record<string, number> = { U: 4.5, V: -4.5, m: -4, E: 4.5 };
const RAMP: Record<string, { z0: number; z1: number; h0: number; h1: number }> = {
  r: { z0: 15 * CELL, z1: 11 * CELL, h0: 0, h1: 4.5 },
  v: { z0: 29 * CELL, z1: 33 * CELL, h0: 0, h1: -4.5 },
  s: { z0: 27 * CELL, z1: 23 * CELL, h0: 0, h1: 4.5 },
  u: { z0: 40 * CELL, z1: 44 * CELL, h0: 0, h1: 4.5 },
};
export const isStairs = (ch: string) => ch === "s" || ch === "u";

function cellFloor(ch: string, z: number) {
  const rp = RAMP[ch];
  if (rp) {
    const k = Math.max(0, Math.min(1, (z - rp.z0) / (rp.z1 - rp.z0)));
    return rp.h0 + (rp.h1 - rp.h0) * k;
  }
  return FLAT[ch] ?? 0;
}

// How tall things stand above whatever they sit on.
const STANDS: Record<string, number> = { L: 1.1, n: 0.9, T: 1.3, M: 1.1, F: 3.4, o: 1.0, Q: 3.2, J: 2.2, K: 2.2, D: 2.2, X: 2.2, H: 15, k: 4.3, "&": 1.1 };
// Masonry and walls stand to a fixed height.
const ABS: Record<string, number> = { W: 6.5, "7": 6.5, C: 14, Z: 15, S: 4.5, A: 4.5, Y: 4.5, R: 5.6, N: 3.2 };

const DIRS: [number, number][] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

// Where each cell's floor is (walkable) or what it sits on (props, low
// walls), and how high its top is.
export const BASE = new Float32Array(COLS * ROWS);
export const TOP = new Float32Array(COLS * ROWS);
(() => {
  const known = new Uint8Array(COLS * ROWS);
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const i = r * COLS + c;
      const ch = GRID[r][c];
      if (isWalkChar(ch) || ch === "m" || isDoor(ch)) {
        BASE[i] = cellFloor(ch, (r + 0.5) * CELL);
        known[i] = 1;
      } else if (!(ch in STANDS)) known[i] = 1;
    }
  }
  // Props and sea walls sit on the highest floor beside them; runs of wall
  // with no floor beside them take it from their neighbours.
  for (let pass = 0; pass < 6; pass++) {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const i = r * COLS + c;
        if (known[i] === 1) continue;
        let best = -Infinity;
        for (const [dc, dr] of DIRS) {
          const nc = c + dc;
          const nr = r + dr;
          if (nc < 0 || nr < 0 || nc >= COLS || nr >= ROWS) continue;
          const n = nr * COLS + nc;
          const nch = GRID[nr][nc];
          const ok = isWalkChar(nch) || (pass > 0 && known[n] === 2);
          if (!ok) continue;
          const f = isWalkChar(nch) ? Math.max(cellFloor(nch, nr * CELL), cellFloor(nch, (nr + 1) * CELL)) : BASE[n];
          best = Math.max(best, f);
        }
        if (best > -Infinity) {
          BASE[i] = best;
          known[i] = 2;
        }
      }
    }
  }
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const i = r * COLS + c;
      const ch = GRID[r][c];
      if (isWalkChar(ch) || ch === "m" || isDoor(ch)) TOP[i] = Math.max(cellFloor(ch, r * CELL), cellFloor(ch, (r + 1) * CELL));
      else if (ch === "x") TOP[i] = -18;
      else if (ch in STANDS) TOP[i] = BASE[i] + STANDS[ch];
      else if (ch in ABS) TOP[i] = ABS[ch];
      else TOP[i] = 99;
    }
  }
})();

// The ground under a point.
export function floorAt(x: number, z: number) {
  const c = Math.floor(x / CELL);
  const r = Math.floor(z / CELL);
  if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return 0;
  const ch = GRID[r][c];
  if (RAMP[ch]) return cellFloor(ch, z);
  return BASE[r * COLS + c];
}

// How high a solid cell stands, for bullets. Windows let shots through to
// whatever's climbing in; closed doors and houses stop everything.
function bulletTop(i: number, ch: string) {
  if (ch === "B" || ch === "Y") return -99;
  if (isDoor(ch) || isHouse(ch)) return 99;
  return TOP[i];
}

export const cellCenter = (c: number, r: number) => ({ x: (c + 0.5) * CELL, z: (r + 0.5) * CELL });
export const cellOf = (x: number, z: number) => ({ c: Math.floor(x / CELL), r: Math.floor(z / CELL) });

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
  { id: "w", cells: [], cost: 1500, zones: [4, 5], label: "Open the way down to the water battery" },
  { id: "f", cells: [], cost: 1000, zones: [1, 6], label: "Open Calle del Cristo" },
  { id: "h", cells: [], cost: 1000, zones: [6, 7], label: "Open Calle Fortaleza" },
  { id: "i", cells: [], cost: 1250, zones: [7, 2], label: "Clear the barricade" },
  { id: "j", cells: [], cost: 750, zones: [1, 8], label: "Open the alley" },
  { id: "l", cells: [], cost: 1000, zones: [8, 3], label: "Open the cemetery gate" },
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
    [70, 35, 1],
    [60, 30, 2],
    [40, 30, 3],
    [14, 24, 4],
    [10, 34, 5],
    [70, 44, 6],
    [60, 46, 7],
    [70, 13, 8],
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
      if (GRID[r][c] !== "B" && GRID[r][c] !== "Y") continue;
      const [dc, dr] = openSide(c, r);
      list.push(entry(c, r, dc, dr, "window", 0.6));
    }
  }
  // Up over the sea walls from the rocks below.
  for (const [c, r] of [[8, 4], [15, 4], [1, 7], [1, 17], [1, 28], [8, 36], [17, 36], [32, 11], [43, 11], [62, 11], [74, 11], [84, 11], [68, 54], [74, 54]] as [number, number][]) {
    const [dc, dr] = openSide(c, r);
    list.push(entry(c, r, dc, dr, "climb", 1.6));
  }
  // Out of the ground in the cemetery and the lawn.
  for (const [c, r] of [[50, 15], [48, 18], [52, 19], [50, 21], [47, 12], [33, 28], [40, 36], [50, 36], [30, 16], [38, 17], [30, 25]] as [number, number][]) {
    const p = cellCenter(c, r);
    list.push({ kind: "ground", zone: ZONE[r * COLS + c] as ZoneId, from: p, at: p, to: p, face: Math.PI, cell: [c, r] });
  }
  return list;
})();

// ---------- things to buy ----------

export type WallBuyDef = { weapon: string; x: number; z: number; face: number; cell: [number, number] };
export type PerkId = "coqui" | "piragua" | "cafe" | "mule";
export type PerkDef = { id: PerkId; name: string; cost: number; blurb: string; color: string };

export const PERKS: Record<PerkId, PerkDef> = {
  coqui: { id: "coqui", name: "Coquí Cola", cost: 2500, blurb: "Take more hits", color: "#3fd46a" },
  piragua: { id: "piragua", name: "Piragua Punch", cost: 3000, blurb: "Reload faster", color: "#ff4fa0" },
  cafe: { id: "cafe", name: "Café Colao", cost: 2000, blurb: "Shoot faster, hit harder", color: "#c8894a" },
  mule: { id: "mule", name: "Mofongo Mule", cost: 4000, blurb: "Carry a third gun", color: "#e0b030" },
};

const WALLBUY_WEAPON: Record<string, string> = { "1": "ametralladora", "2": "escopeta", "4": "carabina", "5": "escopeta", "6": "metralleta", "7": "rifle", "8": "carabina", "9": "metralleta" };
const PERK_AT: Record<string, PerkId> = { J: "coqui", K: "piragua", D: "cafe", X: "mule" };

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

export const PLAYER_START = { x: 70.5 * CELL, z: 35 * CELL, yaw: 0 };

// ---------- lamps ----------

// Wrought-iron lanterns on the walls, and the lights they throw.
export type Lamp = { x: number; y: number; z: number; face: number; color: [number, number, number]; radius: number };

export const LAMPS: Lamp[] = (() => {
  const out: Lamp[] = [];
  // y is above the floor the lamp looks out over.
  const add = (c: number, r: number, y: number, color: [number, number, number] = [1, 0.62, 0.28], radius = 9, side?: [number, number]) => {
    const [dc, dr] = side ?? openSide(c, r);
    const ctr = cellCenter(c, r);
    const floor = BASE[(r + dr) * COLS + (c + dc)];
    out.push({ x: ctr.x + dc * (CELL / 2 + 0.3), y: floor + y, z: ctr.z + dr * (CELL / 2 + 0.3), face: yawOf(dc, dr), color, radius });
  };
  const torch: [number, number, number] = [1, 0.5, 0.22];
  // The street.
  for (const [c, r] of [[55, 27], [59, 27], [62, 27], [66, 27], [58, 32], [64, 32], [54, 32]]) add(c, r, 3.4);
  // The plaza.
  for (const [c, r] of [[66, 23], [66, 33], [75, 23], [75, 30], [75, 37], [67, 38], [73, 38], [69, 22], [72, 22]]) add(c, r, 3.6);
  // The city wall and the campo's south wall.
  for (const [c, r] of [[53, 17], [53, 24], [53, 28], [53, 31], [53, 36]]) add(c, r, 3.4, [1, 0.55, 0.25], 9, [-1, 0]);
  // Norzagaray and the alley.
  for (const [c, r] of [[57, 15], [65, 15], [70, 15], [80, 15], [86, 15]]) add(c, r, 3.4, [1, 0.62, 0.28], 9, [0, -1]);
  // Inside the bars, and out on their terraces.
  add(60, 23, 2.6, [1, 0.45, 0.3], 7, [0, 1]);
  add(74, 43, 2.6, [1, 0.45, 0.3], 7, [0, -1]);
  add(57, 18, 2.8, [1, 0.7, 0.4], 9, [1, 0]);
  add(65, 21, 2.8, [1, 0.7, 0.4], 9, [-1, 0]);
  add(78, 45, 2.8, [1, 0.7, 0.4], 9, [-1, 0]);
  for (const [c, r] of [[75, 17], [79, 21], [75, 22]]) add(c, r, 3.4);
  // Cristo, the park, Fortaleza and San Justo.
  for (const [c, r] of [[72, 39], [68, 39]]) add(c, r, 3.4);
  add(72, 44, 3.4, [1, 0.62, 0.28], 9, [-1, 0]);
  for (const [c, r] of [[64, 49], [77, 49], [70, 48]]) add(c, r, 3.4, [1, 0.62, 0.28], 10);
  for (const [c, r] of [[57, 44], [63, 44], [67, 44], [56, 48], [60, 48], [66, 48]]) add(c, r, 3.6, [1, 0.66, 0.34], 9);
  for (const [c, r] of [[54, 34], [58, 38], [54, 43], [58, 43]]) add(c, r, 3.4);
  for (const [c, r] of [[30, 38], [36, 38], [45, 38], [50, 38]]) add(c, r, 3.4, [1, 0.55, 0.25], 9, [0, -1]);
  // El Morro: torches at the gate, round the plaza, up top and down below.
  for (const [c, r] of [[24, 18], [24, 23], [24, 12], [24, 30]]) add(c, r, 3.4, torch, 9, [1, 0]);
  for (const [c, r] of [[7, 14], [7, 20], [7, 26]]) add(c, r, 3.2, torch, 8, [1, 0]);
  for (const [c, r] of [[20, 13], [20, 18], [20, 23]]) add(c, r, 3.2, torch, 8, [-1, 0]);
  for (const [c, r] of [[11, 28], [15, 28], [19, 28]]) add(c, r, 3.2, torch, 8, [0, -1]);
  for (const [c, r] of [[24, 6], [24, 9]]) add(c, r, 2.6, torch, 8, [-1, 0]);
  for (const [c, r] of [[6, 16], [6, 23], [6, 30]]) add(c, r, 3.2, torch, 9, [-1, 0]);
  for (const [c, r] of [[12, 32], [17, 32], [22, 32]]) add(c, r, 3.2, torch, 9, [0, 1]);
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

// Where a ray first meets something solid (the ground, walls, low walls
// it's below), as a distance along it. Walks the grid cell by cell.
export function rayWall(walk: Uint8Array, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, max: number) {
  const best = max;
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
    const i = r * COLS + c;
    const h = walk[i] ? TOP[i] : bulletTop(i, GRID[r][c]);
    // The ray's height as it enters and leaves this cell.
    const tOut = Math.min(tmC, tmR);
    const yIn = oy + dy * t;
    const yOut = oy + dy * tOut;
    if (Math.min(yIn, yOut) < h) {
      // Enters the block's top (or the ground), or hits its side.
      if (yIn < h) return Math.min(best, t);
      return Math.min(best, t + (h - yIn) / (dy || -1e-9));
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
