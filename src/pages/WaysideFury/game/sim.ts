import { HUB_POINTS, LOCATIONS, PROLOGUE, SHOP_ITEMS, type ShopItemId } from "./content.ts";
import { getWorld, isBlocked, distanceToExit, WATCHER_ROOM, GATEKEEPER_ROOM, type WorldExit } from "./world.ts";
import { HERO_IDS, heroStats, MAX_LEVEL, type HeroId, type CharacterProgress, type Gear } from "../../../../server/shared/waysideFury/save.js";
export { HERO_IDS };
export type { HeroId, CharacterProgress, Gear };
export const HERO_NAMES: Record<HeroId, string> = { you: "You", joe: "Joe", matt: "Matt", alex: "Alex", jon: "Jon" };
// Pure deterministic game rules. Maps use world coordinates; presentation owns the viewport.
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
  miniBoss: boolean; phase: 1 | 2; pattern: number; windup: number; actionTimer: number; aimX: number; aimY: number;
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
  | { type: "kill"; enemyId: number; kind: Enemy["kind"]; x: number; y: number; sprite: Enemy["sprite"]; radius: number }
  | { type: "level"; hero: HeroId; level: number }
  | { type: "swap"; hero: HeroId }
  | { type: "checkpoint"; id: string }
  | { type: "death" };
export interface GameState {
  x: number; y: number; faceX: number; faceY: number; moving: boolean;
  vx: number; vy: number; knockX: number; knockY: number; transitionCooldown: number;
  active: HeroId; party: HeroId[]; unlockedHeroes: HeroId[]; character: CharacterProgress; gear: Gear; time: number; scene: Scene; room: number;
  cutscene: number; sceneTimer: number; palette: "real" | "eightbit";
  transitionTarget: Scene | null; transitionPalette: "real" | "eightbit";
  overlay: "shop" | "home" | null; heroes: Record<HeroId, HeroState>; enemies: Enemy[]; projectiles: Projectile[];
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
export function createHero(id: HeroId, character: CharacterProgress = { level: 1, xp: 0 }, gear: Gear = { power: 0, ward: 0 }): HeroState {
  const stats = heroStats(id, character, gear);
  return { id, ...stats, ...character, hp: stats.maxHp, ki: stats.maxKi / 2, stamina: stats.maxStamina, invulnerable: 0 };
}
function random(s: GameState) {
  s.rngSeed = (s.rngSeed + 0x6d2b79f5) | 0;
  let n = Math.imul(s.rngSeed ^ (s.rngSeed >>> 15), 1 | s.rngSeed);
  n = (n + Math.imul(n ^ (n >>> 7), 61 | n)) ^ n;
  return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
}
export function newGame(seed = 8591): GameState {
  const s: GameState = { x: 75, y: 110, faceX: 1, faceY: 0, moving: false, vx: 0, vy: 0, knockX: 0, knockY: 0, transitionCooldown: 0,
    active: "you", party: ["you", "joe"], unlockedHeroes: [...HERO_IDS], character: { level: 1, xp: 0 }, gear: { power: 0, ward: 0 }, time: 0, scene: "test", room: 0,
    cutscene: 0, sceneTimer: 0, palette: "real", transitionTarget: null, transitionPalette: "eightbit",
    overlay: null, heroes: Object.fromEntries(HERO_IDS.map(id => [id, createHero(id)])) as Record<HeroId, HeroState>, enemies: [], projectiles: [],
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
    speed: kind === "boss" ? 20 : kind === "shooter" ? 19 : 23, cooldown: 0.7 + random(s) * 0.5,
    hitTimer: 0, kx: 0, ky: 0, miniBoss: false, phase: 1, pattern: 0, windup: 0, actionTimer: 0, aimX: -1, aimY: 0 };
  s.enemies.push(e);
  return e;
}
export function enterScene(s: GameState, scene: Scene, room = 0): void {
  const world = getWorld(scene, room);
  s.scene = scene; s.overlay = null; s.room = room; s.x = world.spawn.x; s.y = world.spawn.y;
  s.vx = 0; s.vy = 0; s.knockX = 0; s.knockY = 0; s.transitionCooldown = 0.5;
  s.sceneTimer = 0; s.transitionTarget = null;
  if (scene === "realm") { s.palette = "eightbit"; if (s.clearedRooms.includes("realm-0")) s.chapter = Math.max(2, s.chapter); }
  else if (scene !== "shift" && scene !== "results" && scene !== "dead") s.palette = "real";
  if (scene === "prologue") s.cutscene = 0;
  s.faceX = 1; s.faceY = 0; s.moving = false;
  s.enemies = []; s.projectiles = []; s.effects = []; s.floaters = [];
  s.attackTimer = 0; s.combo = 0; s.comboWindow = 0; s.charge = 0;
  s.dashTimer = 0; s.guard = false; s.hitStop = 0;
  s.previousInput = idleInput();
  if (scene === "overworld") s.notice = "Chapter 1: drive east to the Blast Site. Pull over at a marker.";
  if (scene === "hub") s.notice = "Wayside: visit the station, shop, HOME and BBQ yard. Taxi pickup is by the south road.";
  if (scene === "dungeon" || scene === "realm") {
    if (!s.clearedRooms.includes(world.id)) {
      for (const spawn of world.spawns) {
        const enemy = addEnemy(s, spawn.kind, spawn.x, spawn.y);
        if (spawn.sprite) enemy.sprite = spawn.sprite;
        if (spawn.miniBoss) {
          enemy.miniBoss = true; enemy.hp = enemy.maxHp = 165; enemy.radius = 12; enemy.speed = 18;
        }
      }
    }
    s.notice = scene === "realm" ? "The 8-Bit Realm! Clear the creatures and find the eastern rift."
      : room === WATCHER_ROOM ? "The Watcher: dodge its rush, guard its dark nova."
      : room === GATEKEEPER_ROOM ? "The Sentinel guards the way. Clear this mini-boss gate."
      : room >= 8 ? `${world.name}: an optional supply cache lies beyond the monsters.`
      : `${world.name}: clear the eastern route. Explore side trails for supplies.`;
  }
  if (scene === "test") {
    addEnemy(s, "grunt", 183, 73); addEnemy(s, "grunt", 220, 113);
    addEnemy(s, "grunt", 174, 145); addEnemy(s, "shooter", 260, 76);
    s.notice = "J Attack • K Ki • L Dash • Shift Guard • Q Swap";
  }
}
// Substeps prevent fast dashes and boss rushes crossing thin tile barriers.
function moveBody(s: GameState, body: { x: number; y: number }, dx: number, dy: number, radius: number) {
  const world = getWorld(s.scene, s.room), pieces = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 4));
  for (let n = 0; n < pieces; n++) {
    if (!isBlocked(world, body.x + dx / pieces, body.y, radius)) body.x += dx / pieces;
    if (!isBlocked(world, body.x, body.y + dy / pieces, radius)) body.y += dy / pieces;
  }
}
export function advanceStory(s: GameState): void {
  if (s.scene !== "prologue") return;
  s.cutscene++; s.sceneTimer = 0;
  if (s.cutscene >= PROLOGUE.length) {
    enterScene(s, "overworld"); s.previousInput.interact = true;
  }
}
export function skipPrologue(s: GameState): void {
  enterScene(s, "overworld"); s.previousInput.interact = true;
}
export function beginRealmShift(s: GameState, target: Scene = "realm", palette: "real" | "eightbit" = "eightbit"): void {
  enterScene(s, "shift");
  s.transitionTarget = target; s.transitionPalette = palette;
  s.notice = "A flicker tears the crew into another world...";
}
function effect(s: GameState, kind: Effect["kind"], x: number, y: number, size: number, ttl: number, dx = 0, dy = 0) {
  s.effects.push({ id: s.nextId++, kind, x, y, dx, dy, ttl, maxT: ttl, hero: s.active, size });
}
function floater(s: GameState, x: number, y: number, text: string, color: string) {
  s.floaters.push({ id: s.nextId++, x, y: y - 10, text, color, ttl: 0.85 });
}
function gainXp(s: GameState, amount: number) {
  const before = s.character.level;
  s.character.xp += amount;
  while (s.character.level < MAX_LEVEL && s.character.xp >= xpForLevel(s.character.level)) {
    s.character.xp -= xpForLevel(s.character.level); s.character.level++;
  }
  s.character.xp = Math.min(s.character.xp, xpForLevel(s.character.level) - 1);
  for (const h of Object.values(s.heroes)) {
    const growth = s.character.level - h.level, stats = heroStats(h.id, s.character, s.gear);
    Object.assign(h, s.character, stats);
    if (growth > 0) { h.hp = Math.min(h.maxHp, h.hp + growth * 30); h.ki = Math.min(h.maxKi, h.ki + growth * 15); }
  }
  if (s.character.level > before) {
    s.events.push({ type: "level", hero: s.active, level: s.character.level });
    effect(s, "level", s.x, s.y, 25, 0.85);
    floater(s, s.x, s.y - 15, `LEVEL ${s.character.level}!`, "#f9e77c");
  }
}
function grantGear(s: GameState, power: number, ward: number) {
  s.gear.power = clamp(s.gear.power + power, 0, 10000); s.gear.ward = clamp(s.gear.ward + ward, 0, 10000);
  for (const h of Object.values(s.heroes)) Object.assign(h, heroStats(h.id, s.character, s.gear));
}
function hurtEnemy(s: GameState, e: Enemy, damage: number, dx: number, dy: number, force: number) {
  if (e.hp <= 0) return;
  const dealt = Math.round(damage);
  e.hp -= dealt; e.hitTimer = 0.18; s.hitStop = Math.max(s.hitStop, force >= 80 ? 0.07 : 0.045); e.kx += dx * force; e.ky += dy * force;
  effect(s, "hit", e.x, e.y, 9, 0.12);
  floater(s, e.x, e.y, String(dealt), ({ you: "#9cefff", joe: "#9cefff", matt: "#ffe393", alex: "#b4f49c", jon: "#d6b0ff" })[s.active]);
  s.events.push({ type: "hit", x: e.x, y: e.y, damage: dealt, target: "enemy" });
  if (e.hp <= 0) {
    const candy = e.kind === "boss" ? 35 : 3 + Math.floor(random(s) * 3);
    s.candy += candy; s.kills++;
    floater(s, e.x, e.y + 13, `+${candy} candy`, "#eea2fc");
    gainXp(s, e.kind === "boss" ? e.miniBoss ? 95 : 130 : e.kind === "shooter" ? 35 : 28);
    s.events.push({ type: "kill", enemyId: e.id, kind: e.kind, x: e.x, y: e.y, sprite: e.sprite, radius: e.radius });
  }
}
export function nextPartyHero(s: GameState): HeroId | null {
  const at = s.party.indexOf(s.active);
  for (let offset = 1; offset <= s.party.length; offset++) {
    const id = s.party[(at + offset) % s.party.length];
    if (id !== s.active && s.heroes[id].hp > 0) return id;
  }
  return null;
}
function swapHero(s: GameState): boolean {
  const next = nextPartyHero(s);
  if (!next) return false;
  s.active = next; s.swapCooldown = 0.75; s.charge = 0; s.attackTimer = 0; s.combo = 0;
  activeHero(s).invulnerable = Math.max(activeHero(s).invulnerable, 0.25);
  effect(s, "level", s.x, s.y, 16, 0.3);
  s.events.push({ type: "swap", hero: next }); return true;
}
export function requestSwap(s: GameState): boolean {
  return s.swapCooldown === 0 && s.dashTimer === 0 && !s.overlay ? swapHero(s) : false;
}
function hurtHero(s: GameState, baseDamage: number, sourceX = s.x - s.faceX, sourceY = s.y - s.faceY) {
  const h = activeHero(s);
  if (h.invulnerable > 0 || s.dashTimer > 0 || h.hp <= 0) return;
  const damage = Math.max(1, Math.round((baseDamage - h.defense * 0.5) * (s.guard ? 0.25 : 1)));
  h.hp = Math.max(0, h.hp - damage); h.invulnerable = s.guard ? 0.12 : 0.5;
  s.hitStop = Math.max(s.hitStop, s.guard ? 0.04 : 0.065);
  if (!s.guard) {
    const length = Math.max(1, Math.hypot(s.x - sourceX, s.y - sourceY));
    s.knockX = (s.x - sourceX) / length * 100; s.knockY = (s.y - sourceY) / length * 100;
  }
  floater(s, s.x, s.y, s.guard ? `BLOCK ${damage}` : String(damage), s.guard ? "#a4d5ed" : "#ff897f");
  effect(s, "hit", s.x, s.y, 10, 0.13);
  s.events.push({ type: "hit", x: s.x, y: s.y, damage, target: "hero" });
  if (h.hp === 0) {
    const next = nextPartyHero(s);
    if (next) { swapHero(s); s.notice = `${HERO_NAMES[h.id]} is down! ${HERO_NAMES[next]} takes over.`; }
    else {
      s.scene = "dead"; s.sceneTimer = 0; s.deaths++; s.moving = false; s.guard = false;
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
  if (hit) s.hitStop = s.combo === 3 ? 0.07 : 0.045;
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
    const signature = {
      you: { angles: [0], damage: 4.4, radius: 10, size: 130, name: "YOU: Fury Wave!" },
      joe: { angles: [0], damage: 4.4, radius: 10, size: 130, name: "JOE: Wayside Wave!" },
      matt: { angles: [-0.16, 0, 0.16], damage: 1.8, radius: 6, size: 105, name: "MATT: Golden Fury!" },
      alex: { angles: [-0.1, 0.1], damage: 2.4, radius: 7, size: 115, name: "ALEX: Twin Comet!" },
      jon: { angles: [0], damage: 4.8, radius: 12, size: 140, name: "JON: Night Breaker!" },
    }[s.active];
    for (const angle of signature.angles) {
      const dx = s.faceX * Math.cos(angle) - s.faceY * Math.sin(angle);
      const dy = s.faceX * Math.sin(angle) + s.faceY * Math.cos(angle);
      projectile(s, "hero", s.x + dx * 10, s.y + dy * 10, dx, dy, 245,
        h.power * signature.damage, signature.radius, true);
    }
    effect(s, "beam", s.x, s.y, signature.size, 0.36, s.faceX, s.faceY);
    s.notice = signature.name;
  } else if (h.ki >= 8) {
    h.ki -= 8;
    projectile(s, "hero", s.x + s.faceX * 12, s.y + s.faceY * 12,
      s.faceX, s.faceY, 155, h.power * 1.5, 4);
  } else s.notice = "Hold Ki to recharge.";
  s.charge = 0;
}
function updateBoss(s: GameState, e: Enemy, dt: number) {
  if (e.phase === 1 && e.hp <= e.maxHp * 0.5) {
    e.phase = 2; e.speed = 29; e.cooldown = Math.min(e.cooldown, 0.7);
    effect(s, "level", e.x, e.y, 35, 0.7);
    floater(s, e.x, e.y - 15, "ENRAGED!", "#ff8479");
    s.notice = `${e.miniBoss ? "The Sentinel" : "The Watcher"} is enraged! Keep your guard ready.`;
  }
  if (e.actionTimer > 0) {
    e.actionTimer = Math.max(0, e.actionTimer - dt);
    moveBody(s, e, e.aimX * (e.phase === 2 ? 190 : 160) * dt, e.aimY * (e.phase === 2 ? 190 : 160) * dt, e.radius);
    if (Math.hypot(s.x - e.x, s.y - e.y) < e.radius + 10) hurtHero(s, e.phase === 2 ? 28 : 22, e.x, e.y);
    if (e.actionTimer === 0) e.pattern = 1;
    return;
  }
  if (e.windup > 0) {
    e.windup = Math.max(0, e.windup - dt);
    if (e.windup === 0) {
      e.cooldown = e.phase === 2 ? 1.4 : 2.2;
      if (e.pattern === 0) e.actionTimer = e.phase === 2 ? 0.5 : 0.45;
      else {
        const shots = e.phase === 2 ? 12 : 8;
        const offset = Math.atan2(e.aimY, e.aimX);
        for (let n = 0; n < shots; n++) {
          const angle = offset + n * Math.PI * 2 / shots;
          projectile(s, "enemy", e.x, e.y, Math.cos(angle), Math.sin(angle),
            e.phase === 2 ? 92 : 74, e.phase === 2 ? 15 : 11, 5);
        }
        effect(s, "hit", e.x, e.y, 38, 0.35);
        e.pattern = 0;
      }
    }
    return;
  }
  const dx = s.x - e.x, dy = s.y - e.y, length = Math.max(1, Math.hypot(dx, dy));
  e.aimX = dx / length; e.aimY = dy / length;
  if (e.cooldown === 0) {
    e.windup = e.pattern === 0 ? (e.phase === 2 ? 0.45 : 0.65) : (e.phase === 2 ? 0.6 : 0.8);
  } else if (length > 36) {
    moveBody(s, e, e.aimX * e.speed * dt, e.aimY * e.speed * dt, e.radius);
  }
}
function updateEnemies(s: GameState, dt: number) {
  for (const e of s.enemies) {
    if (e.hp <= 0) continue;
    e.hitTimer = Math.max(0, e.hitTimer - dt);
    e.cooldown = Math.max(0, e.cooldown - dt);
    moveBody(s, e, e.kx * dt, e.ky * dt, e.radius);
    e.kx *= Math.max(0, 1 - dt * 9); e.ky *= Math.max(0, 1 - dt * 9);
    const dx = s.x - e.x, dy = s.y - e.y, length = Math.max(1, Math.hypot(dx, dy));
    const contact = e.radius + 9;
    if (e.hitTimer > 0 || (length > 230 && e.actionTimer === 0 && e.windup === 0)) continue;
    if (e.kind === "boss") updateBoss(s, e, dt);
    else if (e.kind === "shooter") {
      e.aimX = dx / length; e.aimY = dy / length;
      const direction = length < 62 ? -1 : length > 90 ? 1 : 0;
      moveBody(s, e, e.aimX * e.speed * direction * dt, e.aimY * e.speed * direction * dt, e.radius);
      if (e.cooldown === 0) {
        projectile(s, "enemy", e.x, e.y, e.aimX, e.aimY, 70, 9, 4);
        e.cooldown = 1.7; e.windup = 0;
      } else e.windup = e.cooldown < 0.35 ? 0.35 - e.cooldown : 0;
    } else {
      e.aimX = dx / length; e.aimY = dy / length;
      if (length > contact) {
        moveBody(s, e, e.aimX * e.speed * dt, e.aimY * e.speed * dt, e.radius);
      } else if (e.cooldown === 0) { hurtHero(s, 9, e.x, e.y); e.cooldown = 1.15; }
    }
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
    } else if (collides(s.x, s.y, 7)) { hurtHero(s, p.damage, x0, y0); p.ttl = 0; }
    if (isBlocked(getWorld(s.scene, s.room), p.x, p.y, p.radius)) p.ttl = 0;
  }
  s.projectiles = s.projectiles.filter(p => p.ttl > 0);
}
function updateVisuals(s: GameState, dt: number) {
  for (const f of s.floaters) { f.ttl -= dt; f.y -= dt * 17; }
  for (const e of s.effects) e.ttl -= dt;
  s.floaters = s.floaters.filter(f => f.ttl > 0);
  s.effects = s.effects.filter(e => e.ttl > 0);
}
function availableExit(s: GameState): WorldExit | undefined {
  return getWorld(s.scene, s.room).exits.find(e => distanceToExit(e, s.x, s.y) < 25 && (!e.requiresClear || s.enemies.length === 0));
}
export function interactTarget(s: GameState): { id: string; name: string; locked?: boolean } | null {
  if (s.scene === "dungeon" || s.scene === "realm") {
    const world = getWorld(s.scene, s.room);
    const chest = world.props.find(p => p.kind === "chest" && !s.clearedRooms.includes(p.id) && Math.hypot(s.x - p.x - p.w / 2, s.y - p.y - p.h / 2) < 28);
    if (chest) return { id: chest.id, name: "Open supply cache", locked: s.enemies.length > 0 };
    const npc = world.props.find(p => p.kind === "npc" && Math.hypot(s.x - p.x - p.w / 2, s.y - p.y - p.h) < 28);
    if (npc) return { id: "scout", name: "Talk to the stranded scout" };
    const door = availableExit(s);
    return door ? { id: door.id, name: door.name } : null;
  }
  const points = s.scene === "overworld" ? LOCATIONS : s.scene === "hub" ? HUB_POINTS : [];
  return points.find(p => Math.hypot(s.x - p.x, s.y - p.y) < 28) ?? null;
}
function travel(s: GameState, door: WorldExit) {
  if (door.target === "realm") beginRealmShift(s);
  else {
    enterScene(s, typeof door.target === "number" ? "dungeon" : door.target,
      typeof door.target === "number" ? door.target : 0);
    if (s.scene !== "results") { s.x = door.entryX; s.y = door.entryY; }
  }
  s.previousInput.interact = true;
}
export function interact(s: GameState): void {
  const target = interactTarget(s);
  if (!target) return;
  if (s.scene === "realm" || s.scene === "dungeon") {
    if (target.id.startsWith("loot-")) {
      if (target.locked) { s.notice = "Clear the nearby monsters before opening the cache."; return; }
      s.clearedRooms.push(target.id); s.candy += s.room === 8 ? 18 : 25;
      for (const h of Object.values(s.heroes)) {
        h.hp = Math.min(h.maxHp, h.hp + 35); h.ki = Math.min(h.maxKi, h.ki + 20);
      }
      if (s.room === 9) grantGear(s, 1, 0);
      s.notice = s.room === 8 ? "Orchard cache: 18 candy, tonic and Ki supplies!" : "Supply cache: 25 candy, tonic and +1 Power for the crew!";
      s.events.push({ type: "checkpoint", id: target.id }); return;
    }
    if (target.id === "scout") { s.notice = "Scout: Two supply trails survived the blast. Find the orchard north of Split Creek and the old depot south of Furnace Pass."; return; }
    const door = availableExit(s);
    if (door) travel(s, door);
    return;
  }
  if (target.locked) { s.notice = `${target.name}: taken over. A later chapter will open this route.`; return; }
  if (s.scene === "overworld") {
    enterScene(s, target.id === "wayside" ? "hub" : "dungeon");
    s.previousInput.interact = true; return;
  }
  if (target.id === "taxi") { enterScene(s, "overworld"); s.previousInput.interact = true; return; }
  if (target.id === "shop" || target.id === "home") { s.overlay = target.id; s.vx = s.vy = 0; s.moving = false; s.notice = ""; return; }
  const dialogue: Record<string, string> = {
    station: "Wayside Station is safe. Alex and Jon are holding the town while Joe and Matt investigate the Blast Site.",
    bbq: "The grill is still warm. The crew will finish dinner when Wayside is safe.",
    alex: "Alex: The station is secure. I can tag in when you need help. There are supplies hidden off the main route.",
    jon: "Jon: HOME restores the whole crew. Stock up before you go, and don't forget to tag your partner in.",
  };
  s.notice = dialogue[target.id] ?? "Wayside is quiet... for now.";
}
export function toggleParty(s: GameState, id: HeroId, fromCharacter = false): boolean {
  if ((!fromCharacter && (s.scene !== "hub" || s.overlay !== "home")) || s.scene === "dead" || !s.unlockedHeroes.includes(id)) return false;
  if (s.party.includes(id)) {
    if (s.party.length === 1) { s.notice = "Keep at least one hero in the party."; return false; }
    const next = s.party.find(member => member !== id)!;
    if (s.active === id && s.heroes[next].hp <= 0) { s.notice = "Rest at HOME to revive your partner first."; return false; }
    s.party = s.party.filter(member => member !== id);
    if (s.active === id) swapHero(s);
    s.notice = `${HERO_NAMES[id]} is benched.`;
  } else {
    if (s.party.length >= 2) { s.notice = "Party is full. Bench a hero first."; return false; }
    s.party.push(id); s.notice = `${HERO_NAMES[id]} joins the party.`;
  }
  return true;
}
export function restAtHome(s: GameState): void {
  for (const h of Object.values(s.heroes)) { h.hp = h.maxHp; h.ki = h.maxKi; h.stamina = h.maxStamina; }
  if (!s.areas.includes("wayside")) s.areas.push("wayside");
  s.events.push({ type: "checkpoint", id: "home" }); s.notice = "Rested. HOME is your retry checkpoint.";
}
export function buyItem(s: GameState, id: ShopItemId): boolean {
  const item = SHOP_ITEMS.find(item => item.id === id)!;
  if (s.candy < item.cost) { s.notice = "Not enough candy. Monsters drop more."; return false; }
  if (id === "heal" && activeHero(s).hp >= activeHero(s).maxHp) { s.notice = "Already at full HP."; return false; }
  s.candy -= item.cost;
  if (id === "heal") activeHero(s).hp = Math.min(activeHero(s).maxHp, activeHero(s).hp + 55);
  else grantGear(s, id === "power" ? 2 : 0, id === "defense" ? 1 : 0);
  s.notice = `${item.name} purchased.`; return true;
}
export function step(s: GameState, input: Input, delta: number): void {
  const dt = clamp(delta, 0, 0.05);
  s.events.length = 0; s.time += dt; s.sceneTimer += dt;
  s.transitionCooldown = Math.max(0, s.transitionCooldown - dt);
  updateVisuals(s, dt);
  if (s.scene === "prologue") {
    const pressed = input.interact && !s.previousInput.interact;
    s.previousInput = { ...input };
    if (pressed) advanceStory(s);
    return;
  }
  if (s.scene === "shift") {
    if (s.sceneTimer >= 2.4) {
      const target = s.transitionTarget ?? "realm", palette = s.transitionPalette;
      enterScene(s, target); s.palette = palette;
      s.previousInput = { ...input };
    }
    return;
  }
  if (s.scene === "dead" || s.scene === "results") return;
  if (s.overlay) { s.previousInput = { ...input }; s.moving = false; return; }
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
  if (input.swap && !previous.swap) requestSwap(s);
  const h = activeHero(s);
  s.guard = combat && input.guard && s.dashTimer === 0 && !input.ki;
  const length = Math.hypot(input.x, input.y);
  s.moving = length > 0.1;
  if (s.moving && s.dashTimer === 0) {
    const angle = Math.round(Math.atan2(input.y, input.x) / (Math.PI / 4)) * Math.PI / 4;
    s.faceX = Math.cos(angle); s.faceY = Math.sin(angle);
  }
  if (combat && input.dash && !previous.dash && s.dashTimer === 0 && h.stamina >= 25) {
    h.stamina -= 25; s.dashTimer = 0.18; h.invulnerable = Math.max(h.invulnerable, 0.23);
    s.guard = false; s.charge = 0;
    effect(s, "dash", s.x, s.y, 14, 0.23, s.faceX, s.faceY);
  }
  if (s.scene === "overworld") {
    const strength = Math.min(1, length), driveX = length > 0.1 ? input.x / length * 160 * strength : 0;
    const driveY = length > 0.1 ? input.y / length * 160 * strength : 0;
    const ease = 1 - Math.exp(-dt * (s.moving ? 6.5 : 9));
    s.vx += (driveX - s.vx) * ease; s.vy += (driveY - s.vy) * ease;
    const oldX = s.x, oldY = s.y;
    moveBody(s, s, s.vx * dt, s.vy * dt, 10);
    if (s.x === oldX) s.vx *= 0.5;
    if (s.y === oldY) s.vy *= 0.5;
    s.moving = Math.hypot(s.vx, s.vy) > 3;
  } else {
    const speed = s.dashTimer > 0 ? 240 : s.guard ? 29 : input.ki && combat ? 37 : 70;
    const strength = s.dashTimer > 0 ? 1 : s.moving ? Math.min(1, length) : 0;
    const moveX = s.dashTimer > 0 ? s.faceX : input.x / Math.max(0.001, length);
    const moveY = s.dashTimer > 0 ? s.faceY : input.y / Math.max(0.001, length);
    s.vx = moveX * speed * strength; s.vy = moveY * speed * strength;
    moveBody(s, s, (s.vx + s.knockX) * dt, (s.vy + s.knockY) * dt, 7);
    s.knockX *= Math.max(0, 1 - dt * 10); s.knockY *= Math.max(0, 1 - dt * 10);
  }
  if (!combat) { s.charge = 0; if (input.interact && !previous.interact) interact(s); return; }
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
  if (hadEnemies && s.enemies.length === 0 && s.scene === "dungeon") {
    const id = `blast-${s.room}`;
    if (!s.clearedRooms.includes(id)) {
      s.clearedRooms.push(id);
      if (s.room === GATEKEEPER_ROOM && !s.bosses.includes("blast-gatekeeper")) s.bosses.push("blast-gatekeeper");
      if (s.room === WATCHER_ROOM) {
        if (!s.bosses.includes("blast-watcher")) s.bosses.push("blast-watcher");
        if (!s.areas.includes("blast")) s.areas.push("blast");
      }
    }
    s.events.push({ type: "checkpoint", id });
    s.notice = s.room === WATCHER_ROOM ? "The Watcher falls! Chapter 1 is clear. Head through the eastern rift."
      : s.room === GATEKEEPER_ROOM ? "The Sentinel falls. The gate to the crater is open!"
      : s.room >= 8 ? "Side trail clear! Open the supply cache before returning."
      : "Zone clear! The eastern gate is open. Explore side trails for supplies.";
  }
  if (hadEnemies && s.enemies.length === 0 && s.scene === "realm") {
    if (!s.clearedRooms.includes("realm-0")) {
      s.clearedRooms.push("realm-0");
      if (!s.areas.includes("eightbit-realm")) s.areas.push("eightbit-realm");
    }
    s.chapter = Math.max(s.chapter, 2);
    s.events.push({ type: "checkpoint", id: "realm-0" });
    s.notice = "The path is clear. The real evil has only just begun...";
  }
  if (input.interact && !previous.interact && (s.scene === "dungeon" || s.scene === "realm")) interact(s);
  // Walking through an open boundary changes zones without a button press.
  if ((s.scene === "dungeon" || s.scene === "realm") && s.transitionCooldown === 0) {
    const world = getWorld(s.scene, s.room), door = availableExit(s);
    if (door && (s.x < 20 || s.x > world.width - 20 || s.y < 20 || s.y > world.height - 20)) travel(s, door);
  }
}
