import assert from 'node:assert/strict';
import { AMBIENT_TAXI, TAXI_ROCK_IMPACT, TAXI_GAG_DURATION, taxiRockPosition, trafficForState, updateOverworldDressing } from '../src/pages/WaysideFury/game/dressing.ts';
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
for (let time = 0; time < 80; time += .5) {
  for (const car of trafficForState({ x: 700, y: 463, time })) {
    assert.ok([463, 495].includes(car.y), 'ambient traffic keeps to its authored lane');
    if (car.y === 463) assert.ok(Math.abs(car.x - 700) >= 40, 'ambient traffic leaves the player space');
  }
}
console.log('Wayside Fury dressing: host-authoritative one-shot crash, safe lanes, solid wreck and traffic headway pass.');
