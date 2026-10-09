import { grantCheckpointChip } from "./u1/items/pickups.ts";
import { sanitizeItemsNamespace } from "../../../../server/shared/waysideFury/u1Items.js";
import { itemsGear } from "./sim.ts";
import { record, refillCrew } from "./chapters/ch3.ts";
import { onMoon } from "./lunar.ts";
import { campaignHandoff } from "./campaign.ts";
import { enterCampaignMap, enterScene, newGame, createHero, HERO_IDS, type HeroId, type HeroState, type GameState } from "./sim.ts";
import { HUB_WORLD } from "./world.ts";
import { SAVE_VERSION, sanitizeSave, mergeReceipts, ticketDelta } from "../../../../server/shared/waysideFury/save.js";
import type { SaveData, ProgressReceipt } from "../../../../server/shared/waysideFury/save.js";
export { mergeReceipts, ticketDelta };
export type { SaveData, HomeSnapshot, ProgressReceipt, SaveSettings, Gear, CharacterProgress } from "../../../../server/shared/waysideFury/save.js";
export const SAVE_KEY = "wayside-fury-save";

export function progressReport(s: GameState, previous?: ProgressReceipt | null): { score: number; receipt: ProgressReceipt } {
  const reported = mergeReceipts(previous);
  const current: ProgressReceipt = {
    areas: [...new Set(s.areas)], bosses: [...new Set(s.bosses)], rooms: [...new Set(s.clearedRooms)],
    level: s.character.level,
    ...(s.foundItems.length ? { foundItems: [...new Set(s.foundItems)] } : {}),
  };
  const score = ticketDelta(current, reported);
  return { score: Math.min(100000, Math.max(0, Math.floor(score))), receipt: mergeReceipts(reported, current) };
}
export function parseSave(raw: unknown): SaveData | null { return sanitizeSave(raw).save ?? null; }
export function readSave(key = SAVE_KEY): SaveData | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw || raw.length > 65536) return null;
    return parseSave(JSON.parse(raw));
  } catch { return null; }
}
// Building a snapshot is separate from device storage: a full or blocked device
// can still save to the account. The legacy writer keeps its failure contract.
export function makeSave(s: GameState, previous: SaveData | null, home = false, receipt?: ProgressReceipt): SaveData | null {
  const heroes = s.coop?.syncedLevel !== undefined ? Object.fromEntries(HERO_IDS.map(id => {
    const current = s.heroes[id], personal = createHero(id, s.character, itemsGear(s));
    return [id, { ...personal, hp: personal.maxHp * current.hp / current.maxHp, ki: personal.maxKi * current.ki / current.maxKi, stamina: current.stamina }];
  })) : s.heroes;
  return parseSave({
    worldCycleSeconds: s.worldCycleSeconds, version: SAVE_VERSION, u1: sanitizeItemsNamespace(s.u1), campaignMilestones: s.campaignMilestones, solvedInteractions: s.solvedInteractions,
    completedCinematics: s.completedCinematics, checkpointMapId: s.coop?.role === "guest" ? previous?.checkpointMapId ?? "hub" : s.checkpointMapId, chapter: s.chapter, heroes, active: s.active, party: s.party, candy: s.candy,
    unlockedHeroes: s.unlockedHeroes, areas: s.areas, bosses: s.bosses, clearedRooms: s.clearedRooms,
    kills: s.kills, deaths: s.deaths, character: s.character, gear: s.gear, settings: { ...previous?.settings, difficulty: s.difficulty }, savedAt: Date.now(),
    lastReported: mergeReceipts(previous?.lastReported, receipt),
    resetAt: previous?.resetAt, prologuePending: s.scene === "prologue",
    coopRewards: [...(s.coopRewards ?? previous?.coopRewards ?? [])].slice(-256),
    foundItems: s.foundItems, ambientTaxiWrecked: s.ambientTaxiWrecked || s.personalTaxiWrecked || previous?.ambientTaxiWrecked === true,
    home: home ? { heroes, active: s.active, party: s.party, candy: s.candy, chapter: s.chapter, character: s.character, gear: s.gear } : previous?.home ?? null,
  });
}
export function writeSave(s: GameState, previous: SaveData | null, home = false, receipt?: ProgressReceipt): SaveData | null {
  try {
    const saved = makeSave(s, previous, home, mergeReceipts(readSave()?.lastReported, receipt));
    if (!saved) return null;
    localStorage.setItem(SAVE_KEY, JSON.stringify(saved));
    return saved;
  } catch { return null; }
}
// Collection/lore and reward receipts belong to the account, not the story run.
export function makeNewGameSave(previous: SaveData | null): SaveData {
  const state = newGame();
  state.foundItems = [...(previous?.foundItems ?? [])];
  state.coopRewards = [...(previous?.coopRewards ?? [])];
  enterScene(state, "prologue");
  const save = makeSave(state, null)!;
  return { ...save, settings: previous?.settings ?? save.settings,
    lastReported: mergeReceipts(previous?.lastReported),
    resetAt: Math.max(Date.now(), (previous?.resetAt ?? 0) + 1) };
}
export function restoreSave(data: SaveData, retry = false): GameState {
  const saved = parseSave(data), s = newGame();
  if (saved) {
    s.u1 = sanitizeItemsNamespace(saved.u1);
    s.worldCycleSeconds = saved.worldCycleSeconds ?? 0;
    s.difficulty = saved.settings.difficulty ?? "normal";
    const snapshot = retry && saved.home && !saved.checkpointMapId.startsWith("interior-") && !saved.checkpointMapId.startsWith("city-") && !saved.checkpointMapId.startsWith("woods-") && !saved.checkpointMapId.startsWith("moon-") && saved.checkpointMapId !== "space-launch" ? saved.home : saved;
    s.heroes = Object.fromEntries(HERO_IDS.map(id => [id, { ...snapshot.heroes[id] }])) as Record<HeroId, HeroState>;
    s.character = { ...snapshot.character }; s.gear = { ...snapshot.gear }; s.unlockedHeroes = [...saved.unlockedHeroes];
    s.party = [...snapshot.party]; s.active = s.party.includes(snapshot.active) ? snapshot.active : s.party[0];
    s.candy = snapshot.candy; s.chapter = snapshot.chapter;
    s.campaignMilestones = [...saved.campaignMilestones]; s.solvedInteractions = [...saved.solvedInteractions];
    s.completedCinematics = [...saved.completedCinematics]; s.checkpointMapId = saved.checkpointMapId;
    s.areas = [...saved.areas]; s.bosses = [...saved.bosses]; s.clearedRooms = [...saved.clearedRooms];
    s.coopRewards = [...(saved.coopRewards ?? [])];
    for (const id of [...saved.bosses, ...saved.clearedRooms]) grantCheckpointChip(s, id);
    s.events.length = 0;
    s.foundItems = [...saved.foundItems]; s.ambientTaxiWrecked = s.personalTaxiWrecked = saved.ambientTaxiWrecked;
    s.kills = saved.kills; s.deaths = saved.deaths;
    if (retry) for (const hero of Object.values(s.heroes)) { hero.hp = hero.maxHp; hero.ki = hero.maxKi; hero.stamina = hero.maxStamina; }
    if (s.heroes[s.active].hp <= 0) {
      const other = s.party.find(id => s.heroes[id].hp > 0);
      if (other) s.active = other;
      else for (const id of s.party) s.heroes[id].hp = s.heroes[id].maxHp;
    }
  }
  if (saved?.prologuePending) { enterScene(s, "prologue"); return s; }
  enterScene(s, "hub"); s.x = HUB_WORLD.spawn.x; s.y = HUB_WORLD.spawn.y;
  if (saved && saved.checkpointMapId !== "hub" && (!retry || saved.checkpointMapId.startsWith("interior-") || saved.checkpointMapId.startsWith("city-") || saved.checkpointMapId.startsWith("woods-") || saved.checkpointMapId.startsWith("moon-") || saved.checkpointMapId === "space-launch")) {
    const anchor=retry && saved.checkpointMapId === "moon-m09" ? "moon-m06" : saved.checkpointMapId;
    if(anchor.startsWith("woods-")) refillCrew(s);
    enterCampaignMap(s, anchor);
    if(onMoon(s)) {record(s.campaignMilestones,"moon-arrived");record(s.completedCinematics,"space-outbound");refillCrew(s);}
    if(anchor === "space-launch" && s.campaignMilestones.includes("moon-returning")) {
      s.spaceOutfit=false;record(s.campaignMilestones,"moon-home");record(s.completedCinematics,"space-return");
      if(s.campaignMilestones.includes("prism-lens")) {record(s.campaignMilestones,"space-complete");s.chapter=Math.max(4,s.chapter);}
    }
  }
  s.notice = retry ? "Rested at HOME. The crew is ready." : "Welcome back to Wayside.";
  if (s.mapId === "hub" && s.clearedRooms.includes("realm-0")) s.notice = campaignHandoff(s);
  return s;
}
