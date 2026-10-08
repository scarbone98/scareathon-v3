// Item progress is personal. This bounded schema is shared by device and cloud saves.
export const CHIP_IDS = Object.freeze([
  'scanner', 'ki-coil', 'candy-magnet', 'sprinter', 'iron-guard', 'combo-extender',
  'second-wind', 'ki-saver', 'quickstep', 'vital-spark', 'focus-lens', 'lucky-star',
]);
export const RELIC_IDS = Object.freeze(['station-crest', 'blast-ember', 'realm-prism', 'forest-sigil', 'city-medallion', 'frost-bell', 'final-star']);
export const WISH_IDS = Object.freeze(['outfit-midnight-cab', 'outfit-starlight-crew', 'outfit-orchard-gold', 'wish-power', 'wish-ward', 'wish-secret-boss']);
export const OUTFIT_IDS = Object.freeze(['midnight-cab', 'starlight-crew', 'orchard-gold']);
const record = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const integer = (value, maximum = 10_000) => Number.isFinite(value) ? Math.max(0, Math.min(maximum, Math.floor(value))) : 0;
const knownIds = (value, allowed, maximum) => [...new Set((Array.isArray(value) ? value : [])
  .filter(id => allowed.includes(id)))].slice(-maximum);

export function createItemsSave() {
  return { chips: { owned: [], equipped: [null, null, null], secondWindUsed: false },
    relics: { collected: [], cycle: 0, wishes: [], outfits: [], statBonus: { power: 0, ward: 0 }, secretBossUnlocked: false },
    radar: { owned: false, enabled: false } };
}

export function sanitizeItemsSave(raw) {
  const source = record(raw), chips = record(source.chips), relics = record(source.relics), radar = record(source.radar);
  const owned = [...new Set((Array.isArray(chips.owned) ? chips.owned : []).filter(id => CHIP_IDS.includes(id)))];
  const equipped = [null, null, null], seen = new Set();
  for (let slot = 0; slot < equipped.length; slot++) {
    const id = Array.isArray(chips.equipped) ? chips.equipped[slot] : null;
    if (owned.includes(id) && !seen.has(id)) { equipped[slot] = id; seen.add(id); }
  }
  const statBonus = record(relics.statBonus);
  return { chips: { owned, equipped, secondWindUsed: chips.secondWindUsed === true },
    relics: { collected: knownIds(relics.collected, RELIC_IDS, 7), cycle: integer(relics.cycle),
      wishes: (Array.isArray(relics.wishes) ? relics.wishes : []).filter(id => WISH_IDS.includes(id)).slice(-128),
      outfits: knownIds(relics.outfits, OUTFIT_IDS, 3), statBonus: { power: integer(statBonus.power), ward: integer(statBonus.ward) },
      secretBossUnlocked: relics.secretBossUnlocked === true },
    radar: { owned: radar.owned === true, enabled: radar.owned === true && radar.enabled === true } };
}
