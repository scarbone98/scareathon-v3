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
const unsafeKeys = new Set(['__proto__', 'constructor', 'prototype']);
const invalidTree = Symbol('invalid item namespace');
function copySafeTree(value, depth = 0) {
  if (depth > 6) return invalidTree;
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : invalidTree;
  if (typeof value === 'string') return value.length <= 512 ? value : invalidTree;
  if (!value || typeof value !== 'object') return invalidTree;
  if (Array.isArray(value)) {
    if (value.length > 256 || Object.getPrototypeOf(value) !== Array.prototype
      || Reflect.ownKeys(value).some(key => typeof key !== 'string' || (key !== 'length' && !/^(0|[1-9][0-9]*)$/.test(key)))) return invalidTree;
    const copied = [];
    for (let index = 0; index < value.length; index++) {
      const entry = Object.getOwnPropertyDescriptor(value, String(index));
      if (!entry || !Object.hasOwn(entry, 'value')) return invalidTree;
      const child = copySafeTree(entry.value, depth + 1);
      if (child === invalidTree) return invalidTree;
      copied.push(child);
    }
    return copied;
  }
  const prototype = Object.getPrototypeOf(value), keys = Reflect.ownKeys(value);
  if ((prototype !== Object.prototype && prototype !== null) || keys.length > 64) return invalidTree;
  const copied = {};
  for (const key of keys) {
    if (typeof key !== 'string' || key.length > 512 || unsafeKeys.has(key)) return invalidTree;
    const entry = Object.getOwnPropertyDescriptor(value, key);
    if (!entry?.enumerable || !Object.hasOwn(entry, 'value')) return invalidTree;
    const child = copySafeTree(entry.value, depth + 1);
    if (child === invalidTree) return invalidTree;
    copied[key] = child;
  }
  return copied;
}

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

// Campaign progress and personal item intent can come from different devices.
// Wish rewards belong to one relic cycle branch; adding branches would duplicate them.
export function mergeItemsSaves(preferredMostRecent, alternate) {
  const preferred = sanitizeItemsSave(preferredMostRecent), other = sanitizeItemsSave(alternate);
  const chips = preferred.chips.owned.length ? preferred.chips : other.chips;
  const relics = other.relics.cycle > preferred.relics.cycle ? other.relics : preferred.relics;
  return sanitizeItemsSave({
    chips: { ...chips, owned: [...preferred.chips.owned, ...other.chips.owned] },
    relics: { ...relics, collected: preferred.relics.cycle === other.relics.cycle
      ? [...preferred.relics.collected, ...other.relics.collected] : relics.collected },
    radar: { owned: preferred.radar.owned || other.radar.owned,
      enabled: preferred.radar.owned ? preferred.radar.enabled : other.radar.enabled },
  });
}

// Keep the other sessions' bounded JSON until their domain sanitizers merge.
// Unknown top-level namespaces and unsafe sibling trees never enter a cloud save.
export function sanitizeItemsNamespace(raw) {
  const source = record(raw), cleaned = { items: sanitizeItemsSave(source.items) };
  for (const name of ['hub', 'world', 'combat']) {
    try {
      const entry = Object.getOwnPropertyDescriptor(source, name);
      if (!entry || !Object.hasOwn(entry, 'value') || !entry.value || typeof entry.value !== 'object' || Array.isArray(entry.value)) continue;
      const copy = copySafeTree(entry.value);
      if (copy !== invalidTree) cleaned[name] = copy;
    } catch { /* A malformed namespace does not discard valid personal items. */ }
  }
  return cleaned;
}
