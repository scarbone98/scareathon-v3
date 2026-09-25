// Horde Rush game rules, with no drawing or DOM so a headless script can
// play it for balancing (`npm run balance:horde-rush`).
//
// World units: the road runs along +z and is ROAD_HALF * 2 wide. Your army
// walks forward on its own; you only steer it left and right. Everything
// else sits on the road (gates, barrels) or walks toward you (monsters).

export const ROAD_HALF = 5;
export const RUN_SPEED = 6;
export const BULLET_SPEED = 38;
export const BULLET_RANGE = 26;
// Shots per soldier per second at 100% fire rate.
const BASE_RATE = 1.6;
// Bullets actually simulated per second; past this each bullet hits harder.
const MAX_BULLETS_PER_SEC = 45;
const STEER_SPEED = 16;
const MAX_ARMY = 9999;
const MAX_FIRE = 2.5;
// Monsters start walking once they're this close.
const WAKE_DISTANCE = 44;
const SEGMENT_GAP = 19;
const SEGMENTS_PER_LEVEL = 8;
// When a boss is this far ahead the army stops and holds the line.
const BOSS_HOLD_DISTANCE = 11;

export type MonsterId =
  | "rat" | "skull" | "imp" | "pumpkin" | "zombie" | "ghost" | "candle"
  | "werewolf" | "scarecrow" | "ufo" | "shadowbeast" | "swampthing";

interface MonsterStats {
  hp: number;
  speed: number;
  radius: number;
  // First level it can show up in a normal wave.
  from: number;
}

export const MONSTERS: Record<MonsterId, MonsterStats> = {
  rat: { hp: 3, speed: 2.4, radius: 0.45, from: 1 },
  skull: { hp: 4, speed: 3.0, radius: 0.45, from: 1 },
  imp: { hp: 5, speed: 1.9, radius: 0.45, from: 1 },
  pumpkin: { hp: 6, speed: 1.6, radius: 0.5, from: 1 },
  zombie: { hp: 8, speed: 1.3, radius: 0.5, from: 1 },
  ghost: { hp: 10, speed: 1.8, radius: 0.5, from: 2 },
  candle: { hp: 12, speed: 1.4, radius: 0.6, from: 2 },
  werewolf: { hp: 16, speed: 2.4, radius: 0.7, from: 2 },
  scarecrow: { hp: 22, speed: 1.2, radius: 0.7, from: 3 },
  ufo: { hp: 28, speed: 1.7, radius: 0.85, from: 3 },
  shadowbeast: { hp: 36, speed: 1.5, radius: 0.9, from: 4 },
  swampthing: { hp: 50, speed: 1.0, radius: 1.0, from: 5 },
};

const BOSSES: MonsterId[] = ["swampthing", "shadowbeast", "ufo", "scarecrow", "werewolf"];

export type GateKind = "add" | "mul" | "fire";

export interface Gate {
  id: number;
  pair: number;
  kind: GateKind;
  // add: soldiers gained (or lost when negative); mul: multiplier;
  // fire: fire rate change in percent.
  value: number;
  x0: number;
  x1: number;
  z: number;
  // Damage soaked toward the next +1.
  progress: number;
  used: boolean;
  chosen: boolean;
  hitT: number;
}

export interface Barrel {
  id: number;
  x: number;
  z: number;
  hp: number;
  maxHp: number;
  reward: { kind: "add" | "fire"; amount: number };
  hitT: number;
}

export interface Enemy {
  id: number;
  type: MonsterId;
  x: number;
  z: number;
  hp: number;
  maxHp: number;
  speed: number;
  radius: number;
  boss: boolean;
  awake: boolean;
  // Bosses chew through soldiers while they're in contact.
  chewing: boolean;
  chewAcc: number;
  hitT: number;
}

export interface Bullet {
  x: number;
  z: number;
  z0: number;
  dmg: number;
}

export type GameEvent =
  | { type: "gate"; gate: Gate; before: number; after: number }
  | { type: "barrel"; barrel: Barrel }
  | { type: "barrelCrash"; barrel: Barrel; lost: number }
  | { type: "kill"; enemy: Enemy }
  | { type: "bite"; enemy: Enemy; lost: number }
  | { type: "hit"; x: number; z: number; y: number }
  | { type: "level"; level: number }
  | { type: "boss"; enemy: Enemy }
  | { type: "over" };

export interface GameState {
  t: number;
  z: number;
  x: number;
  targetX: number;
  army: number;
  // Fire rate multiplier, 1 = 100%.
  fire: number;
  level: number;
  levelStartZ: number;
  bossZ: number;
  score: number;
  kills: number;
  shotAcc: number;
  halted: boolean;
  over: boolean;
  nextId: number;
  gates: Gate[];
  barrels: Barrel[];
  enemies: Enemy[];
  bullets: Bullet[];
  events: GameEvent[];
  rng: () => number;
}

// Mulberry32: small and seedable so balance runs repeat.
export function makeRng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// How much tougher each level is: monster HP and gate costs scale with it.
export function difficulty(level: number) {
  return Math.pow(1.85, level - 1);
}

// The army stands in a sunflower spiral this far apart; past
// MAX_VISIBLE_SOLDIERS it's drawn (and collides) at that size.
export const SOLDIER_SPACING = 0.3;
export const MAX_VISIBLE_SOLDIERS = 80;

// How far the army spreads; wider armies cover more of the road.
export function squadRadius(army: number) {
  return 0.25 + SOLDIER_SPACING * Math.sqrt(Math.min(army, MAX_VISIBLE_SOLDIERS));
}

export function newGame(seed = Math.floor(Math.random() * 1e9)): GameState {
  const state: GameState = {
    t: 0,
    z: 0,
    x: 0,
    targetX: 0,
    army: 8,
    fire: 1,
    level: 1,
    levelStartZ: 0,
    bossZ: 0,
    score: 0,
    kills: 0,
    shotAcc: 0,
    halted: false,
    over: false,
    nextId: 1,
    gates: [],
    barrels: [],
    enemies: [],
    bullets: [],
    events: [],
    rng: makeRng(seed),
  };
  buildLevel(state, 14);
  return state;
}

// ---------- level layout ----------

function pick<T>(rng: () => number, items: T[]) {
  return items[Math.floor(rng() * items.length)];
}

function between(rng: () => number, lo: number, hi: number) {
  return Math.round(lo + rng() * (hi - lo));
}

function addGatePair(state: GameState, z: number, index: number) {
  const { rng, level } = state;
  const d = difficulty(level);
  const plus = () => ({ kind: "add" as const, value: between(rng, 4, 10) * Math.ceil(d) });
  const minus = () => ({ kind: "add" as const, value: -between(rng, 5, 12) * Math.ceil(d) });
  const fireUp = () => ({ kind: "fire" as const, value: between(rng, 2, 5) * 5 });
  const fireDown = () => ({ kind: "fire" as const, value: -between(rng, 2, 4) * 5 });
  const times = () => ({ kind: "mul" as const, value: 2 });

  // The first door of a run is free; after that most pairs have a trap,
  // and from level 2 some are all traps until you shoot one good.
  const options: { kind: GateKind; value: number }[][] =
    index === 0 && level === 1
      ? [[plus(), plus()]]
      : [
          [plus(), minus()],
          [plus(), fireUp()],
          [times(), plus()],
          [minus(), fireUp()],
          [times(), minus()],
          ...(level > 1 ? [[minus(), fireDown()], [minus(), minus()]] : []),
        ];
  const sides = pick(rng, options);
  if (rng() < 0.5) sides.reverse();

  const pair = state.nextId++;
  const gap = 0.25;
  sides.forEach((side, i) => {
    state.gates.push({
      id: state.nextId++,
      pair,
      ...side,
      x0: i === 0 ? -ROAD_HALF : gap,
      x1: i === 0 ? -gap : ROAD_HALF,
      z,
      progress: 0,
      used: false,
      chosen: false,
      hitT: 0,
    });
  });
}

function addBarrels(state: GameState, z: number) {
  const { rng, level } = state;
  const d = difficulty(level);
  const count = rng() < 0.5 ? 2 : 3;
  const lanes = count === 2 ? [-2.6, 2.6] : [-3.3, 0, 3.3];
  for (const x of lanes) {
    const hp = Math.round(between(rng, 12, 24) * d);
    const reward =
      rng() < 0.6
        ? { kind: "add" as const, amount: between(rng, 3, 8) * Math.ceil(d) }
        : { kind: "fire" as const, amount: between(rng, 2, 4) * 5 };
    state.barrels.push({ id: state.nextId++, x, z: z + rng() * 2, hp, maxHp: hp, reward, hitT: 0 });
  }
}

function spawnEnemy(state: GameState, type: MonsterId, x: number, z: number, boss = false) {
  const stats = MONSTERS[type];
  const d = difficulty(state.level);
  const hp = boss ? Math.round(stats.hp * 8 * d * (1 + 0.15 * (state.level - 1))) : Math.max(1, Math.round(stats.hp * d));
  const enemy: Enemy = {
    id: state.nextId++,
    type,
    x,
    z,
    hp,
    maxHp: hp,
    speed: boss ? 1.1 : stats.speed * (0.9 + state.rng() * 0.2),
    radius: boss ? 1.8 : stats.radius,
    boss,
    awake: false,
    chewing: false,
    chewAcc: 0,
    hitT: 0,
  };
  state.enemies.push(enemy);
  return enemy;
}

function addWave(state: GameState, z: number, strength: number) {
  const { rng, level } = state;
  const pool = (Object.keys(MONSTERS) as MonsterId[]).filter((id) => MONSTERS[id].from <= level && id !== "swampthing");
  // Budget in base HP, so a wave's size stays readable as HP scales.
  let budget = strength;
  let row = 0;
  while (budget > 2) {
    const affordable = pool.filter((id) => MONSTERS[id].hp <= budget);
    if (!affordable.length) break;
    // Lean toward the tougher monsters you can afford.
    const type = affordable[Math.floor(Math.pow(rng(), 0.7) * affordable.length)];
    budget -= MONSTERS[type].hp;
    const x = (rng() * 2 - 1) * (ROAD_HALF - 0.8);
    spawnEnemy(state, type, x, z + row * 1.1 + rng() * 0.8);
    row++;
  }
}

// Lays out a level ahead of the army: gates, barrels and waves in turn,
// ending with a boss.
function buildLevel(state: GameState, startGap: number) {
  const { level } = state;
  const start = state.z + startGap;
  state.levelStartZ = state.z;
  let gateIndex = 0;
  for (let i = 0; i < SEGMENTS_PER_LEVEL; i++) {
    const z = start + i * SEGMENT_GAP;
    const waveStrength = (8 + i * 9) * (1 + (level - 1) * 0.3);
    if (i % 2 === 0) {
      addGatePair(state, z, gateIndex++);
      if (i >= 2) addWave(state, z + 9, waveStrength * 0.5);
    } else if (i === 3 || i === 7) {
      addBarrels(state, z);
      addWave(state, z + 8, waveStrength * 0.6);
    } else {
      addWave(state, z, waveStrength);
    }
  }
  state.bossZ = start + SEGMENTS_PER_LEVEL * SEGMENT_GAP + 8;
  spawnEnemy(state, BOSSES[(level - 1) % BOSSES.length], 0, state.bossZ, true);
}

// ---------- the step ----------

function applyGate(state: GameState, gate: Gate) {
  const before = state.army;
  const value = Math.floor(gate.value);
  if (gate.kind === "add") state.army += value;
  if (gate.kind === "mul") state.army *= value;
  if (gate.kind === "fire") state.fire = Math.min(MAX_FIRE, Math.max(0.4, state.fire * (1 + value / 100)));
  state.army = Math.min(MAX_ARMY, Math.max(0, state.army));
  state.events.push({ type: "gate", gate, before, after: state.army });
}

// Each +1 on a gate costs a little more than the last, so shooting one
// door all game can't grow the army without limit.
function gateStepCost(gate: Gate, d: number) {
  if (gate.kind === "fire") return d * (6 + Math.max(0, gate.value) * 1.2);
  return d * (1.5 + Math.max(0, gate.value) * 0.5);
}

function hurtGate(state: GameState, gate: Gate, dmg: number) {
  const d = difficulty(state.level);
  gate.progress += dmg;
  gate.hitT = 0.12;
  // Multipliers are fixed: shooting one just wastes bullets.
  if (gate.kind === "mul") return;
  const cap = gate.kind === "fire" ? 30 : Infinity;
  let cost = gateStepCost(gate, d);
  while (gate.progress >= cost && gate.value < cap) {
    gate.progress -= cost;
    gate.value += gate.kind === "fire" ? 5 : 1;
    cost = gateStepCost(gate, d);
  }
}

function killEnemy(state: GameState, enemy: Enemy) {
  const base = MONSTERS[enemy.type].hp;
  state.score += enemy.boss ? 500 * state.level : base * 10 * state.level;
  state.kills++;
  state.events.push({ type: "kill", enemy });
}

function loseSoldiers(state: GameState, count: number) {
  const lost = Math.min(state.army, Math.max(0, Math.ceil(count)));
  state.army -= lost;
  return lost;
}

// What a monster costs you when it reaches the army: one soldier per
// couple of HP it has left, so wounded monsters hurt less.
function biteSize(enemy: Enemy) {
  return Math.ceil(enemy.hp / 2);
}

type Target = { kind: "gate"; gate: Gate } | { kind: "barrel"; barrel: Barrel } | { kind: "enemy"; enemy: Enemy };

function firstHit(state: GameState, x: number, z0: number, z1: number): { target: Target; z: number } | null {
  let best: { target: Target; z: number } | null = null;
  for (const gate of state.gates) {
    if (gate.used || gate.z < z0 || gate.z > z1 || x < gate.x0 || x > gate.x1) continue;
    if (!best || gate.z < best.z) best = { target: { kind: "gate", gate }, z: gate.z };
  }
  for (const barrel of state.barrels) {
    if (barrel.z < z0 - 0.5 || barrel.z > z1 + 0.5 || Math.abs(barrel.x - x) > 0.75) continue;
    if (!best || barrel.z < best.z) best = { target: { kind: "barrel", barrel }, z: barrel.z };
  }
  for (const enemy of state.enemies) {
    if (enemy.hp <= 0) continue;
    const r = enemy.radius;
    if (enemy.z < z0 - r || enemy.z > z1 + r || Math.abs(enemy.x - x) > r) continue;
    if (!best || enemy.z < best.z) best = { target: { kind: "enemy", enemy }, z: enemy.z };
  }
  return best;
}

export function step(state: GameState, dt: number) {
  if (state.over) return;
  state.t += dt;
  const r = squadRadius(state.army);

  // Steering
  const limit = ROAD_HALF - r * 0.7;
  state.targetX = Math.max(-limit, Math.min(limit, state.targetX));
  const dx = state.targetX - state.x;
  state.x += Math.sign(dx) * Math.min(Math.abs(dx), STEER_SPEED * dt);

  // Hold the line while a boss is close.
  const boss = state.enemies.find((e) => e.boss);
  state.halted = Boolean(boss && boss.z - state.z < BOSS_HOLD_DISTANCE);
  const prevZ = state.z;
  if (!state.halted) state.z += RUN_SPEED * dt;

  // Walking through gates
  for (const gate of state.gates) {
    if (gate.used || gate.z <= prevZ || gate.z > state.z) continue;
    const pairGates = state.gates.filter((g) => g.pair === gate.pair);
    const chosen =
      pairGates.find((g) => state.x >= g.x0 && state.x <= g.x1) ??
      pairGates.reduce((a, b) => (Math.abs((a.x0 + a.x1) / 2 - state.x) < Math.abs((b.x0 + b.x1) / 2 - state.x) ? a : b));
    for (const g of pairGates) g.used = true;
    chosen.chosen = true;
    applyGate(state, chosen);
  }

  // Firing
  const shotsPerSec = state.army * BASE_RATE * state.fire;
  const bulletsPerSec = Math.min(shotsPerSec, MAX_BULLETS_PER_SEC);
  const dmg = bulletsPerSec > 0 ? shotsPerSec / bulletsPerSec : 0;
  state.shotAcc += bulletsPerSec * dt;
  while (state.shotAcc >= 1) {
    state.shotAcc -= 1;
    // From a random soldier: wider armies spray across more of the road.
    const x = state.x + (state.rng() * 2 - 1) * r * 0.85;
    const z = state.z + 0.4 + state.rng() * 0.3;
    state.bullets.push({ x, z, z0: z, dmg });
  }

  // Bullets
  const survivors: Bullet[] = [];
  for (const b of state.bullets) {
    const nz = b.z + BULLET_SPEED * dt;
    const hit = firstHit(state, b.x, b.z, nz);
    if (hit) {
      const t = hit.target;
      if (t.kind === "gate") {
        hurtGate(state, t.gate, b.dmg);
        state.events.push({ type: "hit", x: b.x, z: t.gate.z, y: 1.1 });
      } else if (t.kind === "barrel") {
        t.barrel.hp -= b.dmg;
        t.barrel.hitT = 0.12;
        state.events.push({ type: "hit", x: b.x, z: t.barrel.z, y: 0.6 });
        if (t.barrel.hp <= 0) {
          const { reward } = t.barrel;
          if (reward.kind === "add") state.army = Math.min(MAX_ARMY, state.army + reward.amount);
          else state.fire = Math.min(MAX_FIRE, state.fire * (1 + reward.amount / 100));
          state.events.push({ type: "barrel", barrel: t.barrel });
          state.barrels = state.barrels.filter((x) => x !== t.barrel);
        }
      } else {
        const e = t.enemy;
        e.hp -= b.dmg;
        e.hitT = 0.1;
        state.events.push({ type: "hit", x: b.x, z: e.z - e.radius * 0.5, y: e.boss ? 1.6 : 0.6 });
        if (e.hp <= 0) killEnemy(state, e);
      }
      continue;
    }
    b.z = nz;
    if (b.z - b.z0 < BULLET_RANGE) survivors.push(b);
  }
  state.bullets = survivors;

  // Monsters
  for (const e of state.enemies) {
    if (e.hp <= 0) continue;
    if (!e.awake && e.z - state.z < WAKE_DISTANCE) {
      e.awake = true;
      if (e.boss) state.events.push({ type: "boss", enemy: e });
    }
    if (!e.awake) continue;
    const contactZ = state.z + r * 0.6 + e.radius * 0.6;
    if (e.boss) {
      if (e.z > contactZ) {
        e.z = Math.max(contactZ, e.z - e.speed * dt);
        e.chewing = false;
      } else {
        // The boss plants itself on the army and eats a few soldiers a second.
        e.chewing = true;
        e.chewAcc += dt * (4 + 1.5 * state.level);
        if (e.chewAcc >= 1) {
          const lost = loseSoldiers(state, Math.floor(e.chewAcc));
          e.chewAcc -= Math.floor(e.chewAcc);
          if (lost) state.events.push({ type: "bite", enemy: e, lost });
        }
      }
      continue;
    }
    e.z -= e.speed * dt;
    // Monsters drift toward the army once they're close.
    if (e.z - state.z < 16) {
      const pull = Math.sign(state.x - e.x) * Math.min(Math.abs(state.x - e.x), 1.1 * dt);
      e.x += pull;
    }
    if (e.z <= contactZ && Math.abs(e.x - state.x) < r + e.radius * 0.8) {
      const lost = loseSoldiers(state, biteSize(e));
      state.events.push({ type: "bite", enemy: e, lost });
      e.hp = 0;
    } else if (e.z < state.z - 2) {
      e.hp = 0; // slipped past
    }
  }

  // Barrels you walk into
  for (const barrel of state.barrels) {
    if (barrel.z > state.z + r * 0.5 || barrel.hp <= 0) continue;
    if (Math.abs(barrel.x - state.x) < r + 0.6) {
      const lost = loseSoldiers(state, barrel.hp / 3);
      state.events.push({ type: "barrelCrash", barrel, lost });
    }
    barrel.hp = 0;
  }

  // Tidy up and move on
  const bossDead = boss && boss.hp <= 0;
  state.enemies = state.enemies.filter((e) => e.hp > 0);
  state.barrels = state.barrels.filter((b) => b.hp > 0);
  state.gates = state.gates.filter((g) => g.z > state.z - 6);
  for (const g of state.gates) g.hitT = Math.max(0, g.hitT - dt);
  for (const b of state.barrels) b.hitT = Math.max(0, b.hitT - dt);
  for (const e of state.enemies) e.hitT = Math.max(0, e.hitT - dt);

  if (bossDead) {
    state.score += 250 * state.level;
    state.level++;
    state.events.push({ type: "level", level: state.level });
    // Stray monsters from the last level would fight at the new difficulty.
    state.enemies = [];
    buildLevel(state, 18);
  }

  if (state.army <= 0) {
    state.over = true;
    state.events.push({ type: "over" });
  }
}

// How far through the current level the army is, 0..1.
export function levelProgress(state: GameState) {
  const span = state.bossZ - BOSS_HOLD_DISTANCE - state.levelStartZ;
  return Math.max(0, Math.min(1, (state.z - state.levelStartZ) / span));
}
