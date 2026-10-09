import assert from 'node:assert/strict';
import { newGame, enterScene, step, idleInput, activeHero, addEnemy, interact, restAtHome, syncCoopLevel } from '../src/pages/WaysideFury/game/sim.ts';
import { grantChip, equipChip, itemsState } from '../src/pages/WaysideFury/game/u1/items/chips.ts';
import { CHIP_FINDS, collectChip } from '../src/pages/WaysideFury/game/u1/items/pickups.ts';
import { getWorld, isBlocked, GATEKEEPER_ROOM, WATCHER_ROOM } from '../src/pages/WaysideFury/game/world.ts';
import { reachable } from './helpers/wayside-fury-items-route.mjs';
import { makeSave, restoreSave, progressReport } from '../src/pages/WaysideFury/game/save.ts';
import { applyCoopReward } from '../src/pages/WaysideFury/game/coopRewards.ts';

const tick = (s, input = {}, frames = 1) => {
  for (let n = 0; n < frames; n++) step(s, { ...idleInput(), ...input }, 1 / 60);
};
const loadout = (...chips) => {
  const s = newGame(); enterScene(s, 'test'); s.enemies = [];
  s.character.level = 6; syncCoopLevel(s);
  chips.forEach((id, index) => { assert.ok(grantChip(s, id)); assert.ok(equipChip(s, id, index)); });
  s.events.length = 0; return s;
};
for (const item of CHIP_FINDS) {
  const world = getWorld(item.scene, item.room);
  assert.equal(isBlocked(world, item.x, item.y, 7), false, `${item.id} open ground`);
  assert.ok(reachable(world, item), `${item.id} reachable`);
  const s = newGame(); enterScene(s, item.scene, item.room); s.x = item.x; s.y = item.y;
  const before = progressReport(s).score;
  interact(s); assert.ok(itemsState(s).chips.owned.includes(item.chip));
  assert.equal(collectChip(s, item.id), false, 'secret is one time');
  assert.equal(progressReport(s).score, before, 'chip IDs never become ticket progress');
}
const normal = loadout(), faster = loadout('sprinter');
tick(normal, { x: 1 }, 15); tick(faster, { x: 1 }, 15);
assert.ok(faster.x > normal.x + 1, 'Sprinter affects actual movement');
const normalKi = loadout(), fastKi = loadout('ki-coil');
activeHero(normalKi).ki = activeHero(fastKi).ki = 0;
tick(normalKi, { ki: true }, 30); tick(fastKi, { ki: true }, 30);
assert.ok(activeHero(fastKi).ki > activeHero(normalKi).ki * 1.29, 'Ki Coil affects actual charge');
const saver = loadout('ki-saver'); activeHero(saver).ki = 6;
tick(saver, { ki: true }); const charged = activeHero(saver).ki;
tick(saver); assert.ok(saver.projectiles.some(p => p.owner === 'hero')); assert.ok(activeHero(saver).ki < charged);
const combo = loadout('combo-extender'); tick(combo, { attack: true }); assert.equal(combo.comboWindow, 1.25);
const dash = loadout('quickstep'); activeHero(dash).stamina = 20;
tick(dash, { dash: true }); assert.ok(dash.dashTimer > 0); assert.ok(activeHero(dash).stamina < 1);
const vital = loadout('vital-spark'); activeHero(vital).hp = 40; tick(vital, {}, 60); assert.ok(activeHero(vital).hp > 40.7);
const hostile = addEnemy(vital, 'grunt', vital.x + 80, vital.y); hostile.speed = 0; hostile.cooldown = 999;
const hp = activeHero(vital).hp; tick(vital, {}, 30); assert.equal(activeHero(vital).hp, hp, 'healing waits for safety');


// Compare damage delivered through the projectile collision path, rather than
// merely asserting that the chip's returned multiplier has the expected value.
const deliveredKiDamage = (s, signature) => {
  const enemy = addEnemy(s, 'boss', s.x + 64, s.y);
  enemy.hp = enemy.maxHp = 10_000; enemy.speed = 0; enemy.cooldown = 999;
  activeHero(s).ki = signature ? activeHero(s).maxKi : 20;
  tick(s, { ki: true }); tick(s);
  for (let frame = 0; frame < 80 && enemy.hp === enemy.maxHp; frame++) tick(s);
  assert.ok(enemy.hp < enemy.maxHp, 'Ki projectile actually reached the target');
  return enemy.maxHp - enemy.hp;
};
for (const signature of [false, true]) {
  const ordinary = deliveredKiDamage(loadout(), signature);
  const focused = deliveredKiDamage(loadout('focus-lens'), signature);
  assert.ok(focused > ordinary, `Focus Lens increases delivered ${signature ? 'signature' : 'ordinary Ki'} damage`);
  assert.ok(Math.abs(focused - ordinary * 1.15) <= 1, '15% bonus respects rounded combat damage');
}
const meleeDamage = s => {
  const enemy = addEnemy(s, 'grunt', s.x + 24, s.y);
  enemy.hp = enemy.maxHp = 1_000; enemy.speed = 0; enemy.cooldown = 999;
  tick(s, { attack: true }); return enemy.maxHp - enemy.hp;
};
assert.equal(meleeDamage(loadout('focus-lens')), meleeDamage(loadout()), 'Focus Lens affects Ki while keeping ordinary melee unchanged');

for (const [room, chip] of [[GATEKEEPER_ROOM, 'iron-guard'], [WATCHER_ROOM, 'focus-lens']]) {
  const s = loadout(); enterScene(s, 'dungeon', room);
  const guardian = s.enemies.find(enemy => enemy.kind === 'boss');
  assert.ok(guardian); guardian.hp = 1;
  s.x = guardian.x - 24; s.y = guardian.y;
  tick(s, { attack: true });
  assert.equal(s.enemies.some(enemy => enemy.id === guardian.id), false, 'the guardian is defeated through the simulation');
  assert.ok(itemsState(s).chips.owned.includes(chip), `${chip} drops from its guardian`);
  assert.equal(grantChip(s, chip), false, 'a repeat boss reward cannot duplicate its chip');
  enterScene(s, 'dungeon', room);
  assert.equal(s.enemies.length, 0, 'revisiting a completed guardian room does not respawn its reward');
}
for (const [room, chip] of [[8, 'candy-magnet'], [9, 'ki-saver']]) {
  const s = loadout(); enterScene(s, 'dungeon', room); s.enemies = [];
  const world = getWorld('dungeon', room), chest = world.props.find(prop => prop.kind === 'chest');
  assert.ok(chest);
  s.x = chest.x + chest.w / 2; s.y = chest.y;
  assert.equal(isBlocked(world, s.x, s.y, 7), false, 'cache opens from a legal approach outside its footprint');
  const before = progressReport(s).score;
  interact(s);
  assert.ok(itemsState(s).chips.owned.includes(chip), `${chip} found through the existing supply cache action`);
  assert.equal(progressReport(s).score - before, 0, 'supply caches retain the shipped no-ticket policy');
  const candy = s.candy, receipt = progressReport(s).receipt;
  interact(s);
  assert.equal(s.candy, candy, 'supply cache cannot pay out twice');
  assert.equal(progressReport(s, receipt).score, 0, 'repeat cache interaction cannot produce new ticket progress');
}

const lethal = s => {
  s.projectiles.push({ id: s.nextId++, x: s.x, y: s.y, vx: 0, vy: 0, damage: 100000, radius: 4, ttl: 1, owner: 'enemy', beam: false, hits: [] });
  tick(s);
};
const wind = loadout('second-wind'); wind.party = [wind.active]; lethal(wind);
assert.equal(wind.scene, 'test'); assert.equal(wind.deaths, 0); assert.equal(itemsState(wind).chips.secondWindUsed, true);
assert.equal(activeHero(wind).hp, activeHero(wind).maxHp * .35);
const savedWind = makeSave(wind, null); const restoredWind = restoreSave(savedWind); assert.equal(itemsState(restoredWind).chips.secondWindUsed, true);
wind.hitStop = 0; activeHero(wind).invulnerable = 0; lethal(wind); assert.equal(wind.scene, 'dead');
restAtHome(restoredWind); assert.equal(itemsState(restoredWind).chips.secondWindUsed, false);

const plainDamage = loadout(), guardDamage = loadout('iron-guard');
for (const s of [plainDamage, guardDamage]) { activeHero(s).hp = 100; s.projectiles.push({ id: s.nextId++, x:s.x,y:s.y,vx:0,vy:0,damage:30,radius:4,ttl:1,owner:'enemy',beam:false,hits:[] }); tick(s); }
assert.ok(activeHero(guardDamage).hp > activeHero(plainDamage).hp, 'Iron Guard affects actual received damage');
const coop = loadout('candy-magnet', 'lucky-star'); coop.coop = { role: 'guest', seat: 1, remoteHeroes: [], appliedHits: [] };
assert.ok(applyCoopReward(coop, { id: 'items-kill', kind:'kill', xp:0,candy:8 }));
assert.equal(coop.candy, 11); assert.equal(applyCoopReward(coop, { id:'items-kill',kind:'kill',xp:0,candy:8 }), false);
assert.ok(applyCoopReward(coop, { id:'items-boss',kind:'checkpoint',xp:0,candy:0,bosses:['blast-gatekeeper'],rooms:['blast-4'] }));
assert.ok(itemsState(coop).chips.owned.includes('iron-guard'));
assert.ok(coop.events.every(e => e.type !== 'checkpoint'), 'personal chip rewards never fan out as world checkpoints');
const otherPlayer = newGame(); assert.equal(itemsState(otherPlayer).chips.owned.length, 0);
assert.deepEqual(itemsState(restoreSave(makeSave(coop, null))).chips.owned, itemsState(coop).chips.owned);
console.log('Wayside Fury chips simulation, acquisition, co-op and save checks passed.');
