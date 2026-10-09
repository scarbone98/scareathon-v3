import { describe, test, expect } from '@jest/globals';
import { sanitizeSave } from '../shared/waysideFury/save.js';
import { createItemsSave, mergeItemsSaves, sanitizeItemsSave, sanitizeItemsNamespace } from '../shared/waysideFury/u1Items.js';
import { legacySave } from './helpers/waysideFurySaveFixtures.js';

describe('Wayside Fury personal Update 1 inventory', () => {
  test('old saves migrate to independent empty personal inventory', () => {
    const first = sanitizeSave(legacySave()).save;
    const second = sanitizeSave(legacySave()).save;
    expect(first.u1.items).toEqual(createItemsSave());
    first.u1.items.chips.owned.push('scanner');
    expect(second.u1.items.chips.owned).toEqual([]);
  });
  test('round trips inventory while retaining other sessions namespaces and ticket receipts', () => {
    const items = createItemsSave();
    items.chips.owned = ['scanner', 'second-wind']; items.chips.equipped = ['scanner', null, null];
    items.chips.secondWindUsed = true; items.radar = { owned: true, enabled: false };
    items.relics.collected = ['station-crest', 'blast-ember'];
    const raw = legacySave({ u1: { items, hub: { arena: { bestScore: 42 }, quests: { accepted: ['test-quest'] } },
      world: { clearedObstacles: ['test-gate'], cycleSeconds: 72 }, combat: { training: { joe: 2 } } } });
    const result = sanitizeSave(raw).save;
    expect(result.u1.items).toEqual(items);
    expect(result.u1.hub).toEqual(raw.u1.hub); expect(result.u1.world).toEqual(raw.u1.world); expect(result.u1.combat).toEqual(raw.u1.combat);
    expect(result.u1.world).not.toBe(raw.u1.world);
    expect(result.lastReported).toEqual(raw.lastReported);
    expect(result.clearedRooms).toEqual(raw.clearedRooms);
  });
  test('sanitizes unknown IDs, duplicate equips and invalid values', () => {
    const items = sanitizeItemsSave({ chips: { owned: ['scanner', 'bogus', 'scanner'], equipped: ['scanner', 'scanner', 'sprinter'], secondWindUsed: true },
      relics: { collected: ['station-crest', 'station-crest', 'bogus'], cycle: Infinity, statBonus: { power: -5, ward: 999999 } },
      radar: { owned: false, enabled: true } });
    expect(items.chips.owned).toEqual(['scanner']); expect(items.chips.equipped).toEqual(['scanner', null, null]);
    expect(items.relics.collected).toEqual(['station-crest']); expect(items.relics.cycle).toBe(0);
    expect(items.relics.statBonus.power).toBe(0); expect(items.relics.statBonus.ward).toBe(10000);
    expect(items.radar).toEqual({ owned: false, enabled: false });
  });
  test('merges acquired chips while preserving the newest loadout and spent-charge intent', () => {
    const preferred = createItemsSave(), alternate = createItemsSave();
    preferred.chips = { owned: ['sprinter', 'second-wind'], equipped: [null, 'sprinter', null], secondWindUsed: false };
    alternate.chips = { owned: ['scanner', 'second-wind'], equipped: ['second-wind', 'scanner', null], secondWindUsed: true };
    preferred.radar = { owned: true, enabled: false }; alternate.radar = { owned: true, enabled: true };
    const merged = mergeItemsSaves(preferred, alternate);
    expect(merged.chips).toEqual({ ...preferred.chips, owned: ['sprinter', 'second-wind', 'scanner'] });
    expect(merged.radar).toEqual(preferred.radar);
    expect(mergeItemsSaves(merged, alternate)).toEqual(merged);
    merged.chips.owned.push('iron-guard');
    expect(preferred.chips.owned).toEqual(['sprinter', 'second-wind']);
    expect(alternate.chips.owned).toEqual(['scanner', 'second-wind']);
  });
  test('uses the older item intent only when the newest save has no owned inventory', () => {
    const alternate = createItemsSave();
    alternate.chips = { owned: ['second-wind'], equipped: ['second-wind', null, null], secondWindUsed: true };
    alternate.radar = { owned: true, enabled: true };
    const merged = mergeItemsSaves(undefined, alternate);
    expect(merged.chips).toEqual(alternate.chips); expect(merged.radar).toEqual(alternate.radar);
    expect(mergeItemsSaves({ chips: { owned: ['invalid'], equipped: ['invalid'] } }, alternate)).toEqual(merged);
  });
  test('keeps the higher relic cycle without refilling it from a stale completed collection', () => {
    const newer = createItemsSave(), older = createItemsSave();
    newer.relics = { ...newer.relics, cycle: 2, collected: [], wishes: ['wish-power', 'wish-ward'], statBonus: { power: 2, ward: 1 } };
    older.relics = { ...older.relics, cycle: 1, collected: ['station-crest', 'blast-ember', 'realm-prism', 'forest-sigil', 'city-medallion', 'frost-bell', 'final-star'],
      wishes: ['wish-secret-boss'], secretBossUnlocked: true };
    expect(mergeItemsSaves(newer, older).relics).toEqual(newer.relics);
    expect(mergeItemsSaves(older, newer).relics).toEqual(newer.relics);
  });
  test('unions only same-cycle relic collection and chooses one conflicting wish branch', () => {
    const preferred = createItemsSave(), alternate = createItemsSave();
    preferred.relics = { ...preferred.relics, cycle: 1, collected: ['station-crest'], wishes: ['wish-power'], statBonus: { power: 2, ward: 0 } };
    alternate.relics = { ...alternate.relics, cycle: 1, collected: ['station-crest', 'blast-ember'], wishes: ['outfit-midnight-cab', 'wish-ward', 'wish-secret-boss'],
      outfits: ['midnight-cab'], statBonus: { power: 0, ward: 1 }, secretBossUnlocked: true };
    const merged = mergeItemsSaves(preferred, alternate);
    expect(merged.relics).toEqual({ ...preferred.relics, collected: ['station-crest', 'blast-ember'] });
    const base = sanitizeSave(legacySave()).save;
    const saved = sanitizeSave({ ...base, u1: { ...base.u1, items: merged } }).save;
    expect(saved.heroes.you.power).toBe(base.heroes.you.power + 2);
    expect(saved.heroes.you.defense).toBe(base.heroes.you.defense);
    expect(sanitizeSave(saved).save.heroes).toEqual(saved.heroes);
    expect(saved.lastReported).toEqual(base.lastReported);
    expect(saved.clearedRooms).toEqual(base.clearedRooms);
  });
  test('retains only known object namespaces and bounded finite JSON trees', () => {
    const valid = { hub: { quests: ['help-scout'], completed: true }, world: { cycleSeconds: 72 }, combat: { training: { joe: 2 } } };
    expect(sanitizeItemsNamespace({ ...valid, unknown: { arbitrary: true }, scratch: 42 })).toEqual({ items: createItemsSave(), ...valid });
    let deep = 'too deep';
    for (let level = 0; level < 7; level++) deep = { child: deep };
    for (const invalid of [deep, { entries: Array(257).fill(0) }, Object.fromEntries(Array.from({ length: 65 }, (_, index) => [`key${index}`, 0])),
      { text: 'x'.repeat(513) }, { count: Infinity }, { count: NaN }, { missing: undefined }, { method: () => 1 }, new Date(), [], 'wrong type']) {
      const cleaned = sanitizeItemsNamespace({ items: { chips: { owned: ['scanner'] } }, world: invalid, combat: valid.combat });
      expect(cleaned.world).toBeUndefined(); expect(cleaned.combat).toEqual(valid.combat);
      expect(cleaned.items.chips.owned).toEqual(['scanner']);
    }
  });
  test('rejects unsafe keys and custom prototypes at every sibling depth', () => {
    const malicious = [JSON.parse('{"__proto__":{"polluted":true}}'), { nested: JSON.parse('{"constructor":{"polluted":true}}') },
      { nested: [{ prototype: 'bad' }] }, Object.create({ inherited: true }), { nested: Object.create({ inherited: true }) }];
    for (const world of malicious) expect(sanitizeItemsNamespace({ world })).toEqual({ items: createItemsSave() });
    expect(sanitizeSave(legacySave({ u1: { world: malicious[0], unknown: { anything: true }, hub: { accepted: [] } } })).save.u1)
      .toEqual({ items: createItemsSave(), hub: { accepted: [] } });
    expect({}.polluted).toBeUndefined();
  });
});
