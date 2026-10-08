import { enterScene, newGame, createHero, itemsGear, HERO_IDS, type HeroId, type HeroState, type GameState } from "./sim.ts";
import { HUB_WORLD } from "./world.ts";
import { grantCheckpointChip } from "./u1/items/pickups.ts";
import { SAVE_VERSION, sanitizeSave, mergeReceipts } from "../../../../server/shared/waysideFury/save.js";
import type { SaveData, ProgressReceipt } from "../../../../server/shared/waysideFury/save.js";
export { mergeReceipts };
export type { SaveData, HomeSnapshot, ProgressReceipt, SaveSettings, Gear, CharacterProgress } from "../../../../server/shared/waysideFury/save.js";
export const SAVE_KEY = "wayside-fury-save";

export function progressReport(s: GameState, previous?: ProgressReceipt | null): { score: number; receipt: ProgressReceipt } {
  const reported = mergeReceipts(previous);
  const current: ProgressReceipt = {
    areas: [...new Set(s.areas)], bosses: [...new Set(s.bosses)], rooms: [...new Set(s.clearedRooms)],
    level: s.character.level,
    ...(s.foundItems.length ? { foundItems: [...new Set(s.foundItems)] } : {}),
  };
  const additions = (now: string[], before: string[]) => now.filter(id => !before.includes(id)).length;
  const score = (additions(current.areas, reported.areas) + additions(current.bosses, reported.bosses)) * 1000 +
    Math.max(0, current.level - reported.level) * 100 + additions(current.rooms, reported.rooms) * 50 +
    additions(current.foundItems ?? [], reported.foundItems ?? []) * 20;
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
    version: SAVE_VERSION, chapter: s.chapter, heroes, active: s.active, party: s.party, candy: s.candy,
    unlockedHeroes: s.unlockedHeroes, areas: s.areas, bosses: s.bosses, clearedRooms: s.clearedRooms,
    kills: s.kills, deaths: s.deaths, character: s.character, gear: s.gear, settings: previous?.settings, savedAt: Date.now(),
    lastReported: mergeReceipts(previous?.lastReported, receipt),
    coopRewards: [...(s.coopRewards ?? previous?.coopRewards ?? [])].slice(-256),
    foundItems: s.foundItems, ambientTaxiWrecked: s.ambientTaxiWrecked || s.personalTaxiWrecked || previous?.ambientTaxiWrecked === true,
    u1: { ...previous?.u1, ...s.u1 },
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
export function restoreSave(data: SaveData, retry = false): GameState {
  const saved = parseSave(data), s = newGame();
  if (saved) {
    const snapshot = retry && saved.home ? saved.home : saved;
    s.heroes = Object.fromEntries(HERO_IDS.map(id => [id, { ...snapshot.heroes[id] }])) as Record<HeroId, HeroState>;
    s.character = { ...snapshot.character }; s.gear = { ...snapshot.gear }; s.unlockedHeroes = [...saved.unlockedHeroes];
    s.party = [...snapshot.party]; s.active = s.party.includes(snapshot.active) ? snapshot.active : s.party[0];
    s.candy = snapshot.candy; s.chapter = snapshot.chapter;
    s.areas = [...saved.areas]; s.bosses = [...saved.bosses]; s.clearedRooms = [...saved.clearedRooms];
    s.coopRewards = [...(saved.coopRewards ?? [])];
    s.foundItems = [...saved.foundItems]; s.ambientTaxiWrecked = s.personalTaxiWrecked = saved.ambientTaxiWrecked;
    s.u1 = structuredClone(saved.u1!);
    for (const id of [...saved.bosses, ...saved.clearedRooms]) grantCheckpointChip(s, id);
    s.events.length = 0;
    s.kills = saved.kills; s.deaths = saved.deaths;
    if (retry && s.u1) s.u1.items.chips.secondWindUsed = false;
    if (retry) for (const hero of Object.values(s.heroes)) { hero.hp = hero.maxHp; hero.ki = hero.maxKi; hero.stamina = hero.maxStamina; }
    if (s.heroes[s.active].hp <= 0) {
      const other = s.party.find(id => s.heroes[id].hp > 0);
      if (other) s.active = other;
      else for (const id of s.party) s.heroes[id].hp = s.heroes[id].maxHp;
    }
  }
  enterScene(s, "hub"); s.x = HUB_WORLD.spawn.x; s.y = HUB_WORLD.spawn.y;
  s.notice = retry ? "Rested at HOME. The crew is ready." : "Welcome back to Wayside.";
  return s;
}
