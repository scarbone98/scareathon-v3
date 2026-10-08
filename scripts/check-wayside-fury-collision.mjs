// Radius-aware navigation and collision regressions; also run by the main check.
import assert from 'node:assert/strict';
import { newGame, enterScene, addEnemy, idleInput, step, interactTarget, activeHero } from '../src/pages/WaysideFury/game/sim.ts';
import { LOCATIONS, HUB_POINTS } from '../src/pages/WaysideFury/game/content.ts';
import { TILE, OVERWORLD, HUB_WORLD, BLAST_WORLDS, REALM_WORLD, TEST_WORLD, isBlocked, tileAt } from '../src/pages/WaysideFury/game/world.ts';

import { HIDDEN_PICKUPS } from '../server/shared/waysideFury/collectibles.js';
import { isWalkableSurface } from '../src/pages/WaysideFury/game/walkableSurfaces.ts';
import { BLAST_ART } from '../src/pages/WaysideFury/game/blastArt.ts';
import { COUNTY_STOPS } from '../src/pages/WaysideFury/game/county.ts';

for (const stop of COUNTY_STOPS) assert.equal(isBlocked(OVERWORLD,stop.x,stop.y,10), false, `${stop.id}: safe taxi anchor`);
const GRID = 4, SWEEP = 2, DT = 1 / 60;
const maps = [OVERWORLD, HUB_WORLD, ...BLAST_WORLDS, REALM_WORLD, TEST_WORLD];
const fields = new Map();
const heroRadius = world => world === OVERWORLD ? 10 : 7;
const sceneFor = world => world === OVERWORLD ? 'overworld' : world === HUB_WORLD ? 'hub'
  : world === REALM_WORLD ? 'realm' : world === TEST_WORLD ? 'test' : 'dungeon';
const roomFor = world => Math.max(0, BLAST_WORLDS.indexOf(world));

// Checking the entire edge matters: checking tile or grid centers alone can
// claim that a thin fence is traversable when it lies between sampled centers.
function clearSegment(world, from, to, radius) {
  const pieces = Math.max(1, Math.ceil(Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y)) / SWEEP));
  for (let i = 0; i <= pieces; i++) {
    const t = i / pieces;
    if (isBlocked(world, from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t, radius)) return false;
  }
  return true;
}
function clearAxes(world, from, to, radius) {
  const xy = { x: to.x, y: from.y }, yx = { x: from.x, y: to.y };
  return (clearSegment(world, from, xy, radius) && clearSegment(world, xy, to, radius))
    || (clearSegment(world, from, yx, radius) && clearSegment(world, yx, to, radius));
}

function navigation(world, radius = heroRadius(world)) {
  let byRadius = fields.get(world);
  if (!byRadius) { byRadius = new Map(); fields.set(world, byRadius); }
  if (byRadius.has(radius)) return byRadius.get(radius);
  const cols = Math.floor(world.width / GRID) + 1, rows = Math.floor(world.height / GRID) + 1;
  const seen = new Uint8Array(cols * rows), occupancy = new Uint8Array(cols * rows);
  const parent = new Int32Array(cols * rows).fill(-1), queue = new Uint32Array(cols * rows);
  const position = node => ({ x: (node % cols) * GRID, y: Math.floor(node / cols) * GRID });
  const walkable = node => {
    if (!occupancy[node]) {
      const p = position(node);
      occupancy[node] = isBlocked(world, p.x, p.y, radius) ? 1 : 2;
    }
    return occupancy[node] === 2;
  };
  const neighbors = point => {
    const result = [], gx = Math.round(point.x / GRID), gy = Math.round(point.y / GRID);
    for (let y = gy - 1; y <= gy + 1; y++) for (let x = gx - 1; x <= gx + 1; x++) {
      if (x >= 0 && y >= 0 && x < cols && y < rows) result.push(y * cols + x);
    }
    return result.sort((a, b) => {
      const pa = position(a), pb = position(b);
      return Math.hypot(pa.x - point.x, pa.y - point.y) - Math.hypot(pb.x - point.x, pb.y - point.y);
    });
  };
  assert.equal(isBlocked(world, world.spawn.x, world.spawn.y, radius), false, `${world.id}: map spawn is clear for radius ${radius}`);
  const first = neighbors(world.spawn).find(node => walkable(node) && clearAxes(world, world.spawn, position(node), radius));
  assert.notEqual(first, undefined, `${world.id}: map spawn connects to the sub-tile navigation grid`);
  let end = 1;
  queue[0] = first; seen[first] = 1;
  for (let i = 0; i < end; i++) {
    const at = queue[i], x = at % cols, y = Math.floor(at / cols), from = position(at);
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const nx = x + dx, ny = y + dy, next = ny * cols + nx;
      if (nx < 0 || nx >= cols || ny < 0 || ny >= rows || seen[next] || !walkable(next)) continue;
      if (!clearSegment(world, from, position(next), radius)) continue;
      seen[next] = 1; parent[next] = at; queue[end++] = next;
    }
  }
  const connectedNode = point => {
    if (isBlocked(world, point.x, point.y, radius)) return undefined;
    return neighbors(point).find(node => seen[node] && clearAxes(world, point, position(node), radius));
  };
  const field = {
    reachable: point => connectedNode(point) !== undefined,
    nearby: (point, distance, spacing = GRID) => {
      const result = [];
      for (let y = Math.max(0, Math.ceil((point.y - distance) / spacing)); y <= Math.min(Math.floor(world.height / spacing), Math.floor((point.y + distance) / spacing)); y++) {
        for (let x = Math.max(0, Math.ceil((point.x - distance) / spacing)); x <= Math.min(Math.floor(world.width / spacing), Math.floor((point.x + distance) / spacing)); x++) {
          const p = { x: x * spacing, y: y * spacing };
          if (Math.hypot(p.x - point.x, p.y - point.y) >= distance) continue;
          if (spacing === GRID ? seen[y * cols + x] : connectedNode(p) !== undefined) result.push(p);
        }
      }
      return result.sort((a, b) => Math.hypot(a.x - point.x, a.y - point.y) - Math.hypot(b.x - point.x, b.y - point.y));
    },
    route: (from, to) => {
      const start = connectedNode(from), finish = connectedNode(to);
      assert.notEqual(start, undefined, `${world.id}: route starts in reachable space at ${from.x},${from.y}`);
      assert.notEqual(finish, undefined, `${world.id}: route ends in reachable space at ${to.x},${to.y}`);
      const ancestors = new Map(), up = [];
      for (let node = start; node !== -1; node = parent[node]) { ancestors.set(node, up.length); up.push(node); }
      const down = []; let node = finish;
      while (!ancestors.has(node)) { down.push(node); node = parent[node]; }
      const raw = [from, ...up.slice(0, ancestors.get(node) + 1).map(position), ...down.reverse().map(position), to];
      const compact = [];
      for (const point of raw) {
        if (compact.length && point.x === compact.at(-1).x && point.y === compact.at(-1).y) continue;
        while (compact.length > 1) {
          const a = compact.at(-2), b = compact.at(-1);
          if (!((a.x === b.x && b.x === point.x) || (a.y === b.y && b.y === point.y))) break;
          compact.pop();
        }
        compact.push(point);
      }
      return compact.slice(1);
    },
  };
  byRadius.set(radius, field);
  return field;
}

export function findWalkRoute(world, from, to) {
  const radius = heroRadius(world);
  if (clearSegment(world, from, to, radius)) return [{ x: to.x, y: to.y }];
  const route = navigation(world).route(from, to), result = [];
  let origin = from;
  for (let i = 0; i < route.length;) {
    let next = i;
    for (let j = route.length - 1; j > i; j--) {
      if (clearSegment(world, origin, route[j], radius)) { next = j; break; }
    }
    result.push(route[next]); origin = route[next]; i = next + 1;
  }
  return result;
}
export function findInteractionApproach(world, targetId, point, range = 28) {
  const state = newGame(); enterScene(state, sceneFor(world), roomFor(world)); state.enemies = [];
  const matches = candidate => {
    state.x = candidate.x; state.y = candidate.y;
    return interactTarget(state)?.id === targetId;
  };
  const field = navigation(world);
  // A marker can have only a narrow approach inside its interaction range.
  // Refine those candidates without weakening radius or swept-edge checks.
  const approach = field.nearby(point, range).find(matches) ?? field.nearby(point, range, 1).find(matches);
  assert.ok(approach, `${world.id}: ${targetId} has a reachable interaction approach`);
  return approach;
}

// Use the live simulation's enemy radii (including the smaller Sentinel) and
// include training-yard enemies, which are authored in enterScene.
for (const world of maps) {
  assert.equal(world.tiles.length, world.cols * world.rows);
  assert.equal(world.collision.length, world.tiles.length);
  const state = newGame(); enterScene(state, sceneFor(world), roomFor(world));
  const field = navigation(world);
  assert.ok(field.reachable(world.spawn), `${world.id}: hero spawn is reachable`);
  for (const enemy of state.enemies) {
    assert.equal(isBlocked(world, enemy.x, enemy.y, enemy.radius), false, `${world.id}: ${enemy.kind} spawn is clear for radius ${enemy.radius}`);
    assert.ok(navigation(world, enemy.radius).reachable(enemy), `${world.id}: ${enemy.kind} spawn is reachable for radius ${enemy.radius}`);
  }
  for (const exit of world.exits) {
    const center = { x: exit.x + exit.w / 2, y: exit.y + exit.h / 2 };
    assert.ok(field.reachable(center), `${world.id}: ${exit.id} exit has a reachable, walkable center`);
    if (exit.target === 'results') continue;
    const destination = typeof exit.target === 'number' ? BLAST_WORLDS[exit.target]
      : exit.target === 'realm' ? REALM_WORLD : OVERWORLD;
    assert.ok(navigation(destination).reachable({ x: exit.entryX, y: exit.entryY }), `${world.id}: ${exit.id} arrives safely in ${destination.id}`);
  }
  if (world.id.startsWith('blast-')) {
    for (const spawn of world.spawns) assert.ok(field.reachable(spawn), `${world.id}: authored encounter is connected to spawn`);
    for (const item of HIDDEN_PICKUPS.filter(item => item.scene === 'dungeon' && item.room === roomFor(world))) {
      assert.ok(field.reachable(item), `${world.id}: existing/new secret ${item.id} is reachable`);
    }
    assert.ok(world.props.filter(p => BLAST_ART.has(p.kind)).length >= 10, `${world.id}: distinct landmark dressing`);
    assert.equal(world.spawns.length, [6,9,6,12,1,9,6,1,6,6][roomFor(world)], `${world.id}: original encounter budget`);
  }
  for (const prop of world.props) {
    if (isWalkableSurface(prop) || ['flower', 'puddle', 'debris', 'reeds', 'impact', 'ground-crack', 'floating-debris', 'broken-bridge', 'blast-scrap', 'ash-tuft', 'bank-stones', 'plaza-fragment'].includes(prop.kind)) {
      assert.equal(prop.footprints?.length ?? 0, 0, `${prop.id}: ground dressing remains walk-through`);
      continue;
    }
    assert.ok(prop.footprints?.length, `${prop.id}: physical props have a collision footprint`);
    for (const rect of prop.footprints) {
      assert.ok(rect.w > 0 && rect.h > 0, `${prop.id}: footprint has positive dimensions`);
      assert.ok(isBlocked(world, rect.x + rect.w / 2, rect.y + rect.h / 2, 1), `${prop.id}: footprint interior is solid`);
    }
    const scattered = ['tree', 'pine', 'rock'].includes(prop.kind)
      && prop.x >= 32 && prop.y >= 32 && prop.x + prop.w <= world.width - 32 && prop.y + prop.h <= world.height - 32;
    if (scattered) {
      const ground = world.id.startsWith('blast') ? 'ash' : 'grass';
      for (const rect of prop.footprints) {
        for (let y = rect.y + 0.1; y < rect.y + rect.h; y += 2) for (let x = rect.x + 0.1; x < rect.x + rect.w; x += 2) {
          assert.equal(tileAt(world, Math.floor(x / TILE), Math.floor(y / TILE)), ground, `${prop.id}: scatter stays off painted paths`);
        }
        for (const spawn of [world.spawn, ...state.enemies]) {
          const dx = spawn.x - Math.max(rect.x, Math.min(spawn.x, rect.x + rect.w));
          const dy = spawn.y - Math.max(rect.y, Math.min(spawn.y, rect.y + rect.h));
          assert.ok(Math.hypot(dx, dy) >= 32, `${prop.id}: scatter leaves spawn clearance`);
        }
        for (const exit of world.exits) {
          const near = rect.x < exit.x + exit.w + 32 && rect.x + rect.w > exit.x - 32
            && rect.y < exit.y + exit.h + 32 && rect.y + rect.h > exit.y - 32;
          assert.equal(near, false, `${prop.id}: scatter leaves exit clearance`);
        }
      }
    }
    if (prop.kind === 'chest') findInteractionApproach(world, prop.id, { x: prop.x + prop.w / 2, y: prop.y + prop.h / 2 });
    if (prop.kind === 'npc' && world !== HUB_WORLD) findInteractionApproach(world, 'scout', { x: prop.x + prop.w / 2, y: prop.y + prop.h });
  }
}
for (const point of LOCATIONS) findInteractionApproach(OVERWORLD, point.id, point);
for (const point of HUB_POINTS) findInteractionApproach(HUB_WORLD, point.id === "station" ? "interior-station-door" : point.id, point);

// Verify authored shapes too, so a change to the footprint generator cannot be
// masked by the independently constructed rectangle fixtures below.
for (const kind of ['tree', 'pine', 'portal', 'crater']) {
  const world = maps.find(map => map.props.some(prop => prop.kind === kind));
  const prop = world.props.find(prop => prop.kind === kind);
  const isolated = { ...world, collision: world.collision.map(() => 0), props: [prop] };
  if (kind === 'tree' || kind === 'pine') {
    assert.ok(prop.footprints.every(rect => rect.w < prop.w / 2 && rect.y >= prop.y + prop.h / 2), `${kind}: authored collision stays at the narrow trunk`);
    assert.equal(isBlocked(isolated, prop.x + prop.w / 2, prop.y + prop.h / 3, 1), false, `${kind}: authored canopy stays walk-through`);
  } else if (kind === 'portal') {
    assert.ok(prop.footprints.length >= 2, 'authored portal keeps solid frame posts');
    assert.equal(isBlocked(isolated, prop.x + prop.w / 2, prop.y + prop.h, 10), false, 'authored portal center admits the taxi as well as the hero');
  } else {
    assert.equal(isBlocked(isolated, prop.x + prop.w / 2, prop.y + prop.h / 2, 1), false, 'authored crater collides at its rim rather than filling the interior');
    assert.equal(isBlocked(isolated, prop.x + prop.w / 2, prop.y + prop.h / 2 + prop.w * 0.3 - 4, 1), true, 'authored crater rim remains solid');
  }
}

const fixture = () => ({
  id: 'collision-fixture', name: 'Collision fixture', width: 320, height: 192, cols: 20, rows: 12,
  tiles: Array(240).fill('grass'), collision: Array(240).fill(0), props: [], exits: [], spawns: [], spawn: { x: 75, y: 110 },
});
const sample = fixture();
sample.props.push({ id: 'trunk', kind: 'tree', x: 80, y: 56, w: 32, h: 64, footprints: [{ x: 92, y: 104, w: 8, h: 8 }] });
assert.equal(isBlocked(sample, 96, 72), false, 'tree canopy remains walkable above its trunk');
assert.equal(isBlocked(sample, 96, 108), true, 'tree trunk is solid');
assert.equal(isBlocked(sample, 84, 108), false, 'small trunks do not mark the whole tile solid');
assert.equal(isBlocked(sample, 85, 108), false, 'circle tangent to footprint can slide along it');
assert.equal(isBlocked(sample, 85.01, 108), true, 'circle entering footprint stops at sub-pixel contact');
assert.equal(isBlocked(sample, 87, 99), false, 'circle clears a rectangle corner outside its radius');
assert.equal(isBlocked(sample, 88, 100), true, 'circle blocks when it overlaps a rectangle corner');
sample.props.push({ id: 'arch', kind: 'portal', x: 144, y: 64, w: 48, h: 56,
  footprints: [{ x: 144, y: 96, w: 8, h: 24 }, { x: 184, y: 96, w: 8, h: 24 }] });
assert.equal(isBlocked(sample, 168, 108, 10), false, 'portal center remains enterable');
assert.equal(isBlocked(sample, 148, 108), true, 'portal frame remains solid');
sample.collision[5 * sample.cols + 14] = 1;
assert.equal(isBlocked(sample, 232, 88), true, 'terrain tiles remain solid alongside prop rectangles');
assert.equal(isBlocked(sample, 7, 40), false, 'body tangent to world boundary can move');
assert.equal(isBlocked(sample, 6.99, 40), true, 'body cannot move outside world bounds');

const tick = (state, input = {}, frames = 1) => {
  for (let i = 0; i < frames; i++) step(state, { ...idleInput(), ...input }, DT);
};
const stationary = enemy => { enemy.speed = 0; enemy.cooldown = 100; return enemy; };
const separation = newGame(); separation.enemies = [];
const overlapping = stationary(addEnemy(separation, 'grunt', separation.x, separation.y));
const oldHero = { x: separation.x, y: separation.y };
tick(separation);
assert.ok(Math.hypot(separation.x - oldHero.x, separation.y - oldHero.y) > 0, 'hero receives a light body push');
assert.ok(Math.hypot(separation.x - oldHero.x, separation.y - oldHero.y) <= 30 * DT + 1e-6, 'body separation has a gentle per-frame limit');
let oldDistance = Math.hypot(overlapping.x - separation.x, overlapping.y - separation.y);
for (let i = 0; i < 150; i++) {
  tick(separation);
  const distance = Math.hypot(overlapping.x - separation.x, overlapping.y - separation.y);
  assert.ok(distance + 1e-8 >= oldDistance, 'stationary overlapping bodies settle without oscillating');
  oldDistance = distance;
}
assert.ok(oldDistance >= 14 - 0.02, 'hero and enemy softly separate to their body radii');
const settled = { x: separation.x, y: separation.y };
tick(separation, {}, 60);
assert.ok(Math.hypot(separation.x - settled.x, separation.y - settled.y) < 0.02, 'settled contact does not jitter');
const crowd = newGame(); crowd.enemies = []; crowd.x = 75; crowd.y = 145;
const first = stationary(addEnemy(crowd, 'grunt', 200, 110)), second = stationary(addEnemy(crowd, 'grunt', 200, 110));
tick(crowd, {}, 150);
assert.ok(Math.hypot(first.x - second.x, first.y - second.y) >= 14 - 0.02, 'enemy pairs also softly separate');

// Fixture changes are scoped to the pure training map and always restored.
const originalProps = TEST_WORLD.props;
try {
  TEST_WORLD.props = [{ id: 'thin-fence', kind: 'fence', x: 144, y: 64, w: 3, h: 96,
    footprints: [{ x: 144, y: 64, w: 3, h: 96 }] }];
  const movement = newGame(); movement.enemies = []; movement.x = 110; movement.y = 110;
  tick(movement, { x: 1, dash: true }, 30);
  assert.ok(movement.x <= 137, 'dash cannot tunnel through a three-pixel prop');
  assert.equal(isBlocked(TEST_WORLD, movement.x, movement.y), false, 'hero stops clear of the prop');
  const slide = newGame(); slide.enemies = []; slide.x = 136.5; slide.y = 80;
  tick(slide, { x: 1, y: 1 }, 30);
  assert.ok(slide.x <= 137 && slide.y > 100, 'axis-separated movement slides along a prop edge');
  const chase = newGame(); chase.enemies = []; chase.x = 100; chase.y = 110;
  const blockedEnemy = addEnemy(chase, 'grunt', 180, 110); blockedEnemy.cooldown = 100;
  tick(chase, {}, 150);
  assert.ok(blockedEnemy.x >= 154, 'chasing enemies stop at solid props');
  assert.equal(isBlocked(TEST_WORLD, blockedEnemy.x, blockedEnemy.y, blockedEnemy.radius), false);
  const pinned = newGame(); pinned.enemies = []; pinned.x = 136; pinned.y = 110;
  const pushing = stationary(addEnemy(pinned, 'grunt', 132, 110));
  tick(pinned, {}, 150);
  assert.equal(isBlocked(TEST_WORLD, pinned.x, pinned.y), false, 'body separation cannot push the hero into a prop');
  assert.equal(isBlocked(TEST_WORLD, pushing.x, pushing.y, pushing.radius), false, 'body separation cannot push enemies into props');
  assert.ok(Math.hypot(pinned.x - pushing.x, pinned.y - pushing.y) >= 14 - 0.02, 'overlap against a prop relaxes toward the available space');

  const launch = (state, owner, beam = false) => state.projectiles.push({
    id: state.nextId++, x: 100, y: 110, vx: 6600, vy: 0, radius: 4,
    damage: 10, ttl: 1, owner, beam, hits: [],
  });
  for (const beam of [false, true]) {
    const blockedShot = newGame(); blockedShot.enemies = [];
    const behind = stationary(addEnemy(blockedShot, 'grunt', 190, 110));
    launch(blockedShot, 'hero', beam); tick(blockedShot);
    assert.equal(behind.hp, behind.maxHp, 'fast hero shots cannot damage enemies through a solid prop');
    assert.equal(blockedShot.projectiles.length, 0, 'hero shots stop on the first prop they cross');
  }
  const exposedBeforeWall = newGame(); exposedBeforeWall.enemies = [];
  const beforeWall = stationary(addEnemy(exposedBeforeWall, 'grunt', 122, 110));
  launch(exposedBeforeWall, 'hero', true); tick(exposedBeforeWall);
  assert.equal(beforeWall.hp, beforeWall.maxHp - 10, 'a target before the prop still takes the beam hit');
  const enemyShot = newGame(); enemyShot.enemies = []; enemyShot.x = 190; enemyShot.y = 110;
  launch(enemyShot, 'enemy'); tick(enemyShot);
  assert.equal(activeHero(enemyShot).hp, 100, 'fast enemy shots cannot hurt the hero through a solid prop');
  assert.equal(enemyShot.projectiles.length, 0, 'enemy shots stop on solid props');
} finally { TEST_WORLD.props = originalProps; }

console.log('Wayside Fury collision: sub-tile footprints, all-map radius-aware reachability, safe arrivals/interactions, sliding, body separation and swept projectile checks pass.');
