import assert from 'node:assert/strict';
import { activeHero, addEnemy, applyCoopHit, enterScene, gainXp, idleInput, newGame, step, xpForLevel } from '../src/pages/WaysideFury/game/sim.ts';
import { BLAST_WORLDS, REALM_WORLD, OVERWORLD, distanceToExit, isBlocked, tileAt } from '../src/pages/WaysideFury/game/world.ts';
import { progressReport } from '../src/pages/WaysideFury/game/save.ts';
import { rollCoopCandy } from '../src/pages/WaysideFury/game/coopRewards.ts';

for (const world of [...BLAST_WORLDS, REALM_WORLD]) {
  const boss = world.spawns.some(enemy => enemy.kind === 'boss');
  if (!boss) {
    assert.equal(world.spawns.length, world.width > 1000 ? 12 : world.width > 800 ? 9 : 6);
    for (const [i, enemy] of world.spawns.entries()) {
      assert.equal(isBlocked(world, enemy.x, enemy.y, 10), false, `${world.id}: safe spawn`);
      assert.ok(Math.hypot(enemy.x - world.spawn.x, enemy.y - world.spawn.y) >= 150);
      assert.ok(world.exits.every(exit => distanceToExit(exit, enemy.x, enemy.y) >= 120));
      assert.ok(world.spawns.some((other, j) => i !== j && Math.hypot(enemy.x - other.x, enemy.y - other.y) <= 80), 'each enemy has a nearby encounter partner');
      assert.ok(world.spawns.every((other, j) => i === j || Math.hypot(enemy.x - other.x, enemy.y - other.y) >= 24), 'formation members do not overlap');
    }
  }
}
assert.equal(tileAt(OVERWORLD, 25, 33), 'stone', 'gag taxi has a paved pullout');
// Progress comes from the same kill path as co-op, with controlled fatal hits.
const run = newGame(); run.coop = { role: 'host', seat: 0, remoteHeroes: [], appliedHits: [] };
let hit = 0;
const clearForXp = (scene, room) => {
  enterScene(run, scene, room);
  for (const enemy of run.enemies) {
    applyCoopHit(run, { type: 'coop-hit', enemyId: enemy.id, damage: 10000, dx: 0, dy: 0, force: 0, attackId: `balance-${hit++}` }, 1);
    const event = run.events.at(-1); assert.equal(event.type, 'kill'); gainXp(run, event.xp);
  }
};
for (let room = 0; room <= 7; room++) clearForXp('dungeon', room);
assert.equal(run.character.level, 6, 'main-route Watcher clear reaches level 6');
clearForXp('realm', 0); assert.equal(run.character.level, 6);
clearForXp('dungeon', 8); clearForXp('dungeon', 9);
assert.equal(run.character.level, 7, 'both optional caches add roughly one level');
assert.equal(xpForLevel(1), 75); assert.equal(xpForLevel(6), 300);
const early = newGame(); enterScene(early, 'dungeon', 0);
const late = newGame(); enterScene(late, 'dungeon', 6);
assert.ok(late.enemies[0].maxHp > early.enemies[0].maxHp);
const entrance = newGame(); enterScene(entrance, 'dungeon', 0);
const initialEnemies = structuredClone(entrance.enemies);
for (let frame = 0; frame < 180; frame++) step(entrance, idleInput(), 1 / 60);
assert.deepEqual(entrance.enemies.map(e => [e.x, e.y]), initialEnemies.map(e => [e.x, e.y]), 'entrance apron does not immediately aggro enemies');
const recovery = newGame(); enterScene(recovery, 'dungeon'); activeHero(recovery).hp = 40; recovery.heroes.joe.hp = 0;
recovery.enemies = [addEnemy(recovery, 'grunt', 300, 192)]; recovery.enemies[0].hp = 0;
step(recovery, idleInput(), 1 / 60);
assert.equal(activeHero(recovery).hp, 52); assert.equal(recovery.heroes.joe.hp, 0, 'clear recovery cannot revive a KO');
enterScene(recovery, 'dungeon'); step(recovery, idleInput(), 1 / 60); assert.equal(activeHero(recovery).hp, 52, 'revisit cannot farm recovery');
gainXp(recovery, 75); assert.equal(recovery.heroes.joe.hp, 0, 'level healing cannot revive a KO');
for (let index = 0; index < 50; index++) assert.ok(rollCoopCandy(`${index}`, 'test', false) >= 2 && rollCoopCandy(`${index}`, 'test', false) <= 4);
const tickets = newGame(); tickets.areas = ['blast', 'blast']; tickets.character.level = 6;
tickets.clearedRooms = ['blast-0', 'blast-0', 'blast-7', 'loot-blast-8']; tickets.bosses = ['blast-watcher']; tickets.foundItems = ['pickup-c1-wreck'];
const report = progressReport(tickets); assert.equal(report.score, 1600, 'only area, level and actual zone deltas pay tickets');
assert.equal(progressReport(tickets, report.receipt).score, 0);
tickets.character.level = 1; assert.equal(progressReport(tickets, report.receipt).score, 0, 'HOME rollback retains high-water mark');
console.log('Wayside Fury balance: density, safe formations, entrance breathing room, level pacing, recovery and exact ticket deltas pass.');

// Combat pass is part of balance acceptance, including boss wall-pin regression.
await import('./check-wayside-fury-combat.mjs');
