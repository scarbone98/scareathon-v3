import assert from 'node:assert/strict';
import { AMBIENT_TAXI, TAXI_ROCK_IMPACT, TAXI_GAG_DURATION, taxiRockPosition, updateOverworldDressing } from '../src/pages/WaysideFury/game/dressing.ts';
import { OVERWORLD, HUB_WORLD, BLAST_WORLDS, TILE, tileAt, isBlocked } from '../src/pages/WaysideFury/game/world.ts';

import { COUNTY_STOPS, COUNTY_DISTRICTS } from '../src/pages/WaysideFury/game/county.ts';

assert.equal(COUNTY_DISTRICTS.length, 3);
for (const stop of COUNTY_STOPS) assert.equal(isBlocked(OVERWORLD, stop.x, stop.y, 10), false, `${stop.id}: taxi apron clears new scenery`);
for (const kind of ['water-tower', 'windmill', 'bench', 'crate', 'reeds']) assert.ok(OVERWORLD.props.some(p => p.kind === kind), `original ${kind} dressing is authored`);

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
for (const world of [OVERWORLD, HUB_WORLD, ...BLAST_WORLDS]) {
  for (const car of world.props.filter(p => ['car', 'ambient-taxi'].includes(p.kind))) {
    if (world.id.startsWith('blast')) {
      const x = Math.floor((car.x + car.w / 2) / TILE), end = Math.floor(world.spawn.y / TILE);
      for (let y = Math.floor((car.y + car.h) / TILE); y <= end; y++) assert.ok(['stone', 'dirt'].includes(tileAt(world, x, y)), `${world.id}: parking drive connects to main path`);
    }
    for (const r of car.footprints) for (const x of [r.x, r.x + r.w - .01]) for (const y of [r.y, r.y + r.h - .01]) {
      assert.equal(tileAt(world, Math.floor(x / TILE), Math.floor(y / TILE)), 'stone', `${world.id}: parked car sits in its paved lot`);
      assert.equal(isBlocked({ ...world, props: world.props.filter(p => p !== car) }, x, y, 0), false, `${world.id}: parked car clears other props`);
    }
  }
}
console.log('Wayside Fury dressing: host-authoritative one-shot crash, safe lanes, solid wreck and unobstructed parked-car lots pass.');
