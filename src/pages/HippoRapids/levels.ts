// Levels players make: kept in the browser, and shared as a code you can paste to a friend.
import { sanitizeLevel, type Level } from "../../../server/shared/hippoRapids/index.js";

const LEVELS_KEY = "hippo-rapids-levels";
const RECORDS_KEY = "hippo-rapids-records";

export interface SavedLevel {
  id: string;
  def: Level;
}

export interface Record {
  time: number; // seconds, after the ring bonus
  medal: 0 | 1 | 2 | 3; // 3 gold, 2 silver, 1 bronze
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode or full: the level just won't be kept.
  }
}

export function loadCustom(): SavedLevel[] {
  return read<SavedLevel[]>(LEVELS_KEY, [])
    .map((l) => ({ id: String(l.id), def: sanitizeLevel(l.def) }))
    .filter((l): l is SavedLevel => !!l.def);
}

export function saveCustom(list: SavedLevel[]) {
  write(LEVELS_KEY, list);
}

export const newLevelId = () => `u${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;

// Records are kept per level and raft size: a 2-hippo run isn't a 4-hippo run.
export const recordKey = (levelKey: string, seats: number) => `${levelKey}:${seats}`;

export function loadRecords(): { [key: string]: Record } {
  return read<{ [key: string]: Record }>(RECORDS_KEY, {});
}

export function saveRecords(records: { [key: string]: Record }) {
  write(RECORDS_KEY, records);
}

export const medalFor = (par: [number, number, number], time: number): 0 | 1 | 2 | 3 => (time <= par[0] ? 3 : time <= par[1] ? 2 : time <= par[2] ? 1 : 0);

export const MEDALS = ["", "🥉", "🥈", "🥇"];

// Share codes: the level's JSON, text-safe.
const PREFIX = "HR1:";

export function encodeLevel(def: Level): string {
  const bytes = new TextEncoder().encode(JSON.stringify(def));
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return PREFIX + btoa(bin);
}

export function decodeLevel(code: string): Level | null {
  try {
    const text = code.trim().replace(/\s+/g, "");
    if (!text.startsWith(PREFIX)) return null;
    const bin = atob(text.slice(PREFIX.length));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return sanitizeLevel(JSON.parse(new TextDecoder().decode(bytes)));
  } catch {
    return null;
  }
}

export const fmtTime = (t: number) => {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, "0")}`;
};
