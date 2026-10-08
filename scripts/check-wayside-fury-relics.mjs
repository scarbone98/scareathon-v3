import assert from 'node:assert/strict';
import { newGame, enterScene } from '../src/pages/WaysideFury/game/sim.ts';
import { getWorld, isBlocked } from '../src/pages/WaysideFury/game/world.ts';
import { makeSave, restoreSave, progressReport } from '../src/pages/WaysideFury/game/save.ts';
import { sanitizeItemsSave, RELIC_IDS, WISH_IDS, OUTFIT_IDS } from '../server/shared/waysideFury/u1Items.js';
import { itemsState } from '../src/pages/WaysideFury/game/u1/items/chips.ts';
import { chipTargets, collectChip } from '../src/pages/WaysideFury/game/u1/items/pickups.ts';
import { registerItemGateAnchors } from '../src/pages/WaysideFury/game/u1/items/gating.ts';
import { RELICS, RELIC_SUMMON, OUTFITS, WISH_OPTIONS, relicTargets, collectRelic,
  hasAllRelics, readyToSummon, availableWishes, chooseWish } from '../src/pages/WaysideFury/game/u1/items/relics.ts';

const stateAt = (scene, room = 0) => {
  const state = newGame(17); enterScene(state, scene, room); state.enemies = [];
  return state;
};
const completeSet = state => {
  // A completed later-chapter save: the four future slots intentionally have no
  // spawn in today's first chapter, so tests never pretend they are obtainable.
  itemsState(state).relics.collected = RELICS.map(relic => relic.id);
  state.scene = 'hub'; state.room = 0; state.x = RELIC_SUMMON.x; state.y = RELIC_SUMMON.y;
};
assert.equal(RELICS.length, 7);
assert.deepEqual(RELICS.map(relic => relic.id), RELIC_IDS);
assert.deepEqual(WISH_OPTIONS.map(wish => wish.id), WISH_IDS);
assert.deepEqual(OUTFITS.map(outfit => outfit.id), OUTFIT_IDS);
assert.equal(new Set(RELICS.map(relic => relic.area)).size, 7, 'each relic belongs to one distinct area');
assert.equal(RELICS.filter(relic => relic.locked).length, 4);
assert.ok(RELICS.filter(relic => relic.locked).every(relic => !relic.scene && !relic.anchors.length));
assert.deepEqual(sanitizeItemsSave(undefined).relics,
  { collected: [], cycle: 0, wishes: [], outfits: [], statBonus: { power: 0, ward: 0 }, secretBossUnlocked: false });

// An independent swept grid traversal proves every scatter location can be
// reached from the map's spawn with the actual hero radius and prop footprints.
const fields = new Map();
function reachable(world, target) {
  const spacing = 4, cols = Math.floor(world.width / spacing) + 1, rows = Math.floor(world.height / spacing) + 1;
  let seen = fields.get(world);
  if (!seen) {
    seen = new Uint8Array(cols * rows);
    const origin = Math.round(world.spawn.y / spacing) * cols + Math.round(world.spawn.x / spacing);
    const queue = [origin]; seen[origin] = 1;
    for (let i = 0; i < queue.length; i++) {
      const node = queue[i], x = node % cols, y = Math.floor(node / cols);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy, next = ny * cols + nx;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows || seen[next]) continue;
        let clear = true;
        for (let t = 0; t <= spacing; t++) {
          if (isBlocked(world, x * spacing + dx * t, y * spacing + dy * t, 7)) { clear = false; break; }
        }
        if (clear) { seen[next] = 1; queue.push(next); }
      }
    }
    fields.set(world, seen);
  }
  return seen[Math.round(target.y / spacing) * cols + Math.round(target.x / spacing)] === 1;
}
for (const definition of RELICS.filter(relic => !relic.locked)) {
  const state = stateAt(definition.scene, definition.room);
  const world = getWorld(definition.scene, definition.room), visited = new Set();
  for (let cycle = 0; cycle < 9; cycle++) {
    itemsState(state).relics.cycle = cycle;
    const [target] = relicTargets(state);
    assert.equal(target.id, definition.id);
    assert.equal(isBlocked(world, target.x, target.y, 7), false, `${target.id} cycle ${cycle}: clear ground`);
    assert.equal(reachable(world, target), true, `${target.id} cycle ${cycle}: reachable scatter`);
    assert.deepEqual(relicTargets(state), relicTargets(structuredClone(state)), 'scatter deterministic without world RNG');
    visited.add(`${target.x},${target.y}`);
  }
  assert.equal(visited.size, definition.anchors.length, 'every authored scatter alternative is used');
}
assert.equal(reachable(getWorld('hub'), RELIC_SUMMON), true, 'hub summon point is reachable');

const collector = stateAt('hub');
for (const relic of RELICS.filter(relic => !relic.locked)) {
  assert.equal(collectRelic(collector, relic.id), false, 'wrong scene or distant position cannot collect');
  enterScene(collector, relic.scene, relic.room); collector.enemies = [];
  const target = relicTargets(collector).find(item => item.id === relic.id);
  collector.x = target.x + 25; collector.y = target.y;
  assert.equal(collectRelic(collector, relic.id), false, 'collect requires 24px range');
  collector.x = target.x; collector.y = target.y;
  assert.equal(collectRelic(collector, relic.id), true);
  assert.equal(collectRelic(collector, relic.id), false, 'a relic cannot be collected twice per cycle');
  assert.equal(relicTargets(collector).some(item => item.id === relic.id), false);
}
assert.equal(itemsState(collector).relics.collected.length, 3);
assert.equal(hasAllRelics(collector), false, 'first-chapter relics do not form a complete set');
for (const relic of RELICS.filter(relic => relic.locked)) assert.equal(collectRelic(collector, relic.id), false);
assert.equal(collectRelic(collector, 'invented-relic'), false);
const wrongRoom = stateAt('dungeon', 0); wrongRoom.x = 440; wrongRoom.y = 192;
assert.equal(collectRelic(wrongRoom, 'blast-ember'), false);
assert.deepEqual(relicTargets(stateAt('overworld')), [], 'taxi map has no duplicate hub relic');

const throughWall = stateAt('hub'), world = getWorld('hub');
const wallTarget = relicTargets(throughWall)[0];
throughWall.x = wallTarget.x - 20; throughWall.y = wallTarget.y;
world.props.push({ id: 'relic-test-wall', kind: 'fence', x: wallTarget.x - 11, y: wallTarget.y - 6, w: 2, h: 12,
  footprints: [{ x: wallTarget.x - 11, y: wallTarget.y - 6, w: 2, h: 12 }] });
try { assert.equal(collectRelic(throughWall, wallTarget.id), false, 'a solid prop blocks collection through a wall'); }
finally { world.props.pop(); }
assert.equal(collectRelic(throughWall, wallTarget.id), true);

const gatedRelic = stateAt('hub');
assert.deepEqual({ x: relicTargets(gatedRelic)[0].x, y: relicTargets(gatedRelic)[0].y }, RELICS[0].anchors[0], 'without U3 the original anchor remains accessible');
gatedRelic.u1.world = { clearedObstacles: [] };
const closedRelic = relicTargets(gatedRelic)[0];
assert.equal(closedRelic.gateId, 'world-matt-station');
assert.deepEqual({ x: closedRelic.x, y: closedRelic.y }, { x: 324, y: 104 });
gatedRelic.x = closedRelic.x; gatedRelic.y = closedRelic.y;
assert.equal(collectRelic(gatedRelic, closedRelic.id), false, 'registered uncleared gate rejects relic collection');
gatedRelic.u1.world.clearedObstacles.push(closedRelic.gateId);
assert.equal(collectRelic(gatedRelic, closedRelic.id), true, 'cleared station gate exposes its relic');
for (const cycle of [1, 2]) {
  const scattered = stateAt('hub'); itemsState(scattered).relics.cycle = cycle;
  scattered.u1.world = { clearedObstacles: [] };
  const target = relicTargets(scattered)[0];
  assert.equal(target.gateId, undefined, 'later scatter alternatives preserve their existing accessible anchors');
  assert.deepEqual({ x: target.x, y: target.y }, RELICS[0].anchors[cycle]);
}
for (const [id, room, gateId, x, y] of [
  ['chip-find-ki-coil', 0, 'world-joe-road', 164, 96],
  ['chip-find-combo-extender', 2, 'world-alex-yard', 372, 88],
]) {
  const state = stateAt('dungeon', room);
  const original = chipTargets(state).find(target => target.id === id);
  assert.equal(original.gateId, undefined);
  state.u1.world = { clearedObstacles: [] };
  const gated = chipTargets(state).find(target => target.id === id);
  assert.deepEqual({ x: gated.x, y: gated.y, gateId: gated.gateId }, { x, y, gateId });
  // Approach from legal ground beside the reward anchor.
  state.x = x - 12; state.y = y;
  assert.equal(isBlocked(getWorld('dungeon', room), state.x, state.y, 7), false);
  assert.equal(collectChip(state, id), false);
  state.u1.world.clearedObstacles.push(gateId);
  assert.equal(collectChip(state, id), true);
}
const registeredGateState = stateAt('dungeon', 2);
registeredGateState.u1.world = { clearedObstacles: [] };
try {
  const registry = [{ id: 'world-alex-yard', rewardAnchor: { x: 380, y: 92 } }];
  registerItemGateAnchors(registry);
  let target = chipTargets(registeredGateState).find(item => item.id === 'chip-find-combo-extender');
  assert.deepEqual({ x: target.x, y: target.y, gateId: target.gateId }, { x: 380, y: 92, gateId: 'world-alex-yard' }, 'merged world registry owns item gate coordinates');
  registry[0].rewardAnchor.x = 9999;
  assert.equal(chipTargets(registeredGateState).find(item => item.id === target.id).x, 380, 'registration copies anchors');
  registerItemGateAnchors([{ id: 'world-alex-yard', rewardAnchor: { x: NaN, y: 92 } }]);
  target = chipTargets(registeredGateState).find(item => item.id === target.id);
  assert.deepEqual({ x: target.x, y: target.y }, { x: 372, y: 88 }, 'invalid registry anchor retains the validated fallback');
} finally { registerItemGateAnchors([]); }

const summoner = stateAt('hub');
summoner.x = RELIC_SUMMON.x; summoner.y = RELIC_SUMMON.y;
assert.equal(readyToSummon(summoner), false);
assert.equal(chooseWish(summoner, 'wish-power'), false, 'partial set cannot wish');
completeSet(summoner);
assert.equal(hasAllRelics(summoner), true);
assert.equal(readyToSummon(summoner), true);
summoner.scene = 'realm'; assert.equal(chooseWish(summoner, 'wish-power'), false, 'summon only at hub');
summoner.scene = 'hub'; summoner.x += RELIC_SUMMON.radius + 1;
assert.equal(chooseWish(summoner, 'wish-power'), false, 'summon only near the hub seal');
summoner.x = RELIC_SUMMON.x;
assert.equal(chooseWish(summoner, 'invented-wish'), false);
assert.equal(chooseWish(summoner, 'outfit-orchard-gold'), false, 'only this cycle\'s offered wishes can grant');
assert.equal(itemsState(summoner).relics.collected.length, 7, 'rejected choice leaves the set intact');

const guestVictor = stateAt('hub'); completeSet(guestVictor);
guestVictor.bosses.push('relic-echo');
assert.equal(itemsState(guestVictor).relics.secretBossUnlocked, false, 'a guest can defeat the host challenger without a personal unlock');
const beforeRejectedWish = structuredClone(itemsState(guestVictor).relics);
assert.equal(availableWishes(guestVictor).some(wish => wish.id === 'wish-secret-boss'), false, 'a defeated challenger cannot be unlocked again');
assert.equal(chooseWish(guestVictor, 'wish-secret-boss'), false);
assert.deepEqual(itemsState(guestVictor).relics, beforeRejectedWish, 'rejecting the defeated challenger leaves all seven relics and rewards intact');
assert.ok(availableWishes(guestVictor).some(wish => wish.id === 'wish-power'));
assert.ok(availableWishes(guestVictor).some(wish => wish.id === 'outfit-starlight-crew'), 'a second cosmetic replaces the unavailable challenger');
assert.equal(chooseWish(guestVictor, 'outfit-starlight-crew'), true, 'the replacement cosmetic remains usable');
completeSet(guestVictor); itemsState(guestVictor).relics.outfits = OUTFITS.map(outfit => outfit.id);
assert.ok(availableWishes(guestVictor).some(wish => wish.id === 'wish-power'), 'the second stat replaces the challenger when all cosmetics are owned');
assert.equal(chooseWish(guestVictor, 'wish-power'), true);

const originalPower = summoner.heroes.you.power, originalGear = { ...summoner.gear };
const beforeProgress = progressReport(summoner);
assert.equal(chooseWish(summoner, 'wish-power'), true);
assert.equal(itemsState(summoner).relics.statBonus.power, 2);
assert.equal(summoner.heroes.you.power, originalPower + 2);
assert.deepEqual(summoner.gear, originalGear, 'wish bonus has its own permanent namespace');
assert.equal(itemsState(summoner).relics.cycle, 1);
assert.deepEqual(itemsState(summoner).relics.collected, []);
assert.equal(chooseWish(summoner, 'wish-power'), false, 'double click cannot pay a second wish');
assert.equal(itemsState(summoner).relics.cycle, 1, 'rejected double click cannot scatter twice');
assert.equal(summoner.candy, 0);
assert.deepEqual(progressReport(summoner), beforeProgress, 'wishes never create ticket progress');
assert.equal(summoner.events.some(event => event.type === 'checkpoint'), false, 'item events never masquerade as receipted room clears');
assert.deepEqual(relicTargets(summoner)[0].x, RELICS[0].anchors[1].x, 'relic scatters to a new spot after a wish');
assert.ok(availableWishes(summoner).some(wish => wish.id === 'wish-ward'));
assert.ok(availableWishes(summoner).some(wish => wish.id === 'outfit-starlight-crew'));

completeSet(summoner);
assert.equal(chooseWish(summoner, 'outfit-starlight-crew'), true);
assert.deepEqual(itemsState(summoner).relics.outfits, ['starlight-crew']);
assert.equal(itemsState(summoner).relics.cycle, 2);
completeSet(summoner);
assert.equal(chooseWish(summoner, 'wish-secret-boss'), true);
assert.equal(itemsState(summoner).relics.secretBossUnlocked, true);
assert.equal(availableWishes(summoner).some(wish => wish.id === 'wish-secret-boss'), false, 'boss unlock is offered once');
assert.equal(availableWishes(summoner).some(wish => wish.outfit === 'starlight-crew'), false, 'owned cosmetic cannot waste another wish');
completeSet(summoner);
assert.equal(chooseWish(summoner, 'wish-ward'), true);
assert.deepEqual(itemsState(summoner).relics.statBonus, { power: 2, ward: 1 });
assert.deepEqual(itemsState(summoner).relics.wishes, ['wish-power', 'outfit-starlight-crew', 'wish-secret-boss', 'wish-ward']);

// All seven stable IDs, rotating wishes and permanent rewards survive JSON,
// device/cloud sanitizer and both ordinary continue and HOME retry.
completeSet(summoner);
const snapshot = makeSave(summoner, null, true);
assert.ok(snapshot);
const persisted = JSON.parse(JSON.stringify(snapshot));
assert.deepEqual(persisted.u1.items.relics, itemsState(summoner).relics);
for (const retry of [false, true]) {
  const restored = restoreSave(persisted, retry);
  assert.deepEqual(itemsState(restored).relics, itemsState(summoner).relics);
  assert.equal(hasAllRelics(restored), true);
  assert.equal(restored.heroes.you.power, originalPower + 2, 'derived power restores wish bonus exactly once');
}
assert.deepEqual(sanitizeItemsSave({ relics: { collected: [...RELIC_IDS, 'invented-relic', RELIC_IDS[0]],
  cycle: -2, wishes: ['wish-power', 'invented-wish'], outfits: ['starlight-crew', 'fake'],
  statBonus: { power: NaN, ward: -1 }, secretBossUnlocked: 1 } }).relics,
{ collected: RELIC_IDS, cycle: 0, wishes: ['wish-power'], outfits: ['starlight-crew'], statBonus: { power: 0, ward: 0 }, secretBossUnlocked: false });

const capped = stateAt('hub'); completeSet(capped);
itemsState(capped).relics.statBonus.power = 9_999; capped.heroes.you.power = 10_000;
assert.equal(chooseWish(capped, 'wish-power'), true);
assert.equal(itemsState(capped).relics.statBonus.power, 10_000, 'runtime bonus respects the same bound as persisted saves');
assert.equal(capped.heroes.you.power, 10_000, 'derived combat stat stays bounded before the next normalization');

console.log('Wayside Fury relics: chapter slots, honest scatter, collection, rotating wishes, permanent rewards and save/retry checks pass.');
