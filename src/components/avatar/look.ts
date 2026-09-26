import type { AvatarData, AvatarItem, AvatarLook, DyeChoice } from "./types";

// How the wardrobe and shop group categories into tabs.
export const WARDROBE_TABS: { key: string; label: string; categories: string[] }[] = [
  { key: "body", label: "Body", categories: ["body"] },
  { key: "face", label: "Face", categories: ["eyes", "mouth", "brows", "face_paint"] },
  { key: "hair", label: "Hair", categories: ["hair", "hair_acc"] },
  { key: "tops", label: "Tops", categories: ["torso", "outer"] },
  { key: "bottoms", label: "Bottoms", categories: ["legs", "legwear"] },
  { key: "shoes", label: "Shoes", categories: ["feet"] },
  { key: "accessories", label: "Accessories", categories: ["head", "face_acc", "neck", "hands", "waist", "back", "wings"] },
  { key: "held", label: "Held & pets", categories: ["held_near", "held_far", "companion"] },
  { key: "extras", label: "Auras & scenes", categories: ["aura", "background"] },
];

export const CATEGORY_LABELS: Record<string, string> = {
  body: "Body",
  eyes: "Eyes",
  mouth: "Mouth",
  brows: "Brows",
  face_paint: "Face paint",
  hair: "Hair",
  hair_acc: "Hair accessory",
  head: "Headwear",
  face_acc: "Mask & glasses",
  neck: "Neck",
  torso: "Top",
  outer: "Outerwear",
  waist: "Waist",
  hands: "Hands",
  legs: "Bottoms",
  legwear: "Legwear",
  feet: "Shoes",
  back: "Back",
  wings: "Wings",
  held_near: "Held",
  held_far: "Held (off hand)",
  companion: "Companion",
  aura: "Aura",
  background: "Background",
};

export function categoriesOf(item: AvatarItem) {
  return [item.category, ...item.occupies];
}

// Adds an item to an outfit, taking off whatever it has to replace so every
// category stays within its limit (the oldest item in a full category goes).
export function wearItem<T extends { item: AvatarItem }>(
  outfit: T[],
  entry: T,
  limits: Record<string, number>
) {
  let next = outfit.filter((current) => current !== entry);
  for (const category of categoriesOf(entry.item)) {
    const limit = limits[category] ?? 1;
    let wearing = next.filter((current) => categoriesOf(current.item).includes(category));
    while (wearing.length >= limit) {
      const [oldest] = wearing;
      next = next.filter((current) => current !== oldest);
      wearing = wearing.slice(1);
    }
  }
  return [...next, entry];
}

export function lookFromAvatar(avatar: AvatarData): AvatarLook {
  return {
    profile: avatar.profile,
    outfit: avatar.outfit.map(({ item, dyes }) => ({ item, dyes })),
  };
}

// The avatar trying on one extra item (for the shop).
export function lookWithItem(look: AvatarLook, item: AvatarItem, limits: Record<string, number>): AvatarLook {
  const tryOn: { item: AvatarItem; dyes: DyeChoice } = { item, dyes: {} };
  return { ...look, outfit: wearItem(look.outfit, tryOn, limits) };
}
