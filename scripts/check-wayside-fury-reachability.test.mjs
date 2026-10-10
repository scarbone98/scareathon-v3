// Native runner: node --test scripts/check-wayside-fury-reachability.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { map, paint, prop, road, TILE } from '../src/pages/WaysideFury/game/worldBuilder.ts';
import { roadPoints, roadWidth, roadDistance } from '../src/pages/WaysideFury/game/roadNetwork.ts';
import { auditWorld } from '../src/pages/WaysideFury/game/reachabilityAudit.ts';
import { auditOverworld, loadBaseline } from './check-wayside-fury-reachability.mjs';

// A small county: one curved east-west road on grass, spawn on the asphalt.
// Curves and bridge tiles are rasterized the way organicAreas.ts does it.
function county({ water = null, roadTo = 600 } = {}) {
  const m = map('overworld', 'Test county', 40, 24, 'grass');
  paint(m, 0, 0, m.width, 32, 'stone', true); paint(m, 0, m.height - 32, m.width, 32, 'stone', true);
  paint(m, 0, 0, 32, m.height, 'stone', true); paint(m, m.width - 32, 0, 32, m.height, 'stone', true);
  road(m, { id: 'main', x: 32, y: 160, w: roadTo - 32, h: 64, direction: 'horizontal', start: 'junction', end: 'junction' });
  // Water over the raster lane; the ribbon pass below turns it into bridge tiles.
  if (water) paint(m, water.x, water.y, water.w, water.h, 'water', true);
  const r = m.roads[0]; r.curve = roadPoints(r); r.curveWidth = 64;
  for (let row = 1; row < m.rows - 1; row++) for (let col = 1; col < m.cols - 1; col++) {
    const i = row * m.cols + col;
    if (roadDistance(r, col * TILE + 8, row * TILE + 8) >= roadWidth(r) / 2) continue;
    if (m.tiles[i] === 'water') { m.tiles[i] = 'bridge'; m.collision[i] = 0; } else if (!m.collision[i]) m.tiles[i] = 'road';
  }
  m.spawn = { x: 80, y: 192 };
  return m;
}
const kinds = result => result.issues.map(i => `${i.severity}:${i.kind}`);
const ring = (m, x, y, w, h) => {
  prop(m, 'barrier', x, y, w, 6); prop(m, 'barrier', x, y + h - 6, w, 6);
  prop(m, 'barrier', x, y, 6, h); prop(m, 'barrier', x + w - 6, y, 6, h);
};

test('a clean county has no issues', () => {
  const m = county();
  prop(m, 'mailbox', 200, 236, 14, 22); prop(m, 'home', 300, 236, 112, 72, 'House');
  const result = auditWorld(m, { doors: [{ id: 'door', name: 'House door', x: 356, y: 320, building: 'home' }] });
  assert.deepEqual(kinds(result), []);
  assert.ok(result.stats.roadSamples > 50 && result.stats.reachedArea > 100_000);
});

test('a mailbox fenced off from every path is unreachable', () => {
  const m = county();
  prop(m, 'mailbox', 220, 280, 14, 22); ring(m, 180, 250, 100, 90);
  const result = auditWorld(m);
  assert.ok(result.issues.some(i => i.kind === 'unreachable-prop' && i.subject.includes('mailbox')), kinds(result).join());
});

test('a house on the road, a mailbox in its wall and a prop in water are reported', () => {
  const m = county({ water: { x: 400, y: 280, w: 96, h: 64 } });
  const home = prop(m, 'home', 200, 120, 112, 72, 'House');
  prop(m, 'mailbox', home.x + 40, home.y + 40, 14, 22);
  prop(m, 'vending', 420, 290, 22, 34);
  const found = kinds(auditWorld(m));
  for (const kind of ['error:structure-on-road', 'error:prop-in-structure', 'error:prop-in-water']) assert.ok(found.includes(kind), `${kind} in ${found}`);
});

test('a road may end at a facade: an entrance cap is not "house on road"', () => {
  const m = county();
  road(m, { id: 'spur', x: 288, y: 192, w: 64, h: 96, direction: 'vertical', start: 'junction', end: 'entrance' });
  m.roads[1].curve = roadPoints(m.roads[1]);
  prop(m, 'shed', 280, 270, 80, 64, 'Shed');
  assert.ok(!kinds(auditWorld(m)).includes('error:structure-on-road'));
});

test('a bridge must land on dry road at both ends', () => {
  const water = { x: 288, y: 32, w: 128, h: 320 };
  const crossing = auditWorld(county({ water }));
  assert.equal(crossing.stats.crossings, 1);
  assert.deepEqual(kinds(crossing).filter(k => k.includes('bridge')), []);
  const stub = auditWorld(county({ water, roadTo: 352 }));
  assert.ok(stub.issues.some(i => i.kind === 'bridge-end' && i.detail.includes('end of the crossing')), kinds(stub).join());
});

test('an obstruction on a bridge deck cuts the far bank off', () => {
  const m = county({ water: { x: 288, y: 32, w: 128, h: 320 } });
  prop(m, 'barrier', 340, 150, 8, 84);
  const found = kinds(auditWorld(m));
  for (const kind of ['error:unreachable-bridge', 'error:unreachable-road', 'error:bridge-end']) assert.ok(found.includes(kind), `${kind} in ${found}`);
});

test('a walled-in door and a leaking sealed area are reported', () => {
  const m = county();
  prop(m, 'home', 300, 260, 112, 72, 'House'); ring(m, 260, 240, 200, 120);
  const result = auditWorld(m, {
    doors: [{ id: 'door', name: 'House door', x: 356, y: 348, building: 'home' }],
    sealed: [{ id: 'yard', name: 'Yard', rect: { x: 40, y: 260, w: 120, h: 80 } }],
  });
  const found = kinds(result);
  for (const kind of ['error:unreachable-door', 'error:sealed-area-open']) assert.ok(found.includes(kind), `${kind} in ${found}`);
});

test('the county overworld has no reachability errors beyond the known baseline', () => {
  const known = new Set(loadBaseline());
  const { issues, stats } = auditOverworld({ coop: true });
  assert.ok(stats.overworld.roadSamples > 500 && stats.overworld.crossings >= 1 && stats.overworld.doors >= 2, 'audit covered the county');
  const fresh = issues.filter(i => i.severity === 'error' && !known.has(i.key));
  assert.deepEqual(fresh.map(i => `${i.key} @ ${i.x},${i.y}: ${i.detail}`), []);
  const fixed = [...known].filter(key => !issues.some(i => i.key === key));
  if (fixed.length) console.log(`Fixed; remove from the reachability baseline: ${fixed.join(', ')}`);
});
