import { enterScene, newGame, xpForLevel, type GameState, type HeroId, type HeroState } from "./sim.ts";

export const SAVE_KEY = "wayside-fury-save";
export interface ProgressReceipt {
  areas: string[];
  bosses: string[];
  rooms: string[];
  level: number;
}
export interface HomeSnapshot {
  heroes: Record<HeroId, HeroState>;
  active: HeroId;
  party: HeroId[];
  candy: number;
  chapter: number;
}
export interface SaveData {
  version: 1;
  chapter: number;
  heroes: Record<HeroId, HeroState>;
  active: HeroId;
  party: HeroId[];
  candy: number;
  unlockedHeroes: ["joe", "matt"];
  areas: string[];
  bosses: string[];
  clearedRooms: string[];
  kills: number;
  deaths: number;
  lastReported: ProgressReceipt;
  home: HomeSnapshot | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isHero = (value: unknown): value is HeroId => value === "joe" || value === "matt";
const bounded = (value: number, min: number, max: number, fallback = min): number =>
  Math.max(min, Math.min(max, Number.isFinite(value) ? value : fallback));
const integer = (value: number, min: number, max: number, fallback = min): number =>
  Math.floor(bounded(value, min, max, fallback));

// Milestones are short ids, not arbitrary data. Keep their order while deduplicating.
function milestoneIds(value: unknown[]): string[] {
  return [...new Set(value.filter((id): id is string =>
    typeof id === "string" && id.length > 0 && id.length <= 64 && id.trim().length > 0))].slice(0, 128);
}
function parseParty(value: unknown): HeroId[] {
  if (!Array.isArray(value)) return ["joe", "matt"];
  const party = [...new Set(value.filter(isHero))];
  return party.length > 0 ? party : ["joe"];
}

export function mergeReceipts(...receipts: (ProgressReceipt | null | undefined)[]): ProgressReceipt {
  const merged: ProgressReceipt = { areas: [], bosses: [], rooms: [], level: 1 };
  for (const receipt of receipts) {
    if (!receipt) continue;
    merged.areas = milestoneIds([...merged.areas, ...(Array.isArray(receipt.areas) ? receipt.areas : [])]);
    merged.bosses = milestoneIds([...merged.bosses, ...(Array.isArray(receipt.bosses) ? receipt.bosses : [])]);
    merged.rooms = milestoneIds([...merged.rooms, ...(Array.isArray(receipt.rooms) ? receipt.rooms : [])]);
    merged.level = Math.max(merged.level, integer(receipt.level, 1, Number.MAX_SAFE_INTEGER));
  }
  return merged;
}
export function progressReport(s: GameState, previous?: ProgressReceipt | null): { score: number; receipt: ProgressReceipt } {
  const reported = mergeReceipts(previous);
  const current: ProgressReceipt = {
    areas: milestoneIds(s.areas), bosses: milestoneIds(s.bosses), rooms: milestoneIds(s.clearedRooms),
    level: Math.max(integer(s.heroes.joe.level, 1, Number.MAX_SAFE_INTEGER), integer(s.heroes.matt.level, 1, Number.MAX_SAFE_INTEGER)),
  };
  const additions = (now: string[], before: string[]) => now.filter((id) => !before.includes(id)).length;
  const score = (additions(current.areas, reported.areas) + additions(current.bosses, reported.bosses)) * 1000 +
    Math.max(0, current.level - reported.level) * 100 + additions(current.rooms, reported.rooms) * 50;
  return { score: integer(score, 0, 100000), receipt: mergeReceipts(reported, current) };
}

function parseHero(value: unknown, id: HeroId, fallback: HeroState): HeroState | null {
  if (!isRecord(value)) return null;
  const fields = ["hp", "maxHp", "ki", "maxKi", "stamina", "maxStamina", "level", "xp", "power", "defense", "invulnerable"];
  if (fields.some((field) => typeof value[field] !== "number")) return null;
  const level = integer(value.level as number, 1, Number.MAX_SAFE_INTEGER, fallback.level);
  const maxHp = integer(value.maxHp as number, 1, 100000, fallback.maxHp);
  const maxKi = integer(value.maxKi as number, 1, 100000, fallback.maxKi);
  const maxStamina = integer(value.maxStamina as number, 1, 100000, fallback.maxStamina);
  return {
    id, level, maxHp, maxKi, maxStamina,
    hp: bounded(value.hp as number, 0, maxHp, maxHp),
    ki: bounded(value.ki as number, 0, maxKi, maxKi),
    stamina: bounded(value.stamina as number, 0, maxStamina, maxStamina),
    xp: integer(value.xp as number, 0, xpForLevel(level) - 1),
    power: integer(value.power as number, 1, 10000, fallback.power),
    defense: integer(value.defense as number, 0, 10000, fallback.defense),
    // A save never carries a combat invulnerability window into the next visit.
    invulnerable: 0,
  };
}
function parseHeroes(value: unknown): Record<HeroId, HeroState> | null {
  if (!isRecord(value)) return null;
  const base = newGame().heroes;
  const joe = parseHero(value.joe, "joe", base.joe);
  const matt = parseHero(value.matt, "matt", base.matt);
  return joe && matt ? { joe, matt } : null;
}
function parseHome(value: unknown): HomeSnapshot | null {
  if (!isRecord(value) || !isHero(value.active) || typeof value.candy !== "number" || typeof value.chapter !== "number") return null;
  const heroes = parseHeroes(value.heroes);
  const party = parseParty(value.party);
  return heroes ? { heroes, party, active: party.includes(value.active) ? value.active : party[0],
    candy: integer(value.candy, 0, 1000000), chapter: integer(value.chapter, 1, 99) } : null;
}
function parseSave(value: unknown): SaveData | null {
  if (!isRecord(value) || value.version !== 1 || !isHero(value.active) ||
      typeof value.chapter !== "number" || typeof value.candy !== "number" ||
      typeof value.kills !== "number" || typeof value.deaths !== "number" ||
      !Array.isArray(value.areas) || !Array.isArray(value.bosses) || !Array.isArray(value.clearedRooms) ||
      !Array.isArray(value.unlockedHeroes) || !value.unlockedHeroes.includes("joe") || !value.unlockedHeroes.includes("matt") ||
      !Object.prototype.hasOwnProperty.call(value, "home")) return null;
  const heroes = parseHeroes(value.heroes);
  const receipt = value.lastReported;
  if (!heroes || !isRecord(receipt) || !Array.isArray(receipt.areas) || !Array.isArray(receipt.bosses) ||
      !Array.isArray(receipt.rooms) || typeof receipt.level !== "number") return null;
  const party = parseParty(value.party);
  return {
    version: 1, heroes, party, active: party.includes(value.active) ? value.active : party[0],
    chapter: integer(value.chapter, 1, 99), candy: integer(value.candy, 0, 1000000),
    kills: integer(value.kills, 0, 1000000), deaths: integer(value.deaths, 0, 1000000),
    unlockedHeroes: ["joe", "matt"],
    areas: milestoneIds(value.areas), bosses: milestoneIds(value.bosses), clearedRooms: milestoneIds(value.clearedRooms),
    lastReported: {
      areas: milestoneIds(receipt.areas), bosses: milestoneIds(receipt.bosses), rooms: milestoneIds(receipt.rooms),
      level: integer(receipt.level, 1, Number.MAX_SAFE_INTEGER),
    },
    home: parseHome(value.home),
  };
}

export function readSave(): SaveData | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw || raw.length > 65536) return null;
    return parseSave(JSON.parse(raw));
  } catch {
    return null;
  }
}
export function writeSave(s: GameState, previous: SaveData | null, home = false, receipt?: ProgressReceipt): SaveData | null {
  try {
    const saved = parseSave({
      version: 1, chapter: s.chapter, heroes: s.heroes, active: s.active, party: s.party, candy: s.candy,
      unlockedHeroes: ["joe", "matt"], areas: s.areas, bosses: s.bosses, clearedRooms: s.clearedRooms,
      kills: s.kills, deaths: s.deaths,
      lastReported: mergeReceipts(readSave()?.lastReported, previous?.lastReported, receipt),
      home: home ? { heroes: s.heroes, active: s.active, party: s.party, candy: s.candy, chapter: s.chapter } : previous?.home ?? null,
    });
    if (!saved) return null;
    localStorage.setItem(SAVE_KEY, JSON.stringify(saved));
    return saved;
  } catch {
    return null;
  }
}
export function restoreSave(data: SaveData, retry = false): GameState {
  const saved = parseSave(data);
  const s = newGame();
  if (saved) {
    const snapshot = retry && saved.home ? saved.home : saved;
    s.heroes = { joe: { ...snapshot.heroes.joe }, matt: { ...snapshot.heroes.matt } };
    s.party = [...snapshot.party];
    s.active = s.party.includes(snapshot.active) ? snapshot.active : s.party[0];
    s.candy = snapshot.candy; s.chapter = snapshot.chapter;
    s.areas = [...saved.areas]; s.bosses = [...saved.bosses]; s.clearedRooms = [...saved.clearedRooms];
    s.kills = saved.kills; s.deaths = saved.deaths;
    if (retry) {
      for (const hero of Object.values(s.heroes)) {
        hero.hp = hero.maxHp; hero.ki = hero.maxKi; hero.stamina = hero.maxStamina;
      }
    }
    if (s.heroes[s.active].hp <= 0) {
      const other = s.party.find((id) => s.heroes[id].hp > 0);
      if (other) s.active = other;
      else for (const id of s.party) s.heroes[id].hp = s.heroes[id].maxHp;
    }
  }
  enterScene(s, "hub");
  s.x = 160; s.y = 121;
  s.notice = retry ? "Rested at HOME. The crew is ready." : "Welcome back to Wayside.";
  return s;
}
