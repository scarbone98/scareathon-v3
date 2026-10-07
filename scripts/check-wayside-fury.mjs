// Exercise the pure simulation headlessly, as the Horde Rush balance script does.
// Run with Node 24+: node scripts/check-wayside-fury.mjs
import assert from 'node:assert/strict';
import { newGame, step, idleInput, addEnemy, activeHero, xpForLevel, enterScene, interact, interactTarget, buyItem, restAtHome, advanceStory, skipPrologue, beginRealmShift, toggleParty } from '../src/pages/WaysideFury/game/sim.ts';

import { LOCATIONS, HUB_POINTS, SHOP_ITEMS, PROLOGUE } from '../src/pages/WaysideFury/game/content.ts';
import { SAVE_KEY, readSave, writeSave, restoreSave, progressReport, mergeReceipts } from '../src/pages/WaysideFury/game/save.ts';

const DT = 1 / 60;
const tick = (s, buttons = {}, frames = 1) => {
  for (let i = 0; i < frames; i++) step(s, { ...idleInput(), ...buttons }, DT);
};
const emptyRoom = () => { const s = newGame(100); s.enemies = []; return s; };
const bulletAtHero = (s, damage = 20) => s.projectiles.push({ id: s.nextId++, x: s.x, y: s.y, vx: 0, vy: 0,
  radius: 4, damage, ttl: 1, owner: 'enemy', beam: false, hits: [] });

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

// HOME party selection keeps at least one hero, changes the active hero when
// benched, and prevents a healthy benched hero from rescuing a solo party wipe.
const party = emptyRoom();
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

// The east gate stays shut during combat; retreat remains available at the entrance.
const retreat = newGame(4); enterScene(retreat, 'dungeon');
retreat.x = 292; retreat.y = 108;
assert.equal(interactTarget(retreat), null); interact(retreat); assert.equal(retreat.room, 0);
retreat.x = 45; retreat.y = 149;
assert.equal(interactTarget(retreat).id, 'exit'); interact(retreat); assert.equal(retreat.scene, 'overworld');

// Boss rushes freeze their aim after the warning; dark novas fire radially.
const bossRules = newGame(5); enterScene(bossRules, 'dungeon', 2);
const watcher = bossRules.enemies[0]; watcher.cooldown = 0;
tick(bossRules, { guard: true });
assert.equal(watcher.pattern, 0); assert.ok(watcher.windup > 0.6);
const rushAim = [watcher.aimX, watcher.aimY], startBossX = watcher.x;
bossRules.y = 160;
for (let f = 0; f < 60 && watcher.actionTimer === 0; f++) tick(bossRules, { guard: true });
assert.ok(watcher.actionTimer > 0);
assert.deepEqual([watcher.aimX, watcher.aimY], rushAim, 'rush aim is locked during its warning');
for (let f = 0; f < 60 && watcher.actionTimer > 0; f++) tick(bossRules, { guard: true });
assert.ok(watcher.x < startBossX - 40); assert.equal(watcher.pattern, 1);
watcher.cooldown = 0; bossRules.x = 45; bossRules.y = 48;
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
const quest = newGame(7); enterScene(quest, 'dungeon');
let playFrame = 0; const checkpoints = [], usedControls = new Set(), roomFrames = [];
function playRoom(s) {
  let frames = 0; const scene = s.scene;
  while (s.enemies.length && s.scene === scene && frames < 15000) {
    const e = s.enemies.reduce((a, b) => Math.hypot(a.x - s.x, a.y - s.y) < Math.hypot(b.x - s.x, b.y - s.y) ? a : b);
    const dx = e.x - s.x, dy = e.y - s.y, length = Math.max(1, Math.hypot(dx, dy)), cycle = playFrame % 240;
    const ki = cycle < 80, attack = !ki && playFrame % 20 === 0, dash = cycle === 110, swap = cycle === 190;
    const input = { ...idleInput(), x: dx / length, y: dy / length, ki, attack, dash, swap, guard: !ki && !attack && !dash };
    for (const key of ['attack', 'ki', 'dash', 'swap', 'guard']) if (input[key]) usedControls.add(key);
    step(s, input, DT);
    checkpoints.push(...s.events.filter(e => e.type === 'checkpoint').map(e => e.id));
    frames++; playFrame++;
  }
  assert.equal(s.scene, scene, 'combat bot survives on default stats');
  assert.equal(s.enemies.length, 0, 'combat bot actually defeats every enemy');
  return frames;
}
function walkTo(s, x, y) {
  for (let f = 0; f < 900 && Math.hypot(x - s.x, y - s.y) > 4; f++) {
    const dx = x - s.x, dy = y - s.y, length = Math.hypot(dx, dy);
    tick(s, { x: dx / length, y: dy / length });
  }
  assert.ok(Math.hypot(x - s.x, y - s.y) <= 4);
}
for (let room = 0; room < 3; room++) {
  assert.equal(quest.room, room); roomFrames.push(playRoom(quest));
  walkTo(quest, 292, 108);
  assert.equal(interactTarget(quest).id, 'next');
  assert.equal(interactTarget(quest).name, ['Next room', 'Confront the Watcher', 'Leave Blast Site'][room]);
  tick(quest, { interact: true });
  if (room < 2) {
    assert.equal(quest.room, room + 1);
    tick(quest, { interact: true }, 6);
    assert.equal(quest.scene, 'dungeon', 'holding Enter across a door cannot immediately retreat');
  }
}
assert.equal(quest.scene, 'shift'); assert.equal(quest.palette, 'real');
assert.deepEqual(quest.clearedRooms, ['blast-0', 'blast-1', 'blast-2']);
assert.deepEqual(quest.bosses, ['blast-watcher']); assert.deepEqual(quest.areas, ['blast']);
assert.deepEqual(checkpoints, ['blast-0', 'blast-1', 'blast-2']);
assert.equal(quest.kills, 10); assert.equal(quest.deaths, 0);
assert.deepEqual([...usedControls].sort(), ['attack', 'dash', 'guard', 'ki', 'swap']);
tick(quest, { interact: true }, 143); assert.equal(quest.scene, 'shift');
tick(quest, { interact: true }, 2); assert.equal(quest.scene, 'realm'); assert.equal(quest.palette, 'eightbit');
assert.equal(quest.sceneTimer, 0); assert.equal(quest.enemies.length, 3);
assert.deepEqual(quest.enemies.map(e => e.sprite), ['pumpkin', 'ghost', 'imp']);
assert.equal(interactTarget(quest), null, 'realm has no western retreat');
quest.x = 292; quest.y = 108; assert.equal(interactTarget(quest), null, 'realm east gate is closed during combat');
quest.x = 45; quest.y = 108;
const realmFrames = playRoom(quest);
assert.equal(quest.chapter, 2); assert.equal(quest.kills, 13); assert.equal(quest.deaths, 0);
assert.deepEqual(quest.clearedRooms, ['blast-0', 'blast-1', 'blast-2', 'realm-0']);
assert.deepEqual(quest.areas, ['blast', 'eightbit-realm']);
assert.deepEqual(checkpoints, ['blast-0', 'blast-1', 'blast-2', 'realm-0']);
walkTo(quest, 292, 108); assert.equal(interactTarget(quest).name, 'To be continued');
tick(quest, { interact: true }); assert.equal(quest.scene, 'results'); assert.equal(quest.sceneTimer, 0);
tick(quest, { attack: true, ki: true, interact: true }, 135);
assert.equal(quest.scene, 'results'); assert.ok(quest.sceneTimer > 2.2);
console.log(`Default-stat chapter playthrough: dungeon ${roomFrames.map(n => (n / 60).toFixed(1)).join('/')}s, realm ${(realmFrames / 60).toFixed(1)}s; 13 kills, level ${activeHero(quest).level}, ${quest.candy} candy, no deaths.`);
// A replay clear raises a checkpoint for legitimate new levels. Its prior
// rooms, areas and boss ids remain receipted and cannot pay again.
const beforeReplay = progressReport(quest);
const replayLevel = beforeReplay.receipt.level;
enterScene(quest, 'overworld');
walkTo(quest, LOCATIONS[1].x, LOCATIONS[1].y); tick(quest); tick(quest, { interact: true });
assert.equal(quest.scene, 'dungeon'); assert.equal(quest.room, 0);
const priorCheckpoints = checkpoints.length; playRoom(quest);
assert.equal(checkpoints.length, priorCheckpoints + 1);
assert.equal(checkpoints.at(-1), 'blast-0');
const replayReport = progressReport(quest, beforeReplay.receipt);
assert.ok(replayReport.receipt.level > replayLevel, 'actual replay combat earns a new level');
assert.equal(replayReport.score, (replayReport.receipt.level - replayLevel) * 100);
assert.equal(progressReport(quest, replayReport.receipt).score, 0, 'unchanged replay checkpoint progress sends nothing');
const repeatedClearCount = checkpoints.length; tick(quest, {}, 60);
assert.equal(checkpoints.length, repeatedClearCount, 'an empty room cannot produce another clear');
assert.deepEqual(quest.clearedRooms, ['blast-0', 'blast-1', 'blast-2', 'realm-0']);
const exitAfterClear = structuredClone(quest); exitAfterClear.x = 45;
assert.equal(interactTarget(exitAfterClear).id, 'exit');
interact(exitAfterClear); assert.equal(exitAfterClear.scene, 'overworld');
const replayRealm = structuredClone(quest); replayRealm.chapter = 1; enterScene(replayRealm, 'realm');
const beforeRealmReplayCount = checkpoints.length;
playRoom(replayRealm);
assert.equal(checkpoints.length, beforeRealmReplayCount + 1);
assert.equal(checkpoints.at(-1), 'realm-0');
assert.equal(replayRealm.chapter, 2, 'realm clear restores chapter advancement after a HOME retry');
assert.equal(progressReport(replayRealm, replayReport.receipt).score, 0, 'a replay without a new level cannot farm old room/area rewards');
assert.deepEqual(replayRealm.clearedRooms, ['blast-0', 'blast-1', 'blast-2', 'realm-0']);

// Tickets use only newly gained progress, with a persistent level high-water mark.
const progress = newGame();
const zero = progressReport(progress);
assert.equal(zero.score, 0); assert.deepEqual(zero.receipt, { areas: [], bosses: [], rooms: [], level: 1 });
progress.areas = ['wayside']; assert.equal(progressReport(progress).score, 1000);
progress.areas = []; progress.bosses = ['blast-watcher']; assert.equal(progressReport(progress).score, 1000);
progress.bosses = []; progress.heroes.joe.level = progress.heroes.matt.level = 3;
assert.equal(progressReport(progress).score, 200, 'shared party levels pay once');
progress.heroes.matt.level = 4; assert.equal(progressReport(progress).score, 300);
progress.heroes.joe.level = progress.heroes.matt.level = 1;
progress.clearedRooms = ['blast-0', 'blast-1']; assert.equal(progressReport(progress).score, 100);
progress.areas = ['wayside', 'blast', 'blast']; progress.bosses = ['blast-watcher', 'blast-watcher'];
progress.clearedRooms = ['blast-0', 'blast-1', 'blast-1'];
progress.heroes.joe.level = progress.heroes.matt.level = 3;
const earned = progressReport(progress); assert.equal(earned.score, 3300);
assert.equal(progressReport(progress, earned.receipt).score, 0, 'repeated checkpoints send nothing');
progress.areas = []; progress.bosses = []; progress.clearedRooms = [];
progress.heroes.joe.level = progress.heroes.matt.level = 1;
const rolledBack = progressReport(progress, earned.receipt);
assert.equal(rolledBack.score, 0); assert.deepEqual(rolledBack.receipt, earned.receipt);
progress.heroes.joe.level = 3; assert.equal(progressReport(progress, rolledBack.receipt).score, 0);
progress.heroes.joe.level = 4; assert.equal(progressReport(progress, rolledBack.receipt).score, 100);
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
  // Dying after dungeon progress retries at HOME without erasing milestones.
  quest.heroes.joe.hp = quest.heroes.matt.hp = 1;
  quest.heroes.joe.invulnerable = quest.heroes.matt.invulnerable = 0; quest.hitStop = 0;
  bulletAtHero(quest, 99); tick(quest);
  activeHero(quest).invulnerable = 0; bulletAtHero(quest, 99); tick(quest);
  assert.equal(quest.scene, 'dead');
  const failedRun = writeSave(quest, firstSave); assert.ok(failedRun);
  const afterDeath = restoreSave(failedRun, true);
  assert.equal(afterDeath.scene, 'hub'); assert.equal(afterDeath.deaths, 1);
  assert.deepEqual(afterDeath.clearedRooms, ['blast-0', 'blast-1', 'blast-2', 'realm-0']);
  assert.deepEqual(afterDeath.bosses, ['blast-watcher']); assert.deepEqual(afterDeath.areas, ['blast', 'eightbit-realm']);
  assert.equal(afterDeath.heroes.joe.level, 1); assert.equal(afterDeath.candy, 19);
  assert.deepEqual(failedRun.lastReported, firstSave.lastReported);
  // Party snapshots retain HOME composition while ordinary saves retain the current party.
  const partySaveState = newGame(); enterScene(partySaveState, 'hub'); partySaveState.overlay = 'home';
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
  entries.set(SAVE_KEY, JSON.stringify(legacy)); assert.deepEqual(readSave().party, ['joe', 'matt']);
  const filteredParty = { ...currentPartySave, party: ['alex', 'joe', 'joe', 99] };
  entries.set(SAVE_KEY, JSON.stringify(filteredParty));
  assert.deepEqual(readSave().party, ['joe']); assert.equal(readSave().active, 'joe');

  // A stale tab cannot roll the report receipt back, even if its game state is older.
  entries.clear();
  const baseRun = newGame(); enterScene(baseRun, 'hub'); restAtHome(baseRun);
  const baseHome = writeSave(baseRun, null, true); assert.ok(baseHome);
  const tabA = restoreSave(baseHome), tabB = restoreSave(baseHome);
  tabA.areas.push('blast'); tabA.clearedRooms.push('blast-0');
  tabA.heroes.joe.level = tabA.heroes.matt.level = 2;
  const tabAReport = progressReport(tabA, baseHome.lastReported);
  assert.equal(tabAReport.score, 2150);
  const committedA = writeSave(tabA, baseHome, false, tabAReport.receipt); assert.ok(committedA);
  const staleB = writeSave(tabB, baseHome); assert.ok(staleB);
  assert.deepEqual(staleB.lastReported, committedA.lastReported);
  assert.deepEqual(readSave().lastReported, committedA.lastReported);
  assert.equal(progressReport(tabB, staleB.lastReported).score, 0);
  tabB.areas.push('blast'); tabB.clearedRooms.push('blast-0');
  tabB.heroes.joe.level = tabB.heroes.matt.level = 2;
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
