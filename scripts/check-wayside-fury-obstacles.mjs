import assert from 'node:assert/strict';
import { newGame, enterScene, addEnemy, idleInput, step, interact, exitCoop } from '../src/pages/WaysideFury/game/sim.ts';
import { getWorld, isBlocked } from '../src/pages/WaysideFury/game/world.ts';
import { makeSave, restoreSave, progressReport } from '../src/pages/WaysideFury/game/save.ts';
import { HERO_OBSTACLES, worldSave, obstacleBlocks, isObstacleCleared, getHeroObstacleTarget,
  canClearHeroObstacle, clearHeroObstacle, obstacleRewardAvailable, syncWorldObstacles } from '../src/pages/WaysideFury/game/u1/world/obstacles.ts';

const DT = 1 / 60;
const tick = (state, input = {}, frames = 1) => {
  const events = [];
  for (let n = 0; n < frames; n++) {
    step(state, { ...idleInput(), ...input }, DT); events.push(...state.events);
  }
  return events;
};
const radiusFor = state => state.scene === 'overworld' ? 10 : 7;
function atGate(gate, role) {
  const state = newGame(773);
  if (role) state.coop = { role, seat: role === 'host' ? 0 : 1, remoteHeroes: [], appliedHits: [] };
  const scene = gate.worldId.startsWith('blast-') ? 'dungeon' : gate.worldId;
  const room = gate.worldId.startsWith('blast-') ? Number(gate.worldId.slice(6)) : 0;
  enterScene(state, scene, room); state.enemies = []; state.projectiles = [];
  state.x = gate.x + gate.w / 2; state.y = gate.y + gate.h + radiusFor(state) + 3;
  state.party = ['you', gate.hero]; state.active = gate.hero;
  state.faceX = 1; state.faceY = 0; state.transitionCooldown = 1;
  state.heroes[gate.hero].invulnerable = 30;
  tick(state, {}, 10);
  return state;
}

// Traverse the actual map with hero-radius collision, including every gate and
// wall. Reaching the reward's interaction radius is enough, even for solid chests.
function canReachReward(state, gate) {
  const world = getWorld(state.scene, state.room), radius = radiusFor(state), grid = 4;
  const cols = Math.floor(world.width / grid) + 1, rows = Math.floor(world.height / grid) + 1;
  const count = cols * rows, seen = new Uint8Array(count), occupancy = new Int8Array(count), queue = new Uint32Array(count);
  occupancy.fill(-1);
  const blocked = (x, y) => isBlocked(world, x, y, radius) || obstacleBlocks(state, x, y, radius);
  const free = index => {
    if (occupancy[index] < 0) occupancy[index] = blocked(index % cols * grid, Math.floor(index / cols) * grid) ? 0 : 1;
    return occupancy[index] === 1;
  };
  const start = Math.round(state.y / grid) * cols + Math.round(state.x / grid);
  assert.ok(free(start), `${gate.id}: approach position is walkable`);
  let head = 0, tail = 1; queue[0] = start; seen[start] = 1;
  while (head < tail) {
    const index = queue[head++], col = index % cols, row = Math.floor(index / cols), x = col * grid, y = row * grid;
    if (Math.hypot(x - gate.rewardAnchor.x, y - gate.rewardAnchor.y) <= 20) return true;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const c = col + dc, r = row + dr;
      if (c < 0 || c >= cols || r < 0 || r >= rows) continue;
      const next = r * cols + c;
      if (seen[next] || !free(next)) continue;
      // Check the segment midpoint so thin geometry cannot fall between cells.
      if (blocked(x + dc * grid / 2, y + dr * grid / 2)) continue;
      seen[next] = 1; queue[tail++] = next;
    }
  }
  return false;
}

assert.equal(HERO_OBSTACLES.length, 6, 'six authored gates are covered');
assert.equal(new Set(HERO_OBSTACLES.map(gate => gate.id)).size, HERO_OBSTACLES.length, 'gate IDs are unique');
assert.deepEqual([...new Set(HERO_OBSTACLES.map(gate => gate.hero))].sort(), ['alex', 'joe', 'jon', 'matt']);
for (const gate of HERO_OBSTACLES) {
  const state = atGate(gate);
  assert.equal(getHeroObstacleTarget(state)?.id, gate.id, `${gate.id}: nearby gate supplies the context target`);
  state.active = 'you';
  assert.equal(canClearHeroObstacle(state, gate.id), false, `${gate.id}: wrong hero is rejected`);
  assert.equal(clearHeroObstacle(state, gate.id), false);
  assert.equal(isObstacleCleared(state, gate.id), false);
  state.active = gate.hero;
  const origin = { x: state.x, y: state.y };
  state.x = gate.x + gate.w + 80;
  assert.equal(canClearHeroObstacle(state, gate.id), false, `${gate.id}: distant hero is rejected`);
  Object.assign(state, origin); state.heroes[gate.hero].hp = 0;
  assert.equal(canClearHeroObstacle(state, gate.id), false, `${gate.id}: fallen hero is rejected`);
  state.heroes[gate.hero].hp = state.heroes[gate.hero].maxHp;
  assert.equal(obstacleBlocks(state, gate.x + gate.w / 2, gate.y + gate.h / 2, radiusFor(state)), true);
  for (const wall of gate.walls) assert.equal(obstacleBlocks(state, wall.x + wall.w / 2, wall.y + wall.h / 2, 7), true);
  assert.equal(canReachReward(state, gate), false, `${gate.id}: closed pocket cannot be bypassed`);
  if (gate.rewardId) assert.equal(obstacleRewardAvailable(state, gate.rewardId), false, `${gate.id}: existing supply cache is sealed`);
  const receipt = progressReport(state).receipt;
  assert.equal(clearHeroObstacle(state, gate.id), true, `${gate.id}: required hero clears gate`);
  assert.equal(clearHeroObstacle(state, gate.id), false, `${gate.id}: clearance is once only`);
  assert.equal(state.events.filter(event => event.type === 'obstacle-cleared').length, 1);
  assert.equal(obstacleBlocks(state, gate.x + gate.w / 2, gate.y + gate.h / 2, radiusFor(state)), false, `${gate.id}: door collision disappears`);
  for (const wall of gate.walls) assert.equal(obstacleBlocks(state, wall.x + wall.w / 2, wall.y + wall.h / 2, 7), true, `${gate.id}: solid walls persist`);
  assert.equal(canReachReward(state, gate), true, `${gate.id}: open pocket leads to reward`);
  if (gate.rewardId) assert.equal(obstacleRewardAvailable(state, gate.rewardId), true);
  assert.equal(progressReport(state, receipt).score, 0, `${gate.id}: gate discovery creates no ticket score`);
  const saved = makeSave(state, null, true);
  assert.ok(saved);
  assert.equal(isObstacleCleared(restoreSave(saved), gate.id), true, `${gate.id}: ordinary save restores discovery`);
  assert.equal(isObstacleCleared(restoreSave(saved, true), gate.id), true, `${gate.id}: HOME retry retains discovery`);
}

// Live movement uses exactly the same gate geometry as interaction/navigation.
for (const gate of HERO_OBSTACLES) {
  const state = atGate(gate); const approach = { x: state.x, y: state.y };
  tick(state, { y: -1 }, 75);
  assert.ok(state.y >= gate.y + gate.h + radiusFor(state) - .1, `${gate.id}: walking cannot cross closed door`);
  Object.assign(state, approach); state.vx = state.vy = 0;
  assert.equal(clearHeroObstacle(state, gate.id), true);
  // Existing supply chests occupy the middle of their pockets. Approach the
  // side of those entrances so this verifies door passage, not chest collision.
  if (gate.rewardId) state.x = gate.x + 11;
  tick(state, { y: -1 }, 75);
  assert.ok(state.y < gate.y, `${gate.id}: walking crosses the cleared entrance`);
}

const gate = HERO_OBSTACLES.find(entry => entry.hero === 'joe' && entry.worldId === 'blast-0');
const held = atGate(gate);
held.active = 'you'; tick(held, { attack: true });
held.active = gate.hero;
assert.equal(tick(held, { attack: true }, 90).filter(event => event.type === 'obstacle-cleared').length, 0, 'tagging while Attack is held does not activate a new press');
assert.equal(isObstacleCleared(held, gate.id), false);
tick(held); held.attackTimer = 0;
assert.equal(tick(held, { attack: true }, 90).filter(event => event.type === 'obstacle-cleared').length, 1, 'one fresh Attack press clears the gate once');

const combat = atGate(gate), enemy = addEnemy(combat, 'grunt', combat.x + 16, combat.y);
enemy.speed = 0; enemy.cooldown = 100;
tick(combat, { attack: true });
assert.ok(enemy.hp < enemy.maxHp, 'hostile in melee reach receives the Attack press');
assert.equal(isObstacleCleared(combat, gate.id), false, 'combat priority prevents gate clearance on that press');

const guarded = atGate(gate); tick(guarded, { attack: true, guard: true });
assert.equal(isObstacleCleared(guarded, gate.id), false, 'guard does not activate obstacle');
const charging = atGate(gate); tick(charging, { attack: true, ki: true });
assert.equal(isObstacleCleared(charging, gate.id), false, 'Ki charge does not activate obstacle');

const guest = atGate(gate, 'guest');
assert.equal(clearHeroObstacle(guest, gate.id), false, 'guest cannot mutate host geometry directly');
const requested = tick(guest, { attack: true });
assert.equal(isObstacleCleared(guest, gate.id), false, 'guest Attack waits for host confirmation');
assert.equal(requested.filter(event => event.id === gate.id && event.type === 'obstacle-request').length, 1, 'guest emits one gate request');
assert.equal(tick(guest, { attack: true }, 90).filter(event => event.id === gate.id).length, 0, 'held guest Attack cannot spam requests');
assert.deepEqual(worldSave(guest).clearedObstacles, [], 'request alone changes no personal discovery');

const host = atGate(gate, 'host'), actor = { hero: gate.hero, x: host.x, y: host.y, hp: 40 };
host.active = 'you';
assert.equal(clearHeroObstacle(host, gate.id, { ...actor, hero: 'matt' }), false, 'host validates peer hero');
assert.equal(clearHeroObstacle(host, gate.id, { ...actor, x: actor.x + 100 }), false, 'host validates peer range');
assert.equal(clearHeroObstacle(host, gate.id, { ...actor, hp: 0 }), false, 'host validates peer health');
host.overlay = 'shop';
assert.equal(clearHeroObstacle(host, gate.id, actor), true, 'host accepts a valid peer independently of host hero');
assert.equal(host.overlay, 'shop', 'host shop overlay does not prevent a remote hero from opening shared geometry');
assert.equal(isObstacleCleared(host, gate.id), true);

// Initial host geometry is borrowed for the session. Only discoveries made
// after joining become the guest's own persistent progress.
const personal = atGate(gate, 'guest');
const prior = HERO_OBSTACLES.find(entry => entry.hero === 'matt').id;
const fresh = HERO_OBSTACLES.find(entry => entry.hero === 'alex').id;
worldSave(personal).clearedObstacles = [prior];
syncWorldObstacles(personal, [gate.id]);
assert.equal(isObstacleCleared(personal, gate.id), true, 'guest adopts initial host geometry');
assert.deepEqual(worldSave(personal).clearedObstacles, [prior], 'initial snapshot preserves personal saves without granting old discoveries');
syncWorldObstacles(personal, [gate.id, fresh]);
assert.deepEqual(new Set(worldSave(personal).clearedObstacles), new Set([prior, fresh]), 'new shared discoveries merge into personal progress');
syncWorldObstacles(personal, [gate.id, fresh]);
assert.equal(worldSave(personal).clearedObstacles.filter(id => id === fresh).length, 1, 'repeated snapshots do not duplicate discoveries');
exitCoop(personal);
assert.equal(isObstacleCleared(personal, prior), true);
assert.equal(isObstacleCleared(personal, fresh), true);
assert.equal(isObstacleCleared(personal, gate.id), false, 'leaving co-op returns to personal gate progress');

// A guest can stand in geometry borrowed from a host without owning that gate.
// When co-op ends, restore the closed door and move the guest out of its pocket.
for (const borrowedGate of [gate, HERO_OBSTACLES.find(entry => entry.worldId === 'overworld')]) {
  for (const position of ['alcove', 'doorway']) {
    const borrowed = atGate(borrowedGate, 'guest');
    syncWorldObstacles(borrowed, [borrowedGate.id]);
    borrowed.x = position === 'alcove' ? borrowedGate.rewardAnchor.x : borrowedGate.x + borrowedGate.w / 2;
    borrowed.y = position === 'alcove' ? borrowedGate.rewardAnchor.y : borrowedGate.y + borrowedGate.h / 2;
    assert.equal(isObstacleCleared(borrowed, borrowedGate.id), true, `${borrowedGate.id}: host lends the opening`);
    assert.deepEqual(worldSave(borrowed).clearedObstacles, [], 'borrowed opening grants no personal discovery');
    exitCoop(borrowed);
    assert.equal(isObstacleCleared(borrowed, borrowedGate.id), false, `${borrowedGate.id}: borrowed opening closes on exit`);
    assert.deepEqual(worldSave(borrowed).clearedObstacles, [], 'safe exit grants no personal discovery');
    const radius = radiusFor(borrowed), world = getWorld(borrowed.scene, borrowed.room);
    assert.equal(isBlocked(world, borrowed.x, borrowed.y, radius), false, `${borrowedGate.id}/${position}: exits clear of authored scenery`);
    assert.equal(obstacleBlocks(borrowed, borrowed.x, borrowed.y, radius), false, `${borrowedGate.id}/${position}: exits clear of restored gate and walls`);
    assert.ok(borrowed.y >= borrowedGate.y + borrowedGate.h + radius - .0001,
      `${borrowedGate.id}/${position}: exits outside the closed pocket at body radius ${radius}`);
  }
}

// Dedicated Interact remains a usable alternative to the context Attack.
const dedicated = atGate(gate); interact(dedicated); assert.equal(isObstacleCleared(dedicated, gate.id), true);
console.log('Wayside Fury obstacles: heroes, collision/navigation, Attack priority, co-op authority and save migration pass.');
