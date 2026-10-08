export interface HiddenPickup {
  id: string; chapter: number; area: string; scene: "overworld" | "hub" | "dungeon" | "realm"; room: number;
  x: number; y: number; name: string; kind: "snack" | "candy" | "trinket" | "lore"; description: string;
  healHp?: number; healKi?: number; candy?: number; walkover?: boolean; requiresWreck?: boolean; requiresDiner?: boolean; buff?: "speed" | "charge";
}
export const HIDDEN_PICKUPS: readonly HiddenPickup[];
export function cleanFoundItems(value: unknown): string[];
