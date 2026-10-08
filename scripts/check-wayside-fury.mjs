// Exercise the pure simulation headlessly, as the Horde Rush balance script does.
// Run with Node 24+: node scripts/check-wayside-fury.mjs
import assert from 'node:assert/strict';
import { findWalkRoute, findInteractionApproach } from './check-wayside-fury-collision.mjs';
import { newGame, step, idleInput, addEnemy, activeHero, xpForLevel, enterScene, interact, interactTarget, buyItem, restAtHome, advanceStory, skipPrologue, beginRealmShift, toggleParty, HERO_IDS, createHero, nextPartyHero, requestSwap } from '../src/pages/WaysideFury/game/sim.ts';

import { LOCATIONS, HUB_POINTS, SHOP_ITEMS, PROLOGUE } from '../src/pages/WaysideFury/game/content.ts';
import { getWorld, BLAST_WORLDS, OVERWORLD, HUB_WORLD, REALM_WORLD, WATCHER_ROOM, GATEKEEPER_ROOM, cameraTarget, tileAt } from '../src/pages/WaysideFury/game/world.ts';
import { captureMotion, interpolateMotion } from '../src/pages/WaysideFury/game/motion.ts';
import { getRenderViewport } from '../src/pages/WaysideFury/game/viewport.ts';
import { SAVE_KEY, readSave, writeSave, restoreSave, progressReport, mergeReceipts } from '../src/pages/WaysideFury/game/save.ts';
import { HERO_OBSTACLES, isObstacleCleared } from '../src/pages/WaysideFury/game/u1/world/obstacles.ts';

const DT = 1 / 60;
const tick = (s, buttons = {}, frames = 1) => {
  for (let i = 0; i < frames; i++) step(s, { ...idleInput(), ...buttons }, DT);
};
const emptyRoom = () => { const s = newGame(100); s.enemies = []; return s; };
const bulletAtHero = (s, damage = 20) => s.projectiles.push({ id: s.nextId++, x: s.x, y: s.y, vx: 0, vy: 0,
  radius: 4, damage, ttl: 1, owner: 'enemy', beam: false, hits: [] });

// 120 Hz presentation frames interpolate the fixed-step simulation without
// mutating saves, resurrecting deleted actors, or blending across a scene change.
const motionState = emptyRoom();
const movingEnemy = addEnemy(motionState, 'grunt', 100, 80);
const removedEnemy = addEnemy(motionState, 'grunt', 120, 80);
bulletAtHero(motionState);
const oldHero = { x: motionState.x, y: motionState.y, time: motionState.time };
const oldProjectile = { ...motionState.projectiles[0] };
const motionBefore = captureMotion(motionState);
motionState.x += 10; motionState.y += 5; motionState.time += 1;
movingEnemy.x += 8; movingEnemy.y += 4;
motionState.enemies = motionState.enemies.filter(enemy => enemy.id !== removedEnemy.id);
const bornEnemy = addEnemy(motionState, 'grunt', 150, 100);
motionState.projectiles[0].x += 12;
bulletAtHero(motionState);
const simulationBeforeRender = structuredClone(motionState);
const halfwayMotion = interpolateMotion(motionBefore, motionState, 0.5);
assert.equal(halfwayMotion.x, oldHero.x + 5); assert.equal(halfwayMotion.y, oldHero.y + 2.5);
assert.equal(halfwayMotion.time, oldHero.time + 0.5);
assert.equal(halfwayMotion.enemies.find(enemy => enemy.id === movingEnemy.id).x, 104);
assert.equal(halfwayMotion.enemies.find(enemy => enemy.id === movingEnemy.id).y, 82);
assert.equal(halfwayMotion.enemies.some(enemy => enemy.id === removedEnemy.id), false);
assert.deepEqual(halfwayMotion.enemies.find(enemy => enemy.id === bornEnemy.id), bornEnemy);
assert.equal(halfwayMotion.projectiles[0].x, oldProjectile.x + 6);
assert.deepEqual(halfwayMotion.projectiles[1], motionState.projectiles[1]);
assert.deepEqual(motionState, simulationBeforeRender, 'interpolation leaves authoritative simulation state unchanged');
assert.equal(motionBefore.enemies.get(movingEnemy.id).x, 100, 'snapshot owns its positions');
assert.equal(interpolateMotion(motionBefore, motionState, -1).x, oldHero.x);
assert.equal(interpolateMotion(motionBefore, motionState, 2).x, motionState.x);
assert.equal(interpolateMotion(null, motionState, 0.5), motionState);
for (const change of [{ scene: 'hub' }, { room: motionState.room + 1 }, { active: 'matt' }]) {
  const changed = { ...motionState, ...change };
  assert.equal(interpolateMotion(motionBefore, changed, 0.5), changed, 'scene, room and hero transitions render the new state directly');
}

// Reachability through precise prop footprints is checked by the collision script.
assert.equal(BLAST_WORLDS.length, 10); assert.ok(HUB_WORLD.width >= 960 && HUB_WORLD.height >= 540);
for (const m of [OVERWORLD, HUB_WORLD, ...BLAST_WORLDS, REALM_WORLD]) {
  assert.deepEqual(cameraTarget(m, -100, -100, 320, 180), { x: 0, y: 0 });
  assert.deepEqual(cameraTarget(m, m.width + 100, m.height + 100, 320, 180), { x: m.width - 320, y: m.height - 180 });
}
// Native backing size follows CSS and DPR; world units follow the integer
// device-pixel zoom, so portrait and wide displays reveal different world areas.
for (const [cssWidth, cssHeight] of [[390, 700], [430, 780], [844, 390], [932, 430], [1280, 800]]) {
  for (const dpr of [1, 1.25, 2, 3, 4]) {
    const viewport = getRenderViewport(cssWidth, cssHeight, dpr);
    const effectiveDpr = Math.min(dpr, 3);
    assert.ok(Math.abs(viewport.pixelWidth - cssWidth * effectiveDpr) <= 1, 'native canvas width');
    assert.ok(Math.abs(viewport.pixelHeight - cssHeight * effectiveDpr) <= 1, 'native canvas height');
    assert.equal(viewport.pixelScale, Math.round(viewport.pixelScale), 'world zoom uses integer device pixels');
    assert.ok(viewport.pixelScale > 0 && viewport.zoom > 0);
    assert.ok(Math.abs(viewport.zoom * effectiveDpr - viewport.pixelScale) < 1e-8);
    assert.ok(Math.abs(viewport.width * viewport.zoom - cssWidth) <= 1, 'logical width follows CSS box');
    assert.ok(Math.abs(viewport.height * viewport.zoom - cssHeight) <= 1, 'logical height follows CSS box');
    assert.ok(viewport.width <= 640 && viewport.height <= 400, 'view stays inside the sensible world range');
  }
}
const nativePhone = getRenderViewport(390, 700, 3);
assert.ok(nativePhone.zoom * 16 >= 40 && nativePhone.zoom * 16 <= 56, 'phone tiles are 40–56 CSS pixels');
const lowerQuality = getRenderViewport(390, 700, 3, 2);
assert.equal(lowerQuality.dpr, 2, 'quality fallback changes the backing DPR cap');
assert.equal(lowerQuality.pixelWidth, 780);
assert.equal(lowerQuality.pixelHeight, 1400);
for (const map of [HUB_WORLD, BLAST_WORLDS[WATCHER_ROOM], REALM_WORLD]) {
  for (const [width, height] of [[240, 400], [480, 180], [640, 400], [map.width + 80, map.height + 64]]) {
    const left = Math.min(0, (map.width - width) / 2), top = Math.min(0, (map.height - height) / 2);
    const right = Math.max(left, map.width - width), bottom = Math.max(top, map.height - height);
    assert.deepEqual(cameraTarget(map, -1000, -1000, width, height), { x: left, y: top }, `${map.id}: near bounds and small-room centering`);
    assert.deepEqual(cameraTarget(map, map.width + 1000, map.height + 1000, width, height), { x: right, y: bottom }, `${map.id}: far bounds and small-room centering`);
    const fractional = cameraTarget(map, 397.25, 275.75, width, height);
    assert.ok(fractional.x >= left && fractional.x <= right && fractional.y >= top && fractional.y <= bottom);
  }
}

const collision = newGame(); enterScene(collision, 'hub'); collision.x = 480; collision.y = 200;
tick(collision, { y: -1, dash: true }, 180);
assert.ok(collision.y >= 183, 'the station footprint is a natural solid boundary');
const boundary = newGame(); enterScene(boundary, 'dungeon'); boundary.x = 100; boundary.y = 48;
tick(boundary, { y: -1, dash: true }, 180);
assert.ok(boundary.y >= 39, 'dash cannot tunnel through the cliff/tree boundary');
const mini = newGame(); enterScene(mini, 'dungeon', GATEKEEPER_ROOM);
assert.ok(mini.enemies[0].miniBoss); assert.ok(mini.enemies[0].maxHp < 260);

assert.equal(tileAt(OVERWORLD, -1, 1), 'void', 'autotile neighbors outside the map do not wrap');
assert.equal(tileAt(OVERWORLD, OVERWORLD.cols, 0), 'void');
const smoothTaxi = newGame(); enterScene(smoothTaxi, 'overworld'); smoothTaxi.x = 416;
const taxiOrigin = smoothTaxi.x; tick(smoothTaxi, { x: 1 });
assert.ok(smoothTaxi.vx > 0 && smoothTaxi.vx < 30, 'taxi accelerates smoothly');
assert.ok(smoothTaxi.x - taxiOrigin < 1);
tick(smoothTaxi, { x: 1 }, 60);
const cruise = smoothTaxi.vx, beforeCoast = smoothTaxi.x; tick(smoothTaxi);
assert.ok(smoothTaxi.x > beforeCoast && smoothTaxi.vx < cruise && smoothTaxi.vx > 0, 'taxi coasts and slows when released');
const edgeTravel = newGame(); enterScene(edgeTravel, 'dungeon'); edgeTravel.enemies = [];
edgeTravel.x = getWorld('dungeon').width - 64; tick(edgeTravel, { x: 1 }, 60);
assert.equal(edgeTravel.scene, 'dungeon'); assert.equal(edgeTravel.room, 1, 'open zone boundaries transition by walking');
assert.ok(edgeTravel.x > 56 && edgeTravel.x < 120, 'arrival starts safely inside the neighboring map');

// You is the default lead, and every crew partner can tag in with an
// independent health pool, shared progression and a distinct signature.
assert.equal(newGame().active, 'you'); assert.deepEqual(newGame().unlockedHeroes, HERO_IDS);
assert.deepEqual(newGame().character, { level: 1, xp: 0 });
for (const [id, beams, notice] of [['you', 1, 'YOU: Fury Wave!'], ['joe', 1, 'JOE: Wayside Wave!'],
  ['matt', 3, 'MATT: Golden Fury!'], ['alex', 2, 'ALEX: Twin Comet!'], ['jon', 1, 'JON: Night Breaker!']]) {
  const partner = emptyRoom(); enterScene(partner, 'hub'); partner.overlay = 'home';
  if (id !== 'you') {
    assert.equal(toggleParty(partner, 'joe'), true);
    assert.equal(toggleParty(partner, id), true);
    partner.overlay = null; assert.equal(nextPartyHero(partner), id);
    assert.equal(requestSwap(partner), true); assert.equal(partner.active, id);
    assert.equal(requestSwap(partner), false, 'HUD swap obeys its cooldown');
  }
  enterScene(partner, 'test'); partner.enemies = []; activeHero(partner).ki = activeHero(partner).maxKi;
  tick(partner, { ki: true }); tick(partner);
  assert.equal(partner.projectiles.filter(p => p.beam).length, beams); assert.equal(partner.notice, notice);
  if (id !== 'you') {
    tick(partner, {}, 60); partner.heroes[id].hp = 1; partner.heroes[id].invulnerable = 0; partner.hitStop = 0;
    bulletAtHero(partner, 99); tick(partner);
    assert.equal(partner.active, 'you', 'a downed partner hands control back to You');
    assert.equal(partner.heroes[id].hp, 0);
  }
}
const soloYou = emptyRoom(); soloYou.party = ['you']; soloYou.heroes.you.hp = 1;
bulletAtHero(soloYou, 99); tick(soloYou); assert.equal(soloYou.scene, 'dead');
assert.ok(soloYou.heroes.joe.hp > 0, 'healthy benched crew cannot rescue a solo wipe');
const derived = createHero('you', { level: 4, xp: 25 }, { power: 4, ward: 2 });
assert.equal(derived.power, 25); assert.equal(derived.defense, 8); assert.equal(derived.maxHp, 160);

// Story advances one beat per press, skips directly to the taxi, and resets timers.
const intro = newGame(); enterScene(intro, 'prologue');
assert.equal(intro.cutscene, 0); assert.equal(intro.sceneTimer, 0);
for (let beat = 0; beat < PROLOGUE.length; beat++) {
  assert.equal(intro.cutscene, beat);
  tick(intro, { interact: true });
  if (beat < PROLOGUE.length - 1) {
    assert.equal(intro.scene, 'prologue'); assert.equal(intro.cutscene, beat + 1);
    assert.equal(intro.sceneTimer, 0);
    tick(intro, { interact: true }, 8);
    assert.equal(intro.cutscene, beat + 1, 'held Interact cannot skip multiple story beats');
    tick(intro);
  }
}
assert.equal(intro.scene, 'overworld');
tick(intro, { interact: true }, 8);
assert.equal(intro.scene, 'overworld', 'held Interact cannot leave the taxi after the last story beat');
const skipped = newGame(); enterScene(skipped, 'prologue'); tick(skipped, {}, 20);
advanceStory(skipped); assert.equal(skipped.cutscene, 1); assert.equal(skipped.sceneTimer, 0);
skipPrologue(skipped); assert.equal(skipped.scene, 'overworld'); assert.equal(skipped.palette, 'real');
// Realm transitions accept any target scene and palette so future chapters can return.
const reusableShift = newGame(); beginRealmShift(reusableShift, 'hub', 'eightbit');
assert.equal(reusableShift.scene, 'shift'); assert.equal(reusableShift.transitionTarget, 'hub');
assert.equal(reusableShift.palette, 'real'); tick(reusableShift, { attack: true, interact: true }, 143);
assert.equal(reusableShift.scene, 'shift');
tick(reusableShift, { interact: true }, 2);
assert.equal(reusableShift.scene, 'hub'); assert.equal(reusableShift.palette, 'eightbit');
beginRealmShift(reusableShift, 'overworld', 'real');
assert.equal(reusableShift.palette, 'eightbit'); tick(reusableShift, {}, 145);
assert.equal(reusableShift.scene, 'overworld'); assert.equal(reusableShift.palette, 'real');

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
assert.equal(ki.notice, 'YOU: Fury Wave!');
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
const tag = emptyRoom(); tag.party = ['joe', 'matt']; tag.active = 'joe'; tag.heroes.joe.hp = 37; tag.heroes.matt.hp = 81;
tick(tag, { swap: true }); assert.equal(tag.active, 'matt');
assert.equal(activeHero(tag).hp, 81);
tick(tag); tick(tag, { swap: true }); assert.equal(tag.active, 'matt');
tick(tag, {}, 60); tick(tag, { swap: true }); assert.equal(tag.active, 'joe');
assert.equal(activeHero(tag).hp, 37);

// HOME party selection keeps at least one hero, changes the active hero when
// benched, and prevents a healthy benched hero from rescuing a solo party wipe.
const party = emptyRoom(); party.party = ['joe', 'matt']; party.active = 'joe';
assert.deepEqual(party.party, ['joe', 'matt']);
assert.equal(toggleParty(party, 'joe'), false, 'party selection is available at HOME');
enterScene(party, 'hub'); party.overlay = 'home';
assert.equal(toggleParty(party, 'joe'), true); assert.deepEqual(party.party, ['matt']);
assert.equal(party.active, 'matt'); assert.equal(toggleParty(party, 'matt'), false);
assert.deepEqual(party.party, ['matt']);
enterScene(party, 'test'); party.enemies = []; tick(party, {}, 60);
tick(party, { swap: true }); assert.equal(party.active, 'matt', 'Swap cannot select a benched hero');
party.heroes.matt.hp = 1; party.heroes.matt.invulnerable = 0;
bulletAtHero(party, 99); tick(party);
assert.equal(party.scene, 'dead'); assert.equal(party.deaths, 1);
assert.equal(party.heroes.joe.hp, 100, 'healthy bench HP cannot avoid party death');
enterScene(party, 'hub'); party.overlay = 'home';
assert.equal(toggleParty(party, 'joe'), true); assert.deepEqual(party.party, ['matt', 'joe']);
assert.equal(toggleParty(party, 'joe'), true); assert.deepEqual(party.party, ['matt']);
restAtHome(party); assert.equal(party.heroes.matt.hp, party.heroes.matt.maxHp);
assert.equal(toggleParty(party, 'joe'), true); assert.equal(toggleParty(party, 'matt'), true);
assert.deepEqual(party.party, ['joe']); assert.equal(party.active, 'joe');
party.heroes.matt.hp = 0;
assert.equal(toggleParty(party, 'matt'), true);
assert.equal(toggleParty(party, 'joe'), false, 'a KO partner must rest before taking over');
restAtHome(party); assert.equal(toggleParty(party, 'joe'), true); assert.equal(party.active, 'matt');

// Kills award candy and XP, grow every stat, and emit a visible level-up.
const progression = emptyRoom();
for (let i = 0; i < 4; i++) { const e = addEnemy(progression, 'grunt', progression.x + 15 + i, progression.y); e.hp = 1; }
tick(progression, { attack: true });
assert.equal(progression.kills, 4);
assert.equal(progression.events.filter(e => e.type === 'kill').length, 4);
assert.ok(progression.events.filter(e => e.type === 'kill').every(e => Number.isFinite(e.x) && Number.isFinite(e.y) && e.sprite === 'zombie' && e.radius === 7),
  'KO rendering has complete enemy snapshots after dead enemies are removed');
assert.ok(progression.candy >= 12);
assert.equal(activeHero(progression).level, 2);
assert.equal(activeHero(progression).xp, 4 * 28 - xpForLevel(1));
assert.ok(activeHero(progression).maxHp > 100 && activeHero(progression).maxKi > 60);
assert.ok(activeHero(progression).power > 12 && activeHero(progression).defense > 3);
assert.ok(progression.effects.some(e => e.kind === 'level'));
assert.equal(progression.events.filter(e => e.type === 'level').length, 1, 'one shared level emits one jingle/event');
assert.deepEqual(progression.character, { level: 2, xp: 4 * 28 - xpForLevel(1) });
for (const h of Object.values(progression.heroes)) { assert.equal(h.level, 2); assert.equal(h.xp, progression.character.xp); }
assert.ok(progression.floaters.some(f => f.text.endsWith('candy')));

// One downed hero tags the survivor in. A party wipe enters game-over once.
const death = emptyRoom(); death.party = ['joe', 'matt']; death.active = 'joe'; death.heroes.joe.hp = 1;
bulletAtHero(death, 99); tick(death);
assert.equal(death.active, 'matt'); assert.equal(death.scene, 'test');
death.heroes.matt.hp = 1; death.heroes.matt.invulnerable = 0; death.hitStop = 0;
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
walker.x = taxi.x = 480; walker.y = taxi.y = 480;
tick(walker, { x: 1 }, 30); tick(taxi, { x: 1, attack: true, ki: true, dash: true, guard: true }, 30);
assert.ok(taxi.x - 480 > (walker.x - 480) * 1.5);
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
for (const point of HUB_POINTS.filter(p => p.id === 'shop' || p.id === 'home')) {
  taxi.overlay = null; taxi.x = point.x; taxi.y = point.y;
  tick(taxi); tick(taxi, { interact: true }); assert.equal(taxi.overlay, point.id);
  const frozenX = taxi.x; tick(taxi, { x: 1, attack: true }, 20); assert.equal(taxi.x, frozenX);
}

// Shop costs are exact, healing caps at max HP, and charms help both heroes.
const shop = emptyRoom(); shop.active = 'joe'; shop.candy = 100; shop.heroes.joe.hp = 20;
const tonic = SHOP_ITEMS.find(item => item.id === 'heal');
assert.equal(buyItem(shop, 'heal'), true);
assert.equal(shop.heroes.joe.hp, 75); assert.equal(shop.candy, 100 - tonic.cost);
assert.equal(buyItem(shop, 'heal'), true); assert.equal(shop.heroes.joe.hp, 100);
const noNeedCandy = shop.candy;
assert.equal(buyItem(shop, 'heal'), false); assert.equal(shop.candy, noNeedCandy);
const stats = Object.fromEntries(Object.entries(shop.heroes).map(([id, h]) => [id, { power: h.power, defense: h.defense }]));
assert.equal(buyItem(shop, 'power'), true); assert.equal(buyItem(shop, 'defense'), true); assert.deepEqual(shop.gear, { power: 2, ward: 1 });
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

// The east gate stays shut during combat; retreat remains available at the entrance.
const retreat = newGame(4); enterScene(retreat, 'dungeon');
retreat.x = getWorld('dungeon').width - 64; retreat.y = getWorld('dungeon').spawn.y;
assert.equal(interactTarget(retreat), null); interact(retreat); assert.equal(retreat.room, 0);
retreat.x = 40; retreat.y = getWorld('dungeon').spawn.y;
assert.equal(interactTarget(retreat).id, 'west'); interact(retreat); assert.equal(retreat.scene, 'overworld');

// Boss rushes freeze their aim after the warning; dark novas fire radially.
const bossRules = newGame(5); enterScene(bossRules, 'dungeon', WATCHER_ROOM);
const watcher = bossRules.enemies[0]; watcher.cooldown = 0; bossRules.x = watcher.x - 100; bossRules.y = watcher.y;
tick(bossRules, { guard: true });
assert.equal(watcher.pattern, 0); assert.ok(watcher.windup > 0.6);
const rushAim = [watcher.aimX, watcher.aimY], startBossX = watcher.x;
bossRules.y = 160;
for (let f = 0; f < 60 && watcher.actionTimer === 0; f++) tick(bossRules, { guard: true });
assert.ok(watcher.actionTimer > 0);
assert.deepEqual([watcher.aimX, watcher.aimY], rushAim, 'rush aim is locked during its warning');
for (let f = 0; f < 60 && watcher.actionTimer > 0; f++) tick(bossRules, { guard: true });
assert.ok(watcher.x < startBossX - 40); assert.equal(watcher.pattern, 1);
watcher.cooldown = 0; bossRules.x = watcher.x - 100; bossRules.y = watcher.y - 70;
tick(bossRules, { guard: true }); assert.ok(watcher.windup > 0.75);
for (let f = 0; f < 65 && watcher.windup > 0; f++) tick(bossRules, { guard: true });
assert.equal(bossRules.projectiles.length, 8); assert.equal(watcher.pattern, 0);
assert.ok(new Set(bossRules.projectiles.map(p => Math.round(p.vx))).size > 3);
watcher.hp = watcher.maxHp / 2;
tick(bossRules, { guard: true });
assert.equal(watcher.phase, 2); assert.ok(watcher.speed > 20);
assert.ok(bossRules.floaters.some(f => f.text === 'ENRAGED!'));
bossRules.projectiles = []; watcher.pattern = 1; watcher.cooldown = 0; watcher.actionTimer = 0; watcher.windup = 0;
tick(bossRules, { guard: true }); assert.ok(watcher.windup <= 0.6);
for (let f = 0; f < 50 && watcher.windup > 0; f++) tick(bossRules, { guard: true });
assert.equal(bossRules.projectiles.length, 12);

// Play the complete dungeon with default stats and only ordinary game inputs.
// This bot charges, aims, attacks, guards, dashes and tags. It gets no healing
// or stats beyond legitimate level-ups, and walks to each room's east gate.
const quest = newGame(7); assert.equal(quest.active, 'you'); assert.deepEqual(quest.party, ['you', 'joe']); enterScene(quest, 'dungeon');
let playFrame = 0; const checkpoints = [], usedControls = new Set(), roomFrames = [];
function playRoom(s) {
  let frames = 0; const scene = s.scene; let route = [], routeEnemy = null;
  while (s.enemies.length && s.scene === scene && frames < 15000) {
    const e = s.enemies.reduce((a, b) => Math.hypot(a.x - s.x, a.y - s.y) < Math.hypot(b.x - s.x, b.y - s.y) ? a : b);
    // Follow walkable waypoints around rims and props, using normal controls.
    if (routeEnemy !== e.id || frames % 30 === 0 || !route.length) {
      route = findWalkRoute(getWorld(s.scene, s.room), s, e, s); routeEnemy = e.id;
    }
    while (route.length > 1 && Math.hypot(route[0].x - s.x, route[0].y - s.y) < 3) route.shift();
    const waypoint = route[0];
    const dx = waypoint.x - s.x, dy = waypoint.y - s.y, length = Math.max(1, Math.hypot(dx, dy)), cycle = playFrame % 240;
    const ki = cycle < 80, attack = !ki && playFrame % 20 === 0, dash = cycle === 110, swap = cycle === 190;
    const input = { ...idleInput(), x: dx / length, y: dy / length, ki, attack, dash, swap, guard: !ki && !attack && !dash };
    for (const key of ['attack', 'ki', 'dash', 'swap', 'guard']) if (input[key]) usedControls.add(key);
    step(s, input, DT);
    checkpoints.push(...s.events.filter(e => e.type === 'checkpoint').map(e => e.id));
    frames++; playFrame++;
  }
  assert.equal(s.scene, scene, 'combat bot survives on default stats');
  assert.equal(s.enemies.length, 0, `combat bot defeats every enemy in ${s.scene}:${s.room}, hero ${s.x.toFixed(1)},${s.y.toFixed(1)}, remaining ${s.enemies.map(e => `${e.kind}@${e.x.toFixed(1)},${e.y.toFixed(1)}`).join(';')}`);
  return frames;
}
function walkTo(s, x, y) {
  const world = getWorld(s.scene, s.room);
  const route = findWalkRoute(world, s, { x, y }, s);
  for (const point of route) {
    for (let f = 0; f < 2500 && Math.hypot(point.x - s.x, point.y - s.y) > 1.5; f++) {
      const dx = point.x - s.x, dy = point.y - s.y, length = Math.hypot(dx, dy);
      // Slow down at corners so taxi momentum cannot carry it into a prop.
      const strength = s.scene === 'overworld' ? Math.max(0.11, Math.min(1, length / 24)) : Math.min(1, length / 4);
      tick(s, { x: dx / length * strength, y: dy / length * strength });
    }
    assert.ok(Math.hypot(point.x - s.x, point.y - s.y) <= 1.5, `${s.scene}:${s.room} stuck at ${s.x.toFixed(1)},${s.y.toFixed(1)} toward ${point.x},${point.y}`);
  }
  assert.ok(Math.hypot(x - s.x, y - s.y) <= 4);
}
const completedZones = [], clearedCheckpoints = [];
function selectQuestHero(state, hero) {
  if (state.active === hero) return;
  if (!state.party.includes(hero)) {
    const partner = state.party.find(id => id !== state.active);
    if (partner) assert.equal(toggleParty(state, partner, true), true);
    assert.equal(toggleParty(state, hero, true), true, 'character sheet can select the required hero');
  }
  tick(state, {}, 120);
  assert.equal(requestSwap(state), true, 'tag control selects the required hero');
  assert.equal(state.active, hero);
}
function restoreQuestParty(state, party, active) {
  for (const id of [...state.party]) if (!party.includes(id)) assert.equal(toggleParty(state, id, true), true);
  for (const id of party) if (!state.party.includes(id)) assert.equal(toggleParty(state, id, true), true);
  selectQuestHero(state, active);
}
function openDoor(s, id) {
  const world = getWorld(s.scene, s.room), door = world.exits.find(e => e.id === id);
  assert.ok(door);
  // Main routes remain wide enough to traverse without clipping natural walls.
  if (id === 'north' || id === 'south') walkTo(s, door.x + door.w / 2, world.spawn.y);
  const x = id === 'west' ? 40 : id === 'east' ? world.width - 64 : door.x + door.w / 2;
  const y = id === 'north' ? 56 : id === 'south' ? world.height - 56 : world.spawn.y;
  walkTo(s, x, y); tick(s);
  assert.equal(interactTarget(s).id, id); tick(s, { interact: true });
}
for (let room = 0; room <= WATCHER_ROOM; room++) {
  assert.equal(quest.room, room); roomFrames.push(playRoom(quest));
  completedZones.push(`blast-${room}`); clearedCheckpoints.push(`blast-${room}`);
  if (room === 1 || room === 3) {
    const side = room === 1 ? 8 : 9;
    openDoor(quest, room === 1 ? 'north' : 'south'); assert.equal(quest.room, side);
    roomFrames.push(playRoom(quest)); completedZones.push(`blast-${side}`); clearedCheckpoints.push(`blast-${side}`);
    const chest = getWorld('dungeon', side).props.find(p => p.kind === 'chest');
    const gate = HERO_OBSTACLES.find(entry => entry.rewardId === chest.id);
    assert.ok(gate);
    const originalParty = [...quest.party], originalActive = quest.active;
    selectQuestHero(quest, gate.hero);
    walkTo(quest, gate.x + gate.w / 2, gate.y + gate.h + 12);
    assert.equal(interactTarget(quest)?.id, gate.id);
    tick(quest); tick(quest, { attack: true });
    assert.equal(isObstacleCleared(quest, gate.id), true, 'required hero opens the supply entrance with context Attack');
    const approach = findInteractionApproach(getWorld('dungeon', side), chest.id, { x: chest.x + chest.w / 2, y: chest.y + chest.h / 2 }, 28, quest);
    walkTo(quest, approach.x, approach.y);
    const beforeLoot = quest.candy;
    assert.equal(interactTarget(quest).id, chest.id); tick(quest); tick(quest, { interact: true });
    assert.equal(quest.candy - beforeLoot, side === 8 ? 18 : 25);
    assert.ok(quest.clearedRooms.includes(chest.id)); completedZones.push(chest.id);
    const afterLoot = quest.candy; tick(quest); tick(quest, { interact: true });
    assert.equal(quest.candy, afterLoot, 'a supply cache pays only once');
    restoreQuestParty(quest, originalParty, originalActive);
    openDoor(quest, room === 1 ? 'south' : 'north'); assert.equal(quest.room, room);
    assert.equal(quest.enemies.length, 0, 'cleared routes stay open when returning from a side trail');
  }
  openDoor(quest, 'east');
  if (room < WATCHER_ROOM) {
    assert.equal(quest.room, room + 1);
    tick(quest, { interact: true }, 6);
    assert.equal(quest.scene, 'dungeon', 'holding Enter across a door cannot immediately retreat');
  }
}
assert.equal(quest.scene, 'shift'); assert.equal(quest.palette, 'real');
assert.deepEqual(quest.clearedRooms, completedZones);
assert.deepEqual(quest.bosses, ['blast-gatekeeper', 'blast-watcher']); assert.deepEqual(quest.areas, ['blast']);
assert.deepEqual(checkpoints, clearedCheckpoints);
const dungeonKills = BLAST_WORLDS.reduce((n, m) => n + m.spawns.length, 0);
assert.equal(quest.kills, dungeonKills); assert.equal(quest.deaths, 0);
assert.deepEqual([...usedControls].sort(), ['attack', 'dash', 'guard', 'ki', 'swap']);
tick(quest, { interact: true }, 143); assert.equal(quest.scene, 'shift');
tick(quest, { interact: true }, 2); assert.equal(quest.scene, 'realm'); assert.equal(quest.palette, 'eightbit');
assert.equal(quest.sceneTimer, 0); assert.equal(quest.enemies.length, 3);
assert.deepEqual(quest.enemies.map(e => e.sprite), ['pumpkin', 'ghost', 'imp']);
assert.equal(interactTarget(quest), null, 'realm has no western retreat');
quest.x = REALM_WORLD.width - 64; quest.y = REALM_WORLD.spawn.y;
assert.equal(interactTarget(quest), null, 'realm east gate is closed during combat');
quest.x = REALM_WORLD.spawn.x; quest.y = REALM_WORLD.spawn.y;
const realmFrames = playRoom(quest);
assert.equal(quest.chapter, 2); assert.equal(quest.kills, dungeonKills + 3); assert.equal(quest.deaths, 0);
completedZones.push('realm-0'); clearedCheckpoints.push('realm-0');
assert.deepEqual(quest.clearedRooms, completedZones);
assert.deepEqual(quest.areas, ['blast', 'eightbit-realm']);
assert.deepEqual(checkpoints, clearedCheckpoints);
openDoor(quest, 'east'); assert.equal(quest.scene, 'results'); assert.equal(quest.sceneTimer, 0);
tick(quest, { attack: true, ki: true, interact: true }, 135);
assert.equal(quest.scene, 'results'); assert.ok(quest.sceneTimer > 2.2);
console.log(`Default-stat 10-zone chapter: dungeon ${roomFrames.map(n => (n / 60).toFixed(1)).join('/')}s, realm ${(realmFrames / 60).toFixed(1)}s; ${quest.kills} kills, level ${activeHero(quest).level}, ${quest.candy} candy, no deaths.`);
// Revisiting completed maps keeps their routes open, without replenishing caches
// or paying receipted milestones again, including after a HOME retry.
const beforeReplay = progressReport(quest);
enterScene(quest, 'overworld');
// Taxi follows the authored road around the creek rather than cutting across water.
walkTo(quest, LOCATIONS[1].x, OVERWORLD.spawn.y);
const blastApproach = findInteractionApproach(OVERWORLD, LOCATIONS[1].id, LOCATIONS[1]);
walkTo(quest, blastApproach.x, blastApproach.y); tick(quest); tick(quest, { interact: true });
assert.equal(quest.scene, 'dungeon'); assert.equal(quest.room, 0); assert.equal(quest.enemies.length, 0);
assert.equal(progressReport(quest, beforeReplay.receipt).score, 0);
const repeatedClearCount = checkpoints.length; tick(quest, {}, 60);
assert.equal(checkpoints.length, repeatedClearCount, 'an empty room cannot produce another clear');
assert.deepEqual(quest.clearedRooms, completedZones);
const exitAfterClear = structuredClone(quest); exitAfterClear.x = 40;
assert.equal(interactTarget(exitAfterClear).id, 'west');
interact(exitAfterClear); assert.equal(exitAfterClear.scene, 'overworld');
const replayRealm = structuredClone(quest); replayRealm.chapter = 1; enterScene(replayRealm, 'realm');
assert.equal(replayRealm.enemies.length, 0);
assert.equal(replayRealm.chapter, 2, 'a completed realm restores chapter advancement after a HOME retry');
assert.equal(progressReport(replayRealm, beforeReplay.receipt).score, 0, 'revisiting cannot farm old room/area rewards');
assert.deepEqual(replayRealm.clearedRooms, completedZones);

// Tickets use only newly gained progress, with a persistent level high-water mark.
const progress = newGame();
const zero = progressReport(progress);
assert.equal(zero.score, 0); assert.deepEqual(zero.receipt, { areas: [], bosses: [], rooms: [], level: 1 });
progress.areas = ['wayside']; assert.equal(progressReport(progress).score, 1000);
progress.areas = []; progress.bosses = ['blast-watcher']; assert.equal(progressReport(progress).score, 1000);
progress.bosses = []; progress.character.level = 3;
assert.equal(progressReport(progress).score, 200, 'shared party levels pay once');
progress.character.level = 4; assert.equal(progressReport(progress).score, 300);
progress.character.level = 1;
progress.clearedRooms = ['blast-0', 'blast-1']; assert.equal(progressReport(progress).score, 100);
progress.areas = ['wayside', 'blast', 'blast']; progress.bosses = ['blast-watcher', 'blast-watcher'];
progress.clearedRooms = ['blast-0', 'blast-1', 'blast-1'];
progress.character.level = 3;
const earned = progressReport(progress); assert.equal(earned.score, 3300);
assert.equal(progressReport(progress, earned.receipt).score, 0, 'repeated checkpoints send nothing');
progress.areas = []; progress.bosses = []; progress.clearedRooms = [];
progress.character.level = 1;
const rolledBack = progressReport(progress, earned.receipt);
assert.equal(rolledBack.score, 0); assert.deepEqual(rolledBack.receipt, earned.receipt);
progress.character.level = 3; assert.equal(progressReport(progress, rolledBack.receipt).score, 0);
progress.character.level = 4; assert.equal(progressReport(progress, rolledBack.receipt).score, 100);
assert.deepEqual(mergeReceipts({ areas: ['wayside'], bosses: [], rooms: ['blast-0'], level: 4 },
  null, { areas: ['blast', 'wayside'], bosses: ['blast-watcher'], rooms: ['blast-1'], level: 2 }),
  { areas: ['wayside', 'blast'], bosses: ['blast-watcher'], rooms: ['blast-0', 'blast-1'], level: 4 });

// Browser storage is replaceable, guarded, and preserves the HOME retry snapshot.
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
const entries = new Map();
const storage = { getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value) };
Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
try {
  assert.equal(readSave(), null);
  home.party = ['joe', 'matt']; home.active = 'matt'; home.candy = 19;
  const firstSave = writeSave(home, null, true);
  assert.ok(firstSave); assert.equal(firstSave.home.candy, 19);
  home.candy = 87; home.character = { level: 2, xp: 7 }; home.heroes.joe.level = 2; home.heroes.joe.xp = 7; home.heroes.joe.maxHp = 120;
  home.heroes.joe.hp = 0; home.heroes.matt.hp = 22; home.areas.push('blast');
  home.clearedRooms.push('blast-1'); home.bosses.push('blast-boss'); home.deaths = 2;
  firstSave.lastReported = { areas: ['wayside'], bosses: [], rooms: ['blast-1'], level: 2 };
  const nextSave = writeSave(home, firstSave);
  assert.ok(nextSave); assert.equal(nextSave.home.candy, 19, 'ordinary saves retain HOME snapshot');
  const saved = readSave(); assert.ok(saved); assert.deepEqual(saved, nextSave);
  assert.deepEqual(saved.lastReported, firstSave.lastReported);
  assert.deepEqual(saved.unlockedHeroes, HERO_IDS);
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
  // Dying after dungeon progress retries at HOME without erasing milestones.
  for (const h of Object.values(quest.heroes)) { h.hp = 1; h.invulnerable = 0; } quest.hitStop = 0;
  bulletAtHero(quest, 99); tick(quest);
  activeHero(quest).invulnerable = 0; quest.hitStop = 0; bulletAtHero(quest, 99); tick(quest);
  assert.equal(quest.scene, 'dead');
  const failedRun = writeSave(quest, firstSave); assert.ok(failedRun);
  const afterDeath = restoreSave(failedRun, true);
  assert.equal(afterDeath.scene, 'hub'); assert.equal(afterDeath.deaths, 1);
  assert.deepEqual(afterDeath.clearedRooms, completedZones);
  assert.deepEqual(afterDeath.bosses, ['blast-gatekeeper', 'blast-watcher']); assert.deepEqual(afterDeath.areas, ['blast', 'eightbit-realm']);
  assert.equal(afterDeath.heroes.joe.level, 1); assert.equal(afterDeath.candy, 19);
  assert.deepEqual(failedRun.lastReported, firstSave.lastReported);
  // Party snapshots retain HOME composition while ordinary saves retain the current party.
  const partySaveState = newGame(); partySaveState.party = ['joe', 'matt']; partySaveState.active = 'joe'; enterScene(partySaveState, 'hub'); partySaveState.overlay = 'home';
  assert.equal(toggleParty(partySaveState, 'matt'), true);
  const soloHome = writeSave(partySaveState, null, true); assert.ok(soloHome);
  assert.deepEqual(soloHome.party, ['joe']); assert.deepEqual(soloHome.home.party, ['joe']);
  toggleParty(partySaveState, 'matt'); toggleParty(partySaveState, 'joe');
  const currentPartySave = writeSave(partySaveState, soloHome); assert.ok(currentPartySave);
  assert.deepEqual(restoreSave(currentPartySave).party, ['matt']);
  assert.equal(restoreSave(currentPartySave).active, 'matt');
  assert.deepEqual(restoreSave(currentPartySave, true).party, ['joe']);
  assert.equal(restoreSave(currentPartySave, true).active, 'joe');
  const legacy = structuredClone(currentPartySave); delete legacy.party; delete legacy.home.party;
  entries.set(SAVE_KEY, JSON.stringify(legacy)); assert.deepEqual(readSave().party, ['you', 'joe']);
  const filteredParty = { ...currentPartySave, party: ['alex', 'joe', 'joe', 99] };
  entries.set(SAVE_KEY, JSON.stringify(filteredParty));
  assert.deepEqual(readSave().party, ['alex', 'joe']); assert.equal(readSave().active, 'alex');

  // A stale tab cannot roll the report receipt back, even if its game state is older.
  entries.clear();
  const baseRun = newGame(); enterScene(baseRun, 'hub'); restAtHome(baseRun);
  const baseHome = writeSave(baseRun, null, true); assert.ok(baseHome);
  const tabA = restoreSave(baseHome), tabB = restoreSave(baseHome);
  tabA.areas.push('blast'); tabA.clearedRooms.push('blast-0');
  tabA.character.level = 2;
  const tabAReport = progressReport(tabA, baseHome.lastReported);
  assert.equal(tabAReport.score, 2150);
  const committedA = writeSave(tabA, baseHome, false, tabAReport.receipt); assert.ok(committedA);
  const staleB = writeSave(tabB, baseHome); assert.ok(staleB);
  assert.deepEqual(staleB.lastReported, committedA.lastReported);
  assert.deepEqual(readSave().lastReported, committedA.lastReported);
  assert.equal(progressReport(tabB, staleB.lastReported).score, 0);
  tabB.areas.push('blast'); tabB.clearedRooms.push('blast-0');
  tabB.character.level = 2;
  assert.equal(progressReport(tabB, staleB.lastReported).score, 0);
  const homeRetry = restoreSave(staleB, true);
  assert.equal(homeRetry.heroes.joe.level, 1);
  assert.equal(progressReport(homeRetry, readSave().lastReported).score, 0, 'HOME retry cannot farm old level rewards');
  const reloaded = restoreSave(readSave());
  assert.equal(progressReport(reloaded, readSave().lastReported).score, 0, 'reload cannot farm old progress');

  // Persisting the new receipt must succeed before any checkpoint can be posted.
  const storedBeforeFailure = entries.get(SAVE_KEY), receiptBeforeFailure = readSave().lastReported;
  const setter = storage.setItem; storage.setItem = () => { throw new Error('quota exhausted'); };
  tabA.areas.push('eightbit-realm');
  const pendingReport = progressReport(tabA, receiptBeforeFailure);
  assert.equal(pendingReport.score, 1000);
  assert.equal(writeSave(tabA, committedA, false, pendingReport.receipt), null);
  assert.equal(entries.get(SAVE_KEY), storedBeforeFailure);
  assert.deepEqual(readSave().lastReported, receiptBeforeFailure);
  storage.setItem = setter;

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
console.log('Wayside Fury simulation: combat, boss patterns/phase, story/realm/results, progress receipts/replay, party selection, taxi/hub/shop/HOME and save/retry checks pass.');
