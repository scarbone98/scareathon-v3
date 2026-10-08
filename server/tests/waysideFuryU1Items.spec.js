import { describe, test, expect } from '@jest/globals';
import { sanitizeSave } from '../shared/waysideFury/save.js';
import { createItemsSave, sanitizeItemsSave } from '../shared/waysideFury/u1Items.js';
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
    const raw = legacySave({ u1: { items, world: { clearedObstacles: ['test-gate'], cycleSeconds: 72 }, combat: { training: { joe: 2 } } } });
    const result = sanitizeSave(raw).save;
    expect(result.u1.items).toEqual(items);
    expect(result.u1.world).toEqual(raw.u1.world); expect(result.u1.combat).toEqual(raw.u1.combat);
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
});
