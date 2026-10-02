// Secret cartridges: off the shelf until their code is typed into WaysideOS. Unlocks are
// remembered on this device; the station hears about a new one through UNLOCK_EVENT.

// Code (as cleanCode leaves it) -> the cartridge's name
export const SECRET_CARTS: Record<string, string> = {
  LIQUID: "Liquid Metal",
};

export const UNLOCK_EVENT = "arcade:unlocked";
const UNLOCK_KEY = "wayside.unlockedCarts";

export function unlockedCarts(): string[] {
  try {
    const saved = JSON.parse(localStorage.getItem(UNLOCK_KEY) ?? "[]");
    return Array.isArray(saved) ? saved : [];
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
