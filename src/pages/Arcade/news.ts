// What's new in the arcade. A game's `added` and `updated` dates (Arcade/games.tsx) put a
// yellow "!" badge on its cartridge and its tile in the index until it's been played on
// this device (or the news goes stale), and a finished game spends its first day in a
// NEW GAMES group of its own before joining the rest.
import type { MachineData } from "./games.tsx";

const DAY = 24 * 60 * 60 * 1000;
// How long a new game stays in the NEW GAMES group
const NEW_FOR = DAY;
// How long an unplayed game keeps its badge
const NEWS_FOR = 14 * DAY;

export const PLAYED_EVENT = "arcade:played";
const PLAYED_KEY = "wayside.playedCarts";

// When each game was last played on this device: name -> time (ms)
export function playedCarts(): Record<string, number> {
  try {
    const saved = JSON.parse(localStorage.getItem(PLAYED_KEY) ?? "{}");
    return saved && typeof saved === "object" && !Array.isArray(saved) ? saved : {};
  } catch {
    return {};
  }
}

export function markPlayed(name: string) {
  try {
    localStorage.setItem(PLAYED_KEY, JSON.stringify({ ...playedCarts(), [name]: Date.now() }));
  } catch {
    // (private windows: no way to remember it)
  }
  window.dispatchEvent(new CustomEvent(PLAYED_EVENT, { detail: name }));
}

const timeOf = (date?: string) => (date ? Date.parse(date) || 0 : 0);

// A finished game in its first day
export function isNewGame(game: MachineData, now = Date.now()) {
  if (game.special || game.earlyAccess) return false;
  const added = timeOf(game.added);
  return added > 0 && added <= now && now - added < NEW_FOR;
}

// Added or updated lately, and not played since
export function hasNews(game: MachineData, played = playedCarts(), now = Date.now()) {
  if (game.special) return false; // (nothing there to play)
  const latest = Math.max(timeOf(game.added), timeOf(game.updated));
  return latest > 0 && latest <= now && now - latest < NEWS_FOR && (played[game.name] ?? 0) < latest;
}

// Changed lately (after it arrived), and not played since
export function hasUpdate(game: MachineData, played = playedCarts(), now = Date.now()) {
  if (game.special) return false;
  const updated = timeOf(game.updated);
  return updated > timeOf(game.added) && updated <= now && now - updated < NEWS_FOR && (played[game.name] ?? 0) < updated;
}
