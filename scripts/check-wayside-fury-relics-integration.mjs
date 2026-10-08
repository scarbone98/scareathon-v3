import assert from 'node:assert/strict';
import { newGame, enterScene, interactTarget, interact, step, idleInput, activeHero } from '../src/pages/WaysideFury/game/sim.ts';
import { makeSave, restoreSave, progressReport } from '../src/pages/WaysideFury/game/save.ts';
import { getWorld, isBlocked } from '../src/pages/WaysideFury/game/world.ts';
import { itemsState } from '../src/pages/WaysideFury/game/u1/items/chips.ts';
import { relicTargets, collectRelic, readyToSummon, chooseWish, RELICS, RELIC_SUMMON } from '../src/pages/WaysideFury/game/u1/items/relics.ts';
import { chipTargets, collectChip, itemWithinReach } from '../src/pages/WaysideFury/game/u1/items/pickups.ts';

const hub = () => { const s = newGame(23); enterScene(s, 'hub'); return s; };
const completeSet = s => {
  itemsState(s).relics.collected = RELICS.map(relic => relic.id);
  s.scene = 'hub'; s.room = 0; s.x = RELIC_SUMMON.x; s.y = RELIC_SUMMON.y;
};
const coop = (role = 'guest') => ({ role, seat: role === 'host' ? 0 : 1, remoteHeroes: [], appliedHits: [], playerCount: 1 });
const tick = s => step(s, idleInput(), 1 / 60);

const finder = hub(), relic = relicTargets(finder)[0];
finder.x = relic.x; finder.y = relic.y;
assert.equal(interactTarget(finder).id, relic.id, 'actual interaction target selects the nearby relic');
const beforeFind = progressReport(finder);
interact(finder);
assert.deepEqual(itemsState(finder).relics.collected, [relic.id]);
assert.equal(interactTarget(finder)?.id === relic.id, false, 'collected relic disappears from the prompt');
interact(finder);
assert.deepEqual(itemsState(finder).relics.collected, [relic.id]);
assert.deepEqual(progressReport(finder), beforeFind, 'interacting with personal relics cannot create ticket progress');
const guestFinder = hub(); guestFinder.coop = coop();
const guestRelic = relicTargets(guestFinder)[0]; guestFinder.x = guestRelic.x; guestFinder.y = guestRelic.y;
interact(guestFinder);
assert.deepEqual(itemsState(guestFinder).relics.collected, [guestRelic.id], 'guest collects its own relic before world interaction rejection');
assert.deepEqual(itemsState(hub()).relics.collected, [], 'personal collection leaves another player untouched');

for (const invalid of ['dead', 'downed', 'overlay']) {
  const s = hub(), target = relicTargets(s)[0]; s.x = target.x; s.y = target.y;
  if (invalid === 'dead') activeHero(s).hp = 0;
  else if (invalid === 'downed') { s.coop = coop(); s.coop.downed = true; }
  else s.overlay = 'home';
  assert.equal(collectRelic(s, target.id), false, `${invalid} player cannot collect a relic`);
  completeSet(s);
  assert.equal(readyToSummon(s), false, `${invalid} player cannot summon`);
  assert.equal(chooseWish(s, 'wish-power'), false, `${invalid} player cannot wish`);
  assert.equal(itemsState(s).relics.collected.length, 7, 'rejected action preserves the full set');
}

const altar = hub(); completeSet(altar);
assert.equal(interactTarget(altar).id, 'relic-summon');
interact(altar);
assert.equal(altar.overlay, 'wish', 'actual altar interaction opens wish selection');
assert.equal(readyToSummon(altar), true, 'wish overlay permits choosing an offered wish');
assert.equal(chooseWish(altar, 'wish-secret-boss'), true);
assert.equal(itemsState(altar).relics.secretBossUnlocked, true);
assert.equal(chooseWish(altar, 'wish-secret-boss'), false, 'one interaction consumes the set once');

const locked = hub(); enterScene(locked, 'dungeon', 9);
assert.equal(locked.enemies.some(enemy => enemy.kind === 'boss' && enemy.sprite === 'ghost'), false, 'secret encounter remains locked before a wish');
const host = hub(); host.coop = coop('host'); itemsState(host).relics.secretBossUnlocked = true;
enterScene(host, 'dungeon', 9);
assert.equal(host.enemies.filter(enemy => enemy.kind === 'boss' && enemy.sprite === 'ghost').length, 1, 'host spawns exactly one unlocked Relic Echo');
const guest = hub(); guest.coop = coop(); itemsState(guest).relics.secretBossUnlocked = true;
enterScene(guest, 'dungeon', 9);
assert.deepEqual(guest.enemies, [], 'guest cannot independently spawn the shared secret boss');

enterScene(altar, 'dungeon', 9);
const echo = altar.enemies.find(enemy => enemy.kind === 'boss' && enemy.sprite === 'ghost');
assert.ok(echo, 'the solo wish opens a playable boss encounter');
assert.equal(echo.maxHp, 340);
assert.equal(isBlocked(getWorld('dungeon', 9), echo.x, echo.y, echo.radius), false, 'secret boss spawns on legal collision ground');
// Finish the actual combat path at low HP; unrelated depot monsters do not
// participate in this focused encounter test.
altar.enemies = [echo]; echo.hp = 1; altar.x = echo.x - 24; altar.y = echo.y;
assert.equal(isBlocked(getWorld('dungeon', 9), altar.x, altar.y, 7), false);
step(altar, { ...idleInput(), attack: true }, 1 / 60);
assert.equal(altar.enemies.some(enemy => enemy.id === echo.id), false);
assert.equal(altar.bosses.filter(id => id === 'relic-echo').length, 1);
assert.equal(altar.events.filter(event => event.type === 'checkpoint' && event.id === 'relic-echo').length, 1);
const clearedReceipt = progressReport(altar).receipt;
enterScene(altar, 'dungeon', 9);
assert.equal(altar.enemies.some(enemy => enemy.sprite === 'ghost' && enemy.kind === 'boss'), false, 'cleared Echo cannot respawn');
tick(altar);
assert.equal(progressReport(altar, clearedReceipt).score, 0, 'revisiting the secret encounter cannot farm ticket progress');
const clearedSave = makeSave(altar, null); assert.ok(clearedSave);
for (const retry of [false, true]) {
  const restored = restoreSave(JSON.parse(JSON.stringify(clearedSave)), retry);
  enterScene(restored, 'dungeon', 9);
  assert.equal(restored.enemies.some(enemy => enemy.sprite === 'ghost' && enemy.kind === 'boss'), false, 'saved boss defeat suppresses respawn on continue/retry');
  assert.equal(restored.bosses.filter(id => id === 'relic-echo').length, 1);
}

const permanent = hub(), originalPower = activeHero(permanent).power;
const oldHome = makeSave(permanent, null, true); assert.ok(oldHome);
completeSet(permanent); interact(permanent);
assert.equal(chooseWish(permanent, 'wish-power'), true);
const powerSave = makeSave(permanent, oldHome); assert.ok(powerSave);
for (const retry of [false, true]) {
  const restored = restoreSave(powerSave, retry);
  assert.equal(activeHero(restored).power, originalPower + 2, 'latest permanent bonus applies exactly once to even an older HOME snapshot');
  assert.deepEqual(restored.gear, permanent.gear, 'base gear remains separate from the wish bonus');
  const twice = restoreSave(makeSave(restored, powerSave), retry);
  assert.equal(activeHero(twice).power, originalPower + 2, 'repeated save/restore cannot double-count the bonus');
}

const authoritative = hub(); authoritative.u1.world = { clearedObstacles: ['world-matt-station'] };
authoritative.coop = { ...coop(), worldObstacles: [] };
let target = relicTargets(authoritative)[0]; authoritative.x = target.x; authoritative.y = target.y;
assert.equal(target.gateId, 'world-matt-station');
assert.equal(itemWithinReach(authoritative, target), false, 'host-world closed gate wins over personal clear');
assert.equal(interactTarget(authoritative)?.id === target.id, false, 'closed relic has no misleading collection prompt');
assert.equal(collectRelic(authoritative, target.id), false);
authoritative.coop.worldObstacles = ['world-matt-station']; authoritative.u1.world.clearedObstacles = [];
assert.equal(itemWithinReach(authoritative, target), true, 'host-world clear wins over personal closed gate');
assert.equal(interactTarget(authoritative).id, target.id);
interact(authoritative);
assert.deepEqual(itemsState(authoritative).relics.collected, ['station-crest']);

const gatedChip = hub(); enterScene(gatedChip, 'dungeon', 0);
gatedChip.coop = { ...coop(), worldObstacles: [] };
target = chipTargets(gatedChip).find(item => item.id === 'chip-find-ki-coil');
gatedChip.x = target.x - 12; gatedChip.y = target.y;
assert.equal(collectChip(gatedChip, target.id), false, 'authoritative closed chip gate blocks guests');
gatedChip.coop.worldObstacles = ['world-joe-road'];
interact(gatedChip);
assert.ok(itemsState(gatedChip).chips.owned.includes('ki-coil'), 'authoritative clear permits per-player chip interaction');

console.log('Wayside Fury relic integration: personal interactions, alive/wish guards, host-only playable Echo, repeat suppression, permanent retries and U3 gate authority pass.');
