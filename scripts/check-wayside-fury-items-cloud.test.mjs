import assert from 'node:assert/strict';
import { test } from 'node:test';
import { newGame, syncCoopLevel } from '../src/pages/WaysideFury/game/sim.ts';
import { makeSave, makeNewGameSave, restoreSave } from '../src/pages/WaysideFury/game/save.ts';
import { mergeSaves } from '../src/pages/WaysideFury/game/cloud.ts';
import { itemsState, grantChip, equipChip } from '../src/pages/WaysideFury/game/u1/items/chips.ts';

function sheet(chip, time) {
  const state = newGame();
  grantChip(state, chip); equipChip(state, chip, 0);
  return { ...makeSave(state, null), savedAt: time };
}
test('cloud keeps newly acquired chips and newest personal loadout even when story progress wins elsewhere', () => {
  const newer = sheet('scanner', 20), progressed = sheet('sprinter', 10);
  progressed.chapter = 4;
  newer.u1.items.radar = { owned: true, enabled: false };
  const merged = mergeSaves(newer, progressed);
  assert.equal(merged.chapter, 4);
  assert.deepEqual(merged.u1.items.chips.owned, ['scanner', 'sprinter']);
  assert.deepEqual(merged.u1.items.chips.equipped, ['scanner', null, null]);
  assert.deepEqual(merged.u1.items.radar, { owned: true, enabled: false });
});
test('a stale full set cannot refill a spent wish, and derived stats persist exactly once', () => {
  const spent = sheet('scanner', 20), stale = sheet('scanner', 10);
  Object.assign(spent.u1.items.relics, { cycle: 1, wishes: ['wish-power'], statBonus: { power: 2, ward: 0 } });
  stale.u1.items.relics.collected = ['station-crest', 'blast-ember', 'realm-prism', 'forest-sigil', 'city-medallion', 'frost-bell', 'final-star'];
  const merged = mergeSaves(spent, stale);
  assert.equal(merged.u1.items.relics.cycle, 1);
  assert.deepEqual(merged.u1.items.relics.collected, []);
  const restored = restoreSave(merged);
  const power = restored.heroes.you.power;
  syncCoopLevel(restored);
  assert.equal(restored.heroes.you.power, power);
  assert.equal(restoreSave(makeSave(restored, merged), true).heroes.you.power, power);
  assert.equal(power, stale.heroes.you.power + 2);
  assert.deepEqual(merged.lastReported, stale.lastReported);
});
test('New Game keeps shipped collection and receipts while an old device cannot resurrect the reset loadout', () => {
  const before = sheet('scanner', 20);
  before.foundItems = ['pickup-c1-station-card'];
  const reset = makeNewGameSave(before);
  const merged = mergeSaves(reset, before);
  assert.deepEqual(merged.foundItems, before.foundItems);
  assert.deepEqual(merged.u1.items.chips.owned, []);
  assert.deepEqual(merged.lastReported, before.lastReported);
});
test('existing guardian and cache completion backfills each earned chip once', () => {
  const legacy = sheet('scanner', 10);
  delete legacy.u1;
  legacy.bosses = ['blast-gatekeeper', 'blast-watcher'];
  legacy.clearedRooms = ['loot-blast-8', 'loot-blast-9'];
  const restored = restoreSave(legacy);
  assert.deepEqual(new Set(itemsState(restored).chips.owned), new Set(['iron-guard', 'focus-lens', 'candy-magnet', 'ki-saver']));
  const again = restoreSave(makeSave(restored, legacy));
  assert.deepEqual(itemsState(again).chips.owned, itemsState(restored).chips.owned);
});
