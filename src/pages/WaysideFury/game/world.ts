// Terrain uses tile collision; props use precise base rectangles. Positions are world pixels.
export const TILE = 16;
export type TileKind = "grass" | "dirt" | "road" | "water" | "sand" | "stone" | "ash" | "void" | "bridge" | "corrupt";
export interface CollisionRect { x: number; y: number; w: number; h: number }
export interface WorldProp {
  id: string;
  kind: "tree" | "pine" | "bush" | "rock" | "flower" | "lamp" | "fence" | "station" | "shop" | "home" | "shed" | "diner" | "bbq" | "sign" | "mailbox" | "vending" | "car" | "ambient-taxi" | "puddle" | "debris" | "chest" | "npc" | "crater" | "portal";
  // Sprite bounds; solid rectangles sit at the physical base, below the canopy.
  x: number; y: number; w: number; h: number; label?: string; color?: string;
  footprints?: CollisionRect[];
}
export interface WorldExit {
  id: string; name: string; x: number; y: number; w: number; h: number;
  target: number | "overworld" | "results" | "realm";
  entryX: number; entryY: number; requiresClear?: boolean;
}
export interface WorldSpawn {
  kind: "grunt" | "shooter" | "boss"; x: number; y: number;
  sprite?: "zombie" | "pumpkin" | "ghost" | "imp" | "shadowbeast"; miniBoss?: boolean;
}
export interface WorldMap {
  id: string; name: string; width: number; height: number; cols: number; rows: number;
  tiles: TileKind[]; collision: number[]; props: WorldProp[]; exits: WorldExit[];
  spawns: WorldSpawn[]; spawn: { x: number; y: number };
}

// A compact authoring language: paint terrain, place props with base footprints,
// then cut the doorway through the natural boundary. No rendering or DOM here.
function map(id: string, name: string, cols: number, rows: number, ground: TileKind): WorldMap {
  return { id, name, width: cols * TILE, height: rows * TILE, cols, rows,
    tiles: Array<TileKind>(cols * rows).fill(ground), collision: Array<number>(cols * rows).fill(0),
    props: [], exits: [], spawns: [], spawn: { x: 56, y: Math.floor(rows / 2) * TILE } };
}
function paint(m: WorldMap, x: number, y: number, w: number, h: number, tile: TileKind, solid = false) {
  for (let row = Math.max(0, Math.floor(y / TILE)); row < Math.min(m.rows, Math.ceil((y + h) / TILE)); row++) {
    for (let col = Math.max(0, Math.floor(x / TILE)); col < Math.min(m.cols, Math.ceil((x + w) / TILE)); col++) {
      m.tiles[row * m.cols + col] = tile; m.collision[row * m.cols + col] = solid ? 1 : 0;
    }
  }
}
// Match the renderer's ground contact, leaving tall sprites walkable behind.
function baseFootprints(kind: WorldProp["kind"], x: number, y: number, w: number, h: number): CollisionRect[] {
  const cx = x + w / 2, bottom = y + h;
  const base = (width: number, height: number, offset = 0): CollisionRect[] =>
    [{ x: cx - width / 2, y: bottom - height + offset, w: width, h: height }];
  switch (kind) {
    case "flower": case "puddle": case "debris": return [];
    case "bush": return base(Math.max(8, w * .6), 5);
    case "tree": case "pine": return base(4, 11, 1);
    case "lamp": return base(6, 6, 1);
    case "sign": case "mailbox": return base(4, 6, 1);
    case "vending": return base(w - 4, 10);
    case "rock": return base(14, 6);
    case "npc": return base(10, 6, 1);
    case "chest": return base(22, 12);
    case "car": case "ambient-taxi": return base(30, 17, 1);
    case "bbq": return base(24, 12, 4);
    case "fence": return base(w, 4, 1);
    case "portal":
      // Solid frame feet leave a wide opening through the glowing center.
      return [{ x: cx - 18, y: bottom - 8, w: 5, h: 10 },
        { x: cx + 13, y: bottom - 8, w: 5, h: 10 }];
    case "crater": {
      // Horizontal strips approximate the elliptical rim, not its tall artwork.
      const rx = w / 2, ry = w * 0.3, cy = y + h / 2, rim: CollisionRect[] = [];
      for (let top = -ry; top < ry; top += 4) {
        const height = Math.min(4, ry - top), near = Math.max(0, Math.max(top, -top - height));
        const outer = rx * Math.sqrt(Math.max(0, 1 - (near / ry) ** 2));
        const innerY = Math.max(Math.abs(top), Math.abs(top + height));
        const inner = (rx - 14) * Math.sqrt(Math.max(0, 1 - (innerY / (ry - 8)) ** 2));
        if (inner === 0) rim.push({ x: cx - outer, y: cy + top, w: outer * 2, h: height });
        else {
          rim.push({ x: cx - outer, y: cy + top, w: outer - inner, h: height });
          rim.push({ x: cx + inner, y: cy + top, w: outer - inner, h: height });
        }
      }
      return rim;
    }
    default: return [{ x: x + 3, y: y + h * 0.4, w: w - 6, h: h * 0.6 }];
  }
}
function prop(m: WorldMap, kind: WorldProp["kind"], x: number, y: number, w = 24, h = 32, label?: string) {
  const p: WorldProp = { id: `${m.id}-${kind}-${m.props.length}`, kind, x, y, w, h, label,
    footprints: baseFootprints(kind, x, y, w, h) };
  m.props.push(p);
  return p;
}
function boundary(m: WorldMap, tile: TileKind, tree: "pine" | "tree" = "tree") {
  paint(m, 0, 0, m.width, 32, tile, true); paint(m, 0, m.height - 32, m.width, 32, tile, true);
  paint(m, 0, 0, 32, m.height, tile, true); paint(m, m.width - 32, 0, 32, m.height, tile, true);
  for (let x = 0; x < m.width; x += 32) { prop(m, tree, x, 0); prop(m, tree, x, m.height - 40); }
  for (let y = 32; y < m.height - 32; y += 32) { prop(m, tree, 0, y); prop(m, tree, m.width - 24, y); }
}
function exit(m: WorldMap, e: WorldExit) {
  m.exits.push(e);
  paint(m, e.x, e.y, e.w, e.h, m.id.startsWith("blast") ? "dirt" : "stone");
  m.props = m.props.filter(p => !(p.x < e.x + e.w && p.x + p.w > e.x && p.y < e.y + e.h && p.y + p.h > e.y));
}
function overlaps(a: CollisionRect, b: CollisionRect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
function scatter(m: WorldMap, ground: "grass" | "ash", seed: number) {
  const reserved = [m.spawn, ...m.spawns].map(p => ({ x: p.x - 32, y: p.y - 32, w: 64, h: 64 }));
  reserved.push(...m.exits.map(e => ({ x: e.x - 32, y: e.y - 32, w: e.w + 64, h: e.h + 64 })));
  for (let n = 0; n < Math.floor(m.cols * m.rows / 22); n++) {
    const x = 48 + (n * 137 + seed * 47) % (m.width - 96);
    const y = 48 + (n * 83 + seed * 19) % (m.height - 96);
    const col = Math.floor(x / TILE), row = Math.floor(y / TILE);
    if (m.tiles[row * m.cols + col] !== ground || m.collision[row * m.cols + col]) continue;
    if (Math.abs(y - m.spawn.y) < 80) continue;
    const kind = ground === "grass" ? n % 3 === 0 ? "tree" : "flower" : n % 3 === 0 ? "pine" : "rock";
    const w = n % 3 === 0 ? 24 : 12, h = n % 3 === 0 ? 32 : 12;
    const footprints = baseFootprints(kind, x, y, w, h);
    // Require open ground around each solid base. This excludes painted paths,
    // bridges and chokepoints, and leaves room to pass between neighboring props.
    const safe = footprints.every(rect => {
      const clearance = { x: rect.x - 24, y: rect.y - 24, w: rect.w + 48, h: rect.h + 48 };
      if (reserved.some(area => overlaps(clearance, area))) return false;
      for (let py = clearance.y; py <= clearance.y + clearance.h; py += 4) {
        for (let px = clearance.x; px <= clearance.x + clearance.w; px += 4) {
          if (tileAt(m, Math.floor(px / TILE), Math.floor(py / TILE)) !== ground || isBlocked(m, px, py, 10)) return false;
        }
      }
      return true;
    });
    if (safe) prop(m, kind, x, y, w, h);
  }
}

export const OVERWORLD = (() => {
  const m = map("overworld", "Wayside County", 80, 45, "grass");
  boundary(m, "grass");
  paint(m, 224, 192, 224, 208, "sand"); paint(m, 240, 208, 192, 176, "water", true);
  paint(m, 864, 80, 272, 144, "sand"); paint(m, 880, 96, 240, 112, "water", true);
  paint(m, 144, 448, 1024, 64, "road"); paint(m, 176, 352, 64, 144, "road");
  paint(m, 624, 144, 64, 336, "road"); paint(m, 1056, 320, 64, 192, "road");
  paint(m, 1008, 480, 64, 112, "road");
  paint(m, 1008, 256, 176, 160, "ash"); paint(m, 1024, 272, 144, 112, "corrupt");
  paint(m, 576, 80, 160, 160, "corrupt"); paint(m, 944, 544, 176, 96, "corrupt");
  prop(m, "station", 136, 320, 160, 112, "Wayside Station");
  prop(m, "crater", 1024, 272, 160, 96);
  // Overworld portals are rendered at their location markers, at these base positions.
  prop(m, "portal", 632, 120, 48, 56); prop(m, "portal", 1008, 504, 48, 56);
  for (let x = 336; x < 1040; x += 144) {
    prop(m, "lamp", x, 422, 12, 30);
    if (x === 336) {
      // Two short runs frame the cab's pullout instead of crossing its body.
      prop(m, "fence", 328, 526, 32, 12); prop(m, "fence", 448, 526, 32, 12);
    } else prop(m, "fence", x + 32, 526, 64, 12);
  }
  // A separate pullout keeps this NPC cab off the player's starting position
  // and leaves both traffic lanes open after the crash.
  paint(m, 368, 512, 64, 32, "road");
  const cab = prop(m, "ambient-taxi", 384, 512, 32, 18); cab.id = "ambient-roadside-taxi";
  const lore = prop(m, "sign", 456, 420, 24, 24, "Old County Road"); lore.id = "roadside-lore-sign";
  const machine = prop(m, "vending", 550, 398, 22, 34, "Candy machine"); machine.id = "roadside-vending";
  prop(m, "diner", 464, 330, 112, 64, "Last Light Diner");
  paint(m, 500, 394, 40, 54, "dirt");
  // Passing lane traffic replaces parked cars embedded in roadside scenery.
  prop(m, "rock", 292, 526, 24, 16);
  prop(m, "tree", 748, 274, 24, 32);
  prop(m, "sign", 1000, 414, 24, 24, "Blast Site · East");
  for (const [x, y] of [[314, 528], [716, 412], [926, 527]]) prop(m, "mailbox", x, y, 14, 22);
  for (let n = 0; n < 22; n++) {
    const x = 282 + n * 39, y = n % 2 ? 556 + n % 3 * 11 : 393 - n % 3 * 14;
    if (x > 472 && x < 580 && y < 448 || x > 1000 && y < 440) continue;
    prop(m, n % 4 ? "bush" : "pine", x, y, n % 4 ? 22 : 24, n % 4 ? 14 : 36);
    prop(m, "flower", x + 19, y + 16, 18, 12);
  }
  for (const [x, y, w] of [[766, 473, 26], [307, 483, 18], [990, 450, 22]]) prop(m, "puddle", x, y, w, 7);
  for (let n = 0; n < 16; n++) {
    const x = 950 + (n * 29) % 235, y = 244 + (n * 41) % 184;
    if (x < 1008 || y > 415) prop(m, n % 3 ? "debris" : "rock", x, y, n % 3 ? 11 : 22, n % 3 ? 7 : 17);
  }
  prop(m, "crater", 916, 368, 38, 25); prop(m, "crater", 1187, 400, 30, 20);
  m.spawn = { x: 208, y: 480 }; scatter(m, "grass", 9); return m;
})();
export const HUB_WORLD = (() => {
  const m = map("hub", "Wayside Town", 60, 34, "grass"); boundary(m, "grass");
  paint(m, 64, 288, 832, 64, "road"); paint(m, 448, 160, 64, 352, "dirt");
  paint(m, 128, 224, 80, 80, "dirt"); paint(m, 736, 240, 80, 64, "dirt");
  paint(m, 352, 160, 256, 80, "stone");
  paint(m, 64, 384, 208, 112, "sand"); paint(m, 80, 400, 176, 80, "water", true);
  prop(m, "station", 368, 64, 224, 112, "Wayside Station");
  prop(m, "shop", 104, 144, 128, 80, "Shop");
  prop(m, "home", 704, 144, 144, 96, "Home");
  prop(m, "shed", 672, 384, 80, 64);
  prop(m, "bbq", 768, 400, 32, 32); prop(m, "fence", 672, 480, 192, 12);
  prop(m, "npc", 816, 384, 16, 24, "Jon"); prop(m, "npc", 336, 224, 16, 24, "Alex");
  prop(m, "car", 520, 424, 40, 24); prop(m, "sign", 412, 408, 24, 24, "Taxi");
  for (let x = 256; x < 704; x += 112) { prop(m, "lamp", x, 260, 12, 32); prop(m, "flower", x + 32, 360, 24, 12); }
  m.spawn = { x: 480, y: 416 }; scatter(m, "grass", 2); return m;
})();

// Compact mixed groups leave a clear entrance apron and space between fights.
function encounter(m: WorldMap, x: number, y: number, sprite?: WorldSpawn["sprite"]) {
  for (const [kind, dx, dy] of [["grunt", -24, -20], ["grunt", -16, 20], ["shooter", 28, 0]] as const) {
    let placed = false;
    for (const offsetY of [0, 24, -24, 48, -48, 72, -72]) {
      for (const offsetX of [0, 24, -24, 48, -48]) {
        const point = { x: x + dx + offsetX, y: y + dy + offsetY };
        if (isBlocked(m, point.x, point.y, 10) || Math.hypot(point.x - m.spawn.x, point.y - m.spawn.y) < 150) continue;
        if (m.exits.some(door => distanceToExit(door, point.x, point.y) < 120)) continue;
        if (m.spawns.some(other => Math.hypot(point.x - other.x, point.y - other.y) < 24)) continue;
        m.spawns.push({ kind, ...point, ...(sprite && kind === "grunt" ? { sprite } : {}) });
        placed = true; break;
      }
      if (placed) break;
    }
    if (!placed) throw new Error(`No safe encounter slot in ${m.id} at ${x},${y}`);
  }
}

export const WATCHER_ROOM = 7;
export const GATEKEEPER_ROOM = 4;
const ZONES = [
  ["Scorched Road", 40, 24], ["Split Creek", 60, 34], ["Ruined Yard", 40, 24],
  ["Furnace Pass", 80, 34], ["Sentinel Gate", 40, 24], ["Shattered Courtyard", 60, 34],
  ["Rift Approach", 40, 24], ["The Watcher's Hollow", 40, 24],
  ["Ash Orchard", 40, 24], ["Old Supply Depot", 40, 24],
] as const;
export const BLAST_WORLDS: WorldMap[] = ZONES.map(([name, cols, rows], room) => {
  const m = map(`blast-${room}`, name, cols, rows, "ash"); boundary(m, "stone", "pine");
  const cy = m.spawn.y;
  paint(m, 32, cy - 64, m.width - 64, 128, "dirt");
  paint(m, 112, cy - 80, 64, 16, "sand"); paint(m, m.width - 192, cy + 64, 112, 16, "sand");
  if (room === 1) {
    paint(m, 432, 32, 96, m.height - 64, "sand"); paint(m, 448, 32, 64, m.height - 64, "water", true);
    paint(m, 416, cy - 48, 128, 96, "bridge"); paint(m, 288, 0, 80, cy + 32, "dirt");
  }
  if (room === 2 || room === 5 || room === 9) {
    prop(m, "shed", m.width - 208, 64, 112, 72);
    prop(m, "fence", 96, m.height - 80, 144, 12);
    prop(m, "car", 288, 80, 40, 24);
  }
  if (room === 3) {
    paint(m, 640, cy, 96, m.height - cy, "dirt");
    paint(m, 144, 32, 192, 112, "stone", true); paint(m, 656, 64, 208, 96, "stone", true);
  }
  if (room === 4) {
    paint(m, 160, cy - 80, 320, 160, "stone");
    prop(m, "lamp", 184, cy - 100, 16, 40); prop(m, "lamp", 456, cy - 100, 16, 40);
  }
  if (room === 6 || room === 7) {
    paint(m, 176, cy - 96, 352, 192, "corrupt");
    prop(m, "crater", 232, cy - 64, 176, 112);
    prop(m, "portal", m.width - 104, cy - 80, 48, 64);
  }
  if (room < 8) {
    exit(m, { id: "west", name: room === 0 ? "Return to taxi" : ZONES[room - 1][0],
      x: 0, y: cy - 48, w: 48, h: 96, target: room === 0 ? "overworld" : room - 1,
      entryX: room === 0 ? 1088 : ZONES[room - 1][1] * TILE - 64,
      entryY: room === 0 ? 400 : Math.floor(ZONES[room - 1][2] / 2) * TILE });
    exit(m, { id: "east", name: room === WATCHER_ROOM ? "Enter the realm rift" : ZONES[room + 1][0],
      x: m.width - 48, y: cy - 48, w: 48, h: 96, target: room === WATCHER_ROOM ? "realm" : room + 1,
      entryX: 56, entryY: room === WATCHER_ROOM ? 192 : Math.floor(ZONES[room + 1][2] / 2) * TILE, requiresClear: true });
  }
  if (room === 1) exit(m, { id: "north", name: "Ash Orchard · optional", x: 288, y: 0, w: 80, h: 48,
    target: 8, entryX: 328, entryY: 320 });
  if (room === 3) exit(m, { id: "south", name: "Old Supply Depot · optional", x: 640, y: m.height - 48, w: 96, h: 48,
    target: 9, entryX: 328, entryY: 64 });
  if (room === 8 || room === 9) {
    paint(m, 288, 0, 80, m.height, "dirt");
    const orchard = room === 8;
    exit(m, { id: orchard ? "south" : "north", name: orchard ? "Split Creek" : "Furnace Pass",
      x: 288, y: orchard ? m.height - 48 : 0, w: 80, h: 48, target: orchard ? 1 : 3,
      entryX: orchard ? 328 : 688, entryY: orchard ? 64 : 480 });
    const chest = prop(m, "chest", 480, cy - 16, 24, 24, orchard ? "Orchard cache" : "Supply cache");
    chest.id = `loot-blast-${room}`;
    if (orchard) prop(m, "npc", 144, 128, 16, 24, "Stranded scout");
  }
  if (room === WATCHER_ROOM || room === GATEKEEPER_ROOM) {
    m.spawns = [{ kind: "boss", x: room === WATCHER_ROOM ? 464 : 368, y: cy, miniBoss: room === GATEKEEPER_ROOM }];
  } else {
    const anchors = m.width > 1000 ? [240, 500, 760, 1020] : m.width > 800 ? [240, 480, 720] : [240, 448];
    for (const x of anchors) encounter(m, x, cy + (room === 6 && x < 400 ? 80 : 0));
  }
  scatter(m, "ash", room + 5);
  return m;
});
export const REALM_WORLD = (() => {
  const m = map("realm-0", "The 8-Bit Realm", 40, 24, "corrupt"); boundary(m, "void", "pine");
  paint(m, 32, 128, 576, 128, "stone");
  prop(m, "portal", 552, 96, 48, 64);
  exit(m, { id: "east", name: "To be continued", x: 592, y: 144, w: 48, h: 96,
    target: "results", entryX: 0, entryY: 0, requiresClear: true });
  encounter(m, 240, 192, "pumpkin"); encounter(m, 448, 192, "ghost"); return m;
})();
export const TEST_WORLD = (() => {
  const m = map("training", "Training Yard", 20, 12, "grass");
  m.height = 180; // Authored training-yard boundary, independent of the camera.
  paint(m, 0, 0, 320, 48, "stone", true); paint(m, 0, 168, 320, 24, "stone", true);
  paint(m, 0, 0, 16, 192, "stone", true); paint(m, 304, 0, 16, 192, "stone", true);
  m.spawn = { x: 75, y: 110 }; return m;
})();
export function getWorld(scene: string, room = 0): WorldMap {
  return scene === "overworld" ? OVERWORLD : scene === "hub" ? HUB_WORLD : scene === "dungeon" ? BLAST_WORLDS[room] ?? BLAST_WORLDS[0] : scene === "realm" ? REALM_WORLD : TEST_WORLD;
}
export function tileAt(m: WorldMap, col: number, row: number): TileKind {
  if (col < 0 || row < 0 || col >= m.cols || row >= m.rows) return "void";
  return m.tiles[row * m.cols + col] ?? "void";
}
function hitsRect(rect: CollisionRect, x: number, y: number, radius: number): boolean {
  if (radius === 0) return x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h;
  if (x + radius <= rect.x || x - radius >= rect.x + rect.w || y + radius <= rect.y || y - radius >= rect.y + rect.h) return false;
  const nearX = Math.max(rect.x, Math.min(x, rect.x + rect.w));
  const nearY = Math.max(rect.y, Math.min(y, rect.y + rect.h));
  return (x - nearX) ** 2 + (y - nearY) ** 2 < radius ** 2;
}
export function isBlocked(m: WorldMap, x: number, y: number, radius = 7): boolean {
  if (x - radius < 0 || y - radius < 0 || x + radius > m.width || y + radius > m.height) return true;
  for (let row = Math.floor((y - radius) / TILE); row <= Math.floor((y + radius) / TILE); row++) {
    for (let col = Math.floor((x - radius) / TILE); col <= Math.floor((x + radius) / TILE); col++) {
      if (m.collision[row * m.cols + col] && hitsRect({ x: col * TILE, y: row * TILE, w: TILE, h: TILE }, x, y, radius)) return true;
    }
  }
  for (const p of m.props) for (const rect of p.footprints ?? []) {
    if (hitsRect(rect, x, y, radius)) return true;
  }
  return false;
}
// A smaller room stays centered; a larger map follows within its own bounds.
// Width and height are supplied by the renderer, never by gameplay rules.
export function cameraTarget(m: WorldMap, x: number, y: number, width: number, height: number, faceX = 0, faceY = 0) {
  return {
    x: m.width <= width ? (m.width - width) / 2 : Math.max(0, Math.min(m.width - width, x - width / 2 + faceX * 28)),
    y: m.height <= height ? (m.height - height) / 2 : Math.max(0, Math.min(m.height - height, y - height / 2 + faceY * 18)),
  };
}
export function distanceToExit(e: WorldExit, x: number, y: number): number {
  return Math.hypot(x - Math.max(e.x, Math.min(x, e.x + e.w)), y - Math.max(e.y, Math.min(y, e.y + e.h)));
}
