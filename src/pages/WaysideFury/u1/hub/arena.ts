import { addEnemy, enterScene, type GameState, type HeroState, type HeroId } from "../../game/sim.ts";
import { isBlocked } from "../../game/world.ts";
import { ARENA_WORLD } from "./arenaWorld.ts";
import { ARENA_MAX_WAVES, ARENA_MAX_ELAPSED_MS, arenaWaveEnemyCount, arenaKillsThroughWave, arenaScore, type ArenaRunReceipt } from "../../../../../server/shared/waysideFury/u1Arena.js";

export interface ArenaRuntime {
  id: string; status: "running" | "finished"; mode: "solo" | "coop"; players: number;
  wave: number; wavesCleared: number; kills: number; elapsedMs: number; intermission: number;
  spawned: boolean; modifier: string; reason: "retired" | "defeated" | null;
}
export interface ArenaPersonal { soloBest: number; coopBest: number; runs: number }
export const freshArenaSave = (): ArenaPersonal => ({ soloBest: 0, coopBest: 0, runs: 0 });
export const ARENA_MODIFIERS = ["Iron hide", "Quick feet", "Crossfire", "Heavy hitters", "Boss round"] as const;
export function arenaReceipt(run: ArenaRuntime): ArenaRunReceipt {
  return { version: 1, mode: run.mode, wavesCleared: run.wavesCleared, kills: run.kills,
    elapsedMs: Math.floor(run.elapsedMs), players: run.players };
}
export function prepareArenaPlayer(s: GameState): void {
  if (s.arenaVitals) return;
  s.arenaLead = s.active;
  s.arenaVitals = Object.fromEntries(Object.entries(s.heroes).map(([id, h]) => [id, { ...h }])) as Record<HeroId, HeroState>;
  for (const h of Object.values(s.heroes)) { h.hp = h.maxHp; h.ki = h.maxKi; h.stamina = h.maxStamina; }
  if (s.coop) { s.coop.downed = false; s.coop.reviveProgress = 0; }
}
export function recordArenaResult(s: GameState): void {
  const run = s.arena;
  if (!run || run.status !== "finished" || !s.arenaVitals || s.arenaRecorded === run.id) return;
  s.arenaRecorded = run.id;
  const save = s.hubArena ??= freshArenaSave(), score = arenaScore(run.wavesCleared, run.kills);
  if (run.mode === "solo") save.soloBest = Math.max(save.soloBest, score);
  else save.coopBest = Math.max(save.coopBest, score);
  save.runs++;
  if (s.arenaVitals) {
    for (const [id, before] of Object.entries(s.arenaVitals)) Object.assign(s.heroes[id as HeroId], before);
    const originalLead = s.arenaLead;
    const living = s.party.find(id => s.heroes[id].hp > 0);
    if (originalLead && s.party.includes(originalLead) && s.heroes[originalLead].hp > 0) s.active = originalLead;
    else if (living) s.active = living;
    else if (originalLead && s.heroes[originalLead].hp > 0) { s.party = [originalLead, ...s.party.filter(id => id !== originalLead)].slice(0, 2); s.active = originalLead; }
    delete s.arenaVitals; delete s.arenaLead;
  }
  if (s.coop) { s.coop.downed = false; s.coop.reviveProgress = 0; }
  s.events.push({ type: "arena-finish", receipt: arenaReceipt(run), score });
}
export function startArena(s: GameState): boolean {
  if (s.coop?.role === "guest" || s.mapId !== "hub" || s.coop && (s.coop.protocolVersion ?? 6) < 6 || s.arena?.status === "running") return false;
  prepareArenaPlayer(s);
  enterScene(s, "arena", 0, "u5-arena");
  s.arena = { id: `${s.rngSeed}:${s.nextId++}:${Math.floor(s.time * 1000)}`, status: "running", mode: s.coop ? "coop" : "solo",
    players: s.coop?.playerCount ?? 1, wave: 1, wavesCleared: 0, kills: 0, elapsedMs: 0,
    intermission: 3, spawned: false, modifier: ARENA_MODIFIERS[0], reason: null };
  s.notice = "Tournament begins in 3… Stay sharp. Every wave gets stronger.";
  return true;
}
export function finishArena(s: GameState, reason: "retired" | "defeated" = "retired"): boolean {
  if (!s.arena || s.arena.status !== "running" || s.coop?.role === "guest") return false;
  if (s.arena.spawned) {
    s.arena.kills = arenaKillsThroughWave(s.arena.wavesCleared) + arenaWaveEnemyCount(s.arena.wave) - s.enemies.filter(e => e.hp > 0).length;
    if (!s.enemies.some(e => e.hp > 0)) s.arena.wavesCleared = s.arena.wave;
  }
  s.arena.status = "finished"; s.arena.reason = reason;
  enterScene(s, "hub"); s.x = 624; s.y = 248; s.overlay = "arena";
  recordArenaResult(s); s.notice = "Tournament finished. Your crew is ready for the road.";
  return true;
}
export function tickArena(s: GameState, dt: number): void {
  const run = s.arena;
  if (!run || run.status !== "running" || s.coop?.role === "guest") return;
  if (s.scene === "dead") { finishArena(s, "defeated"); return; }
  if (s.scene !== "arena") return;
  run.elapsedMs = Math.min(ARENA_MAX_ELAPSED_MS, run.elapsedMs + dt * 1000);
  if (run.elapsedMs >= ARENA_MAX_ELAPSED_MS || run.wavesCleared >= ARENA_MAX_WAVES) { finishArena(s); return; }
  run.players = Math.max(run.players, s.coop?.playerCount ?? 1);
  if (run.spawned) {
    run.kills = arenaKillsThroughWave(run.wavesCleared) + arenaWaveEnemyCount(run.wave) - s.enemies.filter(e => e.hp > 0).length;
    if (s.enemies.some(e => e.hp > 0)) return;
    run.wavesCleared = run.wave; run.wave++; run.spawned = false; run.intermission = 2;
    run.modifier = ARENA_MODIFIERS[(run.wave - 1) % ARENA_MODIFIERS.length];
    s.projectiles = [];
    s.notice = `Wave ${run.wavesCleared} clear! Next: ${run.modifier}.`;
    return;
  }
  run.intermission = Math.max(0, run.intermission - dt);
  if (run.intermission > 0) return;
  const count = arenaWaveEnemyCount(run.wave), modifier = (run.wave - 1) % 5;
  for (let n = 0; n < count; n++) {
    const angle = n / count * Math.PI * 2, x = 320 + Math.cos(angle) * 206, y = 224 + Math.sin(angle) * 144;
    const kind = n === 0 && run.wave % 5 === 0 ? "boss" : (n + run.wave) % (modifier === 2 ? 2 : 4) === 0 ? "shooter" : "grunt";
    const players = [{ x: s.x, y: s.y }, ...(s.coop?.remoteHeroes ?? []).filter(peer => peer.scene === "arena" && peer.room === s.room && peer.hero.hp > 0)];
    const radius = kind === "boss" ? 16 : 7;
    const candidates = [{ x, y }, ...Array.from({ length: 45 }, (_, index) => ({ x: 112 + index % 9 * 52, y: 96 + Math.floor(index / 9) * 56 }))];
    const spawn = candidates.find(point => !isBlocked(ARENA_WORLD, point.x, point.y, radius)
      && players.every(player => Math.hypot(player.x - point.x, player.y - point.y) >= 56)
      && s.enemies.every(enemy => Math.hypot(enemy.x - point.x, enemy.y - point.y) >= radius + enemy.radius + 4));
    if (!spawn) continue;
    const enemy = addEnemy(s, kind, spawn.x, spawn.y);
    const hpScale = 1.6 + (run.wave - 1) * .13 + (modifier === 0 ? .4 : 0) + (modifier === 3 ? .2 : 0);
    const partyPower = Math.max(...Object.values(s.heroes).map(hero => hero.power), ...(s.coop?.remoteHeroes ?? []).map(peer => peer.hero.power));
    const playerScale = 1 + (kind === "boss" ? .75 : .6) * (run.players - 1);
    enemy.baseMaxHp = Math.min(900_000 / playerScale, Math.max((enemy.baseMaxHp ?? enemy.maxHp / playerScale) * hpScale, partyPower * (kind === "boss" ? 20 : 5)));
    enemy.hp = enemy.maxHp = enemy.baseMaxHp * playerScale;
    enemy.archetype = kind === "boss" ? undefined : ["charger", "kiter", "shield", "swarm", "ambusher"][n % 5] as NonNullable<typeof enemy.archetype>;
    enemy.speed *= 1 + Math.min(1, (run.wave - 1) * .035) + (modifier === 1 ? .4 : 0);
    enemy.cooldown = Math.max(.25, enemy.cooldown - run.wave * .015);
    if (kind === "grunt") enemy.sprite = ["zombie", "pumpkin", "ghost"][run.wave % 3] as "zombie" | "pumpkin" | "ghost";
  }
  run.spawned = true; s.notice = `Wave ${run.wave} · ${run.modifier}`;
}
