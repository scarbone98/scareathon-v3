// Mystery Crypt's rules: a turn-based dungeon crawl on a grid, in the style of
// Mystery Dungeon. Every floor is a fresh map of rooms and corridors; you move
// one tile and then everyone else takes a turn. Monsters you beat sometimes
// join your team. Pure logic, no drawing; the renderer reads `events`.

export const MAP_W = 38;
export const MAP_H = 30;
export const MAX_PARTY = 4;
export const BAG_SIZE = 10;

const WALL = 0;
const FLOOR = 1;

export type HeroId = "joe" | "matt" | "alex" | "jon";
export type MonsterId =
  | "rat" | "imp" | "pumpkin" | "skull" | "zombie" | "candle"
  | "ghost" | "scarecrow" | "werewolf" | "ufo" | "shadowbeast" | "swampthing";
export type UnitKind = HeroId | MonsterId;
export type ItemId = "heart" | "candycorn" | "lamp";

interface Stats {
  hp: number;
  atk: number;
  def: number;
}

interface HeroDef extends Stats {
  name: string;
  perk: string;
  recruitBonus: number;
}

export const HEROES: Record<HeroId, HeroDef> = {
  joe: { name: "Joe", perk: "All-rounder", hp: 34, atk: 7, def: 3, recruitBonus: 1 },
  matt: { name: "Matt", perk: "Tough: more HP and defence", hp: 42, atk: 6, def: 4, recruitBonus: 1 },
  alex: { name: "Alex", perk: "Hits hard, bruises easily", hp: 28, atk: 9, def: 2, recruitBonus: 1 },
  jon: { name: "Jon", perk: "Monsters join him more often", hp: 32, atk: 6, def: 3, recruitBonus: 1.6 },
};

interface MonsterDef extends Stats {
  name: string;
  // Floors it shows up on.
  floors: [number, number];
  // Chance to ask to join when beaten.
  recruit: number;
}

export const MONSTERS: Record<MonsterId, MonsterDef> = {
  rat: { name: "Rat", floors: [1, 4], hp: 12, atk: 4, def: 1, recruit: 0.2 },
  imp: { name: "Imp", floors: [1, 5], hp: 10, atk: 5, def: 1, recruit: 0.18 },
  pumpkin: { name: "Pumpkin", floors: [2, 6], hp: 16, atk: 5, def: 3, recruit: 0.16 },
  skull: { name: "Skull", floors: [2, 8], hp: 14, atk: 6, def: 2, recruit: 0.15 },
  zombie: { name: "Zombie", floors: [3, 9], hp: 22, atk: 6, def: 3, recruit: 0.12 },
  candle: { name: "Candle", floors: [4, 11], hp: 16, atk: 8, def: 2, recruit: 0.11 },
  ghost: { name: "Ghost", floors: [5, 13], hp: 18, atk: 8, def: 4, recruit: 0.09 },
  scarecrow: { name: "Scarecrow", floors: [6, 14], hp: 26, atk: 8, def: 5, recruit: 0.08 },
  werewolf: { name: "Werewolf", floors: [8, 16], hp: 28, atk: 10, def: 4, recruit: 0.06 },
  ufo: { name: "UFO", floors: [10, 99], hp: 24, atk: 11, def: 6, recruit: 0.05 },
  shadowbeast: { name: "Shadow Beast", floors: [12, 99], hp: 34, atk: 12, def: 6, recruit: 0.04 },
  swampthing: { name: "Swamp Thing", floors: [14, 99], hp: 44, atk: 12, def: 8, recruit: 0.03 },
};

export const ITEMS: Record<ItemId, { name: string; about: string }> = {
  heart: { name: "Heart", about: "Heals your hero by half." },
  candycorn: { name: "Candy Corn", about: "Throw it at a monster. If you beat it, it's much likelier to join." },
  lamp: { name: "Lantern", about: "Lights up the whole floor, stairs included." },
};

const CHARM_BONUS = 0.4;

export function isHero(kind: UnitKind): kind is HeroId {
  return kind in HEROES;
}

export function unitName(kind: UnitKind) {
  return isHero(kind) ? HEROES[kind].name : MONSTERS[kind].name;
}

export interface Unit {
  id: number;
  kind: UnitKind;
  team: "party" | "enemy";
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  atk: number;
  def: number;
  level: number;
  xp: number;
  // Last way it moved or attacked; also which way it faces on screen.
  dx: number;
  dy: number;
  // Hit by candy corn: much likelier to join when beaten.
  charmed: boolean;
  // Enemies: seen the party and chasing.
  aware: boolean;
  // Enemies: where they're wandering to.
  goal: { x: number; y: number } | null;
}

export interface Pickup {
  id: number;
  x: number;
  y: number;
  kind: ItemId | "candy" | "chest";
  // Candy's worth in points.
  value: number;
}

export interface Room {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type GameEvent =
  | { type: "msg"; text: string; color?: string }
  | { type: "attack"; id: number; x: number; y: number }
  | { type: "hit"; id: number; x: number; y: number; amount: number; team: Unit["team"] }
  | { type: "miss"; x: number; y: number }
  | { type: "die"; unit: Unit }
  | { type: "heal"; id: number; x: number; y: number; amount: number }
  | { type: "level"; id: number; x: number; y: number }
  | { type: "recruit"; id: number; x: number; y: number }
  | { type: "throw"; from: { x: number; y: number }; to: { x: number; y: number } }
  | { type: "charm"; id: number }
  | { type: "pickup"; x: number; y: number; kind: Pickup["kind"]; value: number }
  | { type: "floor"; floor: number };

export type Prompt = { type: "recruit"; unit: Unit };

export interface GameState {
  seed: number;
  rng: () => number;
  floor: number;
  tiles: Uint8Array;
  // Which room each tile belongs to, or -1 for corridors and walls.
  roomOf: Int16Array;
  rooms: Room[];
  stairs: { x: number; y: number };
  explored: Uint8Array;
  visible: Uint8Array;
  // Bumped whenever `explored` or `visible` change, so the renderer knows to redraw the fog.
  sightVersion: number;
  units: Unit[];
  pickups: Pickup[];
  bag: ItemId[];
  leaderId: number;
  nextId: number;
  turn: number;
  floorTurn: number;
  candy: number;
  kills: number;
  recruited: number;
  prompt: Prompt | null;
  over: boolean;
  events: GameEvent[];
}

export interface RunResult {
  score: number;
  floor: number;
  kills: number;
  recruited: number;
  candy: number;
}

// ---------- helpers ----------

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randInt(s: GameState, lo: number, hi: number) {
  return lo + Math.floor(s.rng() * (hi - lo + 1));
}

function pick<T>(s: GameState, list: readonly T[]): T {
  return list[Math.floor(s.rng() * list.length)];
}

const idx = (x: number, y: number) => y * MAP_W + x;
const inMap = (x: number, y: number) => x >= 0 && y >= 0 && x < MAP_W && y < MAP_H;
export const DIRS = [
  { dx: 0, dy: -1 },
  { dx: 1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: -1, dy: 0 },
] as const;

export function isFloor(s: GameState, x: number, y: number) {
  return inMap(x, y) && s.tiles[idx(x, y)] === FLOOR;
}

export function unitAt(s: GameState, x: number, y: number) {
  return s.units.find((u) => u.x === x && u.y === y) ?? null;
}

export function leader(s: GameState) {
  return s.units.find((u) => u.id === s.leaderId)!;
}

export function party(s: GameState) {
  return s.units.filter((u) => u.team === "party");
}

export function onStairs(s: GameState) {
  const l = leader(s);
  return !s.over && l.x === s.stairs.x && l.y === s.stairs.y;
}

export function score(s: GameState) {
  return s.candy + (s.floor - 1) * 500 + s.kills * 5 * s.floor;
}

export function runResult(s: GameState): RunResult {
  return { score: score(s), floor: s.floor, kills: s.kills, recruited: s.recruited, candy: s.candy };
}

function msg(s: GameState, text: string, color?: string) {
  s.events.push({ type: "msg", text, color });
}

// ---------- stats ----------

function scaled(base: number, level: number) {
  return base * (1 + 0.15 * (level - 1));
}

function applyStats(u: Unit) {
  const base: Stats = isHero(u.kind) ? HEROES[u.kind] : MONSTERS[u.kind];
  const hpWas = u.maxHp;
  u.maxHp = Math.round(scaled(base.hp, u.level));
  u.atk = scaled(base.atk, u.level);
  u.def = scaled(base.def, u.level);
  u.hp = Math.min(u.maxHp, u.hp + Math.max(0, u.maxHp - hpWas));
}

export function xpToNext(level: number) {
  return Math.round(12 * Math.pow(level, 1.5));
}

function xpFor(u: Unit) {
  const base = isHero(u.kind) ? HEROES[u.kind] : MONSTERS[u.kind];
  return Math.round(((base.hp + base.atk * 2) * (1 + 0.25 * (u.level - 1))) / 3);
}

function makeUnit(s: GameState, kind: UnitKind, team: Unit["team"], level: number, x: number, y: number): Unit {
  const u: Unit = { id: s.nextId++, kind, team, x, y, hp: 0, maxHp: 0, atk: 0, def: 0, level, xp: 0, dx: 1, dy: 0, charmed: false, aware: false, goal: null };
  applyStats(u);
  u.hp = u.maxHp;
  return u;
}

function gainXp(s: GameState, u: Unit, amount: number) {
  u.xp += amount;
  while (u.xp >= xpToNext(u.level)) {
    u.xp -= xpToNext(u.level);
    u.level++;
    applyStats(u);
    s.events.push({ type: "level", id: u.id, x: u.x, y: u.y });
    msg(s, `${unitName(u.kind)} grew to level ${u.level}!`, "#7dffb0");
  }
}

// ---------- map ----------

function generateFloor(s: GameState) {
  s.tiles = new Uint8Array(MAP_W * MAP_H);
  s.roomOf = new Int16Array(MAP_W * MAP_H).fill(-1);
  s.rooms = [];
  s.explored = new Uint8Array(MAP_W * MAP_H);
  s.visible = new Uint8Array(MAP_W * MAP_H);
  s.pickups = [];

  // A 3x3 grid of cells. Most hold a room; the rest are corridor bends.
  const COLS = 3;
  const ROWS = 3;
  const cw = Math.floor((MAP_W - 2) / COLS);
  const ch = Math.floor((MAP_H - 2) / ROWS);
  const roomCells = new Set<number>();
  while (roomCells.size < 5 + randInt(s, 0, 2)) roomCells.add(randInt(s, 0, COLS * ROWS - 1));

  const anchors: { x: number; y: number }[] = [];
  for (let cy = 0; cy < ROWS; cy++) {
    for (let cx = 0; cx < COLS; cx++) {
      const ox = 1 + cx * cw;
      const oy = 1 + cy * ch;
      const cell = cy * COLS + cx;
      if (roomCells.has(cell)) {
        const w = randInt(s, 4, cw - 3);
        const h = randInt(s, 3, ch - 3);
        const x = ox + randInt(s, 1, cw - w - 1);
        const y = oy + randInt(s, 1, ch - h - 1);
        const room = s.rooms.length;
        s.rooms.push({ x, y, w, h });
        for (let yy = y; yy < y + h; yy++) {
          for (let xx = x; xx < x + w; xx++) {
            s.tiles[idx(xx, yy)] = FLOOR;
            s.roomOf[idx(xx, yy)] = room;
          }
        }
        anchors[cell] = { x: randInt(s, x, x + w - 1), y: randInt(s, y, y + h - 1) };
      } else {
        const p = { x: ox + randInt(s, 2, cw - 3), y: oy + randInt(s, 2, ch - 3) };
        s.tiles[idx(p.x, p.y)] = FLOOR;
        anchors[cell] = p;
      }
    }
  }

  // Join the cells into a maze (every cell reachable), then add a couple of
  // loops so there's more than one way round.
  const carve = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    let { x, y } = a;
    const horizontalFirst = s.rng() < 0.5;
    const stepX = () => {
      while (x !== b.x) {
        x += Math.sign(b.x - x);
        s.tiles[idx(x, y)] = FLOOR;
      }
    };
    const stepY = () => {
      while (y !== b.y) {
        y += Math.sign(b.y - y);
        s.tiles[idx(x, y)] = FLOOR;
      }
    };
    if (horizontalFirst) {
      stepX();
      stepY();
    } else {
      stepY();
      stepX();
    }
  };
  const neighbours = (cell: number) => {
    const cx = cell % COLS;
    const cy = Math.floor(cell / COLS);
    const out: number[] = [];
    if (cx > 0) out.push(cell - 1);
    if (cx < COLS - 1) out.push(cell + 1);
    if (cy > 0) out.push(cell - COLS);
    if (cy < ROWS - 1) out.push(cell + COLS);
    return out;
  };
  const visited = new Set<number>([randInt(s, 0, COLS * ROWS - 1)]);
  const joined = new Set<string>();
  while (visited.size < COLS * ROWS) {
    const from = pick(s, [...visited]);
    const options = neighbours(from).filter((c) => !visited.has(c));
    if (!options.length) continue;
    const to = pick(s, options);
    carve(anchors[from], anchors[to]);
    joined.add(`${Math.min(from, to)}-${Math.max(from, to)}`);
    visited.add(to);
  }
  for (let extra = randInt(s, 1, 3); extra > 0; extra--) {
    const from = randInt(s, 0, COLS * ROWS - 1);
    const to = pick(s, neighbours(from));
    const key = `${Math.min(from, to)}-${Math.max(from, to)}`;
    if (joined.has(key)) continue;
    joined.add(key);
    carve(anchors[from], anchors[to]);
  }

  // Corridor bends that only lead one way are dead ends; trim them so every
  // corridor goes somewhere.
  let trimmed = true;
  while (trimmed) {
    trimmed = false;
    for (let y = 1; y < MAP_H - 1; y++) {
      for (let x = 1; x < MAP_W - 1; x++) {
        if (s.tiles[idx(x, y)] !== FLOOR || s.roomOf[idx(x, y)] >= 0) continue;
        const open = DIRS.filter((d) => s.tiles[idx(x + d.dx, y + d.dy)] === FLOOR).length;
        if (open <= 1) {
          s.tiles[idx(x, y)] = WALL;
          trimmed = true;
        }
      }
    }
  }
}

function randomRoomTile(s: GameState, room: number, free = true) {
  const r = s.rooms[room];
  for (let tries = 0; tries < 60; tries++) {
    const x = randInt(s, r.x, r.x + r.w - 1);
    const y = randInt(s, r.y, r.y + r.h - 1);
    if (!free) return { x, y };
    if (unitAt(s, x, y) || s.pickups.some((p) => p.x === x && p.y === y) || (s.stairs.x === x && s.stairs.y === y)) continue;
    return { x, y };
  }
  return null;
}

function monsterForFloor(s: GameState) {
  const options = (Object.keys(MONSTERS) as MonsterId[]).filter((id) => {
    const [lo, hi] = MONSTERS[id].floors;
    return s.floor >= lo && s.floor <= hi;
  });
  return pick(s, options);
}

function spawnEnemy(s: GameState, avoidRoom: number) {
  const rooms = s.rooms.map((_, i) => i).filter((i) => i !== avoidRoom);
  const at = randomRoomTile(s, pick(s, rooms));
  if (!at) return;
  const level = Math.max(1, s.floor + randInt(s, -1, 0));
  s.units.push(makeUnit(s, monsterForFloor(s), "enemy", level, at.x, at.y));
}

function enemyCap(s: GameState) {
  return Math.min(11, 4 + Math.floor(s.floor / 2));
}

function placeFloorContents(s: GameState) {
  const start = randInt(s, 0, s.rooms.length - 1);
  // Party first, bunched round the leader.
  const members = party(s);
  s.units = members;
  const origin = randomRoomTile(s, start, false)!;
  const spots = nearestFreeTiles(s, origin, members.length);
  members.forEach((u, i) => {
    u.x = spots[i].x;
    u.y = spots[i].y;
  });

  const stairRooms = s.rooms.map((_, i) => i).filter((i) => i !== start);
  s.stairs = { x: -1, y: -1 };
  s.stairs = randomRoomTile(s, pick(s, stairRooms))!;

  for (let n = enemyCap(s) - 1; n > 0; n--) spawnEnemy(s, start);

  const itemCount = randInt(s, 3, 5);
  for (let n = 0; n < itemCount; n++) {
    const at = randomRoomTile(s, randInt(s, 0, s.rooms.length - 1));
    if (!at) continue;
    const roll = s.rng();
    const kind: Pickup["kind"] = roll < 0.4 ? "candy" : roll < 0.62 ? "heart" : roll < 0.85 ? "candycorn" : roll < 0.93 ? "chest" : "lamp";
    s.pickups.push({ id: s.nextId++, x: at.x, y: at.y, kind, value: kind === "candy" ? candyValue(s) : 0 });
  }
  updateSight(s);
}

function candyValue(s: GameState) {
  return 20 * s.floor + randInt(s, 0, 10) * 5;
}

// The `count` floor tiles closest to `origin` by walking, origin first.
function nearestFreeTiles(s: GameState, origin: { x: number; y: number }, count: number) {
  const out: { x: number; y: number }[] = [];
  const seen = new Uint8Array(MAP_W * MAP_H);
  const queue = [origin];
  seen[idx(origin.x, origin.y)] = 1;
  while (queue.length && out.length < count) {
    const p = queue.shift()!;
    out.push(p);
    for (const d of DIRS) {
      const nx = p.x + d.dx;
      const ny = p.y + d.dy;
      if (!isFloor(s, nx, ny) || seen[idx(nx, ny)]) continue;
      seen[idx(nx, ny)] = 1;
      queue.push({ x: nx, y: ny });
    }
  }
  return out;
}

// ---------- sight ----------

// In a room you see the whole room (and its walls); in a corridor, two tiles round you.
function sightAround(s: GameState, x: number, y: number, out: Uint8Array) {
  const room = s.roomOf[idx(x, y)];
  if (room >= 0) {
    const r = s.rooms[room];
    for (let yy = r.y - 1; yy <= r.y + r.h; yy++) for (let xx = r.x - 1; xx <= r.x + r.w; xx++) if (inMap(xx, yy)) out[idx(xx, yy)] = 1;
  } else {
    for (let yy = y - 2; yy <= y + 2; yy++) for (let xx = x - 2; xx <= x + 2; xx++) if (inMap(xx, yy)) out[idx(xx, yy)] = 1;
  }
}

function updateSight(s: GameState) {
  s.visible.fill(0);
  const l = leader(s);
  sightAround(s, l.x, l.y, s.visible);
  for (let i = 0; i < s.visible.length; i++) if (s.visible[i]) s.explored[i] = 1;
  s.sightVersion++;
}

function canSee(s: GameState, a: Unit, b: Unit) {
  const room = s.roomOf[idx(a.x, a.y)];
  if (room >= 0 && room === s.roomOf[idx(b.x, b.y)]) return true;
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) <= 2;
}

// ---------- paths ----------

// First step along the shortest walk from `from` to any tile where `done` is
// true. Units other than `ignore` block the way unless `throughUnits`.
function firstStep(
  s: GameState,
  from: { x: number; y: number },
  done: (x: number, y: number) => boolean,
  opts: { maxDist?: number; throughUnits?: boolean; explored?: boolean } = {}
) {
  const maxDist = opts.maxDist ?? MAP_W * MAP_H;
  const prev = new Int32Array(MAP_W * MAP_H).fill(-1);
  const dist = new Int16Array(MAP_W * MAP_H).fill(-1);
  const start = idx(from.x, from.y);
  dist[start] = 0;
  const queue = [start];
  const blocked = new Set(opts.throughUnits ? [] : s.units.map((u) => idx(u.x, u.y)));
  for (let head = 0; head < queue.length; head++) {
    const cur = queue[head];
    const cx = cur % MAP_W;
    const cy = Math.floor(cur / MAP_W);
    if (cur !== start && done(cx, cy)) {
      let step = cur;
      while (prev[step] !== start) step = prev[step];
      return { x: step % MAP_W, y: Math.floor(step / MAP_W), dist: dist[cur] };
    }
    if (dist[cur] >= maxDist) continue;
    for (const d of DIRS) {
      const nx = cx + d.dx;
      const ny = cy + d.dy;
      if (!isFloor(s, nx, ny)) continue;
      const ni = idx(nx, ny);
      if (dist[ni] >= 0) continue;
      if (opts.explored && !s.explored[ni]) continue;
      // The goal tile may hold a unit (that's who we're walking to).
      if (blocked.has(ni) && !done(nx, ny)) continue;
      dist[ni] = dist[cur] + 1;
      prev[ni] = cur;
      queue.push(ni);
    }
  }
  return null;
}

export function pathStep(s: GameState, to: { x: number; y: number }) {
  const l = leader(s);
  return firstStep(s, l, (x, y) => x === to.x && y === to.y, { throughUnits: true, explored: true });
}

const adjacent = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;

// ---------- combat ----------

function attack(s: GameState, a: Unit, b: Unit) {
  a.dx = Math.sign(b.x - a.x);
  a.dy = Math.sign(b.y - a.y);
  s.events.push({ type: "attack", id: a.id, x: b.x, y: b.y });
  if (s.rng() < 0.08) {
    s.events.push({ type: "miss", x: b.x, y: b.y });
    return;
  }
  const raw = a.atk * (0.85 + s.rng() * 0.3);
  const amount = Math.max(1, Math.round(raw - b.def * 0.5));
  b.hp -= amount;
  s.events.push({ type: "hit", id: b.id, x: b.x, y: b.y, amount, team: b.team });
  if (b.hp <= 0) defeat(s, a, b);
}

function defeat(s: GameState, by: Unit, u: Unit) {
  s.units = s.units.filter((o) => o !== u);
  s.events.push({ type: "die", unit: u });
  if (u.team === "party") {
    if (u.id === s.leaderId) {
      msg(s, `${unitName(u.kind)} fainted...`, "#ff5a6a");
      s.over = true;
    } else {
      msg(s, `${unitName(u.kind)} fainted and left the team.`, "#ff5a6a");
    }
    return;
  }
  s.kills++;
  msg(s, `${unitName(by.kind)} beat the ${unitName(u.kind)}!`);
  const xp = xpFor(u);
  for (const m of party(s)) gainXp(s, m, xp);
  if (by.team === "party") tryRecruit(s, u);
}

export function recruitChance(s: GameState, u: Unit) {
  const def = MONSTERS[u.kind as MonsterId];
  const hero = leader(s).kind as HeroId;
  return Math.min(0.9, (def.recruit + (u.charmed ? CHARM_BONUS : 0)) * HEROES[hero].recruitBonus);
}

function tryRecruit(s: GameState, beaten: Unit) {
  if (s.rng() >= recruitChance(s, beaten)) return;
  // Joins at full health, on the level it was.
  const unit = makeUnit(s, beaten.kind, "party", beaten.level, beaten.x, beaten.y);
  unit.dx = beaten.dx;
  msg(s, `The ${unitName(beaten.kind)} got up. It wants to join you!`, "#ff9ad5");
  if (party(s).length < MAX_PARTY) {
    joinParty(s, unit);
  } else {
    s.prompt = { type: "recruit", unit };
  }
}

function joinParty(s: GameState, unit: Unit) {
  s.units.push(unit);
  s.recruited++;
  s.events.push({ type: "recruit", id: unit.id, x: unit.x, y: unit.y });
  msg(s, `${unitName(unit.kind)} joined your team!`, "#ff9ad5");
}

// Answer "your team is full": swap out `replaceId`, or pass null to say no.
export function resolveRecruit(s: GameState, replaceId: number | null) {
  const p = s.prompt;
  if (!p) return;
  s.prompt = null;
  if (replaceId === null) {
    msg(s, `The ${unitName(p.unit.kind)} wandered off.`);
    return;
  }
  const out = s.units.find((u) => u.id === replaceId && u.team === "party" && u.id !== s.leaderId);
  if (!out) return;
  s.units = s.units.filter((u) => u !== out);
  msg(s, `${unitName(out.kind)} said goodbye.`);
  joinParty(s, p.unit);
}

// ---------- the player's turn ----------

export type Action =
  | { type: "move"; dx: number; dy: number }
  | { type: "attack" }
  | { type: "wait" }
  | { type: "descend" }
  | { type: "use"; slot: number };

// Does `action` and then gives everyone else their turn. Returns false if the
// action wasn't possible (walking into a wall), which costs no turn.
export function act(s: GameState, action: Action) {
  if (s.over || s.prompt) return false;
  const l = leader(s);
  switch (action.type) {
    case "move": {
      l.dx = action.dx;
      l.dy = action.dy;
      const tx = l.x + action.dx;
      const ty = l.y + action.dy;
      if (!isFloor(s, tx, ty)) return false;
      const other = unitAt(s, tx, ty);
      if (other?.team === "enemy") {
        attack(s, l, other);
      } else if (other) {
        // Walking into a teammate swaps places.
        other.x = l.x;
        other.y = l.y;
        other.dx = -action.dx;
        other.dy = -action.dy;
        l.x = tx;
        l.y = ty;
      } else {
        l.x = tx;
        l.y = ty;
      }
      collectPickup(s, l);
      break;
    }
    case "attack": {
      const target = unitAt(s, l.x + l.dx, l.y + l.dy);
      if (target?.team === "enemy") attack(s, l, target);
      else s.events.push({ type: "attack", id: l.id, x: l.x + l.dx, y: l.y + l.dy });
      break;
    }
    case "wait":
      break;
    case "descend":
      if (!onStairs(s)) return false;
      nextFloor(s);
      return true;
    case "use":
      if (!applyItem(s, action.slot)) return false;
      break;
  }
  endTurn(s);
  return true;
}

function collectPickup(s: GameState, u: Unit) {
  const p = s.pickups.find((o) => o.x === u.x && o.y === u.y);
  if (!p) return;
  if (p.kind === "candy") {
    s.candy += p.value;
    msg(s, `Found ${p.value} candy!`, "#ffcf4a");
  } else if (p.kind === "chest") {
    const loot: ItemId[] = [pick(s, ["heart", "candycorn"] as const), pick(s, ["heart", "candycorn", "lamp"] as const)];
    const bonus = candyValue(s) * 2;
    s.candy += bonus;
    const kept = loot.slice(0, Math.max(0, BAG_SIZE - s.bag.length));
    s.bag.push(...kept);
    msg(s, `Opened a chest: ${bonus} candy${kept.length ? " and " + kept.map((k) => ITEMS[k].name).join(", ") : ""}!`, "#ffcf4a");
  } else {
    if (s.bag.length >= BAG_SIZE) {
      msg(s, `Your bag is full. Left the ${ITEMS[p.kind].name}.`);
      return;
    }
    s.bag.push(p.kind);
    msg(s, `Picked up a ${ITEMS[p.kind].name}.`, "#6ae0ff");
  }
  s.pickups = s.pickups.filter((o) => o !== p);
  s.events.push({ type: "pickup", x: p.x, y: p.y, kind: p.kind, value: p.value });
}

function applyItem(s: GameState, slot: number) {
  const item = s.bag[slot];
  if (!item) return false;
  const l = leader(s);
  if (item === "heart") {
    const amount = Math.min(l.maxHp - l.hp, Math.ceil(l.maxHp / 2));
    l.hp += amount;
    s.events.push({ type: "heal", id: l.id, x: l.x, y: l.y, amount });
    msg(s, `${unitName(l.kind)} ate a Heart and got ${amount} HP back.`, "#7dffb0");
  } else if (item === "lamp") {
    s.explored.fill(1);
    s.sightVersion++;
    msg(s, "The Lantern lights up the whole floor!", "#ffcf4a");
  } else {
    throwCandyCorn(s, l);
  }
  s.bag.splice(slot, 1);
  return true;
}

function throwCandyCorn(s: GameState, from: Unit) {
  let x = from.x;
  let y = from.y;
  let hit: Unit | null = null;
  for (let n = 0; n < 10; n++) {
    const nx = x + from.dx;
    const ny = y + from.dy;
    if (!isFloor(s, nx, ny)) break;
    x = nx;
    y = ny;
    hit = unitAt(s, x, y);
    if (hit) break;
  }
  s.events.push({ type: "throw", from: { x: from.x, y: from.y }, to: { x, y } });
  if (!hit) {
    msg(s, "The Candy Corn hit nothing.");
    return;
  }
  if (hit.team === "enemy") {
    hit.charmed = true;
    hit.aware = true;
    s.events.push({ type: "charm", id: hit.id });
    msg(s, `The ${unitName(hit.kind)} loved the Candy Corn! Beat it and it may join you.`, "#ff9ad5");
  } else {
    const amount = Math.min(hit.maxHp - hit.hp, 10 + hit.level * 2);
    hit.hp += amount;
    s.events.push({ type: "heal", id: hit.id, x: hit.x, y: hit.y, amount });
    msg(s, `${unitName(hit.kind)} caught the Candy Corn and got ${amount} HP back.`, "#7dffb0");
  }
}

function nextFloor(s: GameState) {
  s.floor++;
  s.floorTurn = 0;
  // A new floor heals the team a little.
  for (const u of party(s)) u.hp = Math.min(u.maxHp, u.hp + Math.ceil(u.maxHp * 0.2));
  generateFloor(s);
  placeFloorContents(s);
  s.events.push({ type: "floor", floor: s.floor });
  msg(s, `Welcome to B${s.floor}F.`, "#c88cff");
}

// ---------- everyone else's turn ----------

function endTurn(s: GameState) {
  for (const ally of party(s)) {
    if (s.over || s.prompt) break;
    if (ally.id !== s.leaderId && s.units.includes(ally)) allyTurn(s, ally);
  }
  for (const enemy of s.units.filter((u) => u.team === "enemy")) {
    if (s.over) break;
    if (s.units.includes(enemy)) enemyTurn(s, enemy);
  }
  s.turn++;
  s.floorTurn++;
  if (s.over) return;
  // Slowly heal while exploring.
  if (s.turn % 5 === 0) for (const u of party(s)) u.hp = Math.min(u.maxHp, u.hp + Math.max(1, Math.round(u.maxHp / 30)));
  // New monsters wander in now and then.
  if (s.floorTurn % 30 === 0 && s.units.filter((u) => u.team === "enemy").length < enemyCap(s)) {
    const l = leader(s);
    spawnEnemy(s, s.roomOf[idx(l.x, l.y)]);
  }
  updateSight(s);
}

function moveUnit(u: Unit, to: { x: number; y: number }) {
  u.dx = Math.sign(to.x - u.x);
  u.dy = Math.sign(to.y - u.y);
  u.x = to.x;
  u.y = to.y;
}

function allyTurn(s: GameState, u: Unit) {
  const l = leader(s);
  const foes = s.units.filter((o) => o.team === "enemy");
  const next = foes.find((f) => adjacent(f, u));
  if (next) {
    attack(s, u, next);
    return;
  }
  const lead = Math.abs(u.x - l.x) + Math.abs(u.y - l.y);
  // Go after a monster nearby, as long as the leader isn't left behind.
  const target = foes
    .filter((f) => canSee(s, u, f) && Math.abs(f.x - u.x) + Math.abs(f.y - u.y) <= 6)
    .sort((a, b) => Math.abs(a.x - u.x) + Math.abs(a.y - u.y) - (Math.abs(b.x - u.x) + Math.abs(b.y - u.y)))[0];
  if (target && lead <= 6) {
    const step = firstStep(s, u, (x, y) => x === target.x && y === target.y, { maxDist: 12 });
    if (step && !unitAt(s, step.x, step.y)) {
      moveUnit(u, step);
      return;
    }
  }
  if (lead <= 1) return;
  const step = firstStep(s, u, (x, y) => Math.abs(x - l.x) + Math.abs(y - l.y) <= 1 && !(x === l.x && y === l.y) && !unitAt(s, x, y));
  if (step && !unitAt(s, step.x, step.y)) moveUnit(u, step);
}

function enemyTurn(s: GameState, u: Unit) {
  const members = party(s);
  const next = pick(s, members.filter((m) => adjacent(m, u)));
  if (next) {
    u.aware = true;
    attack(s, u, next);
    return;
  }
  const seen = members.filter((m) => canSee(s, u, m));
  if (seen.length) u.aware = true;
  if (u.aware) {
    const near = members.filter((m) => Math.abs(m.x - u.x) + Math.abs(m.y - u.y) <= 14);
    if (!near.length) {
      u.aware = false;
    } else {
      const step = firstStep(s, u, (x, y) => near.some((m) => m.x === x && m.y === y), { maxDist: 16 });
      if (step && !unitAt(s, step.x, step.y)) moveUnit(u, step);
      return;
    }
  }
  // Wander from room to room.
  if (!u.goal || (u.goal.x === u.x && u.goal.y === u.y)) {
    const r = s.rooms[randInt(s, 0, s.rooms.length - 1)];
    u.goal = { x: randInt(s, r.x, r.x + r.w - 1), y: randInt(s, r.y, r.y + r.h - 1) };
  }
  const goal = u.goal;
  const step = firstStep(s, u, (x, y) => x === goal.x && y === goal.y, { throughUnits: true });
  if (!step) {
    u.goal = null;
    return;
  }
  if (!unitAt(s, step.x, step.y)) moveUnit(u, step);
  else if (s.rng() < 0.3) u.goal = null;
}

// ---------- a new run ----------

export interface GameOptions {
  hero?: HeroId;
  seed?: number;
  // Dev: start deeper, with a levelled hero.
  floor?: number;
}

export function newGame(options: GameOptions = {}): GameState {
  const seed = options.seed ?? Math.floor(Math.random() * 2 ** 31);
  const s: GameState = {
    seed,
    rng: mulberry32(seed),
    floor: options.floor ?? 1,
    tiles: new Uint8Array(0),
    roomOf: new Int16Array(0),
    rooms: [],
    stairs: { x: -1, y: -1 },
    explored: new Uint8Array(0),
    visible: new Uint8Array(0),
    sightVersion: 0,
    units: [],
    pickups: [],
    bag: ["heart", "candycorn"],
    leaderId: 0,
    nextId: 1,
    turn: 0,
    floorTurn: 0,
    candy: 0,
    kills: 0,
    recruited: 0,
    prompt: null,
    over: false,
    events: [],
  };
  const hero = makeUnit(s, options.hero ?? "joe", "party", Math.max(1, s.floor), 0, 0);
  s.leaderId = hero.id;
  s.units.push(hero);
  generateFloor(s);
  placeFloorContents(s);
  msg(s, `Welcome to B${s.floor}F.`, "#c88cff");
  return s;
}

// ---------- a simple player, for the menu's attract mode and balance checks ----------

export function autoAction(s: GameState): Action {
  const l = leader(s);
  const foes = s.units.filter((u) => u.team === "enemy" && s.visible[idx(u.x, u.y)]);
  const heart = s.bag.indexOf("heart");
  if (heart >= 0 && l.hp < l.maxHp * 0.35) return { type: "use", slot: heart };
  const next = foes.find((f) => adjacent(f, l));
  if (next) {
    const corn = s.bag.indexOf("candycorn");
    // Charm a fresh monster in front of us.
    if (corn >= 0 && !next.charmed && next.hp > next.maxHp * 0.5 && l.x + l.dx === next.x && l.y + l.dy === next.y) return { type: "use", slot: corn };
    return { type: "move", dx: next.x - l.x, dy: next.y - l.y };
  }
  if (onStairs(s) && (s.floorTurn > 250 || !frontierStep(s))) return { type: "descend" };
  const target = foes.sort((a, b) => Math.abs(a.x - l.x) + Math.abs(a.y - l.y) - (Math.abs(b.x - l.x) + Math.abs(b.y - l.y)))[0];
  const toward = (step: { x: number; y: number } | null): Action | null => (step ? { type: "move", dx: step.x - l.x, dy: step.y - l.y } : null);
  if (target && Math.abs(target.x - l.x) + Math.abs(target.y - l.y) <= 6) {
    const a = toward(firstStep(s, l, (x, y) => x === target.x && y === target.y, { throughUnits: true, maxDist: 12 }));
    if (a) return a;
  }
  const item = s.pickups.find((p) => s.visible[idx(p.x, p.y)]);
  if (item && (s.bag.length < BAG_SIZE || item.kind === "candy" || item.kind === "chest")) {
    const a = toward(firstStep(s, l, (x, y) => x === item.x && y === item.y, { throughUnits: true }));
    if (a) return a;
  }
  if (s.floorTurn <= 250) {
    const a = toward(frontierStep(s));
    if (a) return a;
  }
  if (s.explored[idx(s.stairs.x, s.stairs.y)]) {
    const a = toward(firstStep(s, l, (x, y) => x === s.stairs.x && y === s.stairs.y, { throughUnits: true }));
    if (a) return a;
  }
  return { type: "wait" };
}

// Toward the nearest explored tile next to unexplored floor. (It peeks at the
// map to know which unexplored tiles are floor; fine for a bot.)
function frontierStep(s: GameState) {
  const l = leader(s);
  return firstStep(
    s,
    l,
    (x, y) => DIRS.some((d) => isFloor(s, x + d.dx, y + d.dy) && !s.explored[idx(x + d.dx, y + d.dy)]),
    { throughUnits: true, explored: true }
  );
}
