import assert from 'node:assert/strict';
import { AMBIENT_TAXI, TAXI_ROCK_IMPACT, TAXI_GAG_DURATION, taxiRockPosition, trafficForState, updateTraffic, syncTraffic, updateOverworldDressing } from '../src/pages/WaysideFury/game/dressing.ts';
import { OVERWORLD, isBlocked } from '../src/pages/WaysideFury/game/world.ts';

const state = overrides => ({ scene: 'overworld', x: 208, y: 480, time: 0, ambientTaxiWrecked: false, ambientTaxiGag: -1, events: [], ...overrides });
const fresh = state();
updateOverworldDressing(fresh, .1);
assert.equal(fresh.ambientTaxiGag, -1, 'cab does not crash before someone passes');
fresh.x = 328;
updateOverworldDressing(fresh, .1);
assert.equal(fresh.ambientTaxiWrecked, false, 'the visible arc precedes impact');
assert.ok(taxiRockPosition(fresh).height > 0, 'flying boulder has a raised trajectory and ground shadow');
for (let n = 0; n < 60; n++) updateOverworldDressing(fresh, 1 / 60);
assert.equal(fresh.ambientTaxiWrecked, false, 'wreck flag stays false before impact');
updateOverworldDressing(fresh, .2);
assert.equal(fresh.ambientTaxiWrecked, true);
assert.equal(fresh.events.filter(event => event.type === 'ambient-taxi-crash').length, 1);
for (let n = 0; n < 300; n++) updateOverworldDressing(fresh, 1 / 60);
assert.equal(fresh.ambientTaxiGag, TAXI_GAG_DURATION);
assert.equal(fresh.events.length, 1, 'repeated passing never repeats impact or rewards');
assert.equal(taxiRockPosition(fresh), null, 'flying rock disappears into the wreck');

const restored = state({ x: 328, ambientTaxiWrecked: true });
updateOverworldDressing(restored, 1);
assert.equal(restored.ambientTaxiGag, -1, 'a restored wreck never restarts its gag');
const guest = state({ x: 328, coop: { role: 'guest', remoteHeroes: [] } });
updateOverworldDressing(guest, 2);
assert.equal(guest.ambientTaxiWrecked, false, 'guests cannot trigger or advance authoritative scenery');
const host = state({ coop: { role: 'host', remoteHeroes: [{ scene: 'overworld', x: 328, y: 480 }] } });
updateOverworldDressing(host, TAXI_ROCK_IMPACT + .1);
assert.equal(host.ambientTaxiWrecked, true, 'a teammate passing triggers the host once');
assert.ok(host.events.every(event => event.type === 'ambient-taxi-crash'), 'the rock never creates player damage or combat projectiles');

assert.equal(isBlocked(OVERWORLD, AMBIENT_TAXI.x, AMBIENT_TAXI.y - 8, 7), true, 'cab and wreck share a solid footprint');
for (const side of [-1, 1]) assert.equal(isBlocked(OVERWORLD, AMBIENT_TAXI.x + side * 25, AMBIENT_TAXI.y, 10), false, 'the pullout fences leave an honest approach on both sides of the cab');
for (const y of [463, 480, 495]) for (let x = 154; x <= 1154; x += 8) assert.equal(isBlocked(OVERWORLD, x, y, 10), false, `road lane clear at ${x},${y}`);
assert.equal(isBlocked(OVERWORLD, 400, 554, 10), false, 'the item under the wreck has an open approach');
const driving = state({ x: 700, y: 463 });
// At mid-road both endpoints are visible: no car may pop into existence.
updateTraffic(driving, 1 / 60);
assert.equal(trafficForState(driving).filter(car => car.active).length, 0);
driving.x = 208; updateTraffic(driving, 1 / 60);
assert.equal(trafficForState(driving).filter(car => car.active).length, 1, 'only the hidden east endpoint can spawn');
let previous = driving.traffic[0].x;
for (let frame = 0; frame < 2200; frame++) {
  driving.time += 1 / 60; updateTraffic(driving, 1 / 60);
  for (const car of trafficForState(driving).filter(car => car.active)) {
    assert.ok([463, 495].includes(car.y));
    assert.equal(isBlocked(OVERWORLD, car.x, car.y, 10), false, 'traffic stays clear of props and buildings');
    assert.ok(car.x >= 176 && car.x <= 1136);
  }
  const x = driving.traffic[0].x;
  assert.ok(x <= previous && previous - x <= 29 / 60 + 1e-8, 'lane motion never jumps or reverses');
  previous = x;
}
assert.ok(driving.traffic[0].x >= driving.x + 64, 'car stops behind the taxi with headway');
const stopped = driving.traffic[0].x;
updateTraffic(driving, 1 / 60); assert.equal(driving.traffic[0].x, stopped, 'waiting car stays stable');
driving.y = 560;
for (let frame = 0; frame < 400; frame++) { driving.time += 1 / 60; updateTraffic(driving, 1 / 60); }
assert.equal(driving.traffic[0].x, 176);
assert.equal(driving.traffic[0].active, true, 'a visible lane endpoint cannot despawn');
driving.x = 1100; updateTraffic(driving, 1 / 60);
assert.equal(driving.traffic[0].active, false, 'retire only after the endpoint is hidden');
assert.equal(driving.traffic[1].active, true, 'opposite lane enters at its hidden endpoint');
const carBeforeRender = structuredClone(driving.traffic);
trafficForState({ ...driving, time: driving.time - 1 / 120 });
assert.deepEqual(driving.traffic, carBeforeRender, 'presentation never advances traffic');
const blockedSpawn = state({ coop: { remoteHeroes: [{ scene: 'overworld', x: 1100, y: 480 }] } });
updateTraffic(blockedSpawn, 1 / 60);
assert.equal(trafficForState(blockedSpawn).filter(car => car.active).length, 0, 'spawn must be hidden from all co-op drivers');
assert.equal(trafficForState(driving).length, 2, 'inactive lane retains its renderer slot');
assert.ok(trafficForState(driving)[0].x > OVERWORLD.width + 680, 'retired lane is culled off-map');
const visitor = state({ time: 1000, coop: { role: 'guest', remoteHeroes: [] } });
syncTraffic(visitor, driving.traffic);
const snapshot = structuredClone(visitor.traffic);
updateTraffic(visitor, 1 / 60);
assert.deepEqual(visitor.traffic, snapshot, 'guest never advances traffic independently');
const earlier = structuredClone(driving.traffic); earlier[1].x -= 10;
syncTraffic(visitor, driving.traffic, earlier, .5);
assert.equal(visitor.traffic[1].x, driving.traffic[1].x - 5, 'guest traffic interpolates in stable lane slots');
assert.equal(visitor.traffic[1].updatedAt, visitor.time, 'host clock is rebased to local presentation time');
visitor.coop.role = 'host'; syncTraffic(visitor, driving.traffic);
visitor.x = 1100; visitor.y = 560; updateTraffic(visitor, 1 / 60);
assert.ok(visitor.traffic[1].x > snapshot[1].x, 'promoted host resumes the authoritative lane position');
console.log('Wayside Fury dressing: one-shot crash, safe lanes, continuous traffic, headway, hidden lifecycle and co-op visibility pass.');
