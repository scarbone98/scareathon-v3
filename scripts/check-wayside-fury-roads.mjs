// Node 24+: pure generator regressions, no canvas or dev server required.
import assert from 'node:assert/strict';
import { roadMarks } from '../src/pages/WaysideFury/game/roadMarkings.ts';
import { OVERWORLD, HUB_WORLD, BLAST_WORLDS, REALM_WORLD, TEST_WORLD, TILE, tileAt, isBlocked } from '../src/pages/WaysideFury/game/world.ts';

const contains = (r, x, y) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
function checkMarks(world) {
  const counts = { horizontal: 0, vertical: 0 }, dashes = new Map();
  for (let row = 0; row < world.rows; row++) for (let col = 0; col < world.cols; col++) {
    const tile = { x: col * TILE, y: row * TILE, w: TILE, h: TILE };
    const segments = world.roads.filter(r => overlap(tile, r));
    for (const mark of roadMarks(world, col, row)) {
      assert.ok(mark.x >= tile.x && mark.y >= tile.y && mark.x + mark.w <= tile.x + TILE && mark.y + mark.h <= tile.y + TILE, 'mark stays within its tile/chunk');
      if (mark.kind !== 'lane') continue;
      const direction = mark.w > mark.h ? 'horizontal' : 'vertical';
      assert.ok(segments.some(r => r.direction === direction), `${world.id} marking orientation matches authored road direction at ${col},${row}`);
      assert.ok(!world.roads.some(r => r.direction !== direction && overlap(mark, r)), 'crossings, T junctions and corners have no conflicting paint');
      counts[direction]++;
      const key = direction === 'horizontal' ? `h:${Math.floor(mark.x / 32)}:${Math.round(mark.y + mark.h / 2)}` : `v:${Math.round(mark.x + mark.w / 2)}:${Math.floor(mark.y / 32)}`;
      dashes.set(key, (dashes.get(key) ?? 0) + mark.w * mark.h);
    }
  }
  assert.ok([...dashes.values()].every(area => Math.abs(area - 12) < .001), 'tile/chunk boundaries and junctions never truncate a dash');
  return counts;
}

for (const world of [OVERWORLD, HUB_WORLD, ...BLAST_WORLDS, REALM_WORLD, TEST_WORLD]) {
  const roadCells = [];
  for (let row = 0; row < world.rows; row++) for (let col = 0; col < world.cols; col++) {
    if (tileAt(world, col, row) !== 'road') continue;
    roadCells.push(row * world.cols + col);
    assert.ok(world.roads.some(r => contains(r, col * TILE, row * TILE)), `${world.id}: every road tile has authored direction and ends`);
  }
  for (const r of world.roads) {
    for (let y = r.y; y < r.y + r.h; y += TILE) for (let x = r.x; x < r.x + r.w; x += TILE) assert.equal(tileAt(world, x / TILE, y / TILE), 'road', `${r.id}: later terrain cannot cut a road off`);
    for (const [kind, far] of [[r.start, false], [r.end, true]]) {
      const horizontal = r.direction === 'horizontal';
      const x = horizontal ? r.x + (far ? r.w - 1 : 0) : r.x + r.w / 2;
      const y = horizontal ? r.y + r.h / 2 : r.y + (far ? r.h - 1 : 0);
      if (kind === 'junction') assert.ok(world.roads.some(other => other !== r && contains(other, x, y)), `${r.id}: declared junction actually connects`);
      else if (kind === 'barrier') {
        assert.ok(world.props.some(p => p.kind === 'barrier' && contains(p, x, y)), `${r.id}: visible terminus`);
        assert.ok(isBlocked(world, x, y, 1), `${r.id}: terminus has collision`);
        assert.ok(horizontal ? x <= 32 || x >= world.width - 33 : y <= 32 || y >= world.height - 33, 'barrier sits at map boundary');
      } else {
        const ex = x + (horizontal ? far ? 1 : -1 : 0), ey = y + (!horizontal ? far ? 1 : -1 : 0);
        assert.ok(tileAt(world, Math.floor(ex / TILE), Math.floor(ey / TILE)) === 'stone' || world.props.some(p => ['station', 'portal'].includes(p.kind) && contains(p, ex, ey)), `${r.id}: road meets a paved entrance or doorway`);
      }
    }
  }
  if (roadCells.length) {
    const reached = new Set([roadCells[0]]), queue = [...reached];
    for (const cell of queue) for (const [dc, dr] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const c = cell % world.cols + dc, r = Math.floor(cell / world.cols) + dr, next = r * world.cols + c;
      if (tileAt(world, c, r) === 'road' && !reached.has(next)) { reached.add(next); queue.push(next); }
    }
    assert.equal(reached.size, roadCells.length, `${world.id}: one connected road network`);
  }
  const counts = checkMarks(world);
  if (world === OVERWORLD) assert.ok(counts.horizontal && counts.vertical, 'both real road orientations are exercised');
}

for (const room of [8, 9]) {
  const world = BLAST_WORLDS[room], y = room === 8 ? 36 : world.height - 36;
  assert.ok(world.props.some(p => p.kind === 'barrier' && contains(p, 328, y)), 'optional dirt branch ends at a visible barrier');
  assert.ok(isBlocked(world, 328, y, 1), 'closed optional branch has physical collision');
  assert.equal(world.exits.length, 1, 'the other end remains a deliberate zone entrance');
}

// Independent authored fixtures cover straight roads, unequal-width junctions,
// corners and a short, wide N/S branch that the old aspect-ratio heuristic
// would classify as horizontal. Widening pavement must never rotate its paint.
const h = { id: 'ew', x: 32, y: 192, w: 320, h: 64, direction: 'horizontal', start: 'entrance', end: 'entrance' };
const v = { id: 'ns', x: 160, y: 32, w: 64, h: 320, direction: 'vertical', start: 'entrance', end: 'entrance' };
for (const [name, roads] of [
  ['straight-ew', [h]], ['straight-ns', [v]], ['cross', [h, v]],
  ['tee', [h, { ...v, h: 224 }]],
  ['corner', [{ ...h, x: 160, w: 192 }, { ...v, h: 224 }]],
  ['short-wide-ns', [{ ...v, x: 128, y: 128, w: 128, h: 96 }]],
]) {
  const world = { id: name, cols: 24, rows: 24, tiles: Array(24 * 24).fill('grass'), roads };
  for (const r of roads) for (let y = r.y; y < r.y + r.h; y += TILE) for (let x = r.x; x < r.x + r.w; x += TILE) world.tiles[y / TILE * world.cols + x / TILE] = 'road';
  const counts = checkMarks(world);
  for (const direction of new Set(roads.map(r => r.direction))) assert.ok(counts[direction] > 0, `${name}: has visible ${direction} lane dashes`);
}
console.log('Roads: all 14 maps audited; connected roads, physical termini, authored dash axes, crossings, corners and complete dash clipping pass.');
