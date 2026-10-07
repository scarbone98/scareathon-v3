// Pure deterministic game rules. World coordinates are pixels at 320 x 180.
export const WIDTH = 320;
export const HEIGHT = 180;
export type HeroId = "joe" | "matt";
export type Scene = "test" | "overworld" | "hub" | "dungeon" | "realm" | "prologue" | "shift" | "results" | "dead";
export interface Input {
  x: number; y: number; attack: boolean; ki: boolean; dash: boolean;
  guard: boolean; swap: boolean; interact: boolean;
}
export const idleInput = (): Input => ({ x: 0, y: 0, attack: false, ki: false, dash: false, guard: false, swap: false, interact: false });
export interface HeroState {
  id: HeroId; hp: number; maxHp: number; ki: number; maxKi: number;
  stamina: number; maxStamina: number; level: number; xp: number;
  power: number; defense: number; invulnerable: number;
}
export interface Enemy {
  id: number; kind: "grunt" | "shooter" | "boss";
  sprite: "zombie" | "pumpkin" | "ghost" | "imp" | "shadowbeast";
  x: number; y: number; hp: number; maxHp: number; radius: number;
  speed: number; cooldown: number; hitTimer: number; kx: number; ky: number;
  phase: 1 | 2; pattern: number; windup: number; aimX: number; aimY: number;
}
export interface Projectile {
  id: number; x: number; y: number; vx: number; vy: number; radius: number;
  damage: number; ttl: number; owner: "hero" | "enemy"; hero?: HeroId;
  beam: boolean; hits: number[];
}
export interface Effect {
  id: number; kind: "slash" | "beam" | "charge" | "dash" | "level" | "hit";
  x: number; y: number; dx: number; dy: number; ttl: number; maxT: number;
  hero?: HeroId; size: number;
}
export interface Floater { id: number; x: number; y: number; text: string; color: string; ttl: number }
export type GameEvent =
  | { type: "hit"; x: number; y: number; damage: number; target: "hero" | "enemy" }
  | { type: "kill"; enemyId: number; kind: Enemy["kind"] }
  | { type: "level"; hero: HeroId; level: number }
  | { type: "swap"; hero: HeroId }
  | { type: "checkpoint"; id: string }
  | { type: "death" };
export interface GameState {
  x: number; y: number; faceX: number; faceY: number; moving: boolean;
  active: HeroId; time: number; scene: Scene; room: number;
  heroes: Record<HeroId, HeroState>; enemies: Enemy[]; projectiles: Projectile[];
  effects: Effect[]; floaters: Floater[]; notice: string; guard: boolean;
  attackTimer: number; combo: number; comboWindow: number; charge: number;
  dashTimer: number; swapCooldown: number; hitStop: number;
  clearedRooms: string[]; areas: string[]; bosses: string[]; chapter: number;
  candy: number; deaths: number; kills: number; events: GameEvent[];
  previousInput: Input; rngSeed: number; nextId: number;
}
const clamp = (value: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, value));
export function activeHero(s: GameState) { return s.heroes[s.active]; }
export function xpForLevel(level: number) { return 75 + (level - 1) * 45; }
function hero(id: HeroId): HeroState {
  return { id, hp: 100, maxHp: 100, ki: 30, maxKi: 60, stamina: 80, maxStamina: 80,
    level: 1, xp: 0, power: id === "joe" ? 12 : 13, defense: id === "joe" ? 3 : 2, invulnerable: 0 };
}
function random(s: GameState) {
  s.rngSeed = (s.rngSeed + 0x6d2b79f5) | 0;
  let n = Math.imul(s.rngSeed ^ (s.rngSeed >>> 15), 1 | s.rngSeed);
  n = (n + Math.imul(n ^ (n >>> 7), 61 | n)) ^ n;
  return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
}
export function newGame(seed = 8591): GameState {
  const s: GameState = { x: 75, y: 110, faceX: 1, faceY: 0, moving: false,
    active: "joe", time: 0, scene: "test", room: 0,
    heroes: { joe: hero("joe"), matt: hero("matt") }, enemies: [], projectiles: [],
    effects: [], floaters: [], notice: "Training yard: try your combat kit.", guard: false,
    attackTimer: 0, combo: 0, comboWindow: 0, charge: 0, dashTimer: 0,
    swapCooldown: 0, hitStop: 0, clearedRooms: [], areas: [], bosses: [], chapter: 1,
    candy: 0, deaths: 0, kills: 0, events: [], previousInput: idleInput(), rngSeed: seed | 0, nextId: 1 };
  enterScene(s, "test");
  return s;
}
export function addEnemy(s: GameState, kind: Enemy["kind"], x: number, y: number): Enemy {
  const maxHp = kind === "boss" ? 260 : kind === "shooter" ? 24 : 32;
  const e: Enemy = { id: s.nextId++, kind, sprite: kind === "boss" ? "shadowbeast" : kind === "shooter" ? "imp" : "zombie",
    x, y, hp: maxHp, maxHp, radius: kind === "boss" ? 16 : 7,
    speed: kind === "shooter" ? 19 : 23, cooldown: 0.7 + random(s) * 0.5,
    hitTimer: 0, kx: 0, ky: 0, phase: 1, pattern: 0, windup: 0, aimX: -1, aimY: 0 };
  s.enemies.push(e);
  return e;
}
export function enterScene(s: GameState, scene: Scene, room = 0): void {
  s.scene = scene; s.room = room; s.x = 45; s.y = 108;
  s.faceX = 1; s.faceY = 0; s.moving = false;
  s.enemies = []; s.projectiles = []; s.effects = []; s.floaters = [];
  s.attackTimer = 0; s.combo = 0; s.comboWindow = 0; s.charge = 0;
  s.dashTimer = 0; s.guard = false; s.hitStop = 0;
  s.previousInput = idleInput();
  if (scene === "test") {
    s.x = 75;
    addEnemy(s, "grunt", 183, 73); addEnemy(s, "grunt", 220, 113);
    addEnemy(s, "grunt", 174, 145); addEnemy(s, "shooter", 260, 76);
    s.notice = "J Attack • K Ki • L Dash • Shift Guard • Q Swap";
  }
}
function effect(s: GameState, kind: Effect["kind"], x: number, y: number, size: number, ttl: number, dx = 0, dy = 0) {
  s.effects.push({ id: s.nextId++, kind, x, y, dx, dy, ttl, maxT: ttl, hero: s.active, size });
}
function floater(s: GameState, x: number, y: number, text: string, color: string) {
  s.floaters.push({ id: s.nextId++, x, y: y - 10, text, color, ttl: 0.85 });
}
function gainXp(s: GameState, amount: number) {
  for (const h of Object.values(s.heroes)) {
    h.xp += amount;
    while (h.xp >= xpForLevel(h.level)) {
      h.xp -= xpForLevel(h.level); h.level++;
      h.maxHp += 20; h.hp = Math.min(h.maxHp, h.hp + 30);
      h.maxKi += 10; h.ki = Math.min(h.maxKi, h.ki + 15);
      h.power += 3; h.defense++;
      s.events.push({ type: "level", hero: h.id, level: h.level });
      if (h.id === s.active) {
        effect(s, "level", s.x, s.y, 25, 0.85);
        floater(s, s.x, s.y - 15, `LEVEL ${h.level}!`, "#f9e77c");
      }
    }
  }
}
function hurtEnemy(s: GameState, e: Enemy, damage: number, dx: number, dy: number, force: number) {
  if (e.hp <= 0) return;
  const dealt = Math.round(damage);
  e.hp -= dealt; e.hitTimer = 0.15; e.kx += dx * force; e.ky += dy * force;
  effect(s, "hit", e.x, e.y, 9, 0.12);
  floater(s, e.x, e.y, String(dealt), s.active === "joe" ? "#9cefff" : "#ffe393");
  s.events.push({ type: "hit", x: e.x, y: e.y, damage: dealt, target: "enemy" });
  if (e.hp <= 0) {
    const candy = e.kind === "boss" ? 35 : 3 + Math.floor(random(s) * 3);
    s.candy += candy; s.kills++;
    floater(s, e.x, e.y + 13, `+${candy} candy`, "#eea2fc");
    gainXp(s, e.kind === "boss" ? 130 : e.kind === "shooter" ? 35 : 28);
    s.events.push({ type: "kill", enemyId: e.id, kind: e.kind });
  }
}
function swapHero(s: GameState) {
  const next = s.active === "joe" ? "matt" : "joe";
  if (s.heroes[next].hp <= 0) return;
  s.active = next; s.swapCooldown = 0.75; s.charge = 0; s.attackTimer = 0; s.combo = 0;
  activeHero(s).invulnerable = Math.max(activeHero(s).invulnerable, 0.25);
  effect(s, "level", s.x, s.y, 16, 0.3);
  s.events.push({ type: "swap", hero: next });
}
function hurtHero(s: GameState, baseDamage: number) {
  const h = activeHero(s);
  if (h.invulnerable > 0 || s.dashTimer > 0 || h.hp <= 0) return;
  const damage = Math.max(1, Math.round((baseDamage - h.defense * 0.5) * (s.guard ? 0.25 : 1)));
  h.hp = Math.max(0, h.hp - damage); h.invulnerable = s.guard ? 0.12 : 0.5;
  floater(s, s.x, s.y, s.guard ? `BLOCK ${damage}` : String(damage), s.guard ? "#a4d5ed" : "#ff897f");
  effect(s, "hit", s.x, s.y, 10, 0.13);
  s.events.push({ type: "hit", x: s.x, y: s.y, damage, target: "hero" });
  if (h.hp === 0) {
    const other = s.heroes[s.active === "joe" ? "matt" : "joe"];
    if (other.hp > 0) { swapHero(s); s.notice = `${h.id.toUpperCase()} is down! ${other.id.toUpperCase()} takes over.`; }
    else {
      s.scene = "dead"; s.deaths++; s.moving = false; s.guard = false;
      s.events.push({ type: "death" });
    }
  }
}
function melee(s: GameState) {
  s.combo = s.comboWindow > 0 ? s.combo % 3 + 1 : 1;
  s.attackTimer = s.combo === 3 ? 0.28 : 0.2;
  s.comboWindow = 0.8;
  const reach = s.combo === 3 ? 34 : 28;
  effect(s, "slash", s.x, s.y, reach, s.attackTimer, s.faceX, s.faceY);
  let hit = false;
  for (const e of s.enemies) {
    const dx = e.x - s.x, dy = e.y - s.y, length = Math.hypot(dx, dy);
    if (length > reach + e.radius || (dx * s.faceX + dy * s.faceY) / Math.max(1, length) < -0.1) continue;
    hurtEnemy(s, e, activeHero(s).power * [1, 1.15, 1.9][s.combo - 1], s.faceX, s.faceY, s.combo === 3 ? 125 : 55);
    hit = true;
  }
  if (hit) s.hitStop = s.combo === 3 ? 0.06 : 0.035;
}
function projectile(s: GameState, owner: Projectile["owner"], x: number, y: number, dx: number, dy: number,
  speed: number, damage: number, radius: number, beam = false) {
  s.projectiles.push({ id: s.nextId++, owner, x, y, vx: dx * speed, vy: dy * speed, damage,
    radius, beam, hero: owner === "hero" ? s.active : undefined, ttl: beam ? 0.8 : 3.5, hits: [] });
}
function fireKi(s: GameState) {
  const h = activeHero(s);
  if (h.ki >= h.maxKi - 0.01) {
    h.ki = 0;
    const angles = s.active === "joe" ? [0] : [-0.16, 0, 0.16];
    for (const angle of angles) {
      const dx = s.faceX * Math.cos(angle) - s.faceY * Math.sin(angle);
      const dy = s.faceX * Math.sin(angle) + s.faceY * Math.cos(angle);
      projectile(s, "hero", s.x + dx * 10, s.y + dy * 10, dx, dy, 245,
        h.power * (s.active === "joe" ? 4.4 : 1.8), s.active === "joe" ? 10 : 6, true);
    }
    effect(s, "beam", s.x, s.y, s.active === "joe" ? 130 : 105, 0.36, s.faceX, s.faceY);
    s.notice = s.active === "joe" ? "JOE: Wayside Wave!" : "MATT: Golden Fury!";
  } else if (h.ki >= 8) {
    h.ki -= 8;
    projectile(s, "hero", s.x + s.faceX * 12, s.y + s.faceY * 12,
      s.faceX, s.faceY, 155, h.power * 1.5, 4);
  } else s.notice = "Hold Ki to recharge.";
  s.charge = 0;
}
function updateEnemies(s: GameState, dt: number) {
  for (const e of s.enemies) {
    if (e.hp <= 0) continue;
    e.hitTimer = Math.max(0, e.hitTimer - dt);
    e.cooldown = Math.max(0, e.cooldown - dt);
    e.x += e.kx * dt; e.y += e.ky * dt;
    e.kx *= Math.max(0, 1 - dt * 9); e.ky *= Math.max(0, 1 - dt * 9);
    const dx = s.x - e.x, dy = s.y - e.y, length = Math.max(1, Math.hypot(dx, dy));
    e.aimX = dx / length; e.aimY = dy / length;
    const contact = e.radius + 9;
    if (e.kind === "shooter") {
      const direction = length < 62 ? -1 : length > 90 ? 1 : 0;
      e.x += e.aimX * e.speed * direction * dt; e.y += e.aimY * e.speed * direction * dt;
      if (e.cooldown === 0) {
        projectile(s, "enemy", e.x, e.y, e.aimX, e.aimY, 70, 9, 4);
        e.cooldown = 1.7; e.windup = 0;
      } else e.windup = e.cooldown < 0.35 ? 0.35 - e.cooldown : 0;
    } else if (length > contact) {
      e.x += e.aimX * e.speed * dt; e.y += e.aimY * e.speed * dt;
    } else if (e.cooldown === 0) {
      hurtHero(s, e.kind === "boss" ? 18 : 9); e.cooldown = 1.15;
    }
    e.x = clamp(e.x, 15, WIDTH - 15); e.y = clamp(e.y, 49, HEIGHT - 13);
  }
}
function updateProjectiles(s: GameState, dt: number) {
  for (const p of s.projectiles) {
    const x0 = p.x, y0 = p.y;
    p.x += p.vx * dt; p.y += p.vy * dt; p.ttl -= dt;
    // A segment collision prevents fast beams slipping between fixed-step targets.
    const collides = (x: number, y: number, radius: number) => {
      const dx = p.x - x0, dy = p.y - y0;
      const t = clamp(((x - x0) * dx + (y - y0) * dy) / Math.max(0.001, dx * dx + dy * dy), 0, 1);
      return Math.hypot(x - x0 - dx * t, y - y0 - dy * t) < radius + p.radius;
    };
    if (p.owner === "hero") {
      for (const e of s.enemies) {
        if (e.hp <= 0 || p.hits.includes(e.id) || !collides(e.x, e.y, e.radius)) continue;
        p.hits.push(e.id);
        const length = Math.max(1, Math.hypot(p.vx, p.vy));
        hurtEnemy(s, e, p.damage, p.vx / length, p.vy / length, p.beam ? 85 : 40);
        if (!p.beam) { p.ttl = 0; break; }
      }
    } else if (collides(s.x, s.y, 7)) { hurtHero(s, p.damage); p.ttl = 0; }
  }
  s.projectiles = s.projectiles.filter(p => p.ttl > 0 && p.x > -20 && p.x < WIDTH + 20 && p.y > 20 && p.y < HEIGHT + 20);
}
function updateVisuals(s: GameState, dt: number) {
  for (const f of s.floaters) { f.ttl -= dt; f.y -= dt * 17; }
  for (const e of s.effects) e.ttl -= dt;
  s.floaters = s.floaters.filter(f => f.ttl > 0);
  s.effects = s.effects.filter(e => e.ttl > 0);
}
export function step(s: GameState, input: Input, delta: number): void {
  const dt = clamp(delta, 0, 0.05);
  s.events.length = 0; s.time += dt;
  updateVisuals(s, dt);
  if (s.scene === "dead" || s.scene === "results" || s.scene === "prologue" || s.scene === "shift") return;
  if (s.hitStop > 0) { s.hitStop = Math.max(0, s.hitStop - dt); return; }
  const previous = s.previousInput;
  s.previousInput = { ...input };
  const combat = s.scene === "test" || s.scene === "dungeon" || s.scene === "realm";
  s.attackTimer = Math.max(0, s.attackTimer - dt);
  s.comboWindow = Math.max(0, s.comboWindow - dt);
  s.dashTimer = Math.max(0, s.dashTimer - dt);
  s.swapCooldown = Math.max(0, s.swapCooldown - dt);
  for (const h of Object.values(s.heroes)) {
    h.invulnerable = Math.max(0, h.invulnerable - dt);
    h.stamina = Math.min(h.maxStamina, h.stamina + dt * 20);
    if (!(h.id === s.active && input.ki)) h.ki = Math.min(h.maxKi, h.ki + dt * 2.5);
  }
  if (input.swap && !previous.swap && s.swapCooldown === 0 && s.dashTimer === 0) swapHero(s);
  const h = activeHero(s);
  s.guard = combat && input.guard && s.dashTimer === 0 && !input.ki;
  const length = Math.hypot(input.x, input.y);
  s.moving = length > 0.1;
  if (s.moving && s.dashTimer === 0) {
    s.faceX = input.x / length; s.faceY = input.y / length;
  }
  if (combat && input.dash && !previous.dash && s.dashTimer === 0 && h.stamina >= 25) {
    h.stamina -= 25; s.dashTimer = 0.18; h.invulnerable = Math.max(h.invulnerable, 0.23);
    s.guard = false; s.charge = 0;
    effect(s, "dash", s.x, s.y, 14, 0.23, s.faceX, s.faceY);
  }
  if (s.moving || s.dashTimer > 0) {
    const speed = s.dashTimer > 0 ? 240 : s.scene === "overworld" ? 112 : s.guard ? 29 : input.ki ? 37 : 70;
    const strength = s.dashTimer > 0 ? 1 : Math.min(1, length);
    s.x = clamp(s.x + s.faceX * speed * strength * dt, 14, WIDTH - 14);
    s.y = clamp(s.y + s.faceY * speed * strength * dt, 48, HEIGHT - 13);
  }
  if (!combat) { s.charge = 0; return; }
  if (input.attack && !previous.attack && s.attackTimer === 0 && s.dashTimer === 0 && !s.guard && !input.ki) melee(s);
  if (input.ki && s.dashTimer === 0 && !s.guard) {
    s.charge += dt; h.ki = Math.min(h.maxKi, h.ki + dt * 32);
  }
  if (!input.ki && previous.ki && s.dashTimer === 0) fireKi(s);
  const hadEnemies = s.enemies.length > 0;
  updateEnemies(s, dt);
  updateProjectiles(s, dt);
  s.enemies = s.enemies.filter(e => e.hp > 0);
  if (hadEnemies && s.enemies.length === 0 && s.scene === "test") s.notice = "Training yard clear. Joe and Matt are ready!";
}
