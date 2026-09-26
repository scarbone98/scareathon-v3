// Mystery Crypt's rules: a turn-based dungeon crawl on a grid, in the style of
// Mystery Dungeon. A stage is a few floors, each a fresh map of rooms and
// corridors, with a boss at the bottom. You move one tile (or use a move) and
// then everyone else takes a turn. Monsters you beat sometimes join you.
// Pure logic, no drawing; the renderer reads `events`.
import {
  defaultMoves,
  HEROES,
  isHero,
  ITEMS,
  MONSTERS,
  MOVES,
  stageDef,
  statsAt,
  unitName,
  type HeroId,
  type ItemId,
  type MonsterId,
  type MoveId,
  type StageDef,
  type Stats,
  type UnitKind,
} from "./data.ts";
import type { RosterEntry, StageReport } from "./save.ts";

export { unitName };

export const MAP_W = 38;
export const MAP_H = 30;
export const MAX_PARTY = 4;
export const BAG_SIZE = 10;

const WALL = 0;
const FLOOR = 1;
const CHARM_BONUS = 0.4;
const BOSS_RECRUIT = 0.1;

export interface MoveSlot {
  id: MoveId;
  pp: number;
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
  moves: MoveSlot[];
  // Last way it moved or attacked; also which way it faces on screen.
  dx: number;
  dy: number;
  // Hit by candy corn: much likelier to join when beaten.
  charmed: boolean;
  // Burning or poisoned: loses `amount` HP a turn for `turns` turns.
  dot: { turns: number; amount: number; kind: "burn" | "poison" } | null;
  // The stage's boss: its name replaces the monster's.
  boss: string | null;
  // Enemies: seen the party and chasing.
  aware: boolean;
  // Enemies: where they're wandering to.
  goal: { x: number; y: number } | null;
  // Party: which roster entry this is.
  roster: number;
}

export interface Pickup {
  id: number;
  x: number;
  y: number;
  kind: ItemId | "candy" | "chest";
  // Candy's worth.
  value: number;
}

export interface Room {
  x: number;
  y: number;
  w: number;
  h: number;
}

type Pos = { x: number; y: number };

export type GameEvent =
  | { type: "msg"; text: string; color?: string }
  | { type: "attack"; id: number; x: number; y: number }
  | { type: "hit"; id: number; x: number; y: number; amount: number; team: Unit["team"] }
  | { type: "miss"; x: number; y: number }
  | { type: "die"; unit: Unit }
  | { type: "heal"; id: number; x: number; y: number; amount: number }
  | { type: "level"; id: number; x: number; y: number }
  | { type: "recruit"; id: number; x: number; y: number }
  | { type: "throw"; from: Pos; to: Pos }
  | { type: "charm"; id: number }
  | { type: "pickup"; x: number; y: number; kind: Pickup["kind"]; value: number }
  | { type: "move"; id: number; move: MoveId; from: Pos; dx: number; dy: number; to: Pos; targets: Pos[] }
  | { type: "floor"; floor: number };

export interface GameState {
  seed: number;
  rng: () => number;
  stage: number;
  def: StageDef;
  floor: number;
  tiles: Uint8Array;
  // Which room each tile belongs to, or -1 for corridors and walls.
  roomOf: Int16Array;
  rooms: Room[];
  // (-1, -1) on the boss floor.
  stairs: Pos;
  explored: Uint8Array;
  visible: Uint8Array;
  // Bumped whenever `explored` or `visible` change, so the renderer knows to redraw the fog.
  sightVersion: number;
  units: Unit[];
  pickups: Pickup[];
  bag: ItemId[];
  // Items picked up this stage (lost again if you faint).
  found: ItemId[];
  // Everyone on your side this stage: the starting team, then recruits.
  roster: RosterEntry[];
  // Roster indexes of monsters recruited this stage.
  recruits: number[];
  leaderId: number;
  nextId: number;
  turn: number;
  floorTurn: number;
  candy: number;
  kills: number;
  cleared: boolean;
  over: boolean;
  events: GameEvent[];
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
const manhattan = (a: Pos, b: Pos) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const adjacent = (a: Pos, b: Pos) => manhattan(a, b) === 1;

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

export function isBossFloor(s: GameState) {
  return s.floor === s.def.floors;
}

export function onStairs(s: GameState) {
  const l = leader(s);
  return !s.over && !!l && l.x === s.stairs.x && l.y === s.stairs.y;
}

// "the Rat", or a boss's own name.
function theName(u: Unit) {
  return u.boss ?? `the ${unitName(u.kind)}`;
}

function msg(s: GameState, text: string, color?: string) {
  s.events.push({ type: "msg", text, color });
}

// ---------- stats ----------

function baseStats(kind: UnitKind): Stats {
  return isHero(kind) ? HEROES[kind] : MONSTERS[kind];
}

function applyStats(u: Unit) {
  const stats = statsAt(u.kind, u.level);
  const hpWas = u.maxHp;
  u.maxHp = Math.round(stats.hp * (u.boss ? 3.5 : 1));
  u.atk = stats.atk * (u.boss ? 1.15 : 1);
  u.def = stats.def;
  u.hp = Math.min(u.maxHp, u.hp + Math.max(0, u.maxHp - hpWas));
}

export function xpToNext(level: number) {
  return Math.round(12 * Math.pow(level, 1.5));
}

function xpFor(u: Unit) {
  const base = baseStats(u.kind);
  return Math.round(((base.hp + base.atk * 2) * (1 + 0.25 * (u.level - 1))) / 3) * (u.boss ? 5 : 1);
}

function makeUnit(s: GameState, kind: UnitKind, team: Unit["team"], level: number, x: number, y: number, moves: MoveId[] = defaultMoves(kind, level)): Unit {
  const u: Unit = {
    id: s.nextId++, kind, team, x, y, hp: 0, maxHp: 0, atk: 0, def: 0, level, xp: 0,
    moves: moves.map((id) => ({ id, pp: MOVES[id].pp })),
    dx: 1, dy: 0, charmed: false, dot: null, boss: null, aware: false, goal: null, roster: -1,
  };
  applyStats(u);
  u.hp = u.maxHp;
  return u;
}

function syncRoster(s: GameState, u: Unit) {
  if (u.team !== "party" || u.roster < 0) return;
  const entry = s.roster[u.roster];
  entry.level = u.level;
  entry.xp = u.xp;
  entry.moves = u.moves.map((m) => m.id);
}

function gainXp(s: GameState, u: Unit, amount: number) {
  u.xp += amount;
  while (u.xp >= xpToNext(u.level)) {
    u.xp -= xpToNext(u.level);
    u.level++;
    applyStats(u);
    s.events.push({ type: "level", id: u.id, x: u.x, y: u.y });
    msg(s, `${unitName(u.kind)} grew to level ${u.level}!`, "#7dffb0");
    // A new move goes in a free slot; otherwise it can be swapped in at camp.
    const learned = (isHero(u.kind) ? HEROES[u.kind].learns : MONSTERS[u.kind].learns).find(([at]) => at === u.level);
    if (learned && !u.moves.some((m) => m.id === learned[1])) {
      const move = learned[1];
      if (u.moves.length < 4) {
        u.moves.push({ id: move, pp: MOVES[move].pp });
        msg(s, `${unitName(u.kind)} learned ${MOVES[move].name}!`, "#ffcf4a");
      } else {
        msg(s, `${unitName(u.kind)} can learn ${MOVES[move].name}. Swap it in at camp.`, "#ffcf4a");
      }
    }
  }
  syncRoster(s, u);
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

  const anchors: Pos[] = [];
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
  const carve = (a: Pos, b: Pos) => {
    let { x, y } = a;
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
    if (s.rng() < 0.5) {
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

function floorLevel(s: GameState) {
  return s.def.level + s.floor - 1;
}

function spawnEnemy(s: GameState, avoidRoom: number) {
  const rooms = s.rooms.map((_, i) => i).filter((i) => i !== avoidRoom);
  const at = randomRoomTile(s, pick(s, rooms));
  if (!at) return;
  const level = Math.max(1, floorLevel(s) + randInt(s, -1, 0));
  s.units.push(makeUnit(s, pick(s, s.def.monsters), "enemy", level, at.x, at.y));
}

function enemyCap(s: GameState) {
  if (isBossFloor(s)) return 3;
  return Math.min(7, 3 + Math.floor(s.def.level / 6) + s.floor);
}

function roomCentre(r: Room): Pos {
  return { x: r.x + Math.floor(r.w / 2), y: r.y + Math.floor(r.h / 2) };
}

function placeFloorContents(s: GameState) {
  const start = randInt(s, 0, s.rooms.length - 1);
  // Party first, bunched round the leader.
  const members = party(s);
  s.units = members;
  s.stairs = { x: -1, y: -1 };
  const origin = randomRoomTile(s, start, false)!;
  const spots = nearestTiles(s, origin, members.length);
  members.forEach((u, i) => {
    u.x = spots[i].x;
    u.y = spots[i].y;
  });

  const others = s.rooms.map((_, i) => i).filter((i) => i !== start);
  if (isBossFloor(s)) {
    // The boss waits in the room furthest from the start.
    const far = others.sort((a, b) => manhattan(roomCentre(s.rooms[b]), origin) - manhattan(roomCentre(s.rooms[a]), origin))[0];
    const at = randomRoomTile(s, far)!;
    const boss = makeUnit(s, s.def.boss, "enemy", floorLevel(s) + 1, at.x, at.y);
    boss.boss = s.def.bossName;
    applyStats(boss);
    boss.hp = boss.maxHp;
    s.units.push(boss);
    msg(s, `${s.def.bossName} is somewhere on this floor!`, "#ff5a6a");
  } else {
    s.stairs = randomRoomTile(s, pick(s, others))!;
  }

  for (let n = enemyCap(s) - 1; n > 0; n--) spawnEnemy(s, start);

  const itemCount = randInt(s, 3, 5);
  for (let n = 0; n < itemCount; n++) {
    const at = randomRoomTile(s, randInt(s, 0, s.rooms.length - 1));
    if (!at) continue;
    const roll = s.rng();
    const kind: Pickup["kind"] =
      roll < 0.4 ? "candy" : roll < 0.6 ? "heart" : roll < 0.78 ? "candycorn" : roll < 0.86 ? "chest" : roll < 0.93 ? "elixir" : "lamp";
    s.pickups.push({ id: s.nextId++, x: at.x, y: at.y, kind, value: kind === "candy" ? candyValue(s) : 0 });
  }
  updateSight(s);
}

function candyValue(s: GameState) {
  return 10 * floorLevel(s) + randInt(s, 0, 10) * 5;
}

// The `count` floor tiles closest to `origin` by walking, origin first.
function nearestTiles(s: GameState, origin: Pos, count: number) {
  const out: Pos[] = [];
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

function canSee(s: GameState, a: Pos, b: Pos) {
  const room = s.roomOf[idx(a.x, a.y)];
  if (room >= 0 && room === s.roomOf[idx(b.x, b.y)]) return true;
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) <= 2;
}

// ---------- paths ----------

// First step along the shortest walk from `from` to any tile where `done` is
// true. Other units block the way unless `throughUnits`.
function firstStep(s: GameState, from: Pos, done: (x: number, y: number) => boolean, opts: { maxDist?: number; throughUnits?: boolean; explored?: boolean } = {}) {
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

export function pathStep(s: GameState, to: Pos) {
  const l = leader(s);
  return firstStep(s, l, (x, y) => x === to.x && y === to.y, { throughUnits: true, explored: true });
}

// ---------- combat ----------

const foesOf = (s: GameState, u: Unit) => s.units.filter((o) => o.team !== u.team);

function damage(s: GameState, a: Unit, b: Unit, power: number) {
  const raw = a.atk * power * (0.85 + s.rng() * 0.3);
  return Math.max(1, Math.round(raw - b.def * 0.5));
}

function hurt(s: GameState, by: Unit | null, b: Unit, amount: number) {
  if (!s.units.includes(b)) return;
  b.hp -= amount;
  s.events.push({ type: "hit", id: b.id, x: b.x, y: b.y, amount, team: b.team });
  if (b.hp <= 0) defeat(s, by, b);
}

function attack(s: GameState, a: Unit, b: Unit) {
  a.dx = Math.sign(b.x - a.x);
  a.dy = Math.sign(b.y - a.y);
  s.events.push({ type: "attack", id: a.id, x: b.x, y: b.y });
  if (s.rng() < 0.08) {
    s.events.push({ type: "miss", x: b.x, y: b.y });
    return;
  }
  hurt(s, a, b, damage(s, a, b, 1));
}

function defeat(s: GameState, by: Unit | null, u: Unit) {
  s.units = s.units.filter((o) => o !== u);
  s.events.push({ type: "die", unit: u });
  if (u.team === "party") {
    syncRoster(s, u);
    if (u.id === s.leaderId) {
      msg(s, `${unitName(u.kind)} fainted...`, "#ff5a6a");
      s.over = true;
    } else {
      msg(s, `${unitName(u.kind)} fainted and went back to camp.`, "#ff5a6a");
    }
    return;
  }
  s.kills++;
  msg(s, `${by ? unitName(by.kind) : "Your team"} beat ${theName(u)}!`);
  const xp = xpFor(u);
  for (const m of party(s)) gainXp(s, m, xp);
  if (!by || by.team === "party") tryRecruit(s, u);
  if (u.boss) {
    s.cleared = true;
    s.over = true;
    msg(s, "Stage clear!", "#ffcf4a");
  }
}

export function recruitChance(s: GameState, u: Unit) {
  const base = u.boss ? BOSS_RECRUIT : MONSTERS[u.kind as MonsterId].recruit;
  const hero = leader(s)?.kind as HeroId | undefined;
  return Math.min(0.9, (base + (u.charmed ? CHARM_BONUS : 0)) * (hero ? HEROES[hero].recruitBonus : 1));
}

function tryRecruit(s: GameState, beaten: Unit) {
  if (s.rng() >= recruitChance(s, beaten)) return;
  // Joins at full health, on the level it was.
  const entry: RosterEntry = { uid: null, kind: beaten.kind, level: beaten.level, xp: 0, moves: defaultMoves(beaten.kind, beaten.level) };
  s.roster.push(entry);
  s.recruits.push(s.roster.length - 1);
  msg(s, `The ${unitName(beaten.kind)} got up. It wants to join you!`, "#ff9ad5");
  if (party(s).length < MAX_PARTY && !s.over) {
    const unit = makeUnit(s, beaten.kind, "party", beaten.level, beaten.x, beaten.y, entry.moves);
    unit.roster = s.roster.length - 1;
    unit.dx = beaten.dx;
    s.units.push(unit);
    s.events.push({ type: "recruit", id: unit.id, x: unit.x, y: unit.y });
    msg(s, `${unitName(unit.kind)} joined your team!`, "#ff9ad5");
  } else {
    msg(s, `Your team is full, so the ${unitName(beaten.kind)} went to wait at camp.`, "#ff9ad5");
  }
}

// ---------- moves ----------

// Who a move would hit if `u` used it facing (dx, dy), and where it ends.
export function moveTargets(s: GameState, u: Unit, move: MoveId, dx = u.dx, dy = u.dy) {
  const def = MOVES[move];
  const foe = (o: Unit | null): o is Unit => !!o && o.team !== u.team;
  const hits: Unit[] = [];
  let end: Pos = { x: u.x + dx, y: u.y + dy };
  switch (def.shape) {
    case "line":
    case "pierce": {
      let x = u.x;
      let y = u.y;
      for (let n = 0; n < def.range; n++) {
        if (!isFloor(s, x + dx, y + dy)) break;
        x += dx;
        y += dy;
        const o = unitAt(s, x, y);
        if (foe(o)) {
          hits.push(o);
          if (def.shape === "line") break;
        }
      }
      end = { x, y };
      break;
    }
    case "front": {
      const o = unitAt(s, u.x + dx, u.y + dy);
      if (foe(o)) hits.push(o);
      break;
    }
    case "sweep": {
      const fx = u.x + dx;
      const fy = u.y + dy;
      for (const [ox, oy] of [[0, 0], [dy, dx], [-dy, -dx]]) {
        const o = unitAt(s, fx + ox, fy + oy);
        if (foe(o)) hits.push(o);
      }
      break;
    }
    case "around": {
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          if (!ox && !oy) continue;
          const o = unitAt(s, u.x + ox, u.y + oy);
          if (foe(o)) hits.push(o);
        }
      }
      end = { x: u.x, y: u.y };
      break;
    }
    case "seek": {
      const near = foesOf(s, u)
        .filter((o) => canSee(s, u, o) && manhattan(u, o) <= def.range)
        .sort((a, b) => manhattan(u, a) - manhattan(u, b))[0];
      if (near) {
        hits.push(near);
        end = { x: near.x, y: near.y };
      }
      break;
    }
    case "room": {
      hits.push(...foesOf(s, u).filter((o) => canSee(s, u, o) && manhattan(u, o) <= def.range));
      end = { x: u.x, y: u.y };
      break;
    }
    case "heal": {
      end = { x: u.x, y: u.y };
      break;
    }
  }
  return { hits, end };
}

function healTargets(s: GameState, u: Unit) {
  return s.units.filter((o) => o.team === u.team && manhattan(o, u) <= 5 && o.hp < o.maxHp);
}

// Whether using the move now would do anything.
export function moveUseful(s: GameState, u: Unit, move: MoveId, dx = u.dx, dy = u.dy) {
  if (MOVES[move].shape === "heal") return healTargets(s, u).length > 0;
  return moveTargets(s, u, move, dx, dy).hits.length > 0;
}

function performMove(s: GameState, u: Unit, slot: MoveSlot, dx = u.dx, dy = u.dy) {
  const def = MOVES[slot.id];
  u.dx = dx;
  u.dy = dy;
  slot.pp--;
  const { hits, end } = moveTargets(s, u, slot.id, dx, dy);
  const heals = def.shape === "heal" ? healTargets(s, u) : [];
  s.events.push({
    type: "move",
    id: u.id,
    move: slot.id,
    from: { x: u.x, y: u.y },
    dx,
    dy,
    to: end,
    targets: (def.shape === "heal" ? heals : hits).map((o) => ({ x: o.x, y: o.y })),
  });
  if (u.team === "party") msg(s, `${unitName(u.kind)} used ${def.name}!`, def.color);
  else msg(s, `${u.boss ?? `The ${unitName(u.kind)}`} used ${def.name}!`, "#ff9a8a");

  if (def.shape === "heal") {
    for (const o of heals) {
      const amount = Math.min(o.maxHp - o.hp, Math.ceil(o.maxHp * def.power));
      o.hp += amount;
      s.events.push({ type: "heal", id: o.id, x: o.x, y: o.y, amount });
    }
    return;
  }
  let dealt = 0;
  for (const target of hits) {
    if (!s.units.includes(target)) continue;
    if (s.rng() >= def.accuracy) {
      s.events.push({ type: "miss", x: target.x, y: target.y });
      continue;
    }
    const amount = damage(s, u, target, def.power);
    dealt += amount;
    if (def.effect === "burn" || def.effect === "poison") {
      target.dot = { turns: 4, amount: Math.max(1, Math.round(u.atk * 0.3)), kind: def.effect };
    }
    if (def.effect === "splash") {
      for (const d of DIRS) {
        const o = unitAt(s, target.x + d.dx, target.y + d.dy);
        if (o && o.team !== u.team) hurt(s, u, o, Math.max(1, Math.round(amount * 0.5)));
      }
    }
    hurt(s, u, target, amount);
    if (s.over) return;
  }
  if (def.effect === "drain" && dealt > 0 && s.units.includes(u)) {
    const amount = Math.min(u.maxHp - u.hp, Math.ceil(dealt * 0.35));
    u.hp += amount;
    if (amount > 0) s.events.push({ type: "heal", id: u.id, x: u.x, y: u.y, amount });
  }
}

// ---------- the player's turn ----------

export type Action =
  | { type: "move"; dx: number; dy: number }
  | { type: "attack" }
  | { type: "wait" }
  | { type: "descend" }
  | { type: "use"; slot: number }
  | { type: "skill"; slot: number };

// Does `action` and then gives everyone else their turn. Returns false if the
// action wasn't possible (walking into a wall), which costs no turn.
export function act(s: GameState, action: Action) {
  if (s.over) return false;
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
    case "skill": {
      const slot = l.moves[action.slot];
      if (!slot) return false;
      if (slot.pp <= 0) {
        msg(s, `${MOVES[slot.id].name} is out of uses. An Elixir refills it.`);
        return false;
      }
      if (!moveUseful(s, l, slot.id)) {
        msg(s, MOVES[slot.id].shape === "heal" ? "Everyone is already healthy." : `Nothing for ${MOVES[slot.id].name} to hit that way.`);
        return false;
      }
      performMove(s, l, slot);
      break;
    }
  }
  if (!s.over) endTurn(s);
  return true;
}

function collectPickup(s: GameState, u: Unit) {
  const p = s.pickups.find((o) => o.x === u.x && o.y === u.y);
  if (!p) return;
  if (p.kind === "candy") {
    s.candy += p.value;
    msg(s, `Found ${p.value} candy!`, "#ffcf4a");
  } else if (p.kind === "chest") {
    const loot: ItemId[] = [pick(s, ["heart", "candycorn"] as const), pick(s, ["heart", "candycorn", "lamp", "elixir"] as const)];
    const bonus = candyValue(s) * 2;
    s.candy += bonus;
    const kept = loot.slice(0, Math.max(0, BAG_SIZE - s.bag.length));
    s.bag.push(...kept);
    s.found.push(...kept);
    msg(s, `Opened a chest: ${bonus} candy${kept.length ? " and " + kept.map((k) => ITEMS[k].name).join(", ") : ""}!`, "#ffcf4a");
  } else {
    if (s.bag.length >= BAG_SIZE) {
      msg(s, `Your bag is full. Left the ${ITEMS[p.kind].name}.`);
      return;
    }
    s.bag.push(p.kind);
    s.found.push(p.kind);
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
  } else if (item === "elixir") {
    for (const u of party(s)) for (const m of u.moves) m.pp = MOVES[m.id].pp;
    msg(s, "Your team drank the Elixir. Every move is refilled!", "#6ae0ff");
  } else {
    throwCandyCorn(s, l);
  }
  s.bag.splice(slot, 1);
  // A found item that's been used up can't be lost any more.
  const f = s.found.indexOf(item);
  if (f >= 0) s.found.splice(f, 1);
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
    msg(s, `${capitalise(theName(hit))} loved the Candy Corn! Beat it and it may join you.`, "#ff9ad5");
  } else {
    const amount = Math.min(hit.maxHp - hit.hp, 10 + hit.level * 2);
    hit.hp += amount;
    s.events.push({ type: "heal", id: hit.id, x: hit.x, y: hit.y, amount });
    msg(s, `${unitName(hit.kind)} caught the Candy Corn and got ${amount} HP back.`, "#7dffb0");
  }
}

const capitalise = (text: string) => text[0].toUpperCase() + text.slice(1);

function nextFloor(s: GameState) {
  s.floor++;
  s.floorTurn = 0;
  // A new floor heals the team a little.
  for (const u of party(s)) {
    u.hp = Math.min(u.maxHp, u.hp + Math.ceil(u.maxHp * 0.2));
    u.dot = null;
  }
  generateFloor(s);
  placeFloorContents(s);
  s.events.push({ type: "floor", floor: s.floor });
  msg(s, isBossFloor(s) ? `B${s.floor}F: the bottom of ${s.def.name}.` : `Welcome to B${s.floor}F.`, "#c88cff");
}

// ---------- everyone else's turn ----------

function endTurn(s: GameState) {
  for (const ally of party(s)) {
    if (s.over) break;
    if (ally.id !== s.leaderId && s.units.includes(ally)) allyTurn(s, ally);
  }
  for (const enemy of s.units.filter((u) => u.team === "enemy")) {
    if (s.over) break;
    if (s.units.includes(enemy)) enemyTurn(s, enemy);
  }
  s.turn++;
  s.floorTurn++;
  if (s.over) return;
  // Burns and poison tick.
  for (const u of [...s.units]) {
    if (!u.dot || !s.units.includes(u)) continue;
    u.dot.turns--;
    const amount = u.dot.amount;
    if (u.dot.turns <= 0) u.dot = null;
    hurt(s, u.team === "enemy" ? leader(s) : null, u, amount);
    if (s.over) return;
  }
  // Slowly heal while exploring.
  if (s.turn % 5 === 0) for (const u of party(s)) u.hp = Math.min(u.maxHp, u.hp + Math.max(1, Math.round(u.maxHp / 30)));
  // New monsters wander in now and then.
  if (!isBossFloor(s) && s.floorTurn % 30 === 0 && s.units.filter((u) => u.team === "enemy").length < enemyCap(s)) {
    const l = leader(s);
    spawnEnemy(s, s.roomOf[idx(l.x, l.y)]);
  }
  updateSight(s);
}

function moveUnit(u: Unit, to: Pos) {
  u.dx = Math.sign(to.x - u.x);
  u.dy = Math.sign(to.y - u.y);
  u.x = to.x;
  u.y = to.y;
}

// The move worth using now and which way to face, if any.
function pickMove(s: GameState, u: Unit, chance: number) {
  if (s.rng() >= chance) return null;
  const options: { slot: MoveSlot; dx: number; dy: number; score: number }[] = [];
  for (const slot of u.moves) {
    if (slot.pp <= 0) continue;
    const def = MOVES[slot.id];
    if (def.shape === "heal") {
      const low = healTargets(s, u).filter((o) => o.hp < o.maxHp * 0.5);
      if (low.length) options.push({ slot, dx: u.dx, dy: u.dy, score: 3 + low.length });
      continue;
    }
    const dirs = def.shape === "seek" || def.shape === "room" || def.shape === "around" ? [{ dx: u.dx, dy: u.dy }] : DIRS;
    for (const d of dirs) {
      const n = moveTargets(s, u, slot.id, d.dx, d.dy).hits.length;
      if (n) options.push({ slot, dx: d.dx, dy: d.dy, score: n * def.power });
    }
  }
  options.sort((a, b) => b.score - a.score);
  return options[0] ?? null;
}

function allyTurn(s: GameState, u: Unit) {
  const l = leader(s);
  const foes = s.units.filter((o) => o.team === "enemy");
  const chosen = pickMove(s, u, 0.45);
  if (chosen) {
    performMove(s, u, chosen.slot, chosen.dx, chosen.dy);
    return;
  }
  const next = foes.find((f) => adjacent(f, u));
  if (next) {
    attack(s, u, next);
    return;
  }
  const lead = manhattan(u, l);
  // Go after a monster nearby, as long as the leader isn't left behind.
  const target = foes.filter((f) => canSee(s, u, f) && manhattan(f, u) <= 6).sort((a, b) => manhattan(a, u) - manhattan(b, u))[0];
  if (target && lead <= 6) {
    const step = firstStep(s, u, (x, y) => x === target.x && y === target.y, { maxDist: 12 });
    if (step && !unitAt(s, step.x, step.y)) {
      moveUnit(u, step);
      return;
    }
  }
  if (lead <= 1) return;
  const step = firstStep(s, u, (x, y) => manhattan({ x, y }, l) <= 1 && !(x === l.x && y === l.y) && !unitAt(s, x, y));
  if (step && !unitAt(s, step.x, step.y)) moveUnit(u, step);
}

function enemyTurn(s: GameState, u: Unit) {
  const members = party(s);
  if (members.some((m) => canSee(s, u, m))) u.aware = true;
  if (u.aware) {
    const chosen = pickMove(s, u, u.boss ? 0.4 : 0.2);
    if (chosen) {
      performMove(s, u, chosen.slot, chosen.dx, chosen.dy);
      return;
    }
  }
  const next = pick(s, members.filter((m) => adjacent(m, u)));
  if (next) {
    u.aware = true;
    attack(s, u, next);
    return;
  }
  if (u.aware) {
    const near = members.filter((m) => manhattan(m, u) <= 14);
    if (!near.length) {
      u.aware = false;
    } else {
      const step = firstStep(s, u, (x, y) => near.some((m) => m.x === x && m.y === y), { maxDist: 16 });
      if (step && !unitAt(s, step.x, step.y)) moveUnit(u, step);
      return;
    }
  }
  // Bosses hold their room until they see you.
  if (u.boss) return;
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

// ---------- a new stage ----------

export interface GameOptions {
  stage: number;
  // Hero first, then the monsters brought along.
  roster: RosterEntry[];
  bag: ItemId[];
  seed?: number;
  // Dev: start on this floor.
  floor?: number;
}

export function newGame(options: GameOptions): GameState {
  const seed = options.seed ?? Math.floor(Math.random() * 2 ** 31);
  const def = stageDef(options.stage);
  const s: GameState = {
    seed,
    rng: mulberry32(seed),
    stage: options.stage,
    def,
    floor: Math.min(def.floors, options.floor ?? 1),
    tiles: new Uint8Array(0),
    roomOf: new Int16Array(0),
    rooms: [],
    stairs: { x: -1, y: -1 },
    explored: new Uint8Array(0),
    visible: new Uint8Array(0),
    sightVersion: 0,
    units: [],
    pickups: [],
    bag: [...options.bag],
    found: [],
    roster: options.roster.map((r) => ({ ...r, moves: [...r.moves] })),
    recruits: [],
    leaderId: 0,
    nextId: 1,
    turn: 0,
    floorTurn: 0,
    candy: 0,
    kills: 0,
    cleared: false,
    over: false,
    events: [],
  };
  s.roster.forEach((r, i) => {
    const u = makeUnit(s, r.kind, "party", r.level, 0, 0, r.moves);
    u.xp = r.xp;
    u.roster = i;
    if (i === 0) s.leaderId = u.id;
    s.units.push(u);
  });
  generateFloor(s);
  placeFloorContents(s);
  msg(s, `${def.name}, B${s.floor}F.`, "#c88cff");
  return s;
}

// What a finished stage adds to the save.
export function report(s: GameState): StageReport {
  for (const u of party(s)) syncRoster(s, u);
  const bag = [...s.bag];
  if (!s.cleared) {
    for (const f of s.found) {
      const i = bag.indexOf(f);
      if (i >= 0) bag.splice(i, 1);
    }
  }
  const recruits = new Set(s.recruits);
  return {
    stage: s.stage,
    cleared: s.cleared,
    floor: s.cleared ? s.def.floors : s.floor,
    candy: s.candy,
    roster: s.roster.filter((_, i) => !recruits.has(i)),
    recruits: s.recruits.map((i) => s.roster[i]),
    bag,
  };
}

// ---------- a simple player, for the menu's attract mode and balance checks ----------

export function autoAction(s: GameState): Action {
  const l = leader(s);
  const foes = s.units.filter((u) => u.team === "enemy" && s.visible[idx(u.x, u.y)]);
  const heart = s.bag.indexOf("heart");
  if (heart >= 0 && l.hp < l.maxHp * 0.35) return { type: "use", slot: heart };
  const elixir = s.bag.indexOf("elixir");
  if (elixir >= 0 && l.moves.length > 0 && l.moves.every((m) => m.pp === 0)) return { type: "use", slot: elixir };
  const heal = l.moves.findIndex((m) => m.pp > 0 && MOVES[m.id].shape === "heal");
  if (heal >= 0 && party(s).some((u) => u.hp < u.maxHp * 0.4)) return { type: "skill", slot: heal };
  // A move, if one would hit something facing the way we already are.
  if (foes.length) {
    const slot = l.moves.findIndex((m) => m.pp > 0 && MOVES[m.id].shape !== "heal" && moveUseful(s, l, m.id));
    if (slot >= 0 && s.rng() < 0.6) return { type: "skill", slot };
  }
  const next = foes.find((f) => adjacent(f, l));
  if (next) {
    const corn = s.bag.indexOf("candycorn");
    // Charm a fresh monster in front of us.
    if (corn >= 0 && !next.charmed && next.hp > next.maxHp * 0.5 && l.x + l.dx === next.x && l.y + l.dy === next.y) return { type: "use", slot: corn };
    return { type: "move", dx: next.x - l.x, dy: next.y - l.y };
  }
  if (onStairs(s) && (s.floorTurn > 250 || !frontierStep(s))) return { type: "descend" };
  const toward = (step: Pos | null): Action | null => (step ? { type: "move", dx: step.x - l.x, dy: step.y - l.y } : null);
  const target = foes.sort((a, b) => manhattan(a, l) - manhattan(b, l))[0];
  if (target && (manhattan(target, l) <= 6 || target.boss)) {
    const a = toward(firstStep(s, l, (x, y) => x === target.x && y === target.y, { throughUnits: true, maxDist: 30 }));
    if (a) return a;
  }
  const item = s.pickups.find((p) => s.visible[idx(p.x, p.y)]);
  if (item && (s.bag.length < BAG_SIZE || item.kind === "candy" || item.kind === "chest")) {
    const a = toward(firstStep(s, l, (x, y) => x === item.x && y === item.y, { throughUnits: true }));
    if (a) return a;
  }
  if (s.floorTurn <= 250 || isBossFloor(s)) {
    const a = toward(frontierStep(s));
    if (a) return a;
  }
  if (isBossFloor(s)) {
    // Explored everything: go find the boss.
    const boss = s.units.find((u) => u.boss);
    const a = boss ? toward(firstStep(s, l, (x, y) => x === boss.x && y === boss.y, { throughUnits: true })) : null;
    if (a) return a;
  }
  if (s.stairs.x >= 0 && s.explored[idx(s.stairs.x, s.stairs.y)]) {
    const a = toward(firstStep(s, l, (x, y) => x === s.stairs.x && y === s.stairs.y, { throughUnits: true }));
    if (a) return a;
  }
  return { type: "wait" };
}

// Toward the nearest explored tile next to unexplored floor. (It peeks at the
// map to know which unexplored tiles are floor; fine for a bot.)
function frontierStep(s: GameState) {
  const l = leader(s);
  return firstStep(s, l, (x, y) => DIRS.some((d) => isFloor(s, x + d.dx, y + d.dy) && !s.explored[idx(x + d.dx, y + d.dy)]), { throughUnits: true, explored: true });
}
