// Terrain uses tile collision; props use precise base rectangles. Positions are world pixels.
export const TILE = 16;
export type TileKind = "grass" | "dirt" | "road" | "water" | "sand" | "stone" | "ash" | "void" | "bridge" | "corrupt";
export interface CollisionRect { x: number; y: number; w: number; h: number }
export interface WorldProp {
  id: string;
  kind: "keeper" | "bench" | "crate" | "reeds" | "water-tower" | "windmill" | "tree" | "pine" | "bush" | "rock" | "flower" | "lamp" | "barrier" | "fence" | "station" | "shop" | "home" | "shed" | "diner" | "bbq" | "sign" | "mailbox" | "vending" | "car" | "ambient-taxi" | "puddle" | "debris" | "chest" | "npc" | "crater" | "portal" | "rocket" | "gantry" | "tank" | "control" | "locker" | "air" | "socket" | "seal" | "lander" | "dish" | "flag";
  // Sprite bounds; solid rectangles sit at the physical base, below the canopy.
  x: number; y: number; w: number; h: number; label?: string; color?: string;
  // Fixed parked-car heading; never inferred from the player or camera.
  parkingHeading?: 1 | -1;
  footprints?: CollisionRect[];
}
export interface WorldExit {
  id: string; name: string; x: number; y: number; w: number; h: number;
  target: number | "overworld" | "hub" | "results" | "realm";
  targetMapId?: string; requiresInteraction?: string;
  entryX: number; entryY: number; requiresClear?: boolean;
}
export interface WorldSpawn {
  kind: "grunt" | "shooter" | "boss"; x: number; y: number;
  behavior?: import("./chapters/ch3Worlds.ts").LunarBehavior;
  sprite?: "zombie" | "pumpkin" | "ghost" | "imp" | "shadowbeast"; miniBoss?: boolean;
}
export interface RoadSegment extends CollisionRect {
  id: string;
  direction: 'horizontal' | 'vertical';
  start: 'junction' | 'entrance' | 'barrier';
  end: 'junction' | 'entrance' | 'barrier';
}
export interface WorldMap {
  id: string; name: string; width: number; height: number; cols: number; rows: number;
  roads: RoadSegment[]; tiles: TileKind[]; collision: number[]; props: WorldProp[]; exits: WorldExit[];
  boundLinks?: { id: string; from: { x: number; y: number }; to: { x: number; y: number }; radius: number }[];
  radarAnchors?: { id: string; x: number; y: number }[];
  spawns: WorldSpawn[]; spawn: { x: number; y: number };
}

// A compact authoring language: paint terrain, place props with base footprints,
// then cut the doorway through the natural boundary. No rendering or DOM here.
export function map(id: string, name: string, cols: number, rows: number, ground: TileKind): WorldMap {
  return { id, name, width: cols * TILE, height: rows * TILE, cols, rows,
    tiles: Array<TileKind>(cols * rows).fill(ground), collision: Array<number>(cols * rows).fill(0),
    roads: [], props: [], exits: [], spawns: [], spawn: { x: 56, y: Math.floor(rows / 2) * TILE } };
}
export function paint(m: WorldMap, x: number, y: number, w: number, h: number, tile: TileKind, solid = false) {
  for (let row = Math.max(0, Math.floor(y / TILE)); row < Math.min(m.rows, Math.ceil((y + h) / TILE)); row++) {
    for (let col = Math.max(0, Math.floor(x / TILE)); col < Math.min(m.cols, Math.ceil((x + w) / TILE)); col++) {
      m.tiles[row * m.cols + col] = tile; m.collision[row * m.cols + col] = solid ? 1 : 0;
    }
  }
}
// Match the renderer's ground contact, leaving tall sprites walkable behind.
export function baseFootprints(kind: WorldProp["kind"], x: number, y: number, w: number, h: number): CollisionRect[] {
  const cx = x + w / 2, bottom = y + h;
  const base = (width: number, height: number, offset = 0): CollisionRect[] =>
    [{ x: cx - width / 2, y: bottom - height + offset, w: width, h: height }];
  switch (kind) {
    case "flower": case "puddle": case "debris": case "reeds": return [];
    case "bench": return base(w - 8, 8);
    case "crate": return base(w - 4, 10);
    case "water-tower": return [{ x: x + 8, y: bottom - 8, w: 6, h: 8 }, { x: x + w - 14, y: bottom - 8, w: 6, h: 8 }];
    case "windmill": return base(8, 10);
    case "bush": return base(Math.max(8, w * .6), 5);
    case "tree": case "pine": return base(4, 11, 1);
    case "lamp": return base(6, 6, 1);
    case "sign": case "mailbox": return base(4, 6, 1);
    case "vending": return base(w - 4, 10);
    case "rock": return base(14, 6);
    case "keeper": case "npc": return base(10, 6, 1);
    case "chest": return base(22, 12);
    case "car": case "ambient-taxi": return base(30, 17, 1);
    case "bbq": return base(24, 12, 4);
    case "barrier": return [{ x, y, w, h }];
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
export function prop(m: WorldMap, kind: WorldProp["kind"], x: number, y: number, w = 24, h = 32, label?: string) {
  const p: WorldProp = { id: `${m.id}-${kind}-${m.props.length}`, kind, x, y, w, h, label,
    footprints: baseFootprints(kind, x, y, w, h) };
  m.props.push(p);
  return p;
}
// Park in an authored paved bay, with a fixed ground pose shared by both renderers.
export function parkedCarPose(car: WorldProp) {
  return { x: car.x + car.w / 2, y: car.y + car.h - 7.5, heading: car.parkingHeading ?? 1 };
}
export function parkedCar(m: WorldMap, x: number, y: number, w: number, h: number) {
  const car = prop(m, "car", x, y, w, h);
  car.parkingHeading = 1;
  const pose = parkedCarPose(car);
  const body = { x: pose.x - 17, y: pose.y - 9, w: 34, h: 18 };
  if (m.roads.some(segment => overlaps(body, segment))) throw new Error(`${car.id}: parking overlaps a driving lane`);
  for (const px of [body.x, body.x + body.w - .01]) for (const py of [body.y, body.y + body.h - .01]) {
    if (tileAt(m, Math.floor(px / TILE), Math.floor(py / TILE)) !== 'stone') throw new Error(`${car.id}: parking must stay in its paved bay`);
  }
  return car;
}
export function boundary(m: WorldMap, tile: TileKind, tree: "pine" | "tree" = "tree") {
  paint(m, 0, 0, m.width, 32, tile, true); paint(m, 0, m.height - 32, m.width, 32, tile, true);
  paint(m, 0, 0, 32, m.height, tile, true); paint(m, m.width - 32, 0, 32, m.height, tile, true);
  for (let x = 0; x < m.width; x += 32) { prop(m, tree, x, 0); prop(m, tree, x, m.height - 40); }
  for (let y = 32; y < m.height - 32; y += 32) { prop(m, tree, 0, y); prop(m, tree, m.width - 24, y); }
}
export function exit(m: WorldMap, e: WorldExit) {
  m.exits.push(e);
  paint(m, e.x, e.y, e.w, e.h, m.id.startsWith("blast") ? "dirt" : "stone");
  m.props = m.props.filter(p => !(p.x < e.x + e.w && p.x + p.w > e.x && p.y < e.y + e.h && p.y + p.h > e.y));
}
// Direction belongs to the authored segment, not a guess from neighboring tiles.
// A road end must name a junction, entrance, or physical boundary barrier.
export function road(m: WorldMap, segment: RoadSegment) {
  m.roads.push(segment);
  const { x, y, w, h, direction, start, end } = segment;
  paint(m, x, y, w, h, 'road');
  for (const [terminal, far] of [[start, false], [end, true]] as const) {
    if (terminal !== 'barrier') continue;
    const horizontal = direction === 'horizontal';
    const block = prop(m, 'barrier', x + (horizontal && far ? w - 8 : 0),
      y + (!horizontal && far ? h - 8 : 0), horizontal ? 8 : w, horizontal ? h : 8);
    block.id = `${segment.id}-${far ? 'end' : 'start'}-barrier`;
  }
}
export function overlaps(a: CollisionRect, b: CollisionRect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
export function scatter(m: WorldMap, ground: "grass" | "ash", seed: number) {
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

// Compact mixed groups leave a clear entrance apron and space between fights.
export function encounter(m: WorldMap, x: number, y: number, sprite?: WorldSpawn["sprite"]) {
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
