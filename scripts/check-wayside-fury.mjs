// Exercise the pure simulation headlessly, as the Horde Rush balance script does.
// Run with Node 24+: node scripts/check-wayside-fury.mjs
import assert from 'node:assert/strict';
import { newGame, step, idleInput, addEnemy, activeHero, xpForLevel, enterScene, interact, interactTarget, buyItem, restAtHome } from '../src/pages/WaysideFury/game/sim.ts';

import { LOCATIONS, HUB_POINTS, SHOP_ITEMS } from '../src/pages/WaysideFury/game/content.ts';
import { SAVE_KEY, readSave, writeSave, restoreSave } from '../src/pages/WaysideFury/game/save.ts';

const DT = 1 / 60;
const tick = (s, buttons = {}, frames = 1) => {
  for (let i = 0; i < frames; i++) step(s, { ...idleInput(), ...buttons }, DT);
};
const emptyRoom = () => { const s = newGame(100); s.enemies = []; return s; };
const bulletAtHero = (s, damage = 20) => s.projectiles.push({ id: s.nextId++, x: s.x, y: s.y, vx: 0, vy: 0,
  radius: 4, damage, ttl: 1, owner: 'enemy', beam: false, hits: [] });

// Holding Attack creates one strike. Separate taps advance all three hits,
// and the finisher does more damage with stronger knockback and hit-stop.
const combo = emptyRoom();
const target = addEnemy(combo, 'grunt', combo.x + 20, combo.y);
target.maxHp = target.hp = 1000; target.speed = 0; target.cooldown = 100;
tick(combo, { attack: true });
assert.equal(combo.combo, 1);
assert.ok(combo.hitStop > 0);
assert.ok(target.kx > 0);
const firstDamage = 1000 - target.hp;
tick(combo, { attack: true }, 24);
assert.equal(target.hp, 1000 - firstDamage, 'held Attack must not repeat');
tick(combo, {}, 1);
target.x = combo.x + 20; target.y = combo.y; target.kx = target.ky = 0;
tick(combo, { attack: true });
assert.equal(combo.combo, 2);
tick(combo, {}, 22);
target.x = combo.x + 20; target.y = combo.y; target.kx = target.ky = 0;
const beforeFinisher = target.hp;
tick(combo, { attack: true });
assert.equal(combo.combo, 3);
assert.ok(beforeFinisher - target.hp > firstDamage);
assert.ok(target.kx > 90);
assert.ok(combo.hitStop >= 0.055);
tick(combo, {}, 65);
tick(combo, { attack: true });
assert.equal(combo.combo, 1, 'combo window expires');

// A tap fires on release; holding restores Ki; full bars unleash distinct beams.
const ki = emptyRoom();
const initialKi = activeHero(ki).ki;
tick(ki, { ki: true });
assert.equal(ki.projectiles.length, 0);
tick(ki);
assert.equal(ki.projectiles.length, 1);
assert.equal(ki.projectiles[0].beam, false);
assert.ok(activeHero(ki).ki < initialKi);
ki.projectiles = [];
tick(ki, { ki: true }, 140);
assert.equal(activeHero(ki).ki, activeHero(ki).maxKi);
assert.ok(ki.charge > 2);
tick(ki);
assert.equal(ki.projectiles.filter(p => p.beam).length, 1);
assert.equal(activeHero(ki).ki, 0);
assert.equal(ki.notice, 'JOE: Wayside Wave!');
const mattBeam = emptyRoom();
mattBeam.active = 'matt'; activeHero(mattBeam).ki = activeHero(mattBeam).maxKi;
tick(mattBeam, { ki: true }); tick(mattBeam);
assert.equal(mattBeam.projectiles.filter(p => p.beam).length, 3);
assert.equal(mattBeam.notice, 'MATT: Golden Fury!');
assert.ok(new Set(mattBeam.projectiles.map(p => p.vy)).size === 3);

// Guard cuts damage, while dash grants invulnerability and spends stamina.
const exposed = emptyRoom(); bulletAtHero(exposed); tick(exposed);
const damage = 100 - activeHero(exposed).hp;
const guarding = emptyRoom(); bulletAtHero(guarding); tick(guarding, { guard: true });
assert.ok(100 - activeHero(guarding).hp < damage / 2);
assert.ok(guarding.floaters.some(f => f.text.startsWith('BLOCK')));
const dash = emptyRoom(); bulletAtHero(dash);
const startX = dash.x;
tick(dash, { dash: true });
assert.equal(activeHero(dash).hp, 100);
assert.ok(dash.x > startX + 3);
assert.ok(activeHero(dash).stamina <= activeHero(dash).maxStamina - 24);
assert.ok(dash.dashTimer > 0 && activeHero(dash).invulnerable > 0);
tick(dash, { dash: true }, 20);
assert.equal(dash.dashTimer, 0, 'held Dash cannot auto-repeat');

// Tagging preserves each hero's health and cannot bypass its cooldown.
const tag = emptyRoom(); tag.heroes.joe.hp = 37; tag.heroes.matt.hp = 81;
tick(tag, { swap: true }); assert.equal(tag.active, 'matt');
assert.equal(activeHero(tag).hp, 81);
tick(tag); tick(tag, { swap: true }); assert.equal(tag.active, 'matt');
tick(tag, {}, 60); tick(tag, { swap: true }); assert.equal(tag.active, 'joe');
assert.equal(activeHero(tag).hp, 37);

// Kills award candy and XP, grow every stat, and emit a visible level-up.
const progression = emptyRoom();
for (let i = 0; i < 4; i++) { const e = addEnemy(progression, 'grunt', progression.x + 15 + i, progression.y); e.hp = 1; }
tick(progression, { attack: true });
assert.equal(progression.kills, 4);
assert.ok(progression.candy >= 12);
assert.equal(activeHero(progression).level, 2);
assert.equal(activeHero(progression).xp, 4 * 28 - xpForLevel(1));
assert.ok(activeHero(progression).maxHp > 100 && activeHero(progression).maxKi > 60);
assert.ok(activeHero(progression).power > 12 && activeHero(progression).defense > 3);
assert.ok(progression.effects.some(e => e.kind === 'level'));
assert.ok(progression.floaters.some(f => f.text.endsWith('candy')));

// One downed hero tags the survivor in. A party wipe enters game-over once.
const death = emptyRoom(); death.heroes.joe.hp = 1;
bulletAtHero(death, 99); tick(death);
assert.equal(death.active, 'matt'); assert.equal(death.scene, 'test');
death.heroes.matt.hp = 1; death.heroes.matt.invulnerable = 0;
bulletAtHero(death, 99); tick(death);
assert.equal(death.scene, 'dead'); assert.equal(death.deaths, 1);
assert.ok(death.events.some(e => e.type === 'death'));
tick(death, {}, 20); assert.equal(death.deaths, 1);

// Shooter projectiles and grunt chase both run without DOM or random globals.
const ai = newGame(123); const startDistance = Math.hypot(ai.enemies[0].x - ai.x, ai.enemies[0].y - ai.y);
tick(ai, {}, 85);
assert.ok(Math.hypot(ai.enemies[0].x - ai.x, ai.enemies[0].y - ai.y) < startDistance);
assert.ok(ai.projectiles.some(p => p.owner === 'enemy'));
const a = newGame(1234), b = newGame(1234);
for (let frame = 0; frame < 1800; frame++) {
  const input = { ...idleInput(), x: Math.sin(frame / 90), y: Math.cos(frame / 120),
    attack: frame % 24 === 0, ki: frame % 180 < 60, dash: frame % 100 === 70,
    swap: frame % 130 === 50, guard: frame % 70 > 50 };
  step(a, input, DT); step(b, input, DT);
}
assert.deepEqual(a, b, 'same seed and input sequence must reproduce the complete state');
assert.notEqual(newGame(1234).enemies[0].cooldown, newGame(1235).enemies[0].cooldown);
const scene = newGame(); enterScene(scene, 'overworld');
assert.equal(scene.enemies.length, 0); assert.equal(scene.projectiles.length, 0);
const taxiX = scene.x; tick(scene, { x: 1, attack: true, ki: true }, 20);
assert.ok(scene.x > taxiX + 30); assert.equal(scene.projectiles.length, 0);
// Taxi travel is faster, peaceful, and requires pulling over at open markers.
const walker = emptyRoom(), taxi = emptyRoom();
enterScene(walker, 'hub'); enterScene(taxi, 'overworld');
walker.x = taxi.x = 100;
tick(walker, { x: 1 }, 30); tick(taxi, { x: 1, attack: true, ki: true, dash: true, guard: true }, 30);
assert.ok(taxi.x - 100 > (walker.x - 100) * 1.5);
assert.equal(taxi.enemies.length, 0); assert.equal(taxi.projectiles.length, 0);
assert.equal(taxi.attackTimer, 0); assert.equal(taxi.dashTimer, 0); assert.equal(taxi.guard, false);
for (const marker of LOCATIONS.filter(p => p.locked)) {
  taxi.x = marker.x; taxi.y = marker.y;
  assert.equal(interactTarget(taxi).id, marker.id);
  interact(taxi); assert.equal(taxi.scene, 'overworld');
  assert.ok(taxi.notice.includes('taken over'));
}
const wayside = LOCATIONS.find(p => p.id === 'wayside');
taxi.x = wayside.x; taxi.y = wayside.y; tick(taxi, { interact: true });
assert.equal(taxi.scene, 'hub');
for (const point of HUB_POINTS.filter(p => p.id !== 'taxi')) {
  taxi.overlay = null; taxi.x = point.x; taxi.y = point.y;
  tick(taxi); tick(taxi, { interact: true }); assert.equal(taxi.overlay, point.id);
  const frozenX = taxi.x; tick(taxi, { x: 1, attack: true }, 20); assert.equal(taxi.x, frozenX);
}

// Shop costs are exact, healing caps at max HP, and charms help both heroes.
const shop = emptyRoom(); shop.candy = 100; shop.heroes.joe.hp = 20;
const tonic = SHOP_ITEMS.find(item => item.id === 'heal');
assert.equal(buyItem(shop, 'heal'), true);
assert.equal(shop.heroes.joe.hp, 75); assert.equal(shop.candy, 100 - tonic.cost);
assert.equal(buyItem(shop, 'heal'), true); assert.equal(shop.heroes.joe.hp, 100);
const noNeedCandy = shop.candy;
assert.equal(buyItem(shop, 'heal'), false); assert.equal(shop.candy, noNeedCandy);
const stats = Object.fromEntries(Object.entries(shop.heroes).map(([id, h]) => [id, { power: h.power, defense: h.defense }]));
assert.equal(buyItem(shop, 'power'), true); assert.equal(buyItem(shop, 'defense'), true);
for (const [id, h] of Object.entries(shop.heroes)) {
  assert.equal(h.power, stats[id].power + 2); assert.equal(h.defense, stats[id].defense + 1);
}
shop.candy = 0; const poorStats = JSON.stringify(shop.heroes);
assert.equal(buyItem(shop, 'power'), false); assert.equal(shop.candy, 0);
assert.equal(JSON.stringify(shop.heroes), poorStats);

// HOME rests both heroes, unlocks Wayside progress once, and raises a checkpoint.
const home = emptyRoom(); enterScene(home, 'hub');
for (const h of Object.values(home.heroes)) { h.hp = 1; h.ki = 0; h.stamina = 0; }
restAtHome(home);
for (const h of Object.values(home.heroes)) {
  assert.equal(h.hp, h.maxHp); assert.equal(h.ki, h.maxKi); assert.equal(h.stamina, h.maxStamina);
}
assert.deepEqual(home.areas, ['wayside']);
assert.ok(home.events.some(e => e.type === 'checkpoint' && e.id === 'home'));
restAtHome(home); assert.deepEqual(home.areas, ['wayside']);

// Browser storage is replaceable, guarded, and preserves the HOME retry snapshot.
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
const entries = new Map();
const storage = { getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value) };
Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
try {
  assert.equal(readSave(), null);
  home.active = 'matt'; home.candy = 19;
  const firstSave = writeSave(home, null, true);
  assert.ok(firstSave); assert.equal(firstSave.home.candy, 19);
  home.candy = 87; home.heroes.joe.level = 2; home.heroes.joe.xp = 7; home.heroes.joe.maxHp = 120;
  home.heroes.joe.hp = 0; home.heroes.matt.hp = 22; home.areas.push('blast');
  home.clearedRooms.push('blast-1'); home.bosses.push('blast-boss'); home.deaths = 2;
  firstSave.lastReported = { areas: ['wayside'], bosses: [], rooms: ['blast-1'], level: 2 };
  const nextSave = writeSave(home, firstSave);
  assert.ok(nextSave); assert.equal(nextSave.home.candy, 19, 'ordinary saves retain HOME snapshot');
  const saved = readSave(); assert.ok(saved); assert.deepEqual(saved, nextSave);
  assert.deepEqual(saved.lastReported, firstSave.lastReported);
  assert.deepEqual(saved.unlockedHeroes, ['joe', 'matt']);
  const continued = restoreSave(saved);
  assert.equal(continued.scene, 'hub'); assert.equal(continued.candy, 87);
  assert.equal(continued.heroes.joe.level, 2); assert.equal(continued.active, 'matt');
  const retried = restoreSave(saved, true);
  assert.equal(retried.scene, 'hub'); assert.equal(retried.candy, 19);
  assert.equal(retried.heroes.joe.level, 1, 'retry restores HOME hero stats');
  assert.equal(retried.active, 'matt'); assert.equal(retried.deaths, 2);
  assert.deepEqual(retried.areas, ['wayside', 'blast']);
  assert.deepEqual(retried.clearedRooms, ['blast-1']); assert.deepEqual(retried.bosses, ['blast-boss']);
  for (const h of Object.values(retried.heroes)) { assert.equal(h.hp, h.maxHp); assert.equal(h.ki, h.maxKi); }
  retried.heroes.joe.hp = 5;
  assert.equal(saved.home.heroes.joe.hp, 100, 'restoring copies snapshot hero objects');
  for (const raw of ['{broken', 'null', '[]', '{}', JSON.stringify({ ...saved, version: 999 }), 'x'.repeat(65537)]) {
    entries.set(SAVE_KEY, raw); assert.equal(readSave(), null, 'malformed or unsupported save ignored');
  }
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('storage blocked'); } });
  assert.doesNotThrow(() => readSave()); assert.equal(readSave(), null);
  assert.doesNotThrow(() => writeSave(home, saved)); assert.equal(writeSave(home, saved), null);
} finally {
  if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage);
  else delete globalThis.localStorage;
}
console.log('Wayside Fury simulation: combat, deterministic replay, taxi/hub/shop/HOME and save/retry checks pass.');
