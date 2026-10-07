// What Scaredle and Cross Bones share on the page: countdowns, small saves, copying,
// and turning key presses into keys. The puzzles themselves (which day it is, the
// answers, what's solved) are the server's: see api.ts.

export function formatCountdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

export function readJSON<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeJSON(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode or a full disk: the puzzle still plays, it just won't remember
  }
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

// The physical keyboard, turned into the same keys
export function keyFromEvent(e: KeyboardEvent): string | null {
  if (e.metaKey || e.ctrlKey || e.altKey) return null;
  if (e.key === "Enter") return "ENTER";
  if (e.key === "Backspace" || e.key === "Delete") return "BACK";
  if (/^[a-zA-Z]$/.test(e.key)) return e.key.toUpperCase();
  return null;
}
