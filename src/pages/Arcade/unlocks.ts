// Secret cartridges: off the shelf until their code is typed into WaysideOS. Unlocks are
// remembered on this device; the station hears about a new one through UNLOCK_EVENT.

// Code (as cleanCode leaves it) -> the cartridge's name
export const SECRET_CARTS: Record<string, string> = {
  EVILV2: "8 Bit Evil Returns V2",
  HALLOW: "Hallow Deep",
  VALLEY: "October Valley",
  DENVS: "Denver Vs The Universe",
  OUTSIDE: "Outside",
  WIND: "Daughter Of The Wind",
  PENGUIN: "Penguin Slide",
  POTION: "Cauldron",
  FROG: "Frogulizer",
};

export const UNLOCK_EVENT = "arcade:unlocked";
const UNLOCK_KEY = "wayside.unlockedCarts";

// Carts that were unlocked under an old name (old name -> name now)
const RENAMED: Record<string, string> = {
  "The Clearing": "Warren",
  "Hubble Bubble": "Cauldron",
};

export function unlockedCarts(): string[] {
  try {
    const saved = JSON.parse(localStorage.getItem(UNLOCK_KEY) ?? "[]");
    return Array.isArray(saved) ? saved.map((name) => RENAMED[name] ?? name) : [];
  } catch {
    return [];
  }
}

// Unlocks a cartridge; false if it already was
export function unlockCart(name: string): boolean {
  const unlocked = unlockedCarts();
  if (unlocked.includes(name)) return false;
  try {
    localStorage.setItem(UNLOCK_KEY, JSON.stringify([...unlocked, name]));
  } catch {
    // (private windows: no way to remember it)
  }
  window.dispatchEvent(new CustomEvent(UNLOCK_EVENT, { detail: name }));
  return true;
}
