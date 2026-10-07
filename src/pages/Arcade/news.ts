// What's new in the arcade. A game that's arrived or changed in the last couple of days wears a
// yellow "!" badge on its cartridge and its tile in the index until it's been played on this
// device, and a finished game spends its first day in a NEW GAMES group of its own before
// joining the rest. When it arrived is its `added` date (Arcade/games.tsx); when it last
// changed is read off its web build by itself (see watchGameUpdates), or its `updated` date
// for a game served by this site.
import { isValidElement } from "react";
import type { MachineData } from "./games.tsx";

const DAY = 24 * 60 * 60 * 1000;
// How long a new game stays in the NEW GAMES group
const NEW_FOR = DAY;
// How long an unplayed game keeps its badge
const NEWS_FOR = 2 * DAY;

// Something's changed: a game's been played, or the builds' dates have come in
export const NEWS_EVENT = "arcade:news";
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
  window.dispatchEvent(new CustomEvent(NEWS_EVENT));
}

const timeOf = (date?: string) => (date ? Date.parse(date) || 0 : 0);

// When each game's web build was last published: name -> time (ms). Kept between visits,
// and asked for again once it's this old
const BUILDS_KEY = "wayside.gameBuilds";
const BUILDS_FOR = 10 * 60 * 1000;
let builds: { at: number; times: Record<string, number> } = { at: 0, times: {} };
try {
  const saved = JSON.parse(localStorage.getItem(BUILDS_KEY) ?? "null");
  if (saved && typeof saved.at === "number" && saved.times && typeof saved.times === "object") builds = saved;
} catch {
  // (nothing kept: they're asked for)
}

// A game hosted somewhere else (GitHub Pages): the address its cabinet loads
function buildUrlOf(game: MachineData) {
  const url = isValidElement(game.game) ? (game.game.props as { url?: unknown }).url : undefined;
  return typeof url === "string" && /^https?:/.test(url) ? url : undefined;
}

// Asks each hosted game when its build was last published (its page's Last-Modified, which
// GitHub Pages sets to the time of the push), so an update shows without anyone noting it here
let asking = false;
export async function watchGameUpdates(games: MachineData[]) {
  if (asking || Date.now() - builds.at < BUILDS_FOR) return;
  asking = true;
  const times: Record<string, number> = {};
  await Promise.all(
    games.map(async (game) => {
      const url = buildUrlOf(game);
      if (!url) return;
      try {
        const response = await fetch(url, { method: "HEAD", cache: "no-store" });
        const modified = Date.parse(response.headers.get("Last-Modified") ?? "");
        if (response.ok && modified) times[game.name] = modified;
        else if (builds.times[game.name]) times[game.name] = builds.times[game.name];
      } catch {
        // (offline, or its host is: what was known before stands)
        if (builds.times[game.name]) times[game.name] = builds.times[game.name];
      }
    })
  );
  asking = false;
  builds = { at: Date.now(), times };
  try {
    localStorage.setItem(BUILDS_KEY, JSON.stringify(builds));
  } catch {
    // (private windows: asked for again next visit)
  }
  window.dispatchEvent(new CustomEvent(NEWS_EVENT));
}

// When a game last changed: its build's date, or the one written on it
const updatedTime = (game: MachineData) => Math.max(timeOf(game.updated), builds.times[game.name] ?? 0);

// A finished game in its first day
export function isNewGame(game: MachineData, now = Date.now()) {
  if (game.special || (game.earlyAccess && !game.newShelf)) return false;
  const added = timeOf(game.added);
  return added > 0 && added <= now && now - added < NEW_FOR;
}

// Added or updated lately, and not played since
export function hasNews(game: MachineData, played = playedCarts(), now = Date.now()) {
  if (game.special) return false; // (nothing there to play)
  const latest = Math.max(timeOf(game.added), updatedTime(game));
  return latest > 0 && latest <= now && now - latest < NEWS_FOR && (played[game.name] ?? 0) < latest;
}

// Changed lately (after it arrived), and not played since
export function hasUpdate(game: MachineData, played = playedCarts(), now = Date.now()) {
  if (game.special) return false;
  const updated = updatedTime(game);
  return updated > timeOf(game.added) && updated <= now && now - updated < NEWS_FOR && (played[game.name] ?? 0) < updated;
}
