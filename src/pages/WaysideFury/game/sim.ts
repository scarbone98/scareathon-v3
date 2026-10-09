import { tickOpening, type Opening } from "./opening.ts";
import { storyRevealed, PROLOGUE_FADE } from './prologue.ts';
import type { ActorMotion } from './animation.ts';
import { collectRadar, radarPickupTarget } from "../u1/minimap/relicRadar.ts";
import { tickArena, type ArenaRuntime, type ArenaPersonal } from "../u1/hub/arena.ts";
import { ARENA_HUB_POINT } from "../u1/hub/arenaWorld.ts";
import { hubQuestTarget, openHubQuest, tickHubQuests, trackHubQuestEvent } from "../u1/hub/hubRules.ts";
import type { HubQuestSave } from "../u1/hub/quests.ts";
import type { ArenaRunReceipt } from "../../../../server/shared/waysideFury/u1Arena.js";
import { createItemsSave, type ItemsSaveState } from "../../../../server/shared/waysideFury/u1Items.js";
import { chipEffects, itemsState, trySecondWind } from "./u1/items/chips.ts";
import { itemInteractionCandidates, interactItem } from "./u1/items/interactions.ts";
import { grantCheckpointChip } from "./u1/items/pickups.ts";
import { gateTargets, clearHeroObstacle, obstaclesForState, isObstacleCleared, obstacleBlocks, markSeenGates, releaseBorrowedObstacles } from './locks/obstacles.ts';
import { INTERIORS, interiorDefinition } from './interiors.ts';
import { inCity, cityTargets, cityInteract, enterCityRoom, cityClear, applyCityRequest } from "./chapters/ch4.ts";
import { configureCityEnemy, isCityBehavior, cityDamage, updateCityEnemy } from "./enemies/city.ts";
import { interruptCityBoss } from "./bosses/architect.ts";
import type { CityBehavior } from "./chapters/ch4Worlds.ts";
import { COUNTY_STOPS } from "./county.ts";
import { tickSpaceFilm, type FilmState } from "./cinematics.ts";
import { enterWoods, woodsTargets, woodsInteract, tickWoodsField, clearWoods, inWoods } from "./chapters/ch2.ts";
import { configureWoodsEnemy, woodsDamage, updateWoodsEnemy, woodsMovementScale } from "./enemies/woods.ts";
import type { WoodsBehavior } from "./chapters/ch2Worlds.ts";
import { knowsField } from "./fieldAbilities.ts";
import { enterSpaceRoom, spaceTargets, spaceInteract, completeSpaceFilm, record, refillCrew, spaceCheckpoint } from "./chapters/ch3.ts";
import { onMoon, hasSpaceFlag, tickLunar, tryBoundLink, advanceBoundLink, lunarWorld, brakeBound } from "./lunar.ts";
import { configureLunarEnemy, lunarDamage, updateLunarEnemy } from "./enemies/lunar.ts";
import type { LunarBehavior } from "./chapters/ch3Worlds.ts";
import { sameCampaignMap, campaignLocations, canEnter, getArea, resolveCampaignMap, legacyMapId, WOODS_HANDOFF, campaignHandoff } from "./campaign.ts";
import { HUB_POINTS, PROLOGUE, SHOP_ITEMS, type ShopItemId } from "./content.ts";
import { getWorld, isBlocked, distanceToExit, WATCHER_ROOM, GATEKEEPER_ROOM, type WorldExit } from "./world.ts";
import { HERO_IDS, heroStats, MAX_LEVEL, type HeroId, type CharacterProgress, type Gear } from "../../../../server/shared/waysideFury/save.js";
import { availablePickups, collectPickup, pickupBuffs, walkingPickup } from "./collectibles.ts";
import { updateOverworldDressing } from "./dressing.ts";
import { interactionPrompt, newContextAttack, resolveContextPress, selectInteractionTarget, updateContextPrompt, type AttackPresentation, type ContextAttackState, type InteractTarget, type InteractionCandidate } from "./contextAttack.ts";
import { createFusionRuntime, tickFusion, requestFusion, localFusion, consumeFusionSpecial, resetFusion, type FusionRuntime } from "./u1/combat/fusion.ts";
import { startTraining, cancelTraining, tickTraining, trainingMelee, trainingProjectile, TRAINING_BOARD, type TrainingRuntime } from "./u1/combat/training.ts";
import { signatureDefinition } from "./u1/combat/signature.ts";
import { defaultCombatProgress, type CombatProgress } from "../../../../server/shared/waysideFury/u1Combat.js";
import { updateNightOverworld } from "./u1/world/dayNightRuntime.ts";
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
export const idleInput = (): Input => ({ x: 0, y: 0, attack: false, ki: false, dash: false, guard: false, swap: false, interact: false });
export interface HeroState {
  id: HeroId; hp: number; maxHp: number; ki: number; maxKi: number;
  stamina: number; maxStamina: number; level: number; xp: number;
  power: number; defense: number; invulnerable: number;
}
export interface RemoteHero {
  /** Disposable renderer state; never persisted or sent over the wire. */
  motion?: ActorMotion;
  chipDamageMultiplier?: number; secondWindReady?: boolean; chipSnapshotAt?: number;
  seat: number; userId: string; name: string; hero: HeroState;
  x: number; y: number; faceX: number; faceY: number; moving: boolean;
  guard: boolean; attackTimer: number; combo: number; charge: number; dashTimer: number;
  guardTimer?: number; filmSkip?: boolean; filmHold?: boolean; spaceOutfit?: boolean; boundTimer?: number; meleeCharge?: number;
  fusionIntent?: number; fusionSpecial?: number;
  scene: Scene; room: number; mapId?: string; questCosmetic?: string | null; downed?: boolean; reviveProgress?: number; interact?: boolean;
}
export interface CoopRuntime {
  worldCycleSeconds?: number;
  role: "host" | "guest"; seat: number; remoteHeroes: RemoteHero[]; appliedHits: string[];
  playerCount?: number; syncedLevel?: number; hostLevel?: number; downed?: boolean; reviveProgress?: number;
  spawnedExtras?: number; damageUntil?: Record<number, number>; reviveTimers?: Record<number, number>;
  revivedUntil?: Record<number, number>;
  remoteSecondWindSpent?: Record<number, { userId: string; at: number }>;
  reviveHoldTarget?: string;
  worldClearedRooms?: string[];
  worldChapter?: number; protocolVersion?: number; personalDifficulty?: "normal" | "hard";
  worldBosses?: string[]; worldCampaignMilestones?: string[]; worldSolvedInteractions?: string[]; worldCompletedCinematics?: string[];
}
export interface CoopHit {
  type: "coop-hit"; relayId?: string; relayKind?: "ki" | "interact"; relayX?: number; relayY?: number; enemyId: number; damage: number; dx: number; dy: number; force: number; attackId: string;
}
export type Archetype = "charger" | "kiter" | "shield" | "swarm" | "ambusher";
export interface Enemy {
  /** Disposable renderer state; never persisted or sent over the wire. */
  motion?: ActorMotion;
  nightAmbient?: boolean;
  archetype?: Archetype; combatLevel?: number; escapeIframes?: number;
  woodsBehavior?: WoodsBehavior; tellX?: number; tellY?: number;
  behavior?: LunarBehavior | CityBehavior; poise?: number; burst?: number; exposed?: number; shieldBroken?: boolean;
  relicEcho?: boolean; id: number; kind: "grunt" | "shooter" | "boss";
  sprite: "zombie" | "pumpkin" | "ghost" | "imp" | "shadowbeast";
  x: number; y: number; hp: number; maxHp: number; radius: number;
  baseMaxHp?: number;
  speed: number; cooldown: number; hitTimer: number; kx: number; ky: number;
  miniBoss: boolean; phase: 1 | 2; pattern: number; windup: number; actionTimer: number; aimX: number; aimY: number;
}
export interface Projectile {
  damageCap?: number;
  originX?: number; originY?: number; relayHit?: boolean; signal?: boolean; bounceDistance?: number; bounceVx?: number; bounceVy?: number;
  id: number; x: number; y: number; vx: number; vy: number; radius: number;
  damage: number; ttl: number; owner: "hero" | "enemy"; hero?: HeroId;
  beam: boolean; hits: number[];
}
export interface Effect {
  id: number; kind: "slash" | "beam" | "charge" | "dash" | "level" | "hit";
  x: number; y: number; dx: number; dy: number; ttl: number; maxT: number;
  hero?: HeroId; size: number; fieldAssist?: boolean;
}
export interface Floater { id: number; x: number; y: number; text: string; color: string; ttl: number }
export type GameEvent =
  | { type: "arena-finish"; receipt: ArenaRunReceipt; score: number }
  | { type: "quest-save"; id: string; kind: "accepted" | "claimed" | "cosmetic" }
  | CoopHit
  | { type: "item"; id: string; kind: "chip" | "relic" | "wish" | "radar" }
  | { type: "pickup"; id: string }
  | { type: "coop-pickup"; id: string }
  | { type: "ambient-taxi-crash"; x: number; y: number }
  | { type: "coop-damage"; seat: number; damage: number; sourceX: number; sourceY: number }
  | { type: "coop-revive"; seat: number }
  | { type: "hit"; x: number; y: number; damage: number; target: "hero" | "enemy" }
  | { type: "kill"; enemyId: number; kind: Enemy["kind"]; x: number; y: number; sprite: Enemy["sprite"]; radius: number; xp: number; xpLevel?: number }
  | { type: "level"; hero: HeroId; level: number }
  | { type: "swap"; hero: HeroId }
  | { type: "checkpoint"; id: string }
  | { type: "fusion-start"; id: number; heroes: HeroId[]; seats: number[] }
  | { type: "fusion-end"; id: number }
  | { type: "fusion-special"; id: number }
  | { type: "training-complete"; hero: HeroId; tier: number }
  | { type: "training-failed"; hero: HeroId; tier: number; reason: string }
  | { type: "death" };
export interface GameState {
  opening?: Opening;
  assistHp?: number;
  shapeMarkers?: boolean;
  ambientBirds?: ReturnType<typeof import("./dressing.ts").roadsideBirds>;
  /** Disposable renderer state; never persisted or sent over the wire. */
  motion?: ActorMotion;
  arena?: ArenaRuntime; hubArena?: ArenaPersonal; arenaVitals?: Record<HeroId, HeroState>; arenaLead?: HeroId; arenaRecorded?: string;
  hubQuests?: HubQuestSave; hubQuestId?: string; hubCosmetic?: string | null; hubQuestSerial?: number;
  relicRadar?: { owned: boolean; enabled: boolean };
  u1: { items: ItemsSaveState; combat: CombatProgress; [key: string]: unknown }; fusion: FusionRuntime; training: TrainingRuntime | null;
  worldCycleSeconds: number;
  nightWorld?: { window: string | null };
  localPaused: boolean; spaceOutfit: boolean; oxygen: number; oxygenWarned: boolean; boundTimer: number;
  boundTravel: { from: {x:number;y:number}; to:{x:number;y:number}; elapsed:number } | null;
  film: FilmState | null; filmCaptionHold: boolean; filmSkipHeld: number; filmHold: boolean; fuelGag: number;

  foundItems: string[]; ambientTaxiWrecked: boolean; personalTaxiWrecked: boolean; ambientTaxiGag: number; insideDiner: boolean;
  pickupPending?: { id: string; at: number };
  x: number; y: number; faceX: number; faceY: number; moving: boolean;
  vx: number; vy: number; knockX: number; knockY: number; transitionCooldown: number;
  active: HeroId; party: HeroId[]; unlockedHeroes: HeroId[]; character: CharacterProgress; gear: Gear; time: number; scene: Scene; room: number; mapId: string;
  prologueRevealed?: boolean; prologueExit?: number;
  cutscene: number; sceneTimer: number; palette: "real" | "eightbit";
  transitionTarget: Scene | null; transitionPalette: "real" | "eightbit";
  overlay: "shop" | "home" | "diner" | "wish" | "arena" | "quest" | "quest-board" | null; heroes: Record<HeroId, HeroState>; enemies: Enemy[]; projectiles: Projectile[];
  effects: Effect[]; floaters: Floater[]; notice: string; guard: boolean;
  difficulty: "normal" | "hard"; meleeCharge: number; meleeHolding: boolean;
  guardTimer?: number; attackTimer: number; combo: number; comboWindow: number; charge: number;
  dashTimer: number; swapCooldown: number; hitStop: number;
  clearedRooms: string[]; areas: string[]; bosses: string[]; chapter: number;
  campaignMilestones: string[]; solvedInteractions: string[]; completedCinematics: string[]; checkpointMapId: string;
  candy: number; deaths: number; kills: number; events: GameEvent[];
  previousInput: Input; rngSeed: number; nextId: number;
  coop?: CoopRuntime;
  coopRewards?: string[];
  contextAttack: ContextAttackState;
  dialogue: { speaker: string; lines: string[]; index: number } | null;
}
const clamp = (value: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, value));
export function activeHero(s: GameState) { return s.heroes[s.active]; }
export function xpForLevel(level: number) { return 75 + (level - 1) * 45; }
export function itemsGear(s: GameState): Gear {
  const bonus = itemsState(s).relics.statBonus;
  return { power: s.gear.power + bonus.power, ward: s.gear.ward + bonus.ward };
}
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
  const world = getWorld(s.scene, s.room, s.mapId), anchor = world.spawns.find(spawn => spawn.kind !== "boss") ?? s.enemies[0];
  for (let n = previous; n < extras; n++) {
    let x = anchor.x, y = anchor.y;
    for (let attempt = 0; attempt < 12; attempt++) {
      const angle = (n * 3 + attempt) * Math.PI / 4, radius = 20 + Math.floor(attempt / 4) * 12;
      const nx = anchor.x + Math.cos(angle) * radius, ny = anchor.y + Math.sin(angle) * radius;
      if (!isBlocked(world, nx, ny, 7)) { x = nx; y = ny; break; }
    }
    const enemy = addEnemy(s, "grunt", x, y);
    if (anchor.sprite && anchor.kind !== "boss") enemy.sprite = anchor.sprite;
    if (onMoon(s)) configureLunarEnemy(s,enemy, "rat");
    else enemy.archetype = enemy.kind === "boss" ? undefined : archetypeFor(enemy);
    if (inWoods(s)) { enemy.sprite="zombie"; configureWoodsEnemy(s,enemy,"rooted"); }
    if (inCity(s)) configureCityEnemy(s,enemy,"cable-rat");
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
export function coopLevelBand(scene: Scene, room: number, mapId?: string): readonly [number, number] {
  if (mapId?.startsWith("woods-") || mapId?.startsWith("city-") || mapId?.startsWith("moon-") || mapId === "space-launch") return [1,MAX_LEVEL];
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
  const band = s.coop?.hostLevel ? [Math.max(1, s.coop.hostLevel - 2), Math.min(MAX_LEVEL, s.coop.hostLevel + 2)] : coopLevelBand(s.scene, s.room, s.mapId);
  const level = s.coop?.role === "guest" ? clamp(s.character.level, band[0], band[1]) : s.character.level;
  if (s.coop) s.coop.syncedLevel = s.coop.role === "guest" ? level : undefined;
  if (s.coop?.role !== "guest") for (const e of s.enemies) {
    const next = encounterLevel(s), old = e.combatLevel ?? next;
    if (next !== old) { scaleEnemy(s, e, (e.baseMaxHp ?? e.maxHp) * (10 + (next - 1) * 3) / (10 + (old - 1) * 3)); e.combatLevel = next; }
  }
  for (const h of Object.values(s.heroes)) {
    const stats = heroStats(h.id, { ...s.character, level }, itemsGear(s));
    const hp = h.hp / Math.max(1, h.maxHp), ki = h.ki / Math.max(1, h.maxKi);
    Object.assign(h, stats, { level, xp: s.character.xp });
    h.hp = stats.maxHp * hp; h.ki = stats.maxKi * ki;
  }
}
export function authoredLevel(s: GameState): number {
  return onMoon(s) ? 7 : s.scene === "realm" ? 6 : s.scene === "dungeon" ? s.room >= 8 ? 3 : 1 + Math.floor(s.room / 2) : 1;
}
export function encounterLevel(s: GameState): number {
  const local = s.character.level;
  const peers = (s.coop?.remoteHeroes ?? []).filter(p => sameCampaignMap(s, p));
  const average = (local + peers.reduce((sum, p) => sum + clamp(p.hero.level, local - 2, local + 2), 0)) / (peers.length + 1);
  return clamp(Math.round(average), authoredLevel(s), Math.min(MAX_LEVEL, Math.max(authoredLevel(s) + 2, local + 2)));
}
export function combatXp(s: GameState, amount: number, contentLevel?: number, boost = 1): number {
  const gap = contentLevel === undefined ? 0 : Math.max(0, s.character.level - contentLevel - 3);
  return Math.max(1, Math.round(amount * Math.min(1.5, Math.max(1, Number.isFinite(boost) ? boost : 1)) / (1 + gap * .5)));
}
export function archetypeFor(e: Enemy): Archetype {
  return e.sprite === "ghost" ? "ambusher" : e.sprite === "pumpkin" ? "shield" : e.sprite === "imp" ? "kiter" : e.id % 2 ? "charger" : "swarm";
}
export function startBossBurst(s: GameState, e: Enemy): void {
  e.poise = 0; e.burst = .65; e.windup = .65; e.actionTimer = 0; e.kx = e.ky = 0;
  e.escapeIframes = .95;
  s.notice = "Boss break-out! Leave the marked circle, then punish the recovery.";
}
function updateBossBurst(s: GameState, e: Enemy, dt: number): boolean {
  if ((e.burst ?? 0) <= 0) return false;
  e.burst = Math.max(0, e.burst! - dt); e.windup = e.burst;
  if (e.burst === 0) {
    for (const t of combatTargets(s)) if (Math.hypot(t.x - e.x, t.y - e.y) < 64) hurtTarget(s, t, 16 + (e.combatLevel ?? 1) * 2, e.x, e.y);
    const world = getWorld(s.scene, s.room, s.mapId);
    // Walk out along the clearest inward ray; swept movement never crosses scenery.
    let best = { dx: 0, dy: 0, score: -Infinity };
    for (let n = 0; n < 16; n++) {
      const a = n * Math.PI / 8, dx = Math.cos(a), dy = Math.sin(a);
      let distance = 0;
      for (let r = 8; r <= 96 && !isBlocked(world, e.x + dx * r, e.y + dy * r, e.radius); r += 8) distance = r;
      const x = e.x + dx * distance, y = e.y + dy * distance;
      const score = distance + Math.min(x, y, world.width - x, world.height - y) * .5;
      if (score > best.score) best = { dx: dx * distance, dy: dy * distance, score };
    }
    moveBody(s, e, best.dx, best.dy, e.radius); e.cooldown = 1.4; e.windup = 0;
    effect(s, "hit", e.x, e.y, 64, .3);
  }
  return true;
}
function updateArchetype(s: GameState, e: Enemy, dt: number, target: CombatTarget) {
  const dx = target.x - e.x, dy = target.y - e.y, len = Math.max(1, Math.hypot(dx, dy));
  const hard = s.difficulty === "hard";
  const damage = 8 + (e.combatLevel ?? 1) * 1.4;
  const aim = () => { e.aimX = dx / len; e.aimY = dy / len; };
  const walk = (forward: number, side = 0) => moveBody(s, e, (dx / len * forward - dy / len * side) * e.speed * dt, (dy / len * forward + dx / len * side) * e.speed * dt, e.radius);
  const kind = e.archetype ?? archetypeFor(e);
  if (e.actionTimer > 0) {
    e.actionTimer = Math.max(0, e.actionTimer - dt);
    moveBody(s, e, e.aimX * (kind === "charger" ? 145 : 100) * dt, e.aimY * (kind === "charger" ? 145 : 100) * dt, e.radius);
    if (len < e.radius + 12) hurtTarget(s, target, damage, e.x, e.y);
    if (!e.actionTimer) e.cooldown = kind === "shield" ? 1.8 : 1.5;
    return;
  }
  if (e.windup > 0) {
    e.windup = Math.max(0, e.windup - dt);
    if (e.windup === 0) {
      if (kind === "kiter") { projectile(s, "enemy", e.x, e.y, e.aimX, e.aimY, hard ? 100 : 75, damage, 4); e.cooldown = 1.6; }
      else e.actionTimer = kind === "charger" ? .45 : .3;
    }
    return;
  }
  if (kind === "kiter") {
    walk(len < 90 ? -1 : len > 125 ? 1 : 0, hard ? (e.id % 2 ? .65 : -.65) : 0);
    if (!e.cooldown) { aim(); e.windup = .45; }
  } else if (kind === "swarm") {
    // Orbit to flank instead of queuing behind the first attacker.
    walk(len > 22 ? 1 : 0, (e.id % 2 ? 1 : -1) * (len < 70 ? .8 : .25));
    aim(); if (len < 22 && !e.cooldown) { hurtTarget(s, target, damage * .7, e.x, e.y); e.cooldown = .8; }
  } else if (kind === "ambusher") {
    if (len > 95) { walk(hard ? .8 : .4, .7); return; }
    if (!e.cooldown) { aim(); e.windup = .7; }
    else walk(-.4, .65);
  } else if (kind === "shield") {
    aim(); if (len > 40) walk(.65);
    else if (!e.cooldown) e.windup = .65;
  } else {
    if (!e.cooldown && len < 120) { aim(); e.windup = .55; }
    else if (len > 45) walk(1, hard ? .3 : 0);
  }
}
function random(s: GameState) {
  s.rngSeed = (s.rngSeed + 0x6d2b79f5) | 0;
  let n = Math.imul(s.rngSeed ^ (s.rngSeed >>> 15), 1 | s.rngSeed);
  n = (n + Math.imul(n ^ (n >>> 7), 61 | n)) ^ n;
  return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
}
export function newGame(seed = 8591): GameState {
  const s: GameState = { worldCycleSeconds: 0, u1: { items: createItemsSave(), combat: defaultCombatProgress() }, fusion: createFusionRuntime(), training: null, difficulty: "normal", meleeCharge: 0, meleeHolding: false, localPaused: false, spaceOutfit: false, oxygen: 100, oxygenWarned: false, boundTimer: 0, boundTravel: null, film: null, filmCaptionHold: false, filmSkipHeld: 0, filmHold: false, fuelGag: -1, foundItems: [], ambientTaxiWrecked: false, personalTaxiWrecked: false, ambientTaxiGag: -1, insideDiner: false,
    x: 75, y: 110, faceX: 1, faceY: 0, moving: false, vx: 0, vy: 0, knockX: 0, knockY: 0, transitionCooldown: 0,
    active: "you", party: ["you", "joe"], unlockedHeroes: [...HERO_IDS], character: { level: 1, xp: 0 }, gear: { power: 0, ward: 0 }, time: 0, scene: "test", room: 0, mapId: "training",
    cutscene: 0, sceneTimer: 0, palette: "real", transitionTarget: null, transitionPalette: "eightbit",
    overlay: null, heroes: Object.fromEntries(HERO_IDS.map(id => [id, createHero(id)])) as Record<HeroId, HeroState>, enemies: [], projectiles: [],
    effects: [], floaters: [], notice: "Training yard: try your combat kit.", guard: false,
    attackTimer: 0, combo: 0, comboWindow: 0, charge: 0, dashTimer: 0,
    swapCooldown: 0, hitStop: 0, clearedRooms: [], areas: [], bosses: [], chapter: 1, campaignMilestones: [], solvedInteractions: [], completedCinematics: [], checkpointMapId: "hub",
    candy: 0, deaths: 0, kills: 0, events: [], previousInput: idleInput(), rngSeed: seed | 0, nextId: 1, coopRewards: [],
    contextAttack: newContextAttack(), dialogue: null };
  enterScene(s, "test");
  return s;
}
export function addEnemy(s: GameState, kind: Enemy["kind"], x: number, y: number): Enemy {
  const tier = s.scene === "realm" ? 3 : s.scene === "dungeon" ? s.room >= 8 ? 1 : Math.floor(s.room / 2) : 0;
  const maxHp = kind === "boss" ? 520 : (kind === "shooter" ? 24 : 30) + tier * 6;
  const e: Enemy = { id: s.nextId++, kind, sprite: kind === "boss" ? "shadowbeast" : kind === "shooter" ? "imp" : "zombie",
    x, y, hp: maxHp, maxHp, radius: kind === "boss" ? 16 : 7,
    speed: kind === "boss" ? 20 : kind === "shooter" ? 19 : 23, cooldown: 0.7 + random(s) * 0.5,
    hitTimer: 0, kx: 0, ky: 0, miniBoss: false, phase: 1, pattern: 0, windup: 0, actionTimer: 0, aimX: -1, aimY: 0 };
  e.combatLevel = encounterLevel(s);
  const powerScale = (10 + (e.combatLevel - 1) * 3) / (10 + tier * 3);
  e.hp = e.maxHp = maxHp * Math.max(1, powerScale);
  scaleEnemy(s, e, e.maxHp);
  e.archetype = e.kind === "boss" ? undefined : archetypeFor(e);
  s.enemies.push(e);
  return e;
}
export function enterScene(s: GameState, scene: Scene, room = 0, mapId?: string): void {
  const previousInterior = interiorDefinition(s.mapId);
  const resolved = resolveCampaignMap(mapId ?? (scene === "arena" ? "u5-arena" : legacyMapId(scene, room)) ?? "unknown");
  if (resolved.fallback) { scene = "hub"; room = 0; }
  else if (mapId && !["prologue", "shift", "results", "dead"].includes(scene)) {
    scene = resolved.definition.scene as Scene; room = resolved.definition.room;
  }
  const world = resolved.map;
  if (previousInterior && world.id === previousInterior.parent) s.checkpointMapId = world.id;
  s.mapId = world.id;
  resetFusion(s); cancelTraining(s);
  s.scene = scene; s.overlay = null; s.insideDiner = false; s.dialogue = null; s.contextAttack = newContextAttack(); s.room = room; s.x = world.spawn.x; s.y = world.spawn.y;
  s.vx = 0; s.vy = 0; s.knockX = 0; s.knockY = 0; s.transitionCooldown = 0.5;
  s.sceneTimer = 0; s.transitionTarget = null;
  if (scene === "realm") { s.palette = "eightbit"; if (s.clearedRooms.includes("realm-0")) s.chapter = Math.max(2, s.chapter); }
  else if (scene !== "shift" && scene !== "results" && scene !== "dead") s.palette = "real";
  if (scene === "prologue") { s.cutscene = 0; s.prologueRevealed = false; s.prologueExit = undefined; }
  s.faceX = 1; s.faceY = 0; s.moving = false;
  s.enemies = []; s.projectiles = []; s.effects = []; s.floaters = [];
  s.meleeCharge = 0; s.meleeHolding = false;
  s.attackTimer = 0; s.combo = 0; s.comboWindow = 0; s.charge = 0;
  s.dashTimer = 0; s.guard = false; s.guardTimer = 0; s.hitStop = 0;
  s.previousInput = idleInput();
  if (s.coop) { s.coop.spawnedExtras = 0; s.coop.reviveTimers = {}; s.coop.reviveProgress = 0; s.coop.reviveHoldTarget = undefined; }
  if (scene === "overworld") s.notice = "Chapter 1: drive east to the Blast Site. Pull over at a marker.";
  if (scene === "hub") s.notice = "Wayside: visit the station, shop, HOME and BBQ yard. Taxi pickup is by the south road.";
  if (scene === "dungeon" || scene === "realm") {
    if (s.coop?.role !== "guest" && !s.clearedRooms.includes(world.id) && !s.coop?.worldClearedRooms?.includes(world.id)) {
      for (const spawn of world.spawns) {
        const enemy = addEnemy(s, spawn.kind, spawn.x, spawn.y);
        if (spawn.sprite) enemy.sprite = spawn.sprite;
        if (spawn.miniBoss && !spawn.behavior) {
          enemy.miniBoss = true; enemy.hp = enemy.maxHp = 235; enemy.radius = 12; enemy.speed = 18;
          scaleEnemy(s, enemy, 235 * (10 + ((enemy.combatLevel ?? 1) - 1) * 3) / 10);
        }
        if (spawn.woodsBehavior) configureWoodsEnemy(s, enemy, spawn.woodsBehavior);
        if (spawn.behavior) {
          if(isCityBehavior(spawn.behavior)) configureCityEnemy(s,enemy,spawn.behavior);
          else configureLunarEnemy(s, enemy, spawn.behavior);
        }
        else enemy.archetype = enemy.kind === "boss" ? undefined : archetypeFor(enemy);
      }
    }
    s.notice = scene === "realm" ? "The 8-Bit Realm! Clear the creatures and find the eastern rift."
      : room === WATCHER_ROOM ? "The Watcher: dodge its rush, guard its dark nova."
      : room === GATEKEEPER_ROOM ? "The Sentinel guards the way. Clear this mini-boss gate."
      : room >= 8 ? `${world.name}: an optional supply cache lies beyond the monsters.`
      : `${world.name}: clear the eastern route. Explore side trails for supplies.`;
  }
  if (s.enemies.some(e => e.archetype === "shield")) s.notice += " Pumpkins brace: use a combo finisher or hold Attack, then release.";
  if (scene === "test") {
    if (s.coop?.role !== "guest") {
      addEnemy(s, "grunt", 183, 73); addEnemy(s, "grunt", 220, 113);
      addEnemy(s, "grunt", 174, 145); addEnemy(s, "shooter", 260, 76);
    }
    s.notice = "J Attack • K Ki • L Dash • Shift Guard • Q Swap";
  }
  if (s.mapId === "blast-9" && s.coop?.role !== "guest" && itemsState(s).relics.secretBossUnlocked && !s.bosses.includes("relic-echo")) {
    const echo = addEnemy(s, "boss", 416, 224); echo.sprite = "ghost"; echo.relicEcho = true;
    s.notice = "Relic Echo: the wish has awakened a hidden challenger.";
  }
  if (s.clearedRooms.includes("realm-0")) {
    s.chapter = Math.max(2, s.chapter);
    if (!s.campaignMilestones.includes("realm-0")) s.campaignMilestones.push("realm-0");

  }
  if ((scene === "hub" || scene === "overworld") && canEnter(s, "forest")) s.notice = campaignHandoff(s);
  if (resolved.fallback) s.notice = "Unknown area. Returned safely to Wayside.";
  extraCoopSpawns(s); syncCoopLevel(s); enterSpaceRoom(s); enterCityRoom(s); enterWoods(s);
  const interior = interiorDefinition(s.mapId);
  if (interior) { s.insideDiner = interior.theme === "diner"; s.checkpointMapId = interior.id; s.spaceOutfit = false; s.notice = `${interior.name}: explore on foot. Use the exit mat to return.`; }
}
export function enterCampaignMap(s: GameState, mapId: string): boolean {
  const resolved = resolveCampaignMap(mapId);
  if (s.coop && resolved.definition.minProtocol > (s.coop.protocolVersion ?? 1)) {
    s.notice = "Everyone must update Wayside Fury before entering this area."; return false;
  }
  const area = getArea(resolved.definition.areaId);
  if (!resolved.fallback && area && !canEnter(s, area.id)) {
    s.notice = "Complete the previous chapter to open this route."; return false;
  }
  const interior = interiorDefinition(mapId);
  if (interior) {
    const parent = resolveCampaignMap(interior.parent), parentArea = getArea(parent.definition.areaId);
    if (parentArea && !canEnter(s, parentArea.id)) { s.notice = "Complete the previous chapter to open this route."; return false; }
  }
  enterScene(s, resolved.definition.scene as Scene, resolved.definition.room, mapId);
  return !resolved.fallback;
}

// Substeps prevent fast dashes and boss rushes crossing thin tile barriers.
function moveBody(s: GameState, body: { x: number; y: number }, dx: number, dy: number, radius: number) {
  const world = lunarWorld(s), pieces = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 4));
  for (let n = 0; n < pieces; n++) {
    if (!(s.coop && (s.coop.protocolVersion ?? 1) < 6 && s.scene === "overworld" && (body.x + dx / pieces < 42 || body.x + dx / pieces > 1878)) && !isBlocked(world, body.x + dx / pieces, body.y, radius) && !obstacleBlocks(s, body.x + dx / pieces, body.y, radius)) body.x += dx / pieces;
    if (!(s.coop && (s.coop.protocolVersion ?? 1) < 6 && s.scene === "overworld" && (body.y + dy / pieces < 42 || body.y + dy / pieces > 918)) && !isBlocked(world, body.x, body.y + dy / pieces, radius) && !obstacleBlocks(s, body.x, body.y + dy / pieces, radius)) body.y += dy / pieces;
  }
}
// Relax overlaps without adding velocity: a bounded, time-scaled push settles
// smoothly, and the same sliding collision keeps crowds out of scenery.
function separateBodies(s: GameState, dt: number) {
  const bodies = [{ body: s as { x: number; y: number }, radius: 7, id: 0 },
    ...s.enemies.filter(e => e.hp > 0 && !e.nightAmbient).sort((a, b) => a.id - b.id)
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
  if (s.scene !== "prologue" || s.coop?.role === "guest" || s.prologueExit !== undefined) return;
  if (!storyRevealed(s)) { s.prologueRevealed = true; return; }
  if (s.cutscene === PROLOGUE.length - 1) { requestPrologueSkip(s); return; }
  s.cutscene++; s.sceneTimer = 0; s.prologueRevealed = false;
}
export function requestPrologueSkip(s: GameState): void {
  if (s.scene !== "prologue" || s.coop?.role === "guest" || s.prologueExit !== undefined) return;
  s.prologueExit = 0;
}
// Immediate entry remains available to save/debug tools. Player controls use
// requestPrologueSkip so the same fade completes for touch, keyboard and pad.
export function skipPrologue(s: GameState): void {
  if (s.scene !== "prologue" || s.coop?.role === "guest") return;
  enterScene(s, "overworld"); s.prologueExit = undefined;
  s.previousInput.attack = s.previousInput.interact = true;
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
export function gainXp(s: GameState, amount: number, contentLevel?: number, boost = 1) {
  if (!Number.isFinite(amount) || amount <= 0) return;
  if (s.coop?.role === "guest") syncCoopLevel(s);
  const before = s.character.level;
  amount = combatXp(s, amount, contentLevel, boost);
  s.character.xp += amount;
  while (s.character.level < MAX_LEVEL && s.character.xp >= xpForLevel(s.character.level)) {
    s.character.xp -= xpForLevel(s.character.level); s.character.level++;
  }
  s.character.xp = Math.min(s.character.xp, xpForLevel(s.character.level) - 1);
  const band = s.coop?.hostLevel ? [Math.max(1, s.coop.hostLevel - 2), Math.min(MAX_LEVEL, s.coop.hostLevel + 2)] : coopLevelBand(s.scene, s.room, s.mapId);
  const level = s.coop?.role === "guest" ? clamp(s.character.level, band[0], band[1]) : s.character.level;
  if (s.coop?.role === "guest") s.coop.syncedLevel = level;
  for (const h of Object.values(s.heroes)) {
    const growth = s.character.level - (s.coop ? before : h.level), downed = !!s.coop && h.hp <= 0;
    const stats = heroStats(h.id, { ...s.character, level }, itemsGear(s));
    Object.assign(h, s.character, stats, { level });
    if (growth > 0) {
      if (!downed && h.hp > 0) h.hp = Math.min(h.maxHp, h.hp + growth * 18);
      h.ki = Math.min(h.maxKi, h.ki + growth * 10);
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
function hurtEnemy(s: GameState, e: Enemy, damage: number, dx: number, dy: number, force: number, ki = false) {
  if (e.nightAmbient) return;
  if (e.hp <= 0 || (e.escapeIframes ?? 0) > 0 || (!e.woodsBehavior && (e.burst ?? 0) > 0)) return;
  const allowed = isCityBehavior(e.behavior) ? cityDamage(e,damage,dx,dy,force) : e.woodsBehavior ? woodsDamage(s,e,damage,force,ki) : lunarDamage(s,e,damage,force);
  if(allowed <= 0) return;
  const braced = !e.behavior && !e.woodsBehavior && e.archetype === "shield" && e.windup === 0 && e.actionTimer === 0 && dx * e.aimX + dy * e.aimY < -.3;
  const dealt = Math.max(1, Math.round(allowed * (braced && force < 100 ? .25 : 1)));
  if (e.kind === "boss") {
    if (!e.woodsBehavior && !isCityBehavior(e.behavior)) {
      e.poise = (e.poise ?? 0) + 1;
      const world = getWorld(s.scene, s.room, s.mapId);
      if (e.poise >= 6 || force > 0 && isBlocked(world, e.x + dx * 18, e.y + dy * 18, e.radius)) startBossBurst(s, e);
    }
    force *= .04;
  }
  e.hp -= dealt; e.hitTimer = 0.18; s.hitStop = Math.max(s.hitStop, force >= 80 ? 0.07 : 0.045); e.kx += dx * force; e.ky += dy * force;
  effect(s, "hit", e.x, e.y, 9, 0.12);
  floater(s, e.x, e.y, String(dealt), ({ you: "#9cefff", joe: "#9cefff", matt: "#ffe393", alex: "#b4f49c", jon: "#d6b0ff" })[s.active]);
  s.events.push({ type: "hit", x: e.x, y: e.y, damage: dealt, target: "enemy" });
  if (e.hp <= 0) {
    if (e.relicEcho && !s.bosses.includes("relic-echo")) {
      s.bosses.push("relic-echo"); s.events.push({ type: "checkpoint", id: "relic-echo" });
    }
    const baseXp = e.kind === "boss" ? e.miniBoss ? 90 : 160 : e.kind === "shooter" ? 16 : 12;
    const xp = s.coop ? baseXp : combatXp(s, baseXp, authoredLevel(s));
    if (!s.coop && s.scene !== "arena") {
      const candy = e.kind === "boss" ? 35 : 2 + Math.floor(random(s) * 3);
      const rewardCandy = Math.floor(candy * chipEffects(s).candyMultiplier) + chipEffects(s).candyBonusPerKill;
      s.candy = Math.min(1_000_000, s.candy + rewardCandy); s.kills++;
      floater(s, e.x, e.y + 13, `+${rewardCandy} candy`, "#eea2fc");
      gainXp(s, xp);
    }
    if (!s.coop && s.scene === "arena") s.kills++;
    s.events.push({ type: "kill", enemyId: e.id, kind: e.kind, x: e.x, y: e.y, sprite: e.sprite, radius: e.radius, xp: s.scene === "arena" ? 0 : xp, xpLevel: authoredLevel(s) });
    trackHubQuestEvent(s, s.events[s.events.length - 1]);
  }
}
// Hosts are the only authority for enemy HP and kill rewards. A beam may hit
// several enemies, so dedupe the attack/target pair rather than the whole attack.
export function applyCoopHit(s: GameState, hit: CoopHit, seat: number): boolean {
  if (s.coop?.role !== "host" || seat === s.coop.seat || !Number.isInteger(seat) || seat < 0 || seat > 3) return false;
  if (!Number.isInteger(hit.enemyId) || typeof hit.attackId !== "string" || !hit.attackId || hit.attackId.length > 96
    || ![hit.damage, hit.dx, hit.dy, hit.force].every(Number.isFinite)
    || hit.damage <= 0 || hit.damage > 100000 || hit.force < 0 || hit.force > 1000
    || Math.abs(hit.dx) > 1.01 || Math.abs(hit.dy) > 1.01) return false;
  if(hit.relayId) {
    const relayKey=`${seat}:${hit.attackId}:${hit.relayId}`;
    if(s.coop.appliedHits.includes(relayKey)||hit.relayKind!=="ki"&&hit.relayKind!=="interact"||!applyCityRequest(s,seat,hit.relayId,hit.relayKind,hit.relayX !== undefined && hit.relayY !== undefined ? {x:hit.relayX,y:hit.relayY,dx:hit.dx,dy:hit.dy} : undefined)) return false;
    s.coop.appliedHits.push(relayKey);if(s.coop.appliedHits.length>2048)s.coop.appliedHits.splice(0,s.coop.appliedHits.length-2048);return true;
  }
  const enemy = s.enemies.find(e => e.id === hit.enemyId && e.hp > 0);
  if (!enemy || enemy.nightAmbient) return false;
  const key = `${seat}:${hit.attackId}:${hit.enemyId}`;
  if (s.coop.appliedHits.includes(key)) return false;
  s.coop.appliedHits.push(key);
  if (s.coop.appliedHits.length > 2048) s.coop.appliedHits.splice(0, s.coop.appliedHits.length - 2048);
  hurtEnemy(s, enemy, hit.damage, hit.dx, hit.dy, hit.force, /(^|:)projectile:/.test(hit.attackId));
  return true;
}
function attackEnemy(s: GameState, e: Enemy, damage: number, dx: number, dy: number, force: number, attackId: string) {
  if (e.nightAmbient) return;
  if (e.hp <= 0) return;
  if (s.coop?.role === "guest") {
    s.events.push({ type: "coop-hit", enemyId: e.id, damage, dx, dy, force, attackId });
    effect(s, "hit", e.x, e.y, 9, 0.12);
  } else hurtEnemy(s, e, damage, dx, dy, force, attackId.startsWith("projectile:"));
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
  s.active = next; s.meleeHolding = false; s.meleeCharge = 0; s.swapCooldown = 0.75; s.charge = 0; s.attackTimer = 0; s.combo = 0;
  activeHero(s).invulnerable = Math.max(activeHero(s).invulnerable, 0.25);
  effect(s, "level", s.x, s.y, 16, 0.3);
  s.events.push({ type: "swap", hero: next }); return true;
}
export function requestSwap(s: GameState): boolean {
  if (localFusion(s)) return false;
  if (s.coop && activeHero(s).hp <= 0) return false;
  return s.swapCooldown === 0 && s.dashTimer === 0 && !s.overlay ? swapHero(s) : false;
}
export function exitCoop(s: GameState): void {
  if (!s.coop) return;
  resetFusion(s);
  s.ambientTaxiWrecked ||= s.personalTaxiWrecked;
  s.personalTaxiWrecked = s.ambientTaxiWrecked;
  s.ambientTaxiGag = -1;
  const players = coopCount(s); s.coop.playerCount = 1;
  for (const enemy of s.enemies) scaleEnemy(s, enemy, enemy.baseMaxHp ?? enemy.maxHp / enemyHpScale(enemy.kind, players));
  s.difficulty = s.coop.personalDifficulty ?? s.difficulty;
  delete s.coop; syncCoopLevel(s); releaseBorrowedObstacles(s);
  s.hitStop = 0; s.previousInput = idleInput();
  if (activeHero(s).hp > 0 || s.scene === "dead" || s.scene === "results") return;
  const fallen = s.active, next = nextPartyHero(s);
  if (next) { swapHero(s); s.notice = `${HERO_NAMES[fallen]} is down! ${HERO_NAMES[next]} takes over.`; }
  else {
    resetFusion(s); s.scene = "dead"; s.sceneTimer = 0; s.deaths++; s.moving = s.guard = false; s.overlay = null;
    s.events.push({ type: "death" });
  }
}
export function damageHero(s: GameState, damage: number, sourceX: number, sourceY: number) {
  const h = activeHero(s);
  if (h.invulnerable > 0 || s.dashTimer > 0 || h.hp <= 0) return;
  damage = Math.max(1, Math.round(damage * chipEffects(s).incomingDamageMultiplier / (s.coop ? 1 : 1 + (s.assistHp ?? 0) / 100)));
  h.hp = Math.max(0, h.hp - damage); h.invulnerable = s.guard ? 0.12 : 0.5;
  s.hitStop = Math.max(s.hitStop, s.guard ? 0.04 : 0.065);
  if (!s.guard) {
    const length = Math.max(1, Math.hypot(s.x - sourceX, s.y - sourceY));
    s.knockX = (s.x - sourceX) / length * 100; s.knockY = (s.y - sourceY) / length * 100;
  }
  floater(s, s.x, s.y, s.guard ? `BLOCK ${damage}` : String(damage), s.guard ? "#a4d5ed" : "#ff897f");
  effect(s, "hit", s.x, s.y, 10, 0.13);
  s.events.push({ type: "hit", x: s.x, y: s.y, damage, target: "hero" });
  if (h.hp === 0 && trySecondWind(s)) { effect(s, "level", s.x, s.y, 24, .7); return; }
  if (h.hp === 0) {
    if (s.coop) {
      s.coop.downed = true; s.moving = false; s.guard = false; s.vx = s.vy = 0;
      s.charge = s.dashTimer = s.attackTimer = 0;
      s.notice = "Downed! A teammate can hold Interact nearby to revive you."; return;
    }
    const next = nextPartyHero(s);
    if (next) { swapHero(s); s.notice = `${HERO_NAMES[h.id]} is down! ${HERO_NAMES[next]} takes over.`; }
    else {
      resetFusion(s); s.scene = "dead"; s.sceneTimer = 0; s.deaths++; s.moving = false; s.guard = false;
      s.events.push({ type: "death" });
    }
  }
}
const enemyDamage = (s: GameState, baseDamage: number, defense: number, guard: boolean) =>
  Math.max(1, Math.round((baseDamage * (s.difficulty === "hard" ? 1.45 : 1) * (1 + 0.1 * (coopCount(s) - 1)) - defense * 0.5) * (guard ? 0.25 : 1)));
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
    if (remote.hero.hp <= 0 || remote.downed || !sameCampaignMap(s, remote)) continue;
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
  const teammates = coop.remoteHeroes.filter(peer => sameCampaignMap(s, peer));
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
  resetFusion(s); s.scene = "dead"; s.sceneTimer = 0; s.deaths++; s.moving = s.guard = false;
  s.events.push({ type: "death" });
  return true;
}
function melee(s: GameState, charged = false) {
  s.combo = charged ? 3 : s.comboWindow > 0 ? s.combo % 3 + 1 : 1;
  s.attackTimer = s.combo === 3 ? 0.28 : 0.2;
  s.comboWindow = 0.8 + chipEffects(s).comboWindowBonus;
  const reach = charged ? 48 : s.combo === 3 ? 34 : 28;
  effect(s, "slash", s.x, s.y, reach, s.attackTimer, s.faceX, s.faceY);
  const attackId = `melee:${s.nextId++}`;
  let hit = trainingMelee(s, reach, s.faceX, s.faceY);
  for (const e of s.enemies) {
    const dx = e.x - s.x, dy = e.y - s.y, length = Math.hypot(dx, dy);
    if (length > reach + e.radius || (dx * s.faceX + dy * s.faceY) / Math.max(1, length) < -0.1) continue;
    if(s.active === "joe" && s.combo === 3 && knowsField(s,"breaker-knuckle") && e.kind !== "boss") {e.cooldown=Math.max(e.cooldown,1.1);e.windup=0;}
    attackEnemy(s, e, activeHero(s).power * (charged ? 2.8 : [1, 1.15, 1.6][s.combo - 1]), s.faceX, s.faceY, (charged || s.active === "joe" && s.combo === 3) ? 180 : s.combo === 3 ? 125 : 55, attackId);
    hit = true;
  }
  if (charged) { activeHero(s).stamina -= 18; s.notice = "Charged strike! Shields broken."; }
  if (hit) s.hitStop = s.combo === 3 ? 0.07 : 0.045;
}
function projectile(s: GameState, owner: Projectile["owner"], x: number, y: number, dx: number, dy: number,
  speed: number, damage: number, radius: number, beam = false, ttl = beam ? 0.8 : 3.5, damageCap?: number) {
  s.projectiles.push({ id: s.nextId++, owner, damageCap, originX:x, originY:y, x, y, vx: dx * speed, vy: dy * speed, damage,
    radius, beam, hero: owner === "hero" ? s.active : undefined, ttl, hits: [] });
}
function fireKi(s: GameState) {
  if (s.scene === "hub" && !s.training) { s.charge = 0; return; }
  const h = activeHero(s);
  if (consumeFusionSpecial(s)) {
    // A shared energy budget keeps overlapping beams below one-hit damage.
    for (const angle of [-0.12, 0, 0.12]) {
      const dx = s.faceX * Math.cos(angle) - s.faceY * Math.sin(angle);
      const dy = s.faceX * Math.sin(angle) + s.faceY * Math.cos(angle);
      projectile(s, "hero", s.x + dx * 10, s.y + dy * 10, dx, dy, 285, h.power * 2.8, 10, true, .8, .26);
    }
    effect(s, "beam", s.x, s.y, 170, 0.55, s.faceX, s.faceY);
    s.notice = "FUSION: Wayside Supernova!"; s.charge = 0; return;
  }
  if (localFusion(s)) { s.charge = 0; return; }
  if (h.ki >= h.maxKi - 0.01) {
    const signature = signatureDefinition(s);
    h.ki = signature.kiRefund;
    h.stamina = Math.min(h.maxStamina, h.stamina + signature.staminaRestore);
    for (const angle of signature.angles) {
      const dx = s.faceX * Math.cos(angle) - s.faceY * Math.sin(angle);
      const dy = s.faceX * Math.sin(angle) + s.faceY * Math.cos(angle);
      projectile(s, "hero", s.x + dx * 10, s.y + dy * 10, dx, dy, signature.speed,
        h.power * signature.damage * chipEffects(s).kiDamageMultiplier, signature.radius, true, signature.ttl, .7 / signature.angles.length);
    }
    if (s.active === "jon") for (const id of s.party) { const ally = s.heroes[id]; if (ally.hp > 0) ally.hp = Math.min(ally.maxHp, ally.hp + ally.maxHp * .12); }
    if (s.active === "alex") h.invulnerable = Math.max(h.invulnerable, .45);
    if (s.active === "matt") h.stamina = Math.min(h.maxStamina, h.stamina + 25);
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
  const damageScale = 1 + ((e.combatLevel ?? 1) - 1) * .16;
  if (e.phase === 1 && e.hp <= e.maxHp * 0.5) {
    e.phase = 2; startBossBurst(s, e); e.speed = 29; e.cooldown = Math.min(e.cooldown, 0.7);
    effect(s, "level", e.x, e.y, 35, 0.7);
    floater(s, e.x, e.y - 15, "ENRAGED!", "#ff8479");
    s.notice = `${e.miniBoss ? "The Sentinel" : "The Watcher"} is enraged! Keep your guard ready.`;
  }
  if (e.actionTimer > 0) {
    e.actionTimer = Math.max(0, e.actionTimer - dt);
    moveBody(s, e, e.aimX * (e.phase === 2 ? 190 : 160) * dt, e.aimY * (e.phase === 2 ? 190 : 160) * dt, e.radius);
    for (const player of combatTargets(s)) if (Math.hypot(player.x - e.x, player.y - e.y) < e.radius + 10) hurtTarget(s, player, (e.miniBoss ? (e.phase === 2 ? 24 : 18) : (e.phase === 2 ? 32 : 26)) * damageScale, e.x, e.y);
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
            e.phase === 2 ? 92 : 74, (e.miniBoss ? (e.phase === 2 ? 12 : 9) : (e.phase === 2 ? 18 : 14)) * damageScale, 5);
        }
        effect(s, "hit", e.x, e.y, 38, 0.35);
        e.pattern = 0;
      }
    }
    return;
  }
  const dx = target.x - e.x, dy = target.y - e.y, length = Math.max(1, Math.hypot(dx, dy));
  const lead = s.difficulty === "hard" && target.seat === (s.coop?.seat ?? 0) ? .25 : 0;
  const ax = dx + s.vx * lead, ay = dy + s.vy * lead, aimLength = Math.max(1, Math.hypot(ax, ay));
  e.aimX = ax / aimLength; e.aimY = ay / aimLength;
  if (e.cooldown === 0) {
    e.windup = e.pattern === 0 ? (e.phase === 2 ? 0.45 : 0.65) : (e.phase === 2 ? 0.6 : 0.8);
  } else if (length > 36) {
    moveBody(s, e, e.aimX * e.speed * dt, e.aimY * e.speed * dt, e.radius);
  }
}
function updateEnemies(s: GameState, dt: number) {
  for (const e of s.enemies) {
    if (e.hp <= 0 || e.nightAmbient) continue;
    e.hitTimer = Math.max(0, e.hitTimer - dt);
    e.cooldown = Math.max(0, e.cooldown - dt * (s.difficulty === "hard" ? 1.3 : 1));
    e.escapeIframes = Math.max(0, (e.escapeIframes ?? 0) - dt);
    moveBody(s, e, e.kx * dt, e.ky * dt, e.radius);
    e.kx *= Math.max(0, 1 - dt * 9); e.ky *= Math.max(0, 1 - dt * 9);
    const players = combatTargets(s);
    const target = players.reduce<CombatTarget | null>((best, candidate) => !best || Math.hypot(candidate.x - e.x, candidate.y - e.y) < Math.hypot(best.x - e.x, best.y - e.y) ? candidate : best, null);
    if (!target) continue;
    const dx = target.x - e.x, dy = target.y - e.y, length = Math.max(1, Math.hypot(dx, dy));
    if (e.kind === "boss" && !e.woodsBehavior && !isCityBehavior(e.behavior) && updateBossBurst(s, e, dt)) continue;
    if (e.woodsBehavior) {
      updateWoodsEnemy(s,e,dt,target,{ move:(body,dx,dy)=>moveBody(s,body,dx,dy,body.radius), shot:(body,dx,dy,speed,damage,radius=5)=>projectile(s,"enemy",body.x,body.y,dx,dy,speed,damage,radius), hurt:(t,d,x,y)=>hurtTarget(s,t as CombatTarget,d,x,y), targets:()=>combatTargets(s) });
      continue;
    }
    if (e.behavior) {
      (isCityBehavior(e.behavior) ? updateCityEnemy : updateLunarEnemy)(s,e,dt,target,{ summon:(behavior: "turnstile"|"neon-imp",x:number,y:number)=> {const add=addEnemy(s,behavior==="neon-imp"?"shooter":"grunt",x,y);configureCityEnemy(s,add,behavior);}, move: (body,dx,dy)=>moveBody(s,body,dx,dy,body.radius), shot: (body,dx,dy,speed,damage,radius=5)=>projectile(s,"enemy",body.x,body.y,dx,dy,speed,damage,radius), hurt:(t,d,x,y)=>hurtTarget(s,t as CombatTarget,d,x,y), targets:()=>combatTargets(s) });
      continue;
    }
    if (e.kind !== "boss" && e.hitTimer > 0 || (length > (e.kind === "boss" || s.scene === "test" ? 230 : 140) && e.actionTimer === 0 && e.windup === 0)) continue;
    if (e.kind === "boss") updateBoss(s, e, dt, target);
    else updateArchetype(s, e, dt, target);
  }
}
function updateProjectiles(s: GameState, dt: number) {
  const world = getWorld(s.scene, s.room, s.mapId);
  for (const p of s.projectiles) {
    if (s.training && s.localPaused && p.owner === "hero") continue;
    if(p.bounceDistance !== undefined) {
      p.bounceDistance -= Math.hypot(p.vx,p.vy)*dt;
      if(p.bounceDistance<=0) {p.vx=p.bounceVx!;p.vy=p.bounceVy!;delete p.bounceDistance;}
    }
    const x0 = p.x, y0 = p.y, dx = p.vx * dt, dy = p.vy * dt;
    p.ttl -= dt;
    if (isBlocked(world, x0, y0, p.radius)) { p.ttl = 0; continue; }
    // Trace solids first, including thin footprints crossed between endpoints.
    // Actor hits use only the clear segment, so beams cannot damage through props.
    const pieces = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 2));
    let blocked = false;
    for (let n = 1; n <= pieces; n++) {
      let t = n / pieces;
      if (isBlocked(world, x0 + dx * t, y0 + dy * t, p.radius)) {
        let clear = (n - 1) / pieces, solid = t;
        for (let refine = 0; refine < 8; refine++) {
          const middle = (clear + solid) * 0.5;
          if (isBlocked(world, x0 + dx * middle, y0 + dy * middle, p.radius)) solid = middle;
          else clear = middle;
        }
        t = clear; blocked = true;
      }
      p.x = x0 + dx * t; p.y = y0 + dy * t;
      if (blocked) break;
    }
    trainingProjectile(s, p, x0, y0);
    // A segment collision prevents fast beams slipping between fixed-step targets.
    const collides = (x: number, y: number, radius: number) => {
      const dx = p.x - x0, dy = p.y - y0;
      const t = clamp(((x - x0) * dx + (y - y0) * dy) / Math.max(0.001, dx * dx + dy * dy), 0, 1);
      return Math.hypot(x - x0 - dx * t, y - y0 - dy * t) < radius + p.radius;
    };
    if (p.owner === "hero") {
      if(inCity(s)) for(const boss of s.enemies.filter(e=>isCityBehavior(e.behavior)&&e.kind==='boss')) {
        const switches=cityTargets(s).filter(t=>t.id==='city-signal-switch'||t.id.startsWith('city-pedestal-')&&!(boss.phase===2&&t.id==='city-pedestal-2'));
        const relay=switches.find(t=>collides(t.x,t.y-24,18));
        if(relay&&!p.relayHit) {
          p.relayHit=true;
          if(s.coop?.role==='guest') s.events.push({type:'coop-hit',enemyId:boss.id,damage:1,dx:p.vx/Math.hypot(p.vx,p.vy),dy:p.vy/Math.hypot(p.vx,p.vy),force:0,attackId:`relay:${p.id}`,relayId:relay.id,relayKind:'ki',relayX:p.originX,relayY:p.originY});
          else interruptCityBoss(boss);
        }
      }
      for (const e of s.enemies) {
        if (e.hp <= 0 || p.hits.includes(e.id) || !collides(e.x, e.y, e.radius)) continue;
        p.hits.push(e.id);
        const length = Math.max(1, Math.hypot(p.vx, p.vy));
        attackEnemy(s, e, Math.min(p.damage, p.damageCap === undefined ? Infinity : e.maxHp * p.damageCap), p.vx / length, p.vy / length, p.beam ? 85 : 40, `projectile:${p.id}`);
        if (!p.beam) { p.ttl = 0; break; }
      }
    } else if (s.coop?.role !== "guest") {
      const target = combatTargets(s).find(player => collides(player.x, player.y, 7));
      if (target) {
        const guardTime=target.remote?.guardTimer ?? s.guardTimer ?? 1;
        if(p.signal && target.hero.id==='jon' && target.guard && guardTime<=.3) {
          const boss=s.enemies.find(e=>e.behavior==='switchmaster');if(boss) interruptCityBoss(boss);
          s.notice='Jon deflects the relay signal! Switchmaster exposed.';
        } else hurtTarget(s, target, p.damage, x0, y0);
        p.ttl = 0;
      }
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
  return getWorld(s.scene, s.room, s.mapId).exits.find(e => distanceToExit(e, s.x, s.y) < 25 && (!e.requiresClear || s.enemies.length === 0) && (!e.requiresInteraction || hasSpaceFlag(s,e.requiresInteraction)));
}
// Driving the taxi is less precise than walking, so overworld stops get a wider
// trigger zone than on-foot interactions (28).
const OVERWORLD_STOP_RADIUS = 72, OVERWORLD_PROP_RADIUS = 46;
export function interactTarget(s: GameState): InteractTarget | null {
  if (s.film) return null;
  if (s.overlay === "diner") {
    const item = availablePickups(s).find(pickup => pickup.requiresDiner);
    return item ? { id: item.id, name: `Pick up ${item.name}`, kind: "use", x: item.x, y: item.y }
      : { id: "diner-leave", name: "Leave diner", kind: "use", x: s.x, y: s.y };
  }
  if (s.scene === "prologue") return { id: "story-next", name: s.cutscene === PROLOGUE.length - 1 ? "Continue to the taxi" : "Next", kind: "next", x: s.x, y: s.y };
  if (s.dialogue) return { id: "dialog-next", name: s.dialogue.index < s.dialogue.lines.length - 1 ? "Next" : "Continue", kind: "next", x: s.x, y: s.y };
  if (s.scene === "dead" || s.scene === "results" || s.scene === "shift" || s.overlay || s.coop?.downed) return null;
  const candidates: InteractionCandidate[] = [...itemInteractionCandidates(s)];
  if (s.scene === "hub" && !s.training) candidates.push({ ...TRAINING_BOARD, kind: "use", radius: TRAINING_BOARD.range, distance: Math.hypot(s.x - TRAINING_BOARD.x, s.y - TRAINING_BOARD.y) });
  const add = (target: InteractTarget, radius = 28, distance = Math.hypot(s.x - target.x, s.y - target.y)) => candidates.push({ ...target, radius, distance });
  if (s.coop && activeHero(s).hp > 0) for (const peer of s.coop.remoteHeroes) {
    if (peer.hero.hp <= 0 && sameCampaignMap(s, peer)) add({ id: `coop-revive-${peer.seat}`, name: `Hold to revive ${peer.name}`, kind: "use", x: peer.x, y: peer.y }, 32.001);
  }
  const radar = radarPickupTarget(s);
  if (radar) add({ ...radar, name: "Pick up Relic Radar", kind: "use" });
  const quest = hubQuestTarget(s, false);
  if (quest) add({ ...quest, kind: "talk", x: s.x, y: s.y });
  if (s.mapId === "hub") {
    add({ ...ARENA_HUB_POINT, kind: "use" }, 32);
    add({ id: "u8-board", name: "Read quest board", kind: "talk", x: 448, y: 248 }, 32);
  }
  for (const room of INTERIORS) if (s.mapId === room.parent) add({ id: `${room.id}-door`, name: `Enter ${room.name}`, kind: "use", x: room.x, y: room.y }, s.scene === "overworld" ? 46 : 32);
  const interior = interiorDefinition(s.mapId);
  if (interior) for (const p of getWorld(s.scene, s.room, s.mapId).props) if (p.id.endsWith("-ledger") || p.id.endsWith("-keeper")) add({id:p.id,name:p.kind === "npc" ? `Talk to ${p.label}` : "Read local ledger",kind:"talk",x:p.x+p.w/2,y:p.y+p.h+12},36);
  for (const target of gateTargets(s)) add(target, 34);
  for (const target of cityTargets(s)) add(target, 36);
  for (const target of woodsTargets(s)) add(target, 34);
  for (const target of spaceTargets(s)) add(target, 34);
  for (const pickup of availablePickups(s)) add({ id: pickup.id, name: `Pick up ${pickup.name}`, kind: "use", x: pickup.x, y: pickup.y });
  if (s.scene === "dungeon" || s.scene === "realm") {
    const world = getWorld(s.scene, s.room, s.mapId);
    for (const prop of world.props) {
      if (prop.kind === "chest" && !s.clearedRooms.includes(prop.id)) add({ id: prop.id, name: "Open supply cache", kind: "use", locked: s.enemies.length > 0, x: prop.x + prop.w / 2, y: prop.y + prop.h / 2 });
      if (!interior && prop.kind === "npc") add({ id: "scout", name: `Talk to ${prop.label ?? "the stranded scout"}`, kind: "talk", x: prop.x + prop.w / 2, y: prop.y + prop.h });
    }
    for (const door of world.exits) if ((!door.requiresClear || s.enemies.length === 0) && (!door.requiresInteraction || hasSpaceFlag(s,door.requiresInteraction))) add({ id: door.id, name: door.name, kind: door.target === "overworld" ? "taxi" : "use", x: door.x + door.w / 2, y: door.y + door.h / 2 }, 25, distanceToExit(door, s.x, s.y));
  }
  const points = s.scene === "overworld" ? campaignLocations(s) : s.scene === "hub" ? HUB_POINTS : [];
  for (const point of points) {
    if (point.id === "station" && !(s.scene === "hub" && (s.campaignMilestones.includes("city-complete") || s.coop?.worldCampaignMilestones?.includes("city-complete")))) continue;
    const npc = point.id === "alex" || point.id === "jon";
    const taxi = point.id === "taxi" || s.scene === "overworld";
    add({ ...point, ...(point.id === "station" ? {y:224} : {}), name: npc ? `Talk to ${point.name}` : point.id === "taxi" ? "Enter taxi" : s.scene === "overworld" ? `Leave taxi · ${point.name}` : point.name,
      kind: npc ? "talk" : taxi ? "taxi" : "use" }, s.scene === "overworld" ? OVERWORLD_STOP_RADIUS : undefined);
  }
  if (s.scene === "overworld") {
    if (!s.coop) for (const stop of COUNTY_STOPS) add({ ...stop, kind: "talk" }, OVERWORLD_PROP_RADIUS);
    const sign=getWorld(s.scene,s.room,s.mapId,!!s.coop && (s.coop.protocolVersion ?? 1)<6).props.find(p=>p.id==="roadside-lore-sign");
    if(sign)add({id:sign.id,name:"Read roadside sign",kind:"use",x:sign.x+sign.w/2,y:sign.y+sign.h},OVERWORLD_PROP_RADIUS);

  }
  return selectInteractionTarget(candidates, s.x, s.y, s.faceX, s.faceY);
}
export function hostileWithinMeleeReach(s: GameState): boolean {
  const nextCombo = s.comboWindow > 0 ? s.combo % 3 + 1 : 1, reach = nextCombo === 3 ? 34 : 28;
  return s.enemies.some(enemy => {
    const dx = enemy.x - s.x, dy = enemy.y - s.y, distance = Math.hypot(dx, dy);
    return enemy.hp > 0 && distance <= reach + enemy.radius && (dx * s.faceX + dy * s.faceY) / Math.max(1, distance) >= -.1;
  });
}
export const nonCombatContext = (s: GameState) => !!s.dialogue || s.scene === "prologue" || s.scene === "overworld" || s.scene === "hub" && !s.training || !!s.overlay;
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
  s.meleeHolding = false; s.meleeCharge = 0; s.attackTimer = s.dashTimer = 0; s.guard = false; s.knockX = s.knockY = 0;
  // Keep the existing notice channel useful for screen readers and save checks.
  s.notice = lines[0];
}
function travel(s: GameState, door: WorldExit) {
  const leavingInterior = !!interiorDefinition(s.mapId);
  if (door.id === "moon-shack-lift" || door.id === "moon-ring-lift") record(s.solvedInteractions,door.id);
  if (door.target === "realm") beginRealmShift(s);
  else if (door.targetMapId) {
    if (enterCampaignMap(s, door.targetMapId)) { s.x = door.entryX; s.y = door.entryY; if (leavingInterior) { s.checkpointMapId = door.targetMapId; s.events.push({type:"checkpoint",id:"interior-return"}); } }
  } else {
    enterScene(s, typeof door.target === "number" ? "dungeon" : door.target,
      typeof door.target === "number" ? door.target : 0, door.targetMapId);
    if (s.scene !== "results" && (!door.targetMapId || s.mapId === door.targetMapId)) { s.x = door.entryX; s.y = door.entryY; }
  }
  s.previousInput.attack = s.previousInput.interact = true;
}
export function interact(s: GameState, selected?: InteractTarget | null): void {
  if (s.coop && (s.coop.downed || activeHero(s).hp <= 0)) return;
  const target = selected === undefined ? interactTarget(s) : selected;
  if (!target) return;
  if (target.id === "u1-relic-radar") { collectRadar(s); interactItem(s, target.id); return; }
  if (target.id.startsWith("u8-quest-")) { openHubQuest(s, target.id); return; }
  if (target.id === "u8-board") { tickHubQuests(s); s.overlay = "quest-board"; return; }
  if (target.id === "u5-arena") { s.overlay = "arena"; s.moving = false; s.vx = s.vy = 0; return; }
  if (target.id === TRAINING_BOARD.id) { startTraining(s); return; }
  if (target.id.startsWith('locks-')) {
    const gate = obstaclesForState(s).find(g => g.id === target.id || g.rewardId === target.id);
    if (!gate) return;
    if (target.id === gate.id) { clearHeroObstacle(s,target.id); return; }
    if (!isObstacleCleared(s,gate.id) || Math.hypot(s.x-gate.rewardAnchor.x,s.y-gate.rewardAnchor.y)>=34) return;
    if (s.coop?.role === 'guest') { s.notice='The party host opens shared caches and leads shortcuts.'; return; }
    if (s.solvedInteractions.includes(gate.rewardId) || s.coop?.worldSolvedInteractions?.includes(gate.rewardId)) {
      if (s.mapId.startsWith('moon-')) { spaceInteract(s,'space-home'); return; }
      enterScene(s,'hub'); s.checkpointMapId='hub'; s.events.push({type:'checkpoint',id:'personal-locks-shortcut'}); return;
    }
    s.solvedInteractions.push(gate.rewardId); s.clearedRooms.push(gate.rewardId); if (!s.coop) s.candy += 12;
    openDialogue(s,'Hidden ledger',[gate.lore,'Twelve candy packed for the road. Inspect the cache again for a return route. Lunar caches use the crew’s return flight.']);
    s.events.push({type:'checkpoint',id:gate.rewardId}); return;
  }
  const countyStop = COUNTY_STOPS.find(stop => stop.id === target.id);
  if (countyStop) { openDialogue(s, countyStop.name, [countyStop.text]); return; }
  if (target.id === "story-next") { advanceStory(s); return; }
  if (target.id === "dialog-next") { advanceDialogue(s); return; }
  if (s.coop?.role === "guest" && s.mapId === "hub" && (target.id === "home" || target.id === "interior-home-door")) {
    s.overlay = "home"; s.vx = s.vy = 0; s.moving = false; s.notice = ""; return;
  }
  if (target.id.endsWith("-door") || target.id === "diner-entry") {
    const room = INTERIORS.find(room => `${room.id}-door` === target.id || target.id === "diner-entry" && room.theme === "diner");
    if (room) {
      if (s.coop?.role === "guest") { s.notice = "The party host leads everyone through doors."; return; }
      if (enterCampaignMap(s, room.id)) {
        s.previousInput.attack = s.previousInput.interact = true;
        s.events.push({type:"checkpoint",id:`${room.id}-entered`});
      }
      return;
    }
  }
  const interior = interiorDefinition(s.mapId);
  if (interior && (target.id.endsWith("-ledger") || target.id.endsWith("-keeper"))) {
    if (target.id.endsWith("-keeper")) { if (interior.id === "interior-home") restAtHome(s); else refillCrew(s); }
    openDialogue(s, target.id.endsWith("-keeper") ? "Caretaker" : "Local ledger", [interior.lore, ...(interior.theme === "station" ? [s.clearedRooms.includes("realm-0") ? campaignHandoff(s) : "Wayside Station is safe. Alex and Jon are holding the town."] : [])]); return;
  }
  if (target.id === "diner-leave") { s.overlay = null; s.insideDiner = false; return; }
  if (interactItem(s, target.id)) return;
  if (target.id.startsWith("pickup-")) { collectPickup(s, target.id); return; }
  if (target.id.startsWith("coop-revive-")) return;
  if (target.id === "roadside-lore-sign") { openDialogue(s, "Wayside road sign", ["Blast Site: east. Wayside: west. If the sky starts flickering, get the crew home.", "The old road remembers every late-night drive. Keep a little sweetness for the trip."]); return; }
  if (target.id === "space-air-option") {spaceInteract(s,target.id);return;}
  if (s.scene === "hub" && target.id === "station" && cityInteract(s, target.id)) return;
  if(s.coop?.role==='guest' && (target.id.startsWith('city-anchor-')||target.id==='city-signal-switch'||target.id.startsWith('city-pedestal-'))) {
    s.events.push({type:'coop-hit',enemyId:0,damage:1,dx:0,dy:0,force:0,attackId:`relay-use:${s.nextId++}`,relayId:target.id,relayKind:'interact'});return;
  }
  if (s.coop?.role === "guest" && target.kind !== "talk") return;
  if (woodsInteract(s,target.id) || cityInteract(s,target.id) || spaceInteract(s,target.id)) return;
  if (s.scene === "realm" || s.scene === "dungeon") {
    if (target.id.startsWith("loot-")) {
      if (s.clearedRooms.includes(target.id)) return;
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
    const door = getWorld(s.scene, s.room, s.mapId).exits.find(exit => exit.id === target.id);
    if (door) travel(s, door);
    return;
  }
  if (target.locked) { s.notice = `${target.name}: taken over. A later chapter will open this route.`; return; }
  if (s.scene === "overworld") {
    if (!canEnter(s, target.id)) { s.notice = "Complete the previous chapter to open this route."; return; }
    const area = getArea(target.id);
    if (!area?.available) { openDialogue(s, "Next chapter", [target.id === "city" ? "The Prism Lens exposes Old City’s Eggworks. Chapter 4 continues here next. The Moon stays open for free return visits." : WOODS_HANDOFF]); return; }
    enterCampaignMap(s, area.mapIds[0]);
    s.previousInput.attack = s.previousInput.interact = true; return;
  }
  if (target.id === "taxi") { enterScene(s, "overworld"); s.previousInput.attack = s.previousInput.interact = true; return; }
  if (target.id === "shop" || target.id === "home") { s.overlay = target.id; s.vx = s.vy = 0; s.moving = false; s.notice = ""; return; }
  const dialogue: Record<string, string> = {
    station: s.clearedRooms.includes("realm-0") ? campaignHandoff(s) : "Wayside Station is safe. Alex and Jon are holding the town while Joe and Matt investigate the Blast Site.",
    bbq: "The grill is still warm. The crew will finish dinner when Wayside is safe.",
    alex: "Alex: The station is secure. I can tag in when you need help. There are supplies hidden off the main route.",
    jon: "Jon: HOME restores the whole crew. Stock up before you go, and don't forget to tag your partner in.",
  };
  openDialogue(s, target.id === "alex" ? "Alex" : target.id === "jon" ? "Jon" : target.name, [dialogue[target.id] ?? "Wayside is quiet... for now."]);
}
export function toggleParty(s: GameState, id: HeroId, fromCharacter = false): boolean {
  if (s.coop && activeHero(s).hp <= 0) return false;
  if ((!fromCharacter && ((s.scene !== "hub" && !inCity(s)) || s.overlay !== "home")) || s.scene === "dead" || !s.unlockedHeroes.includes(id)) return false;
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
function checkpointRecovery(s: GameState) {
  for (const hero of Object.values(s.heroes)) {
    if (hero.hp > 0) hero.hp = Math.min(hero.maxHp, hero.hp + 12);
    hero.ki = Math.min(hero.maxKi, hero.ki + 8);
  }
}
export function enforceCountyPartyBounds(s: GameState) {
  if(s.coop && (s.coop.protocolVersion ?? 1) < 6 && s.scene === "overworld" && (s.x > 1878 || s.y > 918)) {
    s.x=208; s.y=480; s.vx=s.vy=0;
    s.notice="Party travel returns to the original county roads. New districts are solo-only in this release.";
  }
}
export function step(s: GameState, input: Input, delta: number): void {
  enforceCountyPartyBounds(s);
  updateNightOverworld(s, delta);
  markSeenGates(s);
  const dt = clamp(delta, 0, 0.05);
  // Keep physical button edges separate from the command forwarded to co-op.
  // Pad A sets both flags, while touch/J must synthesize a held revive command.
  const physicalInput = { ...input };
  s.events.length = 0; s.time += dt; s.sceneTimer += dt;
  if(s.fuelGag>=0) s.fuelGag=Math.min(4,s.fuelGag+dt);
  if(s.film) {
    const ended=tickSpaceFilm(s,input,dt); s.previousInput={...physicalInput};
    if(ended) {
      const action=completeSpaceFilm(s,ended);
      if(action==='moon') {enterScene(s,"dungeon",0,"moon-m01");spaceCheckpoint(s);}
      if(action==='earth') {enterScene(s,"dungeon",0,"space-launch");s.spaceOutfit=false;refillCrew(s);spaceCheckpoint(s);}
    }
    return;
  }
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
  if (s.scene === "prologue") {
    if (physicalInput.guard && !s.previousInput.guard) requestPrologueSkip(s);
    if (s.prologueExit !== undefined) {
      s.prologueExit += dt;
      if (s.prologueExit >= PROLOGUE_FADE) {
        enterScene(s, "overworld"); s.prologueExit = undefined;
        s.previousInput = { ...physicalInput }; return;
      }
    }
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
  tickArena(s, dt); tickHubQuests(s);
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
  tickFusion(s, dt);
  if (input.fusion && !s.previousInput.fusion && !s.localPaused && !s.dialogue && !s.overlay && !s.film) requestFusion(s);
  tickLunar(s,dt);
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
  const practicing = !!s.training;
  const combat = practicing || !interiorDefinition(s.mapId) && (s.scene === "arena" || s.scene === "test" || s.scene === "dungeon" || s.scene === "realm");
  s.attackTimer = Math.max(0, s.attackTimer - dt);
  s.comboWindow = Math.max(0, s.comboWindow - dt);
  s.dashTimer = Math.max(0, s.dashTimer - dt);
  s.swapCooldown = Math.max(0, s.swapCooldown - dt);
  const passives = chipEffects(s);
  for (const h of Object.values(s.heroes)) {
    if (h.id === s.active && h.hp > 0 && !s.enemies.some(e => e.hp > 0 && Math.hypot(e.x - s.x, e.y - s.y) < 100)) h.hp = Math.min(h.maxHp, h.hp + passives.passiveHealPerSecond * dt);
    h.invulnerable = Math.max(0, h.invulnerable - dt);
    h.stamina = Math.min(h.maxStamina, h.stamina + dt * 20);
    if (!(h.id === s.active && input.ki)) h.ki = Math.min(h.maxKi, h.ki + dt * 2.5);
  }
  if (input.swap && !previous.swap) requestSwap(s);
  const h = activeHero(s);
  if(onMoon(s) && input.guard) brakeBound(s);
  s.guard = combat && input.guard && s.dashTimer === 0 && !input.ki;
  s.guardTimer = s.guard ? (s.guardTimer ?? 0) + dt : 0;
  const length = Math.hypot(input.x, input.y);
  s.moving = length > 0.1;
  if (s.moving && s.dashTimer === 0) {
    const angle = Math.round(Math.atan2(input.y, input.x) / (Math.PI / 4)) * Math.PI / 4;
    s.faceX = Math.cos(angle); s.faceY = Math.sin(angle);
  }
  if (combat && input.dash && !previous.dash && s.dashTimer === 0 && h.stamina >= 25 * passives.dashStaminaMultiplier) {
    h.stamina -= 25 * passives.dashStaminaMultiplier; s.dashTimer = 0.18; h.invulnerable = Math.max(h.invulnerable, 0.23);
    s.guard = false; s.charge = 0; s.meleeCharge = 0; s.meleeHolding = false;
    if(onMoon(s)) {s.boundTimer=.4;tryBoundLink(s);}
    effect(s, "dash", s.x, s.y, 14, 0.23, s.faceX, s.faceY);
  }
  if (s.scene === "overworld") {
    const strength = Math.min(1, length), driveX = length > 0.1 ? input.x / length * (input.dash ? 240 : input.guard ? 80 : 160) * strength : 0;
    const driveY = length > 0.1 ? input.y / length * (input.dash ? 240 : input.guard ? 80 : 160) * strength : 0;
    const ease = 1 - Math.exp(-dt * (s.moving ? 6.5 : 9));
    s.vx += (driveX - s.vx) * ease; s.vy += (driveY - s.vy) * ease;
    const oldX = s.x, oldY = s.y;
    if(s.coop && (s.coop.protocolVersion ?? 1) < 6 && (s.x > 1850 && s.vx > 0 || s.y > 890 && s.vy > 0)) s.notice = "New county districts and world routes are solo-only in this release. The original county roads stay open to your party.";
    moveBody(s, s, s.vx * dt, s.vy * dt, 10);
    if (s.x === oldX) s.vx *= 0.5;
    if (s.y === oldY) s.vy *= 0.5;
    s.moving = Math.hypot(s.vx, s.vy) > 3;
  } else {
    const speed = (s.dashTimer > 0 ? (onMoon(s) ? 324 : 240) : s.guard ? 29 : input.ki && combat ? 37 : !combat && input.dash ? 112 : 70) * pickupBuffs(s).speed * passives.moveSpeedMultiplier * woodsMovementScale(s);
    const strength = s.dashTimer > 0 ? 1 : s.moving ? Math.min(1, length) : 0;
    const moveX = s.dashTimer > 0 ? s.faceX : input.x / Math.max(0.001, length);
    const moveY = s.dashTimer > 0 ? s.faceY : input.y / Math.max(0.001, length);
    s.vx = moveX * speed * strength; s.vy = moveY * speed * strength;
    if(!advanceBoundLink(s,dt)) moveBody(s, s, (s.vx + s.knockX) * dt, (s.vy + s.knockY) * dt, 7);
    s.knockX *= Math.max(0, 1 - dt * 10); s.knockY *= Math.max(0, 1 - dt * 10);
  }
  tickOpening(s, dt);
  tickTraining(s, dt);
  if (practicing && !s.training) { s.charge = 0; return; }
  walkingPickup(s);
  if (!combat) {
    s.charge = 0;
    if (usePressed) interact(s, s.contextAttack.target);
    else if (attackPressed && attackAction === "attack" && s.scene !== "overworld" && s.attackTimer === 0 && !input.ki) melee(s);
    return;
  }
  if (attackPressed && attackAction === "attack" && s.dashTimer === 0 && !s.guard && !input.ki) {
    if (s.attackTimer === 0) melee(s); s.meleeHolding = true; s.meleeCharge = 0;
  }
  if (s.meleeHolding) {
    if (s.dashTimer > 0 || s.guard || input.ki || dialogueControlsSuppressed || h.hp <= 0) { s.meleeHolding = false; s.meleeCharge = 0; }
    else if (input.attack) {
      s.meleeCharge = Math.min(1.2, s.meleeCharge + dt);
      if (s.meleeCharge >= .3 && Math.floor(s.time * 12) !== Math.floor((s.time - dt) * 12)) effect(s, "charge", s.x, s.y, 12 + s.meleeCharge * 10, .14);
    } else {
      if (s.meleeCharge >= .6 && h.stamina >= 18 && s.attackTimer === 0) melee(s, true);
      s.meleeHolding = false; s.meleeCharge = 0;
    }
  }
  if (usePressed) {
    const scene = s.scene, room = s.room;
    interact(s, s.contextAttack.target);
    if (s.film || s.overlay || s.scene !== scene || s.room !== room || s.dialogue && !s.coop) return;
    if (s.dialogue) { dialogueControlsSuppressed = true; input = idleInput(); }
  }
  if (!dialogueControlsSuppressed && input.ki && s.dashTimer === 0 && !s.guard) {
    s.charge += dt; h.ki = Math.min(h.maxKi, h.ki + dt * 32 * pickupBuffs(s).charge * passives.kiChargeMultiplier);
  }
  if (!dialogueControlsSuppressed && !input.ki && previous.ki && s.dashTimer === 0) fireKi(s);
  if (practicing) { updateProjectiles(s, dt); return; }
  tickWoodsField(s, input.ki);
  const hadEnemies = s.enemies.length > 0;
  if (s.coop?.role !== "guest") { updateEnemies(s, dt); separateBodies(s, dt); }
  updateProjectiles(s, dt);
  if (s.coop?.role === "guest") return;
  if (checkCoopWipe(s)) return;
  s.enemies = s.enemies.filter(e => e.hp > 0);
  if (hadEnemies && s.enemies.length === 0 && s.scene === "test") s.notice = "Training yard clear. Joe and Matt are ready!";
  if (hadEnemies && s.enemies.length === 0 && s.scene === "dungeon") {
    const id = s.mapId;
    if (!s.clearedRooms.includes(id)) {
      s.clearedRooms.push(id);
      if (!s.coop) checkpointRecovery(s);
      if (id === `blast-${GATEKEEPER_ROOM}` && !s.bosses.includes("blast-gatekeeper")) s.bosses.push("blast-gatekeeper");
      if (id === `blast-${WATCHER_ROOM}`) {
        if (!s.bosses.includes("blast-watcher")) s.bosses.push("blast-watcher");
        if (!s.areas.includes("blast")) s.areas.push("blast");
      }
    }
    if(cityClear(s)) return;
    if(inWoods(s)) { clearWoods(s); return; }
    if(onMoon(s)) {
      if(s.room===5) {record(s.bosses,"moon-cheese-inspector");spaceCheckpoint(s);refillCrew(s);}
      if(s.room===7) record(s.bosses,"moon-apogee-warden");
      s.events.push({type:"checkpoint",id});s.notice="Lunar encounter clear. The next relay route is open.";
      return;
    }
    if (!s.coop) grantCheckpointChip(s, id);
    s.events.push({ type: "checkpoint", id });
    s.notice = s.room === WATCHER_ROOM ? "The Watcher falls! Chapter 1 is clear. Head through the eastern rift."
      : s.room === GATEKEEPER_ROOM ? "The Sentinel falls. The gate to the crater is open!"
      : s.room >= 8 ? "Side trail clear! Open the supply cache before returning."
      : "Zone clear! The eastern gate is open. Explore side trails for supplies.";
  }
  if (hadEnemies && s.enemies.length === 0 && s.scene === "realm") {
    if (!s.clearedRooms.includes("realm-0")) {
      s.clearedRooms.push("realm-0");
      if (!s.coop) checkpointRecovery(s);
      if (!s.areas.includes("eightbit-realm")) s.areas.push("eightbit-realm");
    }
    s.chapter = Math.max(s.chapter, 2);
    if (!s.campaignMilestones.includes("realm-0")) s.campaignMilestones.push("realm-0");
    s.events.push({ type: "checkpoint", id: "realm-0" });
    s.notice = "The path is clear. Return to Wayside: Alex has a lead on Hollow Woods.";
  }
  // Walking through an open boundary changes zones without a button press.
  if ((s.scene === "dungeon" || s.scene === "realm") && s.transitionCooldown === 0) {
    const world = getWorld(s.scene, s.room, s.mapId), door = availableExit(s);
    if (door && (s.x < 20 || s.x > world.width - 20 || s.y < 20 || s.y > world.height - 20)) travel(s, door);
  }
}
