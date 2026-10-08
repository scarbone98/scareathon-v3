import { defaultCombatProgress } from "../../../../../../server/shared/waysideFury/u1Combat.js";
import { CHIP_IDS, createItemsSave, type ChipId, type ItemsSaveState } from "../../../../../../server/shared/waysideFury/u1Items.js";
import type { GameState } from "../../sim.ts";
export { CHIP_IDS, createItemsSave };
export type { ChipId, ItemsSaveState };

export interface ChipDefinition {
  id: ChipId; name: string; description: string; glyph: string; color: string; sourceHint: string;
}
export const CHIPS: readonly ChipDefinition[] = [
  { id: "scanner", name: "Scanner", description: "Reveal enemy HP and highlight exposed weak points.", glyph: "◎", color: "#7de5ff", sourceHint: "Find the station's field kit." },
  { id: "ki-coil", name: "Ki Coil", description: "Charge Ki 30% faster.", glyph: "ϟ", color: "#72caff", sourceHint: "Search Scorched Road." },
  { id: "candy-magnet", name: "Candy Magnet", description: "Collect 25% more candy from monster drops.", glyph: "✦", color: "#f4a5ec", sourceHint: "Search the orchard supply trail." },
  { id: "sprinter", name: "Sprinter", description: "Move 12% faster on foot.", glyph: "»", color: "#90e9b3", sourceHint: "Search the Wayside hub." },
  { id: "iron-guard", name: "Iron Guard", description: "Take 12% less damage.", glyph: "⬡", color: "#afc5ec", sourceHint: "Defeat the Sentinel." },
  { id: "combo-extender", name: "Combo Extender", description: "Keep a combo ready for 0.45 seconds longer.", glyph: "Ⅲ", color: "#ffc28f", sourceHint: "Search the Ruined Yard." },
  { id: "second-wind", name: "Second Wind", description: "Revive with 35% HP once between rests at HOME.", glyph: "↺", color: "#c2f1a0", sourceHint: "Explore the orchard supply trail." },
  { id: "ki-saver", name: "Ki Saver", description: "Ordinary Ki blasts cost 25% less Ki.", glyph: "◇", color: "#a6b9ff", sourceHint: "Open the old depot's supply cache." },
  { id: "quickstep", name: "Quickstep", description: "Dashes cost 20% less stamina.", glyph: "⌁", color: "#80e2d8", sourceHint: "Explore Furnace Pass." },
  { id: "vital-spark", name: "Vital Spark", description: "Recover HP slowly while away from monsters.", glyph: "+", color: "#ff9e9e", sourceHint: "Search the old depot." },
  { id: "focus-lens", name: "Focus Lens", description: "Ki blasts and signature moves deal 15% more damage.", glyph: "◈", color: "#d1abff", sourceHint: "Defeat the Watcher." },
  { id: "lucky-star", name: "Lucky Star", description: "Every monster drops one extra candy.", glyph: "★", color: "#ffe68f", sourceHint: "Search the 8-Bit Realm." },
];
export const CHIP_REGISTRY = Object.fromEntries(CHIPS.map(chip => [chip.id, chip])) as Record<ChipId, ChipDefinition>;

export function itemsState(s: GameState): ItemsSaveState {
  s.u1 ??= { items: createItemsSave(), combat: defaultCombatProgress() };
  s.u1.items ??= createItemsSave();
  return s.u1.items;
}
export function unlockedChipSlots(level: number): number {
  return Number.isFinite(level) && level >= 6 ? 3 : Number.isFinite(level) && level >= 3 ? 2 : 1;
}
export function grantChip(s: GameState, id: ChipId, source?: string): boolean {
  if (!CHIP_IDS.includes(id)) return false;
  const chips = itemsState(s).chips;
  if (chips.owned.includes(id)) return false;
  chips.owned.push(id);
  s.notice = `${CHIP_REGISTRY[id].name} chip found${source ? ` — ${source.slice(0, 80)}` : ""}! Equip it in your character sheet.`;
  s.events.push({ type: "item", id, kind: "chip" });
  return true;
}
export function equipChip(s: GameState, id: ChipId | null, slot: number): boolean {
  const slots = unlockedChipSlots(s.character.level);
  if (!Number.isInteger(slot) || slot < 0 || slot >= slots) return false;
  const chips = itemsState(s).chips;
  if (id !== null && (!CHIP_IDS.includes(id) || !chips.owned.includes(id)
    || chips.equipped.slice(0, slots).some((equipped, index) => index !== slot && equipped === id))) return false;
  if (chips.equipped[slot] === id) return false;
  // A HOME retry may return to an earlier level. Recover chips held in now
  // locked slots by moving them to this active slot without creating duplicates.
  if (id !== null) for (let index = slots; index < chips.equipped.length; index++) {
    if (chips.equipped[index] === id) chips.equipped[index] = null;
  }
  chips.equipped[slot] = id;
  s.notice = id ? `${CHIP_REGISTRY[id].name} equipped.` : `Chip slot ${slot + 1} cleared.`;
  s.events.push({ type: "item", id: "chip-loadout", kind: "chip" });
  return true;
}
export interface ChipEffects {
  scanner: boolean; kiChargeMultiplier: number; candyMultiplier: number; candyBonusPerKill: number;
  moveSpeedMultiplier: number; incomingDamageMultiplier: number; comboWindowBonus: number;
  secondWind: boolean; kiCostMultiplier: number; dashStaminaMultiplier: number;
  passiveHealPerSecond: number; kiDamageMultiplier: number;
}
export function chipEffects(s: GameState): ChipEffects {
  const chips = itemsState(s).chips, active = new Set(chips.equipped.slice(0, unlockedChipSlots(s.character.level))
    .filter((id): id is ChipId => id !== null && chips.owned.includes(id)));
  return {
    scanner: active.has("scanner"), kiChargeMultiplier: active.has("ki-coil") ? 1.3 : 1,
    candyMultiplier: active.has("candy-magnet") ? 1.25 : 1, candyBonusPerKill: active.has("lucky-star") ? 1 : 0,
    moveSpeedMultiplier: active.has("sprinter") ? 1.12 : 1,
    incomingDamageMultiplier: active.has("iron-guard") ? 0.88 : 1,
    comboWindowBonus: active.has("combo-extender") ? 0.45 : 0,
    secondWind: active.has("second-wind") && !chips.secondWindUsed,
    kiCostMultiplier: active.has("ki-saver") ? 0.75 : 1,
    dashStaminaMultiplier: active.has("quickstep") ? 0.8 : 1,
    passiveHealPerSecond: active.has("vital-spark") ? 0.75 : 0,
    kiDamageMultiplier: active.has("focus-lens") ? 1.15 : 1,
  };
}
// Call after lethal damage and before downing, swapping or counting a death.
export function trySecondWind(s: GameState): boolean {
  const hero = s.heroes[s.active];
  if (hero.hp > 0 || !chipEffects(s).secondWind) return false;
  itemsState(s).chips.secondWindUsed = true;
  hero.hp = Math.max(1, hero.maxHp * 0.35); hero.invulnerable = Math.max(hero.invulnerable, 1.4);
  if (s.coop) { s.coop.downed = false; s.coop.reviveProgress = 0; }
  s.knockX = s.knockY = 0;
  s.notice = "Second Wind! Rest at HOME to recharge this chip.";
  s.events.push({ type: "item", id: "chip-second-wind", kind: "chip" });
  return true;
}
export function resetSecondWind(s: GameState): void { itemsState(s).chips.secondWindUsed = false; }
