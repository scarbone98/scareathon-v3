import { obstacleBlocks, getHeroObstacleTarget, clearHeroObstacle, obstacleRewardAvailable, releaseBorrowedObstacles } from "./u1/world/obstacles.ts";
import type { WorldSave } from "../../../../server/shared/waysideFury/u1World.js";
import { advanceWorldClock, updateNightOverworld, resetNightEncounter } from "./u1/world/dayNightRuntime.ts";
import { defaultCombatProgress, type CombatProgress } from "../../../../server/shared/waysideFury/u1Combat.js";
import { TRAINING_BOARD, cancelTraining, tickTraining, trainingMelee, trainingProjectile, type TrainingRuntime, type TrainingFailure, type ChallengeTier } from "./u1/combat/training.ts";
import { signatureDefinition } from "./u1/combat/signature.ts";
import { createFusionRuntime, requestFusion, tickFusion, localFusion, consumeFusionSpecial, resetFusion, type FusionRuntime } from "./u1/combat/fusion.ts";
import { hubQuestTarget, openHubQuest, tickHubQuests, trackHubQuestEvent } from "../u1/hub/hubRules.ts";
import type { HubQuestSave } from "../u1/hub/quests.ts";
import { tickArena, type ArenaRuntime, type ArenaPersonal } from "../u1/hub/arena.ts";
import type { ArenaRunReceipt } from "../../../../server/shared/waysideFury/u1Arena.js";
import { ARENA_HUB_POINT } from "../u1/hub/arenaWorld.ts";
import { HUB_POINTS, LOCATIONS, PROLOGUE, SHOP_ITEMS, type ShopItemId } from "./content.ts";
import { getWorld, isBlocked, distanceToExit, WATCHER_ROOM, GATEKEEPER_ROOM, type WorldExit } from "./world.ts";
import { HERO_IDS, heroStats, MAX_LEVEL, type HeroId, type CharacterProgress, type Gear } from "../../../../server/shared/waysideFury/save.js";
import { availablePickups, collectPickup, pickupBuffs, walkingPickup } from "./collectibles.ts";
import { updateOverworldDressing } from "./dressing.ts";
import { interactionPrompt, newContextAttack, resolveContextPress, selectInteractionTarget, updateContextPrompt, type AttackPresentation, type ContextAttackState, type InteractTarget, type InteractionCandidate } from "./contextAttack.ts";
import { createItemsSave, type ItemsSaveState } from "../../../../server/shared/waysideFury/u1Items.js";
import { chipEffects, itemsState, grantChip, trySecondWind } from "./u1/items/chips.ts";
import { itemInteractionCandidates, interactItem } from "./u1/items/interactions.ts";
import { grantCheckpointChip } from "./u1/items/pickups.ts";
export { HERO_IDS };
export type { HeroId, CharacterProgress, Gear };
export const HERO_NAMES: Record<HeroId, string> = { you: "You", joe: "Joe", matt: "Matt", alex: "Alex", jon: "Jon" };
// Pure deterministic game rules. Maps use world coordinates; presentation owns the viewport.
export type Scene = "arena" | "test" | "overworld" | "hub" | "dungeon" | "realm" | "prologue" | "shift" | "results" | "dead";
export interface Input {
  x: number; y: number; attack: boolean; ki: boolean; dash: boolean;
  guard: boolean; swap: boolean; interact: boolean; fusion?: boolean;
  attackPresentation?: AttackPresentation;
}
export const idleInput = (): Input => ({ x: 0, y: 0, attack: false, ki: false, dash: false, guard: false, swap: false, interact: false, fusion: false });
export interface HeroState {
  id: HeroId; hp: number; maxHp: number; ki: number; maxKi: number;
  stamina: number; maxStamina: number; level: number; xp: number;
  power: number; defense: number; invulnerable: number;
}
export interface RemoteHero {
  seat: number; userId: string; name: string; hero: HeroState;
  x: number; y: number; faceX: number; faceY: number; moving: boolean;
  guard: boolean; attackTimer: number; combo: number; charge: number; dashTimer: number;
  scene: Scene; room: number; attack?: boolean; questCosmetic?: string | null; downed?: boolean; reviveProgress?: number; interact?: boolean; fusionIntent?: number; fusionSpecial?: number;
  chipDamageMultiplier?: number; secondWindReady?: boolean; chipSnapshotAt?: number;
}
export interface CoopRuntime {
  role: "host" | "guest"; seat: number; remoteHeroes: RemoteHero[]; appliedHits: string[];
  playerCount?: number; syncedLevel?: number; downed?: boolean; reviveProgress?: number;
  spawnedExtras?: number; damageUntil?: Record<number, number>; reviveTimers?: Record<number, number>;
  revivedUntil?: Record<number, number>;
  reviveHoldTarget?: string;
  worldClearedRooms?: string[];
  worldChapter?: number;
  remoteSecondWindSpent?: Record<number, { userId: string; at: number }>;
  worldObstacles?: string[];
  worldCycleSeconds?: number;
}
export interface CoopHit {
  type: "coop-hit"; enemyId: number; damage: number; dx: number; dy: number; force: number; attackId: string;
}
export interface Enemy {
  id: number; kind: "grunt" | "shooter" | "boss";
  sprite: "zombie" | "pumpkin" | "ghost" | "imp" | "shadowbeast";
  x: number; y: number; hp: number; maxHp: number; radius: number;
  baseMaxHp?: number;
  nightAmbient?: boolean;
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
  | { type: "item"; id: string; kind: "chip" | "relic" | "radar" | "wish" }
  | { type: "obstacle-cleared"; id: string; x: number; y: number; hero: HeroId }
  | { type: "obstacle-request"; id: string; hero: HeroId; x: number; y: number }
  | { type: "fusion-start"; id: number; heroes: [HeroId, HeroId]; seats: [number, number] }
  | { type: "fusion-end"; id: number }
  | { type: "fusion-special"; id: number }
  | { type: "training-complete"; hero: HeroId; tier: ChallengeTier }
  | { type: "training-failed"; hero: HeroId; tier: ChallengeTier; reason: TrainingFailure }
  | { type: "quest-save"; id: string; kind: "accepted" | "claimed" | "cosmetic" }
  | { type: "arena-finish"; receipt: ArenaRunReceipt; score: number }
  | CoopHit
  | { type: "pickup"; id: string }
  | { type: "coop-pickup"; id: string }
  | { type: "ambient-taxi-crash"; x: number; y: number }
  | { type: "coop-damage"; seat: number; damage: number; sourceX: number; sourceY: number }
  | { type: "coop-revive"; seat: number }
  | { type: "hit"; x: number; y: number; damage: number; target: "hero" | "enemy" }
  | { type: "kill"; enemyId: number; kind: Enemy["kind"]; x: number; y: number; sprite: Enemy["sprite"]; radius: number; xp: number }
  | { type: "level"; hero: HeroId; level: number }
  | { type: "swap"; hero: HeroId }
  | { type: "checkpoint"; id: string }
  | { type: "death" };
export interface GameState {
  foundItems: string[]; ambientTaxiWrecked: boolean; personalTaxiWrecked: boolean; ambientTaxiGag: number; insideDiner: boolean;
  pickupPending?: { id: string; at: number };
  x: number; y: number; faceX: number; faceY: number; moving: boolean;
  vx: number; vy: number; knockX: number; knockY: number; transitionCooldown: number;
  active: HeroId; party: HeroId[]; unlockedHeroes: HeroId[]; character: CharacterProgress; gear: Gear; time: number; scene: Scene; room: number;
  cutscene: number; sceneTimer: number; palette: "real" | "eightbit";
  transitionTarget: Scene | null; transitionPalette: "real" | "eightbit";
  overlay: "shop" | "home" | "diner" | "wish" | "training" | "arena" | "quest" | null; heroes: Record<HeroId, HeroState>; enemies: Enemy[]; projectiles: Projectile[];
  effects: Effect[]; floaters: Floater[]; notice: string; guard: boolean;
  attackTimer: number; combo: number; comboWindow: number; charge: number;
  dashTimer: number; swapCooldown: number; hitStop: number;
  clearedRooms: string[]; areas: string[]; bosses: string[]; chapter: number;
  candy: number; deaths: number; kills: number; events: GameEvent[];
  previousInput: Input; rngSeed: number; nextId: number;
  u1: { combat: CombatProgress; [namespace: string]: unknown };
  training: TrainingRuntime | null;
  fusion: FusionRuntime;
  coop?: CoopRuntime;
  coopRewards?: string[];
  contextAttack: ContextAttackState;
  dialogue: { speaker: string; lines: string[]; index: number } | null;
  u1?: { items: ItemsSaveState; world?: WorldSave; combat: CombatProgress; [key: string]: unknown };
  nightWorld?: { window: string | null };
  arena?: ArenaRuntime; hubArena?: ArenaPersonal;
  hubQuests?: HubQuestSave; hubQuestId?: string; hubCosmetic?: string | null; hubQuestSerial?: number;
  arenaVitals?: Record<HeroId, HeroState>; arenaLead?: HeroId; arenaRecorded?: string;
}
const clamp = (value: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, value));
export function activeHero(s: GameState) { return s.heroes[s.active]; }
// Wish bonuses stay distinct from candy-bought gear and survive HOME retries.
export function itemsGear(s: GameState): Gear {
  const bonus = itemsState(s).relics.statBonus;
  return { power: s.gear.power + bonus.power, ward: s.gear.ward + bonus.ward };
}
export function xpForLevel(level: number) { return 75 + (level - 1) * 45; }
export function createHero(id: HeroId, character: CharacterProgress = { level: 1, xp: 0 }, gear: Gear = { power: 0, ward: 0 }): HeroState {
  const stats = heroStats(id, character, gear);
  return { id, ...stats, ...character, hp: stats.maxHp, ki: stats.maxKi / 2, stamina: stats.maxStamina, invulnerable: 0 };
}
const enemyHpScale = (kind: Enemy["kind"], players: number) => 1 + (kind === "boss" ? 0.75 : 0.6) * (players - 1);
const coopCount = (s: GameState) => s.coop ? s.coop.playerCount ?? 1 : 1;
function scaleEnemy(s: GameState, e: Enemy, baseline = e.baseMaxHp ?? e.maxHp) {
  const percent = e.hp / Math.max(1, e.maxHp);
  e.baseMaxHp = baseline; e.maxHp = baseline * enemyHpScale(e.kind, coopCount(s)); e.hp = e.maxHp * percent;
}
// Extra slots belong to the encounter, so leaving/rejoining the same wave cannot
// continually create fresh enemies and their rewards.
function extraCoopSpawns(s: GameState) {
  if (s.scene === "arena" || s.coop?.role !== "host" || !s.enemies.some(e => e.hp > 0 && !e.nightAmbient)) return;
  const extras = Math.max(0, coopCount(s) - 1), previous = s.coop.spawnedExtras ?? 0;
  const world = getWorld(s.scene, s.room), anchor = world.spawns.find(spawn => spawn.kind !== "boss") ?? s.enemies[0];
  for (let n = previous; n < extras; n++) {
    let x = anchor.x, y = anchor.y;
    for (let attempt = 0; attempt < 12; attempt++) {
      const angle = (n * 3 + attempt) * Math.PI / 4, radius = 20 + Math.floor(attempt / 4) * 12;
      const nx = anchor.x + Math.cos(angle) * radius, ny = anchor.y + Math.sin(angle) * radius;
      if (!isBlocked(world, nx, ny, 7)) { x = nx; y = ny; break; }
    }
    const enemy = addEnemy(s, "grunt", x, y);
    if (anchor.sprite && anchor.kind !== "boss") enemy.sprite = anchor.sprite;
  }
  s.coop.spawnedExtras = Math.max(previous, extras);
}
export function setCoopPlayerCount(s: GameState, players: number): void {
  if (!s.coop) return;
  const previous = coopCount(s), next = clamp(Math.floor(Number.isFinite(players) ? players : 1), 1, 4);
  s.coop.playerCount = next;
  if (s.coop.role !== "host") return;
  for (const e of s.enemies) scaleEnemy(s, e, e.baseMaxHp ?? e.maxHp / enemyHpScale(e.kind, previous));
  extraCoopSpawns(s);
}
export function coopLevelBand(scene: Scene, room: number): readonly [number, number] {
  if (scene === "realm") return [6, 9];
  if (scene === "dungeon") {
    if (room >= 8) return [2, 5];
    const low = 1 + Math.floor(room / 2); return [low, low + 2];
  }
  return [1, 3];
}
// Combat level changes only derived hero stats. The permanent character sheet
// keeps its XP/level, and health/Ki ratios survive both sync and leaving co-op.
export function syncCoopLevel(s: GameState): void {
  const band = coopLevelBand(s.scene, s.room);
  const level = s.coop?.role === "guest" ? clamp(s.character.level, band[0], band[1]) : s.character.level;
  if (s.coop) s.coop.syncedLevel = s.coop.role === "guest" ? level : undefined;
  for (const h of Object.values(s.heroes)) {
    const stats = heroStats(h.id, { ...s.character, level }, itemsGear(s));
    const hp = h.hp / Math.max(1, h.maxHp), ki = h.ki / Math.max(1, h.maxKi);
    Object.assign(h, stats, { level, xp: s.character.xp });
    h.hp = stats.maxHp * hp; h.ki = stats.maxKi * ki;
  }
}
function random(s: GameState) {
  s.rngSeed = (s.rngSeed + 0x6d2b79f5) | 0;
  let n = Math.imul(s.rngSeed ^ (s.rngSeed >>> 15), 1 | s.rngSeed);
  n = (n + Math.imul(n ^ (n >>> 7), 61 | n)) ^ n;
  return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
}
export function newGame(seed = 8591): GameState {
  const s: GameState = { foundItems: [], ambientTaxiWrecked: false, personalTaxiWrecked: false, ambientTaxiGag: -1, insideDiner: false,
    x: 75, y: 110, faceX: 1, faceY: 0, moving: false, vx: 0, vy: 0, knockX: 0, knockY: 0, transitionCooldown: 0,
    active: "you", party: ["you", "joe"], unlockedHeroes: [...HERO_IDS], character: { level: 1, xp: 0 }, gear: { power: 0, ward: 0 }, time: 0, scene: "test", room: 0,
    cutscene: 0, sceneTimer: 0, palette: "real", transitionTarget: null, transitionPalette: "eightbit",
    overlay: null, heroes: Object.fromEntries(HERO_IDS.map(id => [id, createHero(id)])) as Record<HeroId, HeroState>, enemies: [], projectiles: [],
    effects: [], floaters: [], notice: "Training yard: try your combat kit.", guard: false,
    attackTimer: 0, combo: 0, comboWindow: 0, charge: 0, dashTimer: 0,
    swapCooldown: 0, hitStop: 0, clearedRooms: [], areas: [], bosses: [], chapter: 1,
    candy: 0, deaths: 0, kills: 0, events: [], previousInput: idleInput(), rngSeed: seed | 0, nextId: 1, coopRewards: [],
    u1: { combat: defaultCombatProgress(), items: createItemsSave(), world: { clearedObstacles: [], cycleSeconds: 0 } }, training: null, fusion: createFusionRuntime(), contextAttack: newContextAttack(), dialogue: null };
  enterScene(s, "test");
  return s;
}
export function addEnemy(s: GameState, kind: Enemy["kind"], x: number, y: number): Enemy {
  const maxHp = kind === "boss" ? 260 : kind === "shooter" ? 24 : 32;
  const e: Enemy = { id: s.nextId++, kind, sprite: kind === "boss" ? "shadowbeast" : kind === "shooter" ? "imp" : "zombie",
    x, y, hp: maxHp, maxHp, radius: kind === "boss" ? 16 : 7,
    speed: kind === "boss" ? 20 : kind === "shooter" ? 19 : 23, cooldown: 0.7 + random(s) * 0.5,
    hitTimer: 0, kx: 0, ky: 0, miniBoss: false, phase: 1, pattern: 0, windup: 0, actionTimer: 0, aimX: -1, aimY: 0 };
  if (s.coop?.role === "host") scaleEnemy(s, e, maxHp);
  s.enemies.push(e);
  return e;
}
export function enterScene(s: GameState, scene: Scene, room = 0): void {
  const world = getWorld(scene, room);
  resetFusion(s); cancelTraining(s);
  s.scene = scene; s.overlay = null; s.insideDiner = false; s.dialogue = null; s.contextAttack = newContextAttack(); s.room = room; s.x = world.spawn.x; s.y = world.spawn.y;
  s.vx = 0; s.vy = 0; s.knockX = 0; s.knockY = 0; s.transitionCooldown = 0.5;
  s.sceneTimer = 0; s.transitionTarget = null;
  if (scene === "realm") { s.palette = "eightbit"; if (s.clearedRooms.includes("realm-0")) s.chapter = Math.max(2, s.chapter); }
  else if (scene !== "shift" && scene !== "results" && scene !== "dead") s.palette = "real";
  if (scene === "prologue") s.cutscene = 0;
  s.faceX = 1; s.faceY = 0; s.moving = false;
  s.enemies = []; s.projectiles = []; s.effects = []; s.floaters = [];
  resetNightEncounter(s);
  s.attackTimer = 0; s.combo = 0; s.comboWindow = 0; s.charge = 0;
  s.dashTimer = 0; s.guard = false; s.hitStop = 0;
  s.previousInput = idleInput();
  if (s.coop) { s.coop.spawnedExtras = 0; s.coop.reviveTimers = {}; s.coop.reviveProgress = 0; s.coop.reviveHoldTarget = undefined; }
  if (scene === "overworld") s.notice = "Chapter 1: drive east to the Blast Site. Pull over at a marker.";
  if (scene === "hub") s.notice = "Wayside: visit the station, shop, HOME and BBQ yard. Taxi pickup is by the south road.";
  if (scene === "dungeon" || scene === "realm") {
    if (s.coop?.role !== "guest" && !s.clearedRooms.includes(world.id) && !s.coop?.worldClearedRooms?.includes(world.id)) {
      for (const spawn of world.spawns) {
        const enemy = addEnemy(s, spawn.kind, spawn.x, spawn.y);
        if (spawn.sprite) enemy.sprite = spawn.sprite;
        if (spawn.miniBoss) {
          enemy.miniBoss = true; enemy.hp = enemy.maxHp = 165; enemy.radius = 12; enemy.speed = 18;
          if (s.coop?.role === "host") scaleEnemy(s, enemy, 165);
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
    if (s.coop?.role !== "guest") {
      addEnemy(s, "grunt", 183, 73); addEnemy(s, "grunt", 220, 113);
      addEnemy(s, "grunt", 174, 145); addEnemy(s, "shooter", 260, 76);
    }
    s.notice = "J Attack • K Ki • L Dash • Shift Guard • Q Swap";
  }
  if (scene === "dungeon" && room === 9 && s.coop?.role !== "guest" && itemsState(s).relics.secretBossUnlocked && !s.bosses.includes("relic-echo")) {
    const echo = addEnemy(s, "boss", 416, 224); echo.sprite = "ghost"; echo.hp = echo.maxHp = 340;
    if (s.coop?.role === "host") scaleEnemy(s, echo, 340);
    s.notice = "The Relic Echo answers your wish. A hidden challenger waits in the depot!";
  }
  extraCoopSpawns(s); syncCoopLevel(s);
}
// Substeps prevent fast dashes and boss rushes crossing thin tile barriers.
function moveBody(s: GameState, body: { x: number; y: number }, dx: number, dy: number, radius: number) {
  const world = getWorld(s.scene, s.room), pieces = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 4));
  for (let n = 0; n < pieces; n++) {
    if (!isBlocked(world, body.x + dx / pieces, body.y, radius) && !obstacleBlocks(s, body.x + dx / pieces, body.y, radius)) body.x += dx / pieces;
    if (!isBlocked(world, body.x, body.y + dy / pieces, radius) && !obstacleBlocks(s, body.x, body.y + dy / pieces, radius)) body.y += dy / pieces;
  }
}
// Relax overlaps without adding velocity: a bounded, time-scaled push settles
// smoothly, and the same sliding collision keeps crowds out of scenery.
function separateBodies(s: GameState, dt: number) {
  const bodies = [{ body: s as { x: number; y: number }, radius: 7, id: 0 },
    ...s.enemies.filter(e => e.hp > 0).sort((a, b) => a.id - b.id)
      .map(e => ({ body: e, radius: e.radius, id: e.id }))];
  const remaining = bodies.map(() => dt * 30), relaxation = 1 - Math.exp(-dt * 12);
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const a = bodies[i], b = bodies[j], dx = b.body.x - a.body.x, dy = b.body.y - a.body.y;
      const length = Math.hypot(dx, dy), overlap = a.radius + b.radius - length;
      if (overlap <= 0.01) continue;
      // Coincident bodies choose a stable diagonal without consuming game RNG.
      const nx = length > 0.000001 ? dx / length : Math.SQRT1_2;
      const ny = length > 0.000001 ? dy / length : ((a.id + b.id) % 2 ? 1 : -1) * Math.SQRT1_2;
      const push = overlap * relaxation * 0.5;
      const pushA = Math.min(push, remaining[i]), pushB = Math.min(push, remaining[j]);
      remaining[i] -= pushA; remaining[j] -= pushB;
      moveBody(s, a.body, -nx * pushA, -ny * pushA, a.radius);
      moveBody(s, b.body, nx * pushB, ny * pushB, b.radius);
    }
  }
}
export function advanceStory(s: GameState): void {
  if (s.scene !== "prologue" || s.coop?.role === "guest") return;
  s.cutscene++; s.sceneTimer = 0;
  if (s.cutscene >= PROLOGUE.length) {
    enterScene(s, "overworld"); s.previousInput.attack = s.previousInput.interact = true;
  }
}
export function skipPrologue(s: GameState): void {
  enterScene(s, "overworld"); s.previousInput.attack = s.previousInput.interact = true;
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
export function gainXp(s: GameState, amount: number) {
  if (!Number.isFinite(amount) || amount <= 0) return;
  if (s.coop?.role === "guest") syncCoopLevel(s);
  const before = s.character.level;
  s.character.xp += amount;
  while (s.character.level < MAX_LEVEL && s.character.xp >= xpForLevel(s.character.level)) {
    s.character.xp -= xpForLevel(s.character.level); s.character.level++;
  }
  s.character.xp = Math.min(s.character.xp, xpForLevel(s.character.level) - 1);
  const band = coopLevelBand(s.scene, s.room);
  const level = s.coop?.role === "guest" ? clamp(s.character.level, band[0], band[1]) : s.character.level;
  if (s.coop?.role === "guest") s.coop.syncedLevel = level;
  for (const h of Object.values(s.heroes)) {
    const growth = s.character.level - (s.coop ? before : h.level), downed = !!s.coop && h.hp <= 0;
    const stats = heroStats(h.id, { ...s.character, level }, itemsGear(s));
    Object.assign(h, s.character, stats, { level });
    if (growth > 0) {
      if (!downed) h.hp = Math.min(h.maxHp, h.hp + growth * 30);
      h.ki = Math.min(h.maxKi, h.ki + growth * 15);
    }
  }
  if (s.character.level > before) {
    s.events.push({ type: "level", hero: s.active, level: s.character.level });
    effect(s, "level", s.x, s.y, 25, 0.85);
    floater(s, s.x, s.y - 15, `LEVEL ${s.character.level}!`, "#f9e77c");
  }
}
export function grantGear(s: GameState, power: number, ward: number) {
  if (![power, ward].every(Number.isFinite)) return;
  s.gear.power = clamp(s.gear.power + power, 0, 10000); s.gear.ward = clamp(s.gear.ward + ward, 0, 10000);
  syncCoopLevel(s);
}
function hurtEnemy(s: GameState, e: Enemy, damage: number, dx: number, dy: number, force: number) {
  if (e.hp <= 0 || e.nightAmbient) return;
  const dealt = Math.round(damage);
  e.hp -= dealt; e.hitTimer = 0.18; s.hitStop = Math.max(s.hitStop, force >= 80 ? 0.07 : 0.045); e.kx += dx * force; e.ky += dy * force;
  effect(s, "hit", e.x, e.y, 9, 0.12);
  floater(s, e.x, e.y, String(dealt), ({ you: "#9cefff", joe: "#9cefff", matt: "#ffe393", alex: "#b4f49c", jon: "#d6b0ff" })[s.active]);
  s.events.push({ type: "hit", x: e.x, y: e.y, damage: dealt, target: "enemy" });
  if (e.hp <= 0) {
    const xp = e.kind === "boss" ? e.miniBoss ? 95 : 130 : e.kind === "shooter" ? 35 : 28;
    if (!s.coop && s.scene !== "arena") {
      const candy = e.kind === "boss" ? 35 : 3 + Math.floor(random(s) * 3);
      const effects = chipEffects(s);
      const reward = Math.floor(candy * effects.candyMultiplier) + effects.candyBonusPerKill;
      s.candy += reward; s.kills++;
      floater(s, e.x, e.y + 13, `+${reward} candy`, "#eea2fc");
      gainXp(s, xp);
    }
    if (!s.coop && e.kind === "boss") grantChip(s, e.miniBoss ? "iron-guard" : "focus-lens", "guardian");
    if (s.scene === "dungeon" && s.room === 9 && e.kind === "boss" && e.sprite === "ghost" && !s.bosses.includes("relic-echo")) {
      s.bosses.push("relic-echo"); s.events.push({ type: "checkpoint", id: "relic-echo" });
    }
    if (!s.coop && s.scene === "arena") s.kills++;
    const event: GameEvent = { type: "kill", enemyId: e.id, kind: e.kind, x: e.x, y: e.y, sprite: e.sprite, radius: e.radius, xp };
    s.events.push(event); trackHubQuestEvent(s, event);
  }
}
// Hosts are the only authority for enemy HP and kill rewards. A beam may hit
// several enemies, so dedupe the attack/target pair rather than the whole attack.
export function applyCoopHit(s: GameState, hit: CoopHit, seat: number): boolean {
  if (s.scene === "overworld" || s.enemies.find(e => e.id === hit.enemyId)?.nightAmbient) return false;
  if (s.coop?.role !== "host" || seat === s.coop.seat || !Number.isInteger(seat) || seat < 0 || seat > 3) return false;
  if (!Number.isInteger(hit.enemyId) || typeof hit.attackId !== "string" || !hit.attackId || hit.attackId.length > 96
    || ![hit.damage, hit.dx, hit.dy, hit.force].every(Number.isFinite)
    || hit.damage <= 0 || hit.damage > 100000 || hit.force < 0 || hit.force > 1000
    || Math.abs(hit.dx) > 1.01 || Math.abs(hit.dy) > 1.01) return false;
  const enemy = s.enemies.find(e => e.id === hit.enemyId && e.hp > 0);
  if (!enemy) return false;
  const key = `${seat}:${hit.attackId}:${hit.enemyId}`;
  if (s.coop.appliedHits.includes(key)) return false;
  s.coop.appliedHits.push(key);
  if (s.coop.appliedHits.length > 2048) s.coop.appliedHits.splice(0, s.coop.appliedHits.length - 2048);
  hurtEnemy(s, enemy, hit.damage, hit.dx, hit.dy, hit.force);
  return true;
}
function attackEnemy(s: GameState, e: Enemy, damage: number, dx: number, dy: number, force: number, attackId: string) {
  if (e.nightAmbient) return;
  if (e.hp <= 0) return;
  if (chipEffects(s).scanner && !("nightAmbient" in e && e.nightAmbient) && e.windup > 0) damage *= 1.15;
  if (s.coop?.role === "guest") {
    s.events.push({ type: "coop-hit", enemyId: e.id, damage, dx, dy, force, attackId });
    effect(s, "hit", e.x, e.y, 9, 0.12);
  } else hurtEnemy(s, e, damage, dx, dy, force);
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
  if (localFusion(s) || s.coop && activeHero(s).hp <= 0) return false;
  return s.swapCooldown === 0 && s.dashTimer === 0 && !s.overlay ? swapHero(s) : false;
}
export function exitCoop(s: GameState): void {
  if (!s.coop) return;
  s.ambientTaxiWrecked ||= s.personalTaxiWrecked;
  s.personalTaxiWrecked = s.ambientTaxiWrecked;
  s.ambientTaxiGag = -1;
  const borrowedObstacles = s.coop.worldObstacles ?? [];
  resetFusion(s);
  const players = coopCount(s); s.coop.playerCount = 1;
  for (const enemy of s.enemies) scaleEnemy(s, enemy, enemy.baseMaxHp ?? enemy.maxHp / enemyHpScale(enemy.kind, players));
  delete s.coop; releaseBorrowedObstacles(s, borrowedObstacles); syncCoopLevel(s);
  s.hitStop = 0; s.previousInput = idleInput();
  if (activeHero(s).hp > 0 || s.scene === "dead" || s.scene === "results") return;
  const fallen = s.active, next = nextPartyHero(s);
  if (next) { swapHero(s); s.notice = `${HERO_NAMES[fallen]} is down! ${HERO_NAMES[next]} takes over.`; }
  else {
    s.scene = "dead"; s.sceneTimer = 0; s.deaths++; s.moving = s.guard = false; s.overlay = null;
    s.events.push({ type: "death" });
  }
}
function damageHero(s: GameState, damage: number, sourceX: number, sourceY: number) {
  const h = activeHero(s);
  if (h.invulnerable > 0 || s.dashTimer > 0 || h.hp <= 0) return;
  damage = Math.max(1, Math.round(damage * chipEffects(s).incomingDamageMultiplier));
  h.hp = Math.max(0, h.hp - damage); h.invulnerable = s.guard ? 0.12 : 0.5;
  s.hitStop = Math.max(s.hitStop, s.guard ? 0.04 : 0.065);
  if (!s.guard) {
    const length = Math.max(1, Math.hypot(s.x - sourceX, s.y - sourceY));
    s.knockX = (s.x - sourceX) / length * 100; s.knockY = (s.y - sourceY) / length * 100;
  }
  floater(s, s.x, s.y, s.guard ? `BLOCK ${damage}` : String(damage), s.guard ? "#a4d5ed" : "#ff897f");
  effect(s, "hit", s.x, s.y, 10, 0.13);
  s.events.push({ type: "hit", x: s.x, y: s.y, damage, target: "hero" });
  if (h.hp === 0 && trySecondWind(s)) {
    effect(s, "level", s.x, s.y, 24, 0.7);
    s.knockX = s.knockY = 0; return;
  }
  if (h.hp === 0) {
    if (s.coop) {
      s.coop.downed = true; s.moving = false; s.guard = false; s.vx = s.vy = 0;
      s.charge = s.dashTimer = s.attackTimer = 0;
      s.notice = "Downed! A teammate can hold their use control nearby to revive you."; return;
    }
    const next = nextPartyHero(s);
    if (next) { swapHero(s); s.notice = `${HERO_NAMES[h.id]} is down! ${HERO_NAMES[next]} takes over.`; }
    else {
      s.scene = "dead"; s.sceneTimer = 0; s.deaths++; s.moving = false; s.guard = false;
      s.events.push({ type: "death" });
    }
  }
}
const enemyDamage = (s: GameState, baseDamage: number, defense: number, guard: boolean) =>
  Math.max(1, Math.round((baseDamage * (1 + 0.1 * (coopCount(s) - 1)) - defense * 0.5) * (guard ? 0.25 : 1)));
function hurtHero(s: GameState, baseDamage: number, sourceX = s.x - s.faceX, sourceY = s.y - s.faceY) {
  damageHero(s, enemyDamage(s, baseDamage, activeHero(s).defense, s.guard), sourceX, sourceY);
}
export function applyCoopDamage(s: GameState, damage: number, sourceX: number, sourceY: number): void {
  if (s.coop?.role !== "guest" || ![damage, sourceX, sourceY].every(Number.isFinite) || damage <= 0 || damage > 100000) return;
  damageHero(s, Math.round(damage), sourceX, sourceY);
}
export function reviveCoopHero(s: GameState): boolean {
  if (!s.coop || activeHero(s).hp > 0) return false;
  const h = activeHero(s); h.hp = h.maxHp * 0.4; h.invulnerable = 1;
  s.coop.downed = false; s.coop.reviveProgress = 0; s.knockX = s.knockY = 0;
  s.hitStop = 0; s.notice = "Revived! Back in the fight.";
  effect(s, "level", s.x, s.y, 22, 0.65); return true;
}
interface CombatTarget { x: number; y: number; hero: HeroState; guard: boolean; dashTimer: number; seat: number; remote?: RemoteHero }
function combatTargets(s: GameState): CombatTarget[] {
  const targets: CombatTarget[] = activeHero(s).hp > 0 ? [{ x: s.x, y: s.y, hero: activeHero(s), guard: s.guard, dashTimer: s.dashTimer, seat: s.coop?.seat ?? 0 }] : [];
  if (s.coop?.role === "host") for (const remote of s.coop.remoteHeroes) {
    if (remote.hero.hp <= 0 || remote.downed || remote.scene !== s.scene || remote.room !== s.room) continue;
    targets.push({ x: remote.x, y: remote.y, hero: remote.hero, guard: remote.guard, dashTimer: remote.dashTimer, seat: remote.seat, remote });
  }
  return targets;
}
function hurtTarget(s: GameState, target: CombatTarget, damage: number, sourceX: number, sourceY: number) {
  if (!target.remote) { hurtHero(s, damage, sourceX, sourceY); return; }
  const coop = s.coop!, until = coop.damageUntil ??= {};
  if (target.hero.hp <= 0 || target.dashTimer > 0 || target.hero.invulnerable > 0 || (until[target.seat] ?? 0) > s.time) return;
  const rawDamage = enemyDamage(s, damage, target.hero.defense, target.guard);
  const dealt = Math.max(1, Math.round(rawDamage * (target.remote.chipDamageMultiplier === 0.88 ? 0.88 : 1)));
  until[target.seat] = s.time + (target.guard ? 0.12 : 0.5);
  target.hero.hp = Math.max(0, target.hero.hp - dealt); target.remote.downed = target.hero.hp === 0;
  if (target.hero.hp === 0 && target.remote.secondWindReady && coop.remoteSecondWindSpent?.[target.seat]?.userId !== target.remote.userId) {
    (coop.remoteSecondWindSpent ??= {})[target.seat] = { userId: target.remote.userId, at: target.remote.chipSnapshotAt ?? 0 };
    target.remote.secondWindReady = false; target.remote.downed = false; target.remote.reviveProgress = 0;
    target.hero.hp = Math.max(1, target.hero.maxHp * 0.35); target.hero.invulnerable = Math.max(target.hero.invulnerable, 1.4);
    until[target.seat] = s.time + 1.4;
    effect(s, "level", target.x, target.y, 24, 0.7);
  }
  // Guests apply their own chip mitigation and consume their personal revive.
  // The host predicts both before deciding whether the shared world has wiped.
  s.events.push({ type: "coop-damage", seat: target.seat, damage: rawDamage, sourceX, sourceY });
  effect(s, "hit", target.x, target.y, 10, 0.13);
}
function updateCoopRevives(s: GameState, input: Input, dt: number) {
  const coop = s.coop;
  if (!coop) return;
  coop.downed = activeHero(s).hp <= 0;
  if (coop.role !== "host") return;
  const teammates = coop.remoteHeroes.filter(peer => peer.scene === s.scene && peer.room === s.room);
  const players = [{ seat: coop.seat, x: s.x, y: s.y, hp: activeHero(s).hp, interact: input.interact },
    ...teammates.map(peer => ({ seat: peer.seat, x: peer.x, y: peer.y, hp: peer.hero.hp, interact: peer.interact === true }))];
  const timers = coop.reviveTimers ??= {}, recentlyRevived = coop.revivedUntil ??= {};
  for (const player of players) {
    const helpers = players.some(helper => helper.seat !== player.seat && helper.hp > 0 && helper.interact && Math.hypot(player.x - helper.x, player.y - helper.y) <= 32);
    timers[player.seat] = player.hp <= 0 && helpers && (recentlyRevived[player.seat] ?? 0) <= s.time ? (timers[player.seat] ?? 0) + dt : 0;
    if (player.seat === coop.seat) coop.reviveProgress = timers[player.seat] / 2;
    const peer = teammates.find(peer => peer.seat === player.seat);
    if (peer) peer.reviveProgress = timers[player.seat] / 2;
    if (timers[player.seat] + 1e-9 < 2) continue;
    timers[player.seat] = 0; recentlyRevived[player.seat] = s.time + 3;
    if (player.seat === coop.seat) reviveCoopHero(s);
    else if (peer) {
      peer.hero.hp = peer.hero.maxHp * 0.4; peer.downed = false; peer.reviveProgress = 0;
      s.events.push({ type: "coop-revive", seat: peer.seat });
    }
  }
}
function checkCoopWipe(s: GameState) {
  const coop = s.coop;
  if (coop?.role !== "host" || s.scene === "dead" || activeHero(s).hp > 0 || coop.remoteHeroes.length < coopCount(s) - 1) return false;
  if (coop.remoteHeroes.some(peer => peer.hero.hp > 0 && !peer.downed)) return false;
  s.scene = "dead"; s.sceneTimer = 0; s.deaths++; s.moving = s.guard = false;
  s.events.push({ type: "death" });
  return true;
}
function melee(s: GameState) {
  s.combo = s.comboWindow > 0 ? s.combo % 3 + 1 : 1;
  s.attackTimer = s.combo === 3 ? 0.28 : 0.2;
  s.comboWindow = 0.8 + chipEffects(s).comboWindowBonus;
  const reach = (s.combo === 3 ? 34 : 28) + (localFusion(s) ? 8 : 0);
  trainingMelee(s, reach, s.faceX, s.faceY);
  effect(s, "slash", s.x, s.y, reach, s.attackTimer, s.faceX, s.faceY);
  const attackId = `melee:${s.nextId++}`;
  let hit = false;
  for (const e of s.enemies) {
    const dx = e.x - s.x, dy = e.y - s.y, length = Math.hypot(dx, dy);
    if (length > reach + e.radius || (dx * s.faceX + dy * s.faceY) / Math.max(1, length) < -0.1) continue;
    attackEnemy(s, e, activeHero(s).power * [1, 1.15, 1.9][s.combo - 1] * (localFusion(s) ? 1.6 : 1), s.faceX, s.faceY, s.combo === 3 ? 125 : 55, attackId);
    hit = true;
  }
  if (hit) s.hitStop = s.combo === 3 ? 0.07 : 0.045;
}
function projectile(s: GameState, owner: Projectile["owner"], x: number, y: number, dx: number, dy: number,
  speed: number, damage: number, radius: number, beam = false, ttl = beam ? 0.8 : 3.5) {
  s.projectiles.push({ id: s.nextId++, owner, x, y, vx: dx * speed, vy: dy * speed, damage,
    radius, beam, hero: owner === "hero" ? s.active : undefined, ttl, hits: [] });
}
function fireKi(s: GameState) {
  if (s.scene === "hub" && !s.training) { s.charge = 0; return; }
  const h = activeHero(s);
  if (localFusion(s) && consumeFusionSpecial(s)) {
    for (const angle of [-0.12, 0, 0.12]) {
      const dx = s.faceX * Math.cos(angle) - s.faceY * Math.sin(angle);
      const dy = s.faceX * Math.sin(angle) + s.faceY * Math.cos(angle);
      projectile(s, "hero", s.x + dx * 10, s.y + dy * 10, dx, dy, 285, h.power * 5, 14, true);
    }
    effect(s, "beam", s.x, s.y, 170, 0.55, s.faceX, s.faceY);
    s.notice = "FUSION: Wayside Supernova!"; s.charge = 0; return;
  }
  if (h.ki >= h.maxKi - 0.01) {
    const signature = signatureDefinition(s);
    h.ki = signature.kiRefund;
    h.stamina = Math.min(h.maxStamina, h.stamina + signature.staminaRestore);
    for (const angle of signature.angles) {
      const dx = s.faceX * Math.cos(angle) - s.faceY * Math.sin(angle);
      const dy = s.faceX * Math.sin(angle) + s.faceY * Math.cos(angle);
      projectile(s, "hero", s.x + dx * 10, s.y + dy * 10, dx, dy, signature.speed,
        h.power * signature.damage * chipEffects(s).kiDamageMultiplier, signature.radius, true, signature.ttl);
    }
    effect(s, "beam", s.x, s.y, signature.size, 0.36, s.faceX, s.faceY);
    s.notice = signature.name;
  } else if (h.ki >= 8 * chipEffects(s).kiCostMultiplier) {
    h.ki -= 8 * chipEffects(s).kiCostMultiplier;
    projectile(s, "hero", s.x + s.faceX * 12, s.y + s.faceY * 12,
      s.faceX, s.faceY, 155, h.power * 1.5 * chipEffects(s).kiDamageMultiplier, 4);
  } else s.notice = "Hold Ki to recharge.";
  s.charge = 0;
}
function updateBoss(s: GameState, e: Enemy, dt: number, target: CombatTarget) {
  if (e.phase === 1 && e.hp <= e.maxHp * 0.5) {
    e.phase = 2; e.speed = 29; e.cooldown = Math.min(e.cooldown, 0.7);
    effect(s, "level", e.x, e.y, 35, 0.7);
    floater(s, e.x, e.y - 15, "ENRAGED!", "#ff8479");
    s.notice = `${e.miniBoss ? "The Sentinel" : "The Watcher"} is enraged! Keep your guard ready.`;
  }
  if (e.actionTimer > 0) {
    e.actionTimer = Math.max(0, e.actionTimer - dt);
    moveBody(s, e, e.aimX * (e.phase === 2 ? 190 : 160) * dt, e.aimY * (e.phase === 2 ? 190 : 160) * dt, e.radius);
    for (const player of combatTargets(s)) if (Math.hypot(player.x - e.x, player.y - e.y) < e.radius + 10) hurtTarget(s, player, e.phase === 2 ? 28 : 22, e.x, e.y);
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
  const dx = target.x - e.x, dy = target.y - e.y, length = Math.max(1, Math.hypot(dx, dy));
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
    const players = combatTargets(s);
    const target = players.reduce<CombatTarget | null>((best, candidate) => !best || Math.hypot(candidate.x - e.x, candidate.y - e.y) < Math.hypot(best.x - e.x, best.y - e.y) ? candidate : best, null);
    if (!target) continue;
    const dx = target.x - e.x, dy = target.y - e.y, length = Math.max(1, Math.hypot(dx, dy));
    const contact = e.radius + 9;
    if (e.hitTimer > 0 || (length > 230 && e.actionTimer === 0 && e.windup === 0)) continue;
    if (e.kind === "boss") updateBoss(s, e, dt, target);
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
      } else if (e.cooldown === 0) { hurtTarget(s, target, 9, e.x, e.y); e.cooldown = 1.15; }
    }
  }
}
function updateProjectiles(s: GameState, dt: number) {
  const world = getWorld(s.scene, s.room);
  for (const p of s.projectiles) {
    const x0 = p.x, y0 = p.y, dx = p.vx * dt, dy = p.vy * dt;
    p.ttl -= dt;
    if (isBlocked(world, x0, y0, p.radius) || obstacleBlocks(s, x0, y0, p.radius)) { p.ttl = 0; continue; }
    // Trace solids first, including thin footprints crossed between endpoints.
    // Actor hits use only the clear segment, so beams cannot damage through props.
    const pieces = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 2));
    let blocked = false;
    for (let n = 1; n <= pieces; n++) {
      let t = n / pieces;
      if (isBlocked(world, x0 + dx * t, y0 + dy * t, p.radius) || obstacleBlocks(s, x0 + dx * t, y0 + dy * t, p.radius)) {
        let clear = (n - 1) / pieces, solid = t;
        for (let refine = 0; refine < 8; refine++) {
          const middle = (clear + solid) * 0.5;
          if (isBlocked(world, x0 + dx * middle, y0 + dy * middle, p.radius) || obstacleBlocks(s, x0 + dx * middle, y0 + dy * middle, p.radius)) solid = middle;
          else clear = middle;
        }
        t = clear; blocked = true;
      }
      p.x = x0 + dx * t; p.y = y0 + dy * t;
      if (blocked) break;
    }
    // A segment collision prevents fast beams slipping between fixed-step targets.
    const collides = (x: number, y: number, radius: number) => {
      const dx = p.x - x0, dy = p.y - y0;
      const t = clamp(((x - x0) * dx + (y - y0) * dy) / Math.max(0.001, dx * dx + dy * dy), 0, 1);
      return Math.hypot(x - x0 - dx * t, y - y0 - dy * t) < radius + p.radius;
    };
    if (p.owner === "hero") {
      const hitTraining = trainingProjectile(s, p, x0, y0);
      if (!p.beam && hitTraining) continue;
      for (const e of s.enemies) {
        if (e.hp <= 0 || p.hits.includes(e.id) || !collides(e.x, e.y, e.radius)) continue;
        p.hits.push(e.id);
        const length = Math.max(1, Math.hypot(p.vx, p.vy));
        attackEnemy(s, e, p.damage, p.vx / length, p.vy / length, p.beam ? 85 : 40, `projectile:${p.id}`);
        if (!p.beam) { p.ttl = 0; break; }
      }
    } else if (s.coop?.role !== "guest") {
      const target = combatTargets(s).find(player => collides(player.x, player.y, 7));
      if (target) { hurtTarget(s, target, p.damage, x0, y0); p.ttl = 0; }
    }
    if (blocked) p.ttl = 0;
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
// Driving the taxi is less precise than walking, so overworld stops get a wider
// trigger zone than on-foot interactions (28).
const OVERWORLD_STOP_RADIUS = 72, OVERWORLD_PROP_RADIUS = 46;
export function interactTarget(s: GameState): InteractTarget | null {
  if (s.overlay === "diner") {
    const item = availablePickups(s).find(pickup => pickup.requiresDiner);
    return item ? { id: item.id, name: `Pick up ${item.name}`, kind: "use", x: item.x, y: item.y }
      : { id: "diner-leave", name: "Leave diner", kind: "use", x: s.x, y: s.y };
  }
  if (s.scene === "prologue") return { id: "story-next", name: s.cutscene === PROLOGUE.length - 1 ? "Continue to the taxi" : "Next", kind: "next", x: s.x, y: s.y };
  if (s.dialogue) return { id: "dialog-next", name: s.dialogue.index < s.dialogue.lines.length - 1 ? "Next" : "Continue", kind: "next", x: s.x, y: s.y };
  if (s.scene === "dead" || s.scene === "results" || s.scene === "shift" || s.overlay || s.coop?.downed) return null;
  const candidates: InteractionCandidate[] = [...itemInteractionCandidates(s)];
  const gate = getHeroObstacleTarget(s);
  if (gate) candidates.push({ id: gate.id, name: gate.label, kind: "use", x: gate.x + gate.w / 2, y: gate.y + gate.h / 2, distance: 0, radius: 28 });
  const add = (target: InteractTarget, radius = 28, distance = Math.hypot(s.x - target.x, s.y - target.y)) => candidates.push({ ...target, radius, distance });
  if (s.coop && activeHero(s).hp > 0) for (const peer of s.coop.remoteHeroes) {
    if (peer.hero.hp <= 0 && peer.scene === s.scene && peer.room === s.room) add({ id: `coop-revive-${peer.seat}`, name: `Hold to revive ${peer.name}`, kind: "use", x: peer.x, y: peer.y }, 32.001);
  }
  for (const pickup of availablePickups(s)) add({ id: pickup.id, name: `Pick up ${pickup.name}`, kind: "use", x: pickup.x, y: pickup.y });
  const quest = hubQuestTarget(s);
  if (quest) add({ ...quest, kind: "talk", x: s.x, y: s.y });
  if (s.scene === "dungeon" || s.scene === "realm") {
    const world = getWorld(s.scene, s.room);
    for (const prop of world.props) {
      if (prop.kind === "chest" && obstacleRewardAvailable(s, prop.id) && !s.clearedRooms.includes(prop.id)) add({ id: prop.id, name: "Open supply cache", kind: "use", locked: s.enemies.length > 0, x: prop.x + prop.w / 2, y: prop.y + prop.h / 2 });
      if (prop.kind === "npc") add({ id: "scout", name: `Talk to ${prop.label ?? "the stranded scout"}`, kind: "talk", x: prop.x + prop.w / 2, y: prop.y + prop.h });
    }
    for (const door of world.exits) if (!door.requiresClear || s.enemies.length === 0) add({ id: door.id, name: door.name, kind: door.target === "overworld" ? "taxi" : "use", x: door.x + door.w / 2, y: door.y + door.h / 2 }, 25, distanceToExit(door, s.x, s.y));
  }
  const points = s.scene === "overworld" ? LOCATIONS : s.scene === "hub" ? [...HUB_POINTS, ARENA_HUB_POINT] : [];
  for (const point of points) {
    if (point.id === TRAINING_BOARD.id && s.training) continue;
    const npc = point.id === "alex" || point.id === "jon";
    const taxi = point.id === "taxi" || s.scene === "overworld";
    add({ ...point, name: npc ? `Talk to ${point.name}` : point.id === "taxi" ? "Enter taxi" : s.scene === "overworld" ? `Leave taxi · ${point.name}` : point.name,
      kind: npc ? "talk" : taxi ? "taxi" : "use" }, s.scene === "overworld" ? OVERWORLD_STOP_RADIUS : undefined);
  }
  if (s.scene === "overworld") {
    add({ id: "roadside-lore-sign", name: "Read roadside sign", kind: "use", x: 468, y: 444  }, OVERWORLD_PROP_RADIUS);
    add({ id: "diner-entry", name: "Enter diner", kind: "use", x: 520, y: 405  }, OVERWORLD_PROP_RADIUS);
  }
  return selectInteractionTarget(candidates, s.x, s.y, s.faceX, s.faceY);
}
export function hostileWithinMeleeReach(s: GameState): boolean {
  const nextCombo = s.comboWindow > 0 ? s.combo % 3 + 1 : 1, reach = nextCombo === 3 ? 34 : 28;
  return s.enemies.some(enemy => {
    const dx = enemy.x - s.x, dy = enemy.y - s.y, distance = Math.hypot(dx, dy);
    return enemy.hp > 0 && !enemy.nightAmbient && distance <= reach + enemy.radius && (dx * s.faceX + dy * s.faceY) / Math.max(1, distance) >= -.1;
  });
}
export const nonCombatContext = (s: GameState) => !!s.dialogue || s.scene === "prologue" || s.scene === "overworld" || s.scene === "hub" || !!s.overlay;
function refreshContextAttack(s: GameState): void {
  s.contextAttack.target = interactTarget(s);
  updateContextPrompt(s.contextAttack, interactionPrompt(s.contextAttack.target, hostileWithinMeleeReach(s), nonCombatContext(s)), s.time);
}
export function advanceDialogue(s: GameState): void {
  if (!s.dialogue) return;
  if (s.dialogue.index + 1 < s.dialogue.lines.length) s.dialogue.index++;
  else s.dialogue = null;
  s.previousInput.attack = s.previousInput.interact = true;
}
function openDialogue(s: GameState, speaker: string, lines: string[]): void {
  s.dialogue = { speaker, lines, index: 0 }; s.vx = s.vy = 0; s.moving = false; s.charge = 0;
  s.attackTimer = s.dashTimer = 0; s.guard = false; s.knockX = s.knockY = 0;
  // Keep the existing notice channel useful for screen readers and save checks.
  s.notice = lines[0];
}
function travel(s: GameState, door: WorldExit) {
  if (door.target === "realm") beginRealmShift(s);
  else {
    enterScene(s, typeof door.target === "number" ? "dungeon" : door.target,
      typeof door.target === "number" ? door.target : 0);
    if (s.scene !== "results") { s.x = door.entryX; s.y = door.entryY; }
  }
  s.previousInput.attack = s.previousInput.interact = true;
}
export function interact(s: GameState, selected?: InteractTarget | null): void {
  if (s.coop && (s.coop.downed || activeHero(s).hp <= 0)) return;
  const target = selected === undefined ? interactTarget(s) : selected;
  if (target && interactItem(s, target.id)) return;
  if (target?.id === TRAINING_BOARD.id) { s.overlay = "training"; s.vx = s.vy = 0; s.moving = false; return; }
  if (!target) return;
  if (target.id === "story-next") { advanceStory(s); return; }
  if (target.id === "dialog-next") { advanceDialogue(s); return; }
  if (target.id === "diner-entry") { s.overlay = "diner"; s.insideDiner = true; s.vx = s.vy = 0; s.moving = false; return; }
  if (target.id === "diner-leave") { s.overlay = null; s.insideDiner = false; return; }
  if (target.id.startsWith("pickup-")) { collectPickup(s, target.id); return; }
  if (target.id.startsWith("u8-quest-")) { openHubQuest(s, target.id); return; }
  if (target.id.startsWith("coop-revive-")) return;
  if (target.id === "roadside-lore-sign") { openDialogue(s, "Wayside road sign", ["Blast Site: east. Wayside: west. If the sky starts flickering, get the crew home.", "The old road remembers every late-night drive. Keep a little sweetness for the trip."]); return; }
  if (s.coop?.role === "guest") {
    if (target.id.startsWith("world-")) s.events.push({ type: "obstacle-request", id: target.id, hero: s.active, x: s.x, y: s.y });
    return;
  }
  if (target.id.startsWith("world-")) {
    if (!clearHeroObstacle(s, target.id)) s.notice = `Choose the required hero in Character, then tag them in. ${target.name}`;
    return;
  }
  if (s.coop?.role === "guest" && target.kind !== "talk") return;

  if (s.scene === "realm" || s.scene === "dungeon") {
    if (target.id.startsWith("loot-")) {
      if (target.locked) { s.notice = "Clear the nearby monsters before opening the cache."; return; }
      s.clearedRooms.push(target.id);
      if (!s.coop) grantCheckpointChip(s, target.id);
      if (!s.coop) {
        s.candy += s.room === 8 ? 18 : 25;
        for (const h of Object.values(s.heroes)) {
          h.hp = Math.min(h.maxHp, h.hp + 35); h.ki = Math.min(h.maxKi, h.ki + 20);
        }
        if (s.room === 9) grantGear(s, 1, 0);
      }
      s.notice = s.coop ? "Supply cache opened! Everyone receives their own supplies."
        : s.room === 8 ? "Orchard cache: 18 candy, tonic and Ki supplies!" : "Supply cache: 25 candy, tonic and +1 Power for the crew!";
      s.events.push({ type: "checkpoint", id: target.id }); return;
    }
    if (target.id === "scout") { openDialogue(s, "Stranded scout", ["Scout: Two supply trails survived the blast. Find the orchard north of Split Creek and the old depot south of Furnace Pass."]); return; }
    const door = getWorld(s.scene, s.room).exits.find(exit => exit.id === target.id);
    if (door) travel(s, door);
    return;
  }
  if (target.locked) { s.notice = `${target.name}: taken over. A later chapter will open this route.`; return; }
  if (s.scene === "overworld") {
    enterScene(s, target.id === "wayside" ? "hub" : "dungeon");
    s.previousInput.attack = s.previousInput.interact = true; return;
  }
  if (target.id === "u5-arena") { s.overlay = "arena"; s.moving = false; s.vx = s.vy = 0; return; }
  if (target.id === "taxi") { enterScene(s, "overworld"); s.previousInput.attack = s.previousInput.interact = true; return; }
  if (target.id === "shop" || target.id === "home") { s.overlay = target.id; s.vx = s.vy = 0; s.moving = false; s.notice = ""; return; }
  const dialogue: Record<string, string> = {
    station: "Wayside Station is safe. Alex and Jon are holding the town while Joe and Matt investigate the Blast Site.",
    bbq: "The grill is still warm. The crew will finish dinner when Wayside is safe.",
    alex: "Alex: The station is secure. I can tag in when you need help. There are supplies hidden off the main route.",
    jon: "Jon: HOME restores the whole crew. Stock up before you go, and don't forget to tag your partner in.",
  };
  openDialogue(s, target.id === "alex" ? "Alex" : target.id === "jon" ? "Jon" : target.name, [dialogue[target.id] ?? "Wayside is quiet... for now."]);
}
export function toggleParty(s: GameState, id: HeroId, fromCharacter = false): boolean {
  if (s.coop && activeHero(s).hp <= 0) return false;
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
  if (s.coop && (s.coop.downed || activeHero(s).hp <= 0)) return;
  itemsState(s).chips.secondWindUsed = false;
  for (const h of Object.values(s.heroes)) { h.hp = h.maxHp; h.ki = h.maxKi; h.stamina = h.maxStamina; }
  if (!s.areas.includes("wayside")) s.areas.push("wayside");
  s.events.push({ type: "checkpoint", id: "home" }); s.notice = "Rested. HOME is your retry checkpoint.";
}
export function buyItem(s: GameState, id: ShopItemId): boolean {
  if (s.coop && (s.coop.downed || activeHero(s).hp <= 0)) return false;
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
  // Keep physical button edges separate from the command forwarded to co-op.
  // Pad A sets both flags, while touch/J must synthesize a held revive command.
  const physicalInput = { ...input };
  s.events.length = 0; s.time += dt; s.sceneTimer += dt;
  advanceWorldClock(s, dt);
  updateNightOverworld(s, dt);
  refreshContextAttack(s);
  const attackPressed = input.attack && !s.previousInput.attack;
  const interactPressed = input.interact && !s.previousInput.interact;
  const heldAttackAction = input.attack ? resolveContextPress(s.contextAttack, hostileWithinMeleeReach(s), nonCombatContext(s), s.time, input.attackPresentation) : "none";
  let attackAction = attackPressed ? heldAttackAction : "none";
  // Standard pad A supplies both bindings. Resolve that physical press once.
  let usePressed = attackPressed ? attackAction === "interact" : interactPressed;
  if (s.coop) {
    if (!input.attack) s.coop.reviveHoldTarget = undefined;
    else if (attackPressed) s.coop.reviveHoldTarget = heldAttackAction === "interact" && s.contextAttack.target?.id.startsWith("coop-revive-") ? s.contextAttack.target.id : undefined;
  }
  if (input.attack) input.interact = heldAttackAction === "interact" && !!s.coop?.reviveHoldTarget && s.coop.reviveHoldTarget === s.contextAttack.target?.id;
  s.transitionCooldown = Math.max(0, s.transitionCooldown - dt);
  updateVisuals(s, dt);
  updateOverworldDressing(s, dt);
  tickFusion(s, dt);
  tickHubQuests(s);
  if (s.scene === "prologue") {
    s.previousInput = { ...physicalInput };
    if (usePressed) interact(s, s.contextAttack.target);
    return;
  }
  if (s.scene === "shift") {
    if (s.coop?.role !== "guest" && s.sceneTimer >= 2.4) {
      const target = s.transitionTarget ?? "realm", palette = s.transitionPalette;
      enterScene(s, target); s.palette = palette;
      s.previousInput = { ...physicalInput };
    }
    return;
  }
  if (s.scene === "dead") tickArena(s, 0);
  if (s.scene === "dead" || s.scene === "results") return;
  const dialogueInput = s.dialogue ? physicalInput : null;
  let dialogueControlsSuppressed = !!dialogueInput;
  if (s.dialogue) {
    s.previousInput = { ...physicalInput }; s.moving = false;
    if (usePressed) interact(s, s.contextAttack.target);
    if (!s.coop) return;
    // A conversation is local in co-op. Keep its physical button edges while
    // letting the host's shared enemies, projectiles and clear rewards advance.
    input = idleInput(); usePressed = false; attackAction = "none";
    s.vx = s.vy = s.knockX = s.knockY = s.charge = s.attackTimer = s.dashTimer = 0;
    s.guard = false;
  }
  updateCoopRevives(s, input, dt);
  if (checkCoopWipe(s)) return;
  if (s.coop?.downed) {
    input = idleInput(); s.previousInput = idleInput(); s.moving = s.guard = false;
    s.vx = s.vy = s.knockX = s.knockY = s.charge = s.attackTimer = s.dashTimer = 0;
  }
  if (s.overlay) {
    s.previousInput = { ...physicalInput }; s.moving = false;
    if (s.overlay === "diner" && usePressed) interact(s, s.contextAttack.target);
    return;
  }
  if (s.hitStop > 0) { s.hitStop = Math.max(0, s.hitStop - dt); return; }
  const previous = dialogueInput ? idleInput() : s.previousInput;
  s.previousInput = { ...physicalInput };
  const combat = ["test", "dungeon", "realm", "arena"].includes(s.scene) || s.scene === "hub" && !!s.training;
  s.attackTimer = Math.max(0, s.attackTimer - dt);
  s.comboWindow = Math.max(0, s.comboWindow - dt);
  s.dashTimer = Math.max(0, s.dashTimer - dt);
  s.swapCooldown = Math.max(0, s.swapCooldown - dt);
  const passives = chipEffects(s);
  for (const h of Object.values(s.heroes)) {
    if (h.id === s.active && h.hp > 0 && !s.enemies.some(e => e.hp > 0 && !("nightAmbient" in e && e.nightAmbient) && Math.hypot(e.x - s.x, e.y - s.y) < 100))
      h.hp = Math.min(h.maxHp, h.hp + passives.passiveHealPerSecond * dt);
    h.invulnerable = Math.max(0, h.invulnerable - dt);
    h.stamina = Math.min(h.maxStamina, h.stamina + dt * 20);
    if (!(h.id === s.active && input.ki)) h.ki = Math.min(h.maxKi, h.ki + dt * 2.5);
  }
  if (input.fusion && !previous.fusion) requestFusion(s);
  if (input.swap && !previous.swap) requestSwap(s);
  const h = activeHero(s);
  s.guard = combat && input.guard && s.dashTimer === 0 && !input.ki;
  const length = Math.hypot(input.x, input.y);
  s.moving = length > 0.1;
  if (s.moving && s.dashTimer === 0) {
    const angle = Math.round(Math.atan2(input.y, input.x) / (Math.PI / 4)) * Math.PI / 4;
    s.faceX = Math.cos(angle); s.faceY = Math.sin(angle);
  }
  if (combat && input.dash && !previous.dash && s.dashTimer === 0 && h.stamina >= 25 * passives.dashStaminaMultiplier) {
    h.stamina -= 25 * passives.dashStaminaMultiplier; s.dashTimer = 0.18; h.invulnerable = Math.max(h.invulnerable, 0.23);
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
    const speed = (s.dashTimer > 0 ? 240 : s.guard ? 29 : input.ki && combat ? 37 : localFusion(s) ? 84 : 70) * pickupBuffs(s).speed * passives.moveSpeedMultiplier;
    const strength = s.dashTimer > 0 ? 1 : s.moving ? Math.min(1, length) : 0;
    const moveX = s.dashTimer > 0 ? s.faceX : input.x / Math.max(0.001, length);
    const moveY = s.dashTimer > 0 ? s.faceY : input.y / Math.max(0.001, length);
    s.vx = moveX * speed * strength; s.vy = moveY * speed * strength;
    moveBody(s, s, (s.vx + s.knockX) * dt, (s.vy + s.knockY) * dt, 7);
    s.knockX *= Math.max(0, 1 - dt * 10); s.knockY *= Math.max(0, 1 - dt * 10);
  }
  tickTraining(s, dt);
  walkingPickup(s);
  if (!combat || s.scene === "hub" && !s.training) {
    s.charge = 0;
    if (usePressed) interact(s, s.contextAttack.target);
    else if (attackPressed && attackAction === "attack" && s.scene !== "overworld" && s.attackTimer === 0 && !input.ki) melee(s);
    return;
  }
  if (attackPressed && attackAction === "attack" && s.attackTimer === 0 && s.dashTimer === 0 && !s.guard && !input.ki) melee(s);
  if (usePressed) {
    const scene = s.scene, room = s.room;
    interact(s, s.contextAttack.target);
    if (s.overlay || s.scene !== scene || s.room !== room || s.dialogue && !s.coop) return;
    if (s.dialogue) { dialogueControlsSuppressed = true; input = idleInput(); }
  }
  if (!dialogueControlsSuppressed && input.ki && s.dashTimer === 0 && !s.guard) {
    s.charge += dt; h.ki = Math.min(h.maxKi, h.ki + dt * 32 * pickupBuffs(s).charge * passives.kiChargeMultiplier);
  }
  if (!dialogueControlsSuppressed && !input.ki && previous.ki && s.dashTimer === 0) fireKi(s);
  const hadEnemies = s.enemies.length > 0;
  if (s.coop?.role !== "guest") { updateEnemies(s, dt); separateBodies(s, dt); }
  updateProjectiles(s, dt);
  if (s.coop?.role === "guest") return;
  if (checkCoopWipe(s)) return;
  s.enemies = s.enemies.filter(e => e.hp > 0);
  tickArena(s, dt);
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
  // Walking through an open boundary changes zones without a button press.
  if ((s.scene === "dungeon" || s.scene === "realm") && s.transitionCooldown === 0) {
    const world = getWorld(s.scene, s.room), door = availableExit(s);
    if (door && (s.x < 20 || s.x > world.width - 20 || s.y < 20 || s.y > world.height - 20)) travel(s, door);
  }
}
