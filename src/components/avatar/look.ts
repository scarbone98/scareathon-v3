import type { AvatarData, AvatarItem, AvatarLook, AvatarManifest, DyeChoice, InventoryEntry } from "./types";

// How the wardrobe and shop group categories into tabs.
const TAB_LIST: { key: string; label: string; categories: string[] }[] = [
  { key: "body", label: "Body", categories: ["body"] },
  { key: "hair", label: "Hair", categories: ["hair"] },
  { key: "face", label: "Face", categories: ["face_paint", "face_acc"] },
  { key: "tops", label: "Tops", categories: ["torso", "outer", "neck"] },
  { key: "bottoms", label: "Bottoms", categories: ["legs"] },
  { key: "shoes", label: "Shoes", categories: ["feet"] },
  { key: "hats", label: "Hats", categories: ["head"] },
  // (no backgrounds: your banner is your background, see station/banners.ts)
  { key: "extras", label: "Extras", categories: ["back", "wings", "held", "companion", "aura"] },
];
// Everything you own comes first; then a tab for each kind of thing
export const WARDROBE_TABS = [{ key: "all", label: "All", categories: TAB_LIST.flatMap((t) => t.categories) }, ...TAB_LIST];

export const CATEGORY_LABELS: Record<string, string> = {
  body: "Body",
  face_paint: "Face paint",
  hair: "Hair",
  head: "Hat",
  face_acc: "Mask & glasses",
  neck: "Neck",
  torso: "Top",
  outer: "Jacket",
  legs: "Bottoms",
  feet: "Shoes",
  back: "Back",
  wings: "Wings",
  held: "Held",
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

// What a generated kid wears: always a top, bottoms and shoes, usually hair,
// and sometimes a jacket, glasses or rosy cheeks. Only free items are used.
// Bottoms, shoes and glasses come in everyday colours; tops can be anything.
const NEUTRAL_DYES = ["coal", "denim", "bark", "ash", "cloud", "pine"];
const GENERATED: { category: string; chance: number; neutral?: boolean }[] = [
  { category: "hair", chance: 0.95 },
  { category: "torso", chance: 1 },
  { category: "outer", chance: 0.35 },
  { category: "legs", chance: 1, neutral: true },
  { category: "feet", chance: 1, neutral: true },
  { category: "face_acc", chance: 0.15, neutral: true },
  { category: "face_paint", chance: 0.25 },
];
// Generated kids mostly get everyday skin, hair and eyes (the first few of
// each list); the wild ones are there to pick in the wardrobe.
const EVERYDAY_SKIN_TONES = 5;
const EVERYDAY_HAIR_COLOURS = 6;
const GENERATED_BODY = "body_kid";

export type GeneratedLook = {
  profile: { skin: string; hair: string; eyes: string };
  outfit: { itemInstanceId: number; dyes: DyeChoice; item: AvatarItem }[];
};

// A random kid built from the free items the player owns. Everyone starts
// with one, and the wardrobe's Randomize button rolls a new one.
export function randomLook(inventory: InventoryEntry[], manifest: AvatarManifest, random = Math.random): GeneratedLook | null {
  const pick = <T,>(list: T[]) => list[Math.floor(random() * list.length)];
  const free = inventory.filter((entry) => entry.item.basePrice == null);
  const body = free.find((entry) => entry.item.itemKey === GENERATED_BODY) || free.find((entry) => entry.item.category === "body");
  if (!body) return null;
  const outfit: GeneratedLook["outfit"] = [{ itemInstanceId: body.itemInstanceId, dyes: {}, item: body.item }];
  for (const { category, chance, neutral } of GENERATED) {
    const options = free.filter((entry) => entry.item.category === category);
    if (!options.length || random() >= chance) continue;
    const entry = pick(options);
    const dyes: DyeChoice = {};
    const colours = neutral ? manifest.dyeColors.filter((ramp) => NEUTRAL_DYES.includes(ramp)) : manifest.dyeColors;
    for (const channel of Object.keys(entry.item.dyes) as (keyof DyeChoice)[]) dyes[channel] = pick(colours);
    outfit.push({ itemInstanceId: entry.itemInstanceId, dyes, item: entry.item });
  }
  return {
    profile: {
      skin: pick(manifest.skinTones.slice(0, EVERYDAY_SKIN_TONES)),
      hair: pick(random() < 0.85 ? manifest.hairColors.slice(0, EVERYDAY_HAIR_COLOURS) : manifest.hairColors),
      eyes: random() < 0.9 ? manifest.eyeColors[0] : pick(manifest.eyeColors),
    },
    outfit,
  };
}
