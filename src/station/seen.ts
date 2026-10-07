// What's been seen on this device, for the "!" dots (components/NewsDot): notices read, when
// the shop was last looked round, where everyone stood on the scoreboard last time. Kept in
// the browser, like the arcade's played games (Arcade/news.ts): a dot is a nudge, not a record.
import { useEffect, useState } from "react";

const KEY = "wayside.seen";
const SEEN_EVENT = "wayside:seen";

type Seen = {
  // things read, by kind and id: when (ms)
  read: Record<string, number>;
  // places looked round, by name: when last (ms)
  looked: Record<string, number>;
  // a board's standings as last seen, by board: name -> place
  places: Record<string, Record<string, number>>;
};

function load(): Seen {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return { read: saved?.read ?? {}, looked: saved?.looked ?? {}, places: saved?.places ?? {} };
  } catch {
    return { read: {}, looked: {}, places: {} };
  }
}

function save(next: Seen) {
  try {
    // (read marks older than two months are let go: what they marked has long since left)
    const cutoff = Date.now() - 60 * 24 * 60 * 60 * 1000;
    next.read = Object.fromEntries(Object.entries(next.read).filter(([, at]) => at > cutoff));
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // (private windows: nothing's remembered, so dots come back next visit)
  }
  window.dispatchEvent(new CustomEvent(SEEN_EVENT));
}

export function isRead(id: string) {
  return id in load().read;
}

export function markRead(id: string) {
  const seen = load();
  if (id in seen.read) return;
  seen.read[id] = Date.now();
  save(seen);
}

// When somewhere was last looked round (ms), or null if never
export function lastLooked(place: string): number | null {
  return load().looked[place] ?? null;
}

export function noteLooked(place: string) {
  const seen = load();
  seen.looked[place] = Date.now();
  save(seen);
}

export function placesSeen(board: string): Record<string, number> | null {
  return load().places[board] ?? null;
}

export function notePlaces(board: string, places: Record<string, number>) {
  const seen = load();
  seen.places[board] = places;
  save(seen);
}

// The shop's wares count as new if they came in after you last looked round it (or in the
// last three days, if you never have)
export function shopNewSince() {
  return lastLooked("shop") ?? Date.now() - 3 * 24 * 60 * 60 * 1000;
}

// Re-renders whoever shows dots when something's been seen (here, or in another tab)
export function useSeen() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const bump = () => setTick((tick) => tick + 1);
    window.addEventListener(SEEN_EVENT, bump);
    window.addEventListener("storage", bump);
    return () => {
      window.removeEventListener(SEEN_EVENT, bump);
      window.removeEventListener("storage", bump);
    };
  }, []);
}
