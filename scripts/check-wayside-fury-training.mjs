import assert from 'node:assert/strict';
import { newGame, enterScene, idleInput, step, HERO_IDS } from '../src/pages/WaysideFury/game/sim.ts';
import { makeSave, restoreSave, progressReport } from '../src/pages/WaysideFury/game/save.ts';
import { HUB_WORLD, isBlocked } from '../src/pages/WaysideFury/game/world.ts';
import { startTraining, cancelTraining, tickTraining, trainingMelee, trainingProjectile, TRAINING_BOARD } from '../src/pages/WaysideFury/game/u1/combat/training.ts';
import { signatureDefinition } from '../src/pages/WaysideFury/game/u1/combat/signature.ts';
import { defaultCombatProgress } from '../server/shared/waysideFury/u1Combat.js';

const DT = 1 / 60;
function state(hero = 'you') {
  const s = newGame(); enterScene(s, 'hub');
  s.active = hero; s.party = [hero, hero === 'joe' ? 'matt' : 'joe'];
  s.x = TRAINING_BOARD.x; s.y = TRAINING_BOARD.y;
  return s;
}
function tick(s, dt) { s.time += dt; tickTraining(s, dt); }
function walk(s, point) {
  for (let frames = 0; Math.hypot(point.x - s.x, point.y - s.y) > 1e-6; frames++) {
    assert.ok(frames < 600, 'training route is short');
    const dx = point.x - s.x, dy = point.y - s.y, length = Math.hypot(dx, dy), travel = Math.min(length, 70 * DT);
    s.x += dx / length * travel; s.y += dy / length * travel;
    assert.equal(isBlocked(HUB_WORLD, s.x, s.y, 7), false, 'each course substep clears collision');
    tick(s, DT);
    assert.ok(s.training || s.u1.combat.training[s.active] >= 1, 'route completes before its time limit');
  }
}
function finishFootwork(s) {
  assert.equal(startTraining(s), true);
  const rings = [...s.training.rings];
  for (const ring of rings) walk(s, ring);
  assert.equal(s.training, null);
  assert.equal(s.u1.combat.training[s.active], 1);
}
function finishTargets(s) {
  s.x = TRAINING_BOARD.x; s.y = TRAINING_BOARD.y;
  assert.equal(startTraining(s), true);
  const targets = [...s.training.targets];
  for (const target of targets) {
    s.x = target.x; s.y = target.y + 24; tick(s, .3);
    assert.equal(trainingMelee(s, 28, 0, -1), true);
  }
  assert.equal(s.training, null); assert.equal(s.u1.combat.training[s.active], 2);
}
function finishCombo(s) {
  s.x = TRAINING_BOARD.x; s.y = TRAINING_BOARD.y;
  assert.equal(startTraining(s), true);
  s.x = 352; s.y = 448;
  for (let hit = 0; hit < 9; hit++) { tick(s, .3); assert.equal(trainingMelee(s, 28, 0, -1), true); }
  assert.equal(s.training, null); assert.equal(s.u1.combat.training[s.active], 3);
}
function shot(x, y, beam = false, hero = 'you') {
  return { id: 50, x, y, vx: 245, vy: 0, radius: 4, damage: 20, ttl: 2, owner: 'hero', hero, beam, hits: [] };
}

{
  const s = state(); assert.deepEqual(s.u1.combat, defaultCombatProgress());
  s.x += 100; assert.equal(startTraining(s), false);
  s.x = TRAINING_BOARD.x; s.scene = 'dungeon'; assert.equal(startTraining(s), false);
  s.scene = 'hub'; s.heroes.you.hp = 0; assert.equal(startTraining(s), false);
  s.heroes.you.hp = s.heroes.you.maxHp;
  assert.equal(startTraining(s), true); assert.equal(startTraining(s), false);
  const t = s.training, second = t.rings[1]; s.x = second.x; s.y = second.y; tick(s, DT);
  assert.equal(t.ringIndex, 0, 'rings must be taken in order');
  cancelTraining(s); assert.equal(s.training, null); assert.equal(s.u1.combat.training.you, 0);
}
for (const hero of HERO_IDS) {
  const s = state(hero), baseline = { candy: s.candy, kills: s.kills, character: structuredClone(s.character),
    rooms: [...s.clearedRooms], areas: [...s.areas], bosses: [...s.bosses], score: progressReport(s).score };
  const enemies = s.enemies;
  finishFootwork(s); finishTargets(s); finishCombo(s);
  assert.deepEqual(s.u1.combat.training, Object.fromEntries(HERO_IDS.map(id => [id, id === hero ? 3 : 0])), 'tiers are per hero');
  assert.equal(s.scene, 'hub'); assert.equal(s.enemies, enemies, 'training does not replace shared encounter state');
  assert.deepEqual({ candy: s.candy, kills: s.kills, character: s.character, rooms: s.clearedRooms, areas: s.areas,
    bosses: s.bosses, score: progressReport(s).score }, baseline, 'training creates no candy, XP, milestones, or ticket delta');
  assert.equal(s.events.filter(e => e.type === 'training-complete').length, 3);
  assert.ok(s.events.every(e => e.type !== 'checkpoint' && e.type !== 'kill'));
  s.x = TRAINING_BOARD.x; s.y = TRAINING_BOARD.y;
  assert.equal(startTraining(s), false, 'mastered hero has no fourth tier');
}
{
  const s = state(); startTraining(s); tick(s, 10);
  assert.equal(s.training, null); assert.equal(s.u1.combat.training.you, 0);
  assert.equal(s.events.at(-1).reason, 'time');
  startTraining(s); s.active = 'joe'; tick(s, DT); assert.equal(s.events.at(-1).reason, 'hero-changed');
  s.active = 'you'; startTraining(s); s.x = 480; tick(s, DT); assert.equal(s.events.at(-1).reason, 'left-yard');
}
{
  const s = state(); s.u1.combat.training.you = 1; startTraining(s);
  const ordinary = shot(392, 392);
  assert.equal(trainingProjectile(s, ordinary, 320, 392), true);
  assert.equal(ordinary.ttl, 0); assert.equal(s.training.targets.filter(t => t.broken).length, 1, 'a bolt breaks only its first target');
  const beam = shot(392, 464, true);
  assert.equal(trainingProjectile(s, beam, 296, 464), true);
  assert.equal(s.training.targets.filter(t => t.broken).length, 3, 'a beam follows its actual segment');
  assert.equal(trainingProjectile(s, shot(392, 392, true, 'joe'), 320, 392), false, 'other heroes cannot train this player');
  assert.equal(trainingProjectile(s, beam, 296, 464), false, 'a beam cannot count a target twice');
}
{
  const s = state(); s.u1.combat.training.you = 1; startTraining(s);
  s.training.targets = [{ id: -1001, x: 200, y: 424, radius: 9, broken: false, hitFlash: 0 }];
  assert.equal(trainingProjectile(s, shot(176, 424, true), 264, 424), false, 'training shots cannot pass through water collision');
  s.training.targets[0].x = 432; s.training.targets[0].y = 430; s.x = 412; s.y = 430;
  assert.equal(trainingMelee(s, 28, 1, 0), false, 'training melee cannot pass through a sign footprint');
}
{
  const s = state(); s.u1.combat.training.you = 2; startTraining(s); s.x = 352; s.y = 448;
  assert.equal(trainingProjectile(s, shot(352, 424), 352, 460), false, 'combo challenge requires melee');
  assert.equal(trainingMelee(s, 28, 0, -1), true); assert.equal(s.training.hits, 1);
  assert.equal(trainingMelee(s, 28, 0, -1), false); assert.equal(s.training.hits, 1, 'duplicate swings do not advance the chain');
  tick(s, .8); assert.equal(s.training.hits, 0, 'late input resets consecutive progress');
  trainingMelee(s, 28, 0, -1); tick(s, .3);
  assert.equal(trainingMelee(s, 28, 0, 1), false); assert.equal(s.training.hits, 0, 'missing resets the chain');
  for (let i = 0; i < 9; i++) { tick(s, .3); trainingMelee(s, 28, 0, -1); }
  assert.equal(s.u1.combat.training.you, 3);
}
{
  const s = state('alex'); s.coop = { role: 'guest', seat: 2, remoteHeroes: [], appliedHits: [] };
  finishFootwork(s); finishTargets(s); finishCombo(s);
  assert.equal(s.u1.combat.training.alex, 3, 'guests train locally without host encounter mutations');
  assert.equal(s.enemies.length, 0);
}
for (const hero of HERO_IDS) {
  const s = state(hero), definitions = [];
  for (let tier = 0; tier <= 3; tier++) { s.u1.combat.training[hero] = tier; definitions.push(signatureDefinition(s, hero)); }
  const [base, footwork, precision, mastery] = definitions;
  assert.ok(footwork.speed > base.speed, 'footwork changes actual flight speed');
  assert.ok(precision.angles.length > footwork.angles.length, 'precision unlocks a wider volley');
  assert.ok(mastery.ttl > precision.ttl && mastery.kiRefund > 0 && mastery.staminaRestore > 0, 'mastery extends piercing travel and recovers energy');
  assert.ok(mastery.damage * mastery.angles.length > base.damage * base.angles.length);
  const returned = signatureDefinition(s, hero); returned.angles.push(9);
  assert.equal(signatureDefinition(s, hero).angles.includes(9), false, 'definitions are independent values');
}
{
  const s = state(); s.u1.combat.training.you = 3; enterScene(s, 'test'); s.enemies = [];
  s.heroes.you.ki = s.heroes.you.maxKi; s.heroes.you.stamina = 20;
  step(s, { ...idleInput(), ki: true }, DT); step(s, idleInput(), DT);
  assert.equal(s.projectiles.length, 3, 'the game actually uses the trained signature volley');
  assert.ok(s.projectiles.every(p => Math.abs(Math.hypot(p.vx, p.vy) - 285) < 1e-6 && p.ttl > .9));
  assert.equal(s.heroes.you.ki, s.heroes.you.maxKi * .15);
  assert.ok(s.heroes.you.stamina >= 40);
  const saved = makeSave(s, null, true); assert.ok(saved);
  const restored = restoreSave(saved), retry = restoreSave(saved, true);
  assert.equal(restored.u1.combat.training.you, 3); assert.equal(retry.u1.combat.training.you, 3);
  assert.equal(restored.training, null);
}
{
  const s = state(); startTraining(s); const before = s.training.elapsed;
  step(s, { ...idleInput(), x: 1, y: 1 }, DT);
  assert.ok(s.training.elapsed > before, 'simulation advances the local challenge clock');
  s.u1.combat.training.you = 2; cancelTraining(s); s.x = TRAINING_BOARD.x; s.y = TRAINING_BOARD.y; startTraining(s);
  s.x = 352; s.y = 448; s.faceX = 0; s.faceY = -1;
  step(s, { ...idleInput(), attack: true }, DT);
  assert.equal(s.training.hits, 1, 'real attacks use the training hit hook');
}

// Every usable approach to the board must survive the first challenge tick.
for (let n = 0; n < 16; n++) {
  const s = newGame(); enterScene(s, 'hub');
  const angle = n * Math.PI / 8; s.x = TRAINING_BOARD.x + Math.cos(angle) * 27; s.y = TRAINING_BOARD.y + Math.sin(angle) * 27;
  assert.equal(startTraining(s), true); tickTraining(s, DT);
  assert.ok(s.training, 'starting from the road-facing board approach must not fail immediately');
}

// Completing, stopping, and failing practice retire local Ki shots before
// the hub returns to noncombat simulation; shared enemy shots remain intact.
for (const terminal of ['complete', 'cancel', 'timeout', 'hero-changed']) {
  const s = state(); s.u1.combat.training.you = terminal === 'complete' ? 1 : 0;
  assert.equal(startTraining(s), true);
  if (terminal === 'complete') {
    s.training.targets = [{ id: -1001, x: 328, y: 392, radius: 9, broken: false, hitFlash: 0 }];
    s.x = 328; s.y = 416; s.faceX = 0; s.faceY = -1;
  }
  s.heroes.you.ki = s.heroes.you.maxKi;
  step(s, { ...idleInput(), ki: true }, DT); step(s, idleInput(), DT);
  if (terminal === 'complete') assert.equal(s.u1.combat.training.you, 2);
  else {
    assert.ok(s.projectiles.some(p => p.owner === 'hero'), 'real practice Ki creates local shots');
    const shared = { ...shot(500, 500), id: 700, owner: 'enemy' };
    s.projectiles.push(shared);
    if (terminal === 'cancel') cancelTraining(s);
    else { if (terminal === 'hero-changed') s.active = 'joe'; tick(s, terminal === 'timeout' ? 10 : DT); }
    assert.ok(s.projectiles.includes(shared), 'cleanup preserves host-owned enemy shots');
  }
  assert.equal(s.training, null);
  assert.ok(s.projectiles.every(p => p.owner !== 'hero'), 'no practice shot freezes after training ends');
}

// A release on the exact terminal tick cannot create a fresh frozen shot.
for (const terminal of ['timeout', 'footwork', 'melee']) {
  const s = state(); s.u1.combat.training.you = terminal === 'melee' ? 2 : 0;
  startTraining(s); s.heroes.you.ki = s.heroes.you.maxKi;
  step(s, { ...idleInput(), ki: true }, DT);
  if (terminal === 'timeout') s.training.elapsed = s.training.timeLimit;
  else if (terminal === 'footwork') {
    s.training.ringIndex = s.training.rings.length - 1;
    const last = s.training.rings.at(-1);
    s.x = last.x; s.y = last.y; s.training.previousX = s.x; s.training.previousY = s.y;
  } else {
    s.x = 352; s.y = 448; s.faceX = 0; s.faceY = -1;
    s.training.elapsed = 1; s.training.hits = 8; s.training.lastHitAt = .7;
  }
  step(s, { ...idleInput(), attack: terminal === 'melee' }, DT);
  assert.equal(s.training, null);
  assert.equal(s.projectiles.length, 0, 'terminal tick suppresses a newly released practice signature');
  assert.equal(s.charge, 0);
}

console.log('Wayside Fury training: per-hero challenges, honest target hits, signature behavior, co-op isolation, and save migration passed.');
