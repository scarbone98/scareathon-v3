// Exercise the pure simulation headlessly, as the Horde Rush balance script does.
// Run with Node 24+: node scripts/check-wayside-fury.mjs
import assert from 'node:assert/strict';
import { newGame, step, idleInput, addEnemy, activeHero, xpForLevel, enterScene } from '../src/pages/WaysideFury/game/sim.ts';

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
console.log('Wayside Fury simulation: combat, Ki signatures, guard/dash, tagging, growth, death and determinism pass.');
