import assert from 'node:assert/strict';
import { createItemsSave, sanitizeItemsSave, sanitizeItemsNamespace, CHIP_IDS, RELIC_IDS } from '../server/shared/waysideFury/u1Items.js';
import { CHIPS, itemsState, unlockedChipSlots, grantChip, equipChip, chipEffects, trySecondWind, resetSecondWind } from '../src/pages/WaysideFury/game/u1/items/chips.ts';

  const freshState = (level = 1) => ({ character: { level, xp: 0 }, active: 'you',
    heroes: { you: { hp: 100, maxHp: 100, invulnerable: 0 } }, events: [], notice: '', knockX: 5, knockY: 8 });

  assert.equal(CHIPS.length, 12);
  assert.deepEqual(CHIPS.map(chip => chip.id), CHIP_IDS, 'registry and cloud schema agree');
  assert.equal(new Set(CHIPS.map(chip => chip.id)).size, 12);
  for (const [level, slots] of [[0, 1], [1, 1], [2, 1], [3, 2], [5, 2], [6, 3], [999, 3], [NaN, 1]]) {
    assert.equal(unlockedChipSlots(level), slots);
  }
  const legacy = freshState(), empty = createItemsSave();
  assert.deepEqual(itemsState(legacy), empty, 'old saves acquire item defaults');
  assert.equal(itemsState(legacy), legacy.u1.items, 'item references remain stable');
  const sibling = freshState(); sibling.u1 = { world: { clearedObstacles: ['gate-one'] } };
  itemsState(sibling);
  assert.deepEqual(sibling.u1.world, { clearedObstacles: ['gate-one'] }, 'items preserve sibling U1 progress');
  empty.chips.owned.push('scanner');
  assert.deepEqual(createItemsSave().chips.owned, [], 'default save objects are independent');

  const player = freshState();
  assert.equal(equipChip(player, 'scanner', 0), false, 'an unearned chip cannot equip');
  assert.equal(grantChip(player, 'scanner', 'station field kit'), true);
  assert.equal(grantChip(player, 'scanner', 'replayed reward'), false, 'replayed rewards are idempotent');
  assert.equal(grantChip(player, 'not-a-chip'), false);
  assert.equal(player.events.length, 1);
  assert.deepEqual(player.events[0], { type: 'item', id: 'scanner', kind: 'chip' }, 'item rewards do not create milestone/ticket deltas');
  assert.equal(equipChip(player, 'scanner', 0), true);
  assert.equal(equipChip(player, 'scanner', 0), false, 'unchanged loadout emits no event');
  assert.equal(equipChip(player, 'scanner', 1), false, 'level-one second slot is locked');
  assert.equal(equipChip(player, null, -1), false);
  assert.equal(equipChip(player, null, 0.5), false);
  assert.equal(equipChip(player, null, 3), false);
  player.character.level = 3;
  assert.equal(equipChip(player, 'scanner', 1), false, 'one chip cannot occupy two slots');
  assert.equal(equipChip(player, null, 0), true);
  assert.equal(equipChip(player, 'scanner', 1), true);
  player.character.level = 1;
  assert.equal(chipEffects(player).scanner, false, 'locked slots supply no effects after a level rollback');
  player.character.level = 3;
  assert.equal(chipEffects(player).scanner, true);
  player.character.level = 1;
  assert.equal(equipChip(player, 'scanner', 0), true, 'a chip retained in a locked slot can move to an unlocked slot after HOME retry');
  assert.deepEqual(itemsState(player).chips.equipped, ['scanner', null, null]);
  player.character.level = 3;
  assert.equal(equipChip(player, 'scanner', 1), false, 'reunlocking slots does not duplicate a moved chip');

  const expected = {
    scanner: ['scanner', true], 'ki-coil': ['kiChargeMultiplier', 1.3],
    'candy-magnet': ['candyMultiplier', 1.25], sprinter: ['moveSpeedMultiplier', 1.12],
    'iron-guard': ['incomingDamageMultiplier', 0.88], 'combo-extender': ['comboWindowBonus', 0.45],
    'second-wind': ['secondWind', true], 'ki-saver': ['kiCostMultiplier', 0.75],
    quickstep: ['dashStaminaMultiplier', 0.8], 'vital-spark': ['passiveHealPerSecond', 0.75],
    'focus-lens': ['kiDamageMultiplier', 1.15], 'lucky-star': ['candyBonusPerKill', 1],
  };
  const noChips = chipEffects(freshState());
  for (const id of CHIP_IDS) {
    const state = freshState(6); grantChip(state, id); equipChip(state, id, 0);
    const [field, value] = expected[id], effects = chipEffects(state);
    assert.equal(effects[field], value, `${id} passive effect`);
    for (const key of Object.keys(noChips).filter(key => key !== field)) {
      assert.equal(effects[key], noChips[key], `${id} does not alter unrelated ${key}`);
    }
  }
  const stacked = freshState(6);
  for (const [slot, id] of ['candy-magnet', 'lucky-star', 'sprinter'].entries()) { grantChip(stacked, id); equipChip(stacked, id, slot); }
  assert.equal(chipEffects(stacked).candyMultiplier, 1.25);
  assert.equal(chipEffects(stacked).candyBonusPerKill, 1);
  assert.equal(chipEffects(stacked).moveSpeedMultiplier, 1.12);

  const wind = freshState(); grantChip(wind, 'second-wind'); equipChip(wind, 'second-wind', 0);
  assert.equal(trySecondWind(wind), false, 'Second Wind only runs after lethal damage');
  wind.heroes.you.hp = 0; wind.coop = { downed: true, reviveProgress: 0.8 };
  assert.equal(trySecondWind(wind), true);
  assert.equal(wind.heroes.you.hp, 35);
  assert.equal(wind.heroes.you.invulnerable, 1.4);
  assert.equal(wind.coop.downed, false); assert.equal(wind.coop.reviveProgress, 0);
  assert.equal(wind.knockX, 0); assert.equal(wind.knockY, 0);
  wind.heroes.you.hp = 0;
  assert.equal(trySecondWind(wind), false, 'one revive between rests');
  const reloaded = freshState(); reloaded.u1 = { items: sanitizeItemsSave(JSON.parse(JSON.stringify(wind.u1.items))) };
  reloaded.heroes.you.hp = 0;
  assert.equal(trySecondWind(reloaded), false, 'reload cannot reset Second Wind');
  resetSecondWind(reloaded);
  assert.equal(trySecondWind(reloaded), true, 'HOME rest restores one charge');

  const malformed = sanitizeItemsSave({ chips: { owned: ['scanner', 'scanner', 'unknown', 'sprinter'],
    equipped: ['scanner', 'scanner', 'unknown', 'sprinter'], secondWindUsed: 'yes' },
    relics: { collected: [...RELIC_IDS, 'unknown', RELIC_IDS[0]], cycle: Infinity,
      wishes: [...Array(140).fill('wish-power'), 'unknown'], outfits: ['midnight-cab', 'midnight-cab', 'unknown'],
      statBonus: { power: 999999, ward: -9 }, secretBossUnlocked: 1 }, radar: { owned: false, enabled: true } });
  assert.deepEqual(malformed.chips, { owned: ['scanner', 'sprinter'], equipped: ['scanner', null, null], secondWindUsed: false });
  assert.deepEqual(malformed.relics.collected, RELIC_IDS);
  assert.equal(malformed.relics.cycle, 0);
  assert.equal(malformed.relics.wishes.length, 128, 'wish history is bounded and permits repeat wishes');
  assert.deepEqual(malformed.relics.outfits, ['midnight-cab']);
  assert.deepEqual(malformed.relics.statBonus, { power: 10000, ward: 0 });
  assert.equal(malformed.relics.secretBossUnlocked, false);
  assert.deepEqual(malformed.radar, { owned: false, enabled: false }, 'unowned radar cannot enable');
  for (const bad of [undefined, null, [], 42, 'legacy']) assert.deepEqual(sanitizeItemsSave(bad), createItemsSave());
  const siblings = { hub: { quests: { completed: ['help-scout'] } }, world: { clearedObstacles: ['test-gate'], cycleSeconds: 72 }, combat: { training: { joe: 2 } } };
  const namespace = sanitizeItemsNamespace({ ...siblings, unknown: { value: 1 } });
  assert.deepEqual(namespace, { items: createItemsSave(), ...siblings });
  assert.notEqual(namespace.world, siblings.world, 'sibling data is copied independently');
  let deep = 'too deep';
  for (let level = 0; level < 7; level++) deep = { child: deep };
  const cyclic = {}; cyclic.child = cyclic;
  for (const invalid of [deep, cyclic, { entries: Array(257).fill(0) }, Object.fromEntries(Array.from({ length: 65 }, (_, index) => [`key${index}`, 0])),
    { text: 'x'.repeat(513) }, { count: Infinity }, { missing: undefined }, { method: () => 1 }, new Date(), [], 'wrong type',
    JSON.parse('{"__proto__":{"polluted":true}}'), { nested: { constructor: {} } }, { nested: [{ prototype: 'bad' }] },
    Object.create({ inherited: true })]) assert.deepEqual(sanitizeItemsNamespace({ world: invalid }), { items: createItemsSave() });
  assert.equal({}.polluted, undefined);
  console.log('Wayside Fury chips: all 12 passives, slot/ownership rules, per-player rewards, Second Wind persistence and bounded migration pass.');
