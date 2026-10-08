import assert from 'node:assert/strict';
import { newGame, enterScene } from '../src/pages/WaysideFury/game/sim.ts';
import { getWorld, isBlocked, TILE } from '../src/pages/WaysideFury/game/world.ts';
import { itemsState } from '../src/pages/WaysideFury/game/u1/items/chips.ts';
import { RELICS, relicTargets, collectRelic } from '../src/pages/WaysideFury/game/u1/items/relics.ts';
import { RADAR_PICKUP, radarReading, radarTargets, radarPickupTarget, collectRadar, toggleRadar } from '../src/pages/WaysideFury/game/u1/items/radar.ts';

const ready = () => {
  const state = newGame(341);
  enterScene(state, 'dungeon', 2);
  state.x = 200; state.y = 200;
  Object.assign(itemsState(state).radar, { owned: true, enabled: true });
  return state;
};
const target = (state, id, x, y, extra = {}) => ({ id, scene: state.scene, room: state.room, area: 'blast', x, y, ...extra });
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} is near ${b}`);

// Native compass bearings track cardinal and diagonal directions, plus the
// continuous angle between them. Distances use the world's actual tile scale.
for (const [dx, dy, direction, bearing] of [[0, -32, 'N', 0], [32, -32, 'NE', 45], [32, 0, 'E', 90],
  [32, 32, 'SE', 135], [0, 32, 'S', 180], [-32, 32, 'SW', 225], [-32, 0, 'W', 270], [-32, -32, 'NW', 315]]) {
  const state = ready();
  const reading = radarReading(state, [target(state, 'find', state.x + dx, state.y + dy)]);
  assert.equal(reading.direction, direction); near(reading.bearing, bearing);
  near(reading.distance, Math.hypot(dx, dy)); near(reading.distanceTiles, Math.hypot(dx, dy) / TILE);
}
const angled = ready();
near(radarReading(angled, [target(angled, 'find', angled.x + 12, angled.y - 27)]).bearing, Math.atan2(12, 27) * 180 / Math.PI);
near(radarReading(angled, [target(angled, 'find', angled.x + 48, angled.y + 64)]).distance, 80);
assert.equal(radarReading(angled, [target(angled, 'here', angled.x, angled.y)]).distance, 0);

// The nearest unclaimed signal wins. Equal distances resolve by stable ID,
// irrespective of registry insertion order, so a compass never chatters.
const state = ready();
const targets = [target(state, 'far', 280, 200), target(state, 'zeta', 232, 200), target(state, 'alpha', 168, 200)];
assert.equal(radarReading(state, targets).id, 'alpha');
assert.equal(radarReading(state, targets.toReversed()).id, 'alpha');
assert.equal(radarReading(state, [target(state, 'nearest', 210, 200), ...targets]).id, 'nearest');
assert.equal(radarReading(state, [target(state, 'found', 201, 200, { found: true }), target(state, 'collected', 202, 200, { collected: true }), ...targets]).id, 'alpha');
itemsState(state).relics.collected.push('station-crest');
assert.equal(radarReading(state, [target(state, 'station-crest', 201, 200, { kind: 'relic' }), ...targets]).id, 'alpha');
assert.equal(radarReading(state, [target(state, 'no-name', 210, 200)]).name, 'Hidden find');

// Area and room boundaries prevent spoilers and unreachable signals. The
// optional JOB E adapter can offer many areas; filtering remains local.
const wrong = [target(state, 'other-room', 201, 200, { room: 3 }), target(state, 'missing-room', 201, 200, { room: undefined }),
  target(state, 'other-scene', 201, 200, { scene: 'realm' }), target(state, 'future-area', 201, 200, { area: 'city' }),
  target(state, 'bad-coordinate', NaN, 200)];
assert.deepEqual(radarTargets(state, wrong), []);
assert.equal(radarReading(state, [...wrong, target(state, 'current', 232, 200)]).id, 'current');
assert.equal(radarReading(state, [target(state, 'room-alias', 232, 200, { area: 'blast-2' })]).id, 'room-alias');
enterScene(state, 'results');
assert.equal(radarReading(state, [{ id: 'unreachable', scene: 'results', x: state.x, y: state.y }]), null);

// Default relic integration drops a signal immediately for this player's
// collection while another player's compass retains its own signal.
const collector = newGame(4), other = newGame(5);
for (const player of [collector, other]) { enterScene(player, 'hub'); Object.assign(itemsState(player).radar, { owned: true, enabled: true }); }
const relic = relicTargets(collector)[0];
assert.equal(radarReading(collector).id, relic.id);
collector.x = relic.x; collector.y = relic.y;
assert.equal(collectRelic(collector, relic.id), true);
assert.equal(radarReading(collector), null);
assert.equal(radarReading(other).id, relic.id);
assert.equal(radarTargets(collector).some(find => RELICS.find(entry => entry.id === find.id)?.locked), false);

// The early gadget occupies open hub ground and is collected once per player.
const pickup = newGame();
assert.equal(radarPickupTarget(pickup), null);
assert.equal(collectRadar(pickup), false);
assert.equal(toggleRadar(pickup), false);
assert.equal(radarReading(pickup), null);
enterScene(pickup, 'hub');
assert.equal(isBlocked(getWorld('hub'), RADAR_PICKUP.x, RADAR_PICKUP.y, 10), false);
assert.equal(radarPickupTarget(pickup).id, RADAR_PICKUP.id);
pickup.x = RADAR_PICKUP.x + 24.01; pickup.y = RADAR_PICKUP.y;
assert.equal(collectRadar(pickup), false, 'collection validates range');
const hub = getWorld('hub'), obstruction = { id: 'radar-test-wall', kind: 'fence', x: 444, y: 371, w: 8, h: 1,
  footprints: [{ x: 444, y: 371, w: 8, h: 1 }] };
hub.props.push(obstruction);
try {
  pickup.x = RADAR_PICKUP.x; pickup.y = RADAR_PICKUP.y - 24;
  assert.ok(radarPickupTarget(pickup), 'a nearby barrier does not remove a safely placed gadget');
  assert.equal(collectRadar(pickup), false, 'a thin solid barrier prevents reaching through it');
} finally { hub.props.splice(hub.props.indexOf(obstruction), 1); }
pickup.x = RADAR_PICKUP.x + 24;
pickup.y = RADAR_PICKUP.y;
pickup.heroes[pickup.active].hp = 0;
assert.equal(collectRadar(pickup), false, 'downed heroes cannot collect');
pickup.heroes[pickup.active].hp = 20;
assert.equal(collectRadar(pickup), true);
assert.deepEqual(itemsState(pickup).radar, { owned: true, enabled: true });
assert.equal(pickup.events.filter(event => event.type === 'item' && event.kind === 'radar').length, 1);
assert.equal(collectRadar(pickup), false);
assert.equal(radarPickupTarget(pickup), null);
assert.ok(radarReading(pickup));
assert.equal(toggleRadar(pickup), true); assert.equal(itemsState(pickup).radar.enabled, false); assert.equal(radarReading(pickup), null);
assert.equal(toggleRadar(pickup), true); assert.ok(radarReading(pickup));

console.log('Wayside Fury relic radar: bearings, nearest targets, local isolation, per-player collection and toggle passed.');
