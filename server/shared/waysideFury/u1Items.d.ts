export type ChipId = "scanner" | "ki-coil" | "candy-magnet" | "sprinter" | "iron-guard" | "combo-extender"
  | "second-wind" | "ki-saver" | "quickstep" | "vital-spark" | "focus-lens" | "lucky-star";
export interface ItemsSaveState {
  chips: { owned: ChipId[]; equipped: (ChipId | null)[]; secondWindUsed: boolean };
  relics: { collected: string[]; cycle: number; wishes: string[]; outfits: string[];
    statBonus: { power: number; ward: number }; secretBossUnlocked: boolean };
  radar: { owned: boolean; enabled: boolean };
}
export const CHIP_IDS: readonly ChipId[];
export const RELIC_IDS: readonly string[];
export const WISH_IDS: readonly string[];
export const OUTFIT_IDS: readonly string[];
export function createItemsSave(): ItemsSaveState;
export function sanitizeItemsSave(raw: unknown): ItemsSaveState;
export function sanitizeItemsNamespace(raw: unknown): { items: ItemsSaveState; [key: string]: unknown };
