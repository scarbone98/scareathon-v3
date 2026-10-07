// Maps are tile layouts with a separate collision layer. All positions use world pixels.
export const TILE = 16;
export const VIEW_WIDTH = 320;
export const VIEW_HEIGHT = 180;
export type TileKind = "grass" | "dirt" | "road" | "water" | "sand" | "stone" | "ash" | "void" | "bridge" | "corrupt";
export interface WorldProp {
  id: string;
  kind: "tree" | "pine" | "rock" | "flower" | "lamp" | "fence" | "station" | "shop" | "home" | "shed" | "bbq" | "sign" | "car" | "chest" | "npc" | "crater" | "portal";
  // Top-left position and footprint, including trees and small decorations.
  x: number; y: number; w: number; h: number; label?: string; color?: string;
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

// A compact authoring language: paint tile rectangles, stamp collision footprints,
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
function prop(m: WorldMap, kind: WorldProp["kind"], x: number, y: number, w = 24, h = 32, solid = false, label?: string) {
  const p: WorldProp = { id: `${m.id}-${kind}-${m.props.length}`, kind, x, y, w, h, label };
  m.props.push(p);
  if (solid) {
    // Trees collide at the trunk, letting heroes walk behind the canopy.
    const trunk = kind === "tree" || kind === "pine";
    paint(m, trunk ? x + 8 : x, trunk ? y + h - 16 : y, trunk ? w - 16 : w, trunk ? 16 : h,
      m.tiles[Math.floor(y / TILE) * m.cols + Math.floor(x / TILE)] ?? "grass", true);
  }
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
function scatter(m: WorldMap, ground: "grass" | "ash", seed: number) {
  for (let n = 0; n < Math.floor(m.cols * m.rows / 22); n++) {
    const x = 48 + (n * 137 + seed * 47) % (m.width - 96);
    const y = 48 + (n * 83 + seed * 19) % (m.height - 96);
    const col = Math.floor(x / TILE), row = Math.floor(y / TILE);
    if (m.tiles[row * m.cols + col] !== ground || m.collision[row * m.cols + col]) continue;
    // Decorations stay out of the wide central encounter route.
    if (Math.abs(y - m.spawn.y) < 80) continue;
    prop(m, ground === "grass" ? n % 3 === 0 ? "tree" : "flower" : n % 3 === 0 ? "pine" : "rock",
      x, y, n % 3 === 0 ? 24 : 12, n % 3 === 0 ? 32 : 12);
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
  prop(m, "station", 136, 320, 160, 112, true, "Wayside Station");
  prop(m, "crater", 1024, 272, 160, 96);
  prop(m, "portal", 632, 144, 48, 56); prop(m, "portal", 1008, 528, 48, 56);
  for (let x = 336; x < 1040; x += 144) { prop(m, "lamp", x, 422, 12, 30); prop(m, "fence", x + 32, 526, 64, 12); }
  prop(m, "car", 352, 464, 32, 18); prop(m, "sign", 1000, 414, 24, 24);
  scatter(m, "grass", 9); m.spawn = { x: 208, y: 480 }; return m;
})();
export const HUB_WORLD = (() => {
  const m = map("hub", "Wayside Town", 60, 34, "grass"); boundary(m, "grass");
  paint(m, 64, 288, 832, 64, "road"); paint(m, 448, 160, 64, 352, "dirt");
  paint(m, 128, 224, 80, 80, "dirt"); paint(m, 736, 240, 80, 64, "dirt");
  paint(m, 352, 160, 256, 80, "stone");
  paint(m, 64, 384, 208, 112, "sand"); paint(m, 80, 400, 176, 80, "water", true);
  prop(m, "station", 368, 64, 224, 112, true, "Wayside Station");
  prop(m, "shop", 104, 144, 128, 80, true, "Shop");
  prop(m, "home", 704, 144, 144, 96, true, "Home");
  prop(m, "shed", 672, 384, 80, 64, true);
  prop(m, "bbq", 768, 400, 32, 32, true); prop(m, "fence", 672, 480, 192, 12, true);
  prop(m, "npc", 816, 384, 16, 24, false, "Jon"); prop(m, "npc", 336, 224, 16, 24, false, "Alex");
  prop(m, "car", 520, 424, 40, 24); prop(m, "sign", 412, 408, 24, 24, false, "Taxi");
  for (let x = 256; x < 704; x += 112) { prop(m, "lamp", x, 260, 12, 32); prop(m, "flower", x + 32, 360, 24, 12); }
  scatter(m, "grass", 2); m.spawn = { x: 480, y: 416 }; return m;
})();

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
    prop(m, "shed", m.width - 208, 64, 112, 72, true);
    prop(m, "fence", 96, m.height - 80, 144, 12, true);
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
  scatter(m, "ash", room + 5);
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
    const chest = prop(m, "chest", 480, cy - 16, 24, 24, false, orchard ? "Orchard cache" : "Supply cache");
    chest.id = `loot-blast-${room}`;
    if (orchard) prop(m, "npc", 144, 128, 16, 24, false, "Stranded scout");
  }
  if (room === WATCHER_ROOM || room === GATEKEEPER_ROOM) {
    m.spawns = [{ kind: "boss", x: 368, y: cy, miniBoss: room === GATEKEEPER_ROOM }];
  } else {
    m.spawns = [ { kind: "grunt", x: 224, y: cy - 24 }, { kind: "grunt", x: 288, y: cy + 32 },
      { kind: "shooter", x: Math.min(m.width - 128, 416), y: cy - 32 } ];
    if (room === 3 || room === 5) m.spawns.push({ kind: "grunt", x: 672, y: cy + 32 }, { kind: "shooter", x: 752, y: cy - 32 });
    if (room === 3) m.spawns.push({ kind: "grunt", x: 1008, y: cy - 24 }, { kind: "shooter", x: 1120, y: cy + 32 });
  }
  return m;
});
export const REALM_WORLD = (() => {
  const m = map("realm-0", "The 8-Bit Realm", 40, 24, "corrupt"); boundary(m, "void", "pine");
  paint(m, 32, 128, 576, 128, "stone");
  prop(m, "portal", 552, 96, 48, 64);
  exit(m, { id: "east", name: "To be continued", x: 592, y: 144, w: 48, h: 96,
    target: "results", entryX: 0, entryY: 0, requiresClear: true });
  m.spawns = [{ kind: "grunt", x: 224, y: 176, sprite: "pumpkin" },
    { kind: "grunt", x: 320, y: 224, sprite: "ghost" }, { kind: "shooter", x: 448, y: 176 }]; return m;
})();
export const TEST_WORLD = (() => {
  const m = map("training", "Training Yard", 20, 12, "grass");
  m.height = VIEW_HEIGHT;
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
export function isBlocked(m: WorldMap, x: number, y: number, radius = 7): boolean {
  if (x - radius < 0 || y - radius < 0 || x + radius > m.width || y + radius > m.height) return true;
  for (let row = Math.floor((y - radius) / TILE); row <= Math.floor((y + radius) / TILE); row++) {
    for (let col = Math.floor((x - radius) / TILE); col <= Math.floor((x + radius) / TILE); col++) {
      if (!m.collision[row * m.cols + col]) continue;
      const nearX = Math.max(col * TILE, Math.min(x, (col + 1) * TILE));
      const nearY = Math.max(row * TILE, Math.min(y, (row + 1) * TILE));
      if ((x - nearX) ** 2 + (y - nearY) ** 2 < radius ** 2) return true;
    }
  }
  return false;
}
export function cameraTarget(m: WorldMap, x: number, y: number, faceX = 0, faceY = 0) {
  return { x: Math.max(0, Math.min(m.width - VIEW_WIDTH, x - VIEW_WIDTH / 2 + faceX * 28)),
    y: Math.max(0, Math.min(m.height - VIEW_HEIGHT, y - VIEW_HEIGHT / 2 + faceY * 18)) };
}
export function distanceToExit(e: WorldExit, x: number, y: number): number {
  return Math.hypot(x - Math.max(e.x, Math.min(x, e.x + e.w)), y - Math.max(e.y, Math.min(y, e.y + e.h)));
}
