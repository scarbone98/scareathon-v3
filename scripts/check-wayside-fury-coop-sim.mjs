import assert from 'node:assert/strict';
import { newGame, enterScene, addEnemy, activeHero, idleInput, step, interact, applyCoopHit } from '../src/pages/WaysideFury/game/sim.ts';
import { getWorld } from '../src/pages/WaysideFury/game/world.ts';

const DT = 1 / 60;
const cooperative = (role, seat) => {
  const s = newGame(221);
  s.coop = { role, seat, remoteHeroes: [], appliedHits: [] };
  return s;
};
const tick = (s, input = {}, frames = 1) => {
  const events = [];
  for (let f = 0; f < frames; f++) { step(s, { ...idleInput(), ...input }, DT); events.push(...s.events); }
  return events;
};

// Entering a guest world never independently respawns its authored encounter.
const guest = cooperative('guest', 1);
enterScene(guest, 'dungeon');
assert.equal(guest.enemies.length, 0);
const enemy = addEnemy(guest, 'grunt', guest.x + 20, guest.y);
enemy.cooldown = 0;
const authoritativeEnemy = structuredClone(enemy);
const hp = activeHero(guest).hp;
tick(guest, {}, 60);
assert.deepEqual(enemy, authoritativeEnemy, 'guest does not advance enemy AI or contact attacks');
assert.equal(activeHero(guest).hp, hp);
const events = tick(guest, { attack: true });
const melee = events.filter(e => e.type === 'coop-hit');
assert.equal(melee.length, 1);
assert.equal(melee[0].enemyId, enemy.id);
assert.equal(enemy.hp, authoritativeEnemy.hp, 'guest hits do not alter enemy HP');
assert.equal(guest.candy, 0); assert.equal(guest.character.xp, 0); assert.equal(guest.kills, 0);
assert.equal(tick(guest, { attack: true }, 60).filter(e => e.type === 'coop-hit').length, 0, 'held attack is one strike');
assert.ok(tick(guest, { x: -1 }, 10));
assert.ok(guest.x < getWorld('dungeon').spawn.x, 'guest retains local hero movement');

// Beam collisions report each enemy once even across multiple ticks, while
// distinct projectiles can each damage that same target.
guest.hitStop = 0;
const second = addEnemy(guest, 'grunt', enemy.x + 16, enemy.y);
const bullet = () => guest.projectiles.push({ id: guest.nextId++, x: enemy.x - 20, y: enemy.y,
  vx: 20, vy: 0, radius: 15, damage: 12, ttl: 0.8, owner: 'hero', hero: guest.active, beam: true, hits: [] });
bullet();
const beamHits = tick(guest, {}, 55).filter(e => e.type === 'coop-hit');
assert.equal(beamHits.length, 2); assert.equal(new Set(beamHits.map(e => e.enemyId)).size, 2);
assert.equal(beamHits[0].attackId, beamHits[1].attackId);
bullet();
const otherBeamHits = tick(guest, {}, 55).filter(e => e.type === 'coop-hit');
assert.equal(otherBeamHits.length, 2); assert.notEqual(otherBeamHits[0].attackId, beamHits[0].attackId);
assert.equal(second.hp, second.maxHp);

// Authoritative damage is applied once per source attack and target. Its kill
// follows the same XP/candy/event path as local combat.
const host = cooperative('host', 0);
host.enemies = [structuredClone(authoritativeEnemy), structuredClone(second)];
assert.equal(applyCoopHit(host, melee[0], 1), true);
const afterHit = host.enemies[0].hp;
assert.equal(applyCoopHit(host, melee[0], 1), false); assert.equal(host.enemies[0].hp, afterHit);
assert.equal(applyCoopHit(host, beamHits[0], 1), true);
assert.equal(applyCoopHit(host, beamHits[1], 1), true, 'one beam can hit multiple targets');
assert.equal(applyCoopHit(host, { ...melee[0], attackId: 'invalid', damage: NaN }, 1), false);
assert.equal(applyCoopHit(host, { ...melee[0], attackId: 'self' }, 0), false);
const kill = { ...melee[0], attackId: 'finisher', damage: 1000 };
assert.equal(applyCoopHit(host, kill, 1), true);
assert.equal(host.kills, 1); assert.ok(host.candy > 0); assert.ok(host.character.xp > 0);
assert.equal(host.events.filter(e => e.type === 'kill').length, 1);
assert.equal(applyCoopHit(host, kill, 1), false); assert.equal(host.kills, 1);
assert.equal(applyCoopHit(guest, kill, 0), false, 'guests cannot apply authoritative enemy damage');

// Empty snapshots and doorway inputs never create guest clears or travel.
guest.enemies = []; guest.projectiles = [];
const world = getWorld('dungeon'); guest.x = world.width - 18; guest.y = world.spawn.y;
guest.transitionCooldown = 0;
tick(guest, { interact: true }, 10); interact(guest);
assert.equal(guest.scene, 'dungeon'); assert.equal(guest.room, 0);
assert.deepEqual(guest.clearedRooms, []); assert.deepEqual(guest.areas, []);
enterScene(guest, 'shift'); tick(guest, {}, 180); assert.equal(guest.scene, 'shift');
enterScene(guest, 'prologue'); tick(guest, { interact: true }); assert.equal(guest.cutscene, 0);

console.log('Wayside Fury co-op simulation: guest prediction, host-only world authority, per-hit reporting and deduplicated host combat pass.');
