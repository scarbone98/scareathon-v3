// Favourite cartridges: starred with the star key on the arcade's terminal, and remembered on
// this device. They lead the shelf and the index of every game, in a group of their own, and
// the arcade opens on the first of them. Open views hear of a change through FAVOURITES_EVENT.
import { useEffect, useState } from "react";

export const FAVOURITES_EVENT = "arcade:favourites";
const FAVOURITES_KEY = "wayside.favouriteCarts";

// The cartridges' names. Read once and kept here, so a private window still has them till it's shut
let favourites: string[] = [];
try {
  const saved = JSON.parse(localStorage.getItem(FAVOURITES_KEY) ?? "[]");
  if (Array.isArray(saved)) favourites = saved.filter((name) => typeof name === "string");
} catch {
  // (nothing kept: none yet)
}

export const favouriteCarts = () => favourites;

// Stars a cartridge, or takes its star off
export function toggleFavourite(name: string) {
  favourites = favourites.includes(name) ? favourites.filter((other) => other !== name) : [...favourites, name];
  try {
    localStorage.setItem(FAVOURITES_KEY, JSON.stringify(favourites));
  } catch {
    // (private windows: no way to remember it)
  }
  window.dispatchEvent(new CustomEvent(FAVOURITES_EVENT));
}

// The favourites, kept up to date
export function useFavouriteCarts() {
  const [carts, setCarts] = useState(favouriteCarts);
  useEffect(() => {
    const onChange = () => setCarts(favouriteCarts());
    window.addEventListener(FAVOURITES_EVENT, onChange);
    return () => window.removeEventListener(FAVOURITES_EVENT, onChange);
  }, []);
  return carts;
}
