// Deterministic combat regressions, Node 24+. No renderer or optional Update 1 gear.
import assert from 'node:assert/strict';
import { activeHero, addEnemy, applyCoopHit, combatXp, createHero, encounterLevel, enterScene, idleInput, newGame, setCoopPlayerCount, step, syncCoopLevel } from '../src/pages/WaysideFury/game/sim.ts';
import { getWorld, isBlocked } from '../src/pages/WaysideFury/game/world.ts';
import { makeSave, parseSave, progressReport, restoreSave } from '../src/pages/WaysideFury/game/save.ts';
import { drawLunarTelegraph } from '../src/pages/WaysideFury/game/renderSpace2d.ts';
import { applyCoopReward } from '../src/pages/WaysideFury/game/coopRewards.ts';
import { cleanHero, cleanRelay, cleanWorld } from '../server/wayside-fury/protocol.js';

const tick = (s, input = idleInput(), count = 1) => { for (let i = 0; i < count; i++) step(s, { ...input }, 1 / 60); };
const host = () => { const s = newGame(); s.coop = { role: 'host', seat: 0, remoteHeroes: [], appliedHits: [], playerCount: 1 }; return s; };
let sequence = 0;
const hit = (s, e, dx = 0, dy = 0, force = 55, damage = 1) => applyCoopHit(s, { type: 'coop-hit', enemyId: e.id, damage, dx, dy, force, attackId: `regression-${sequence++}` }, 1);
for (const map of ['blast-4', 'blast-7', 'moon-m06', 'moon-m08']) {
  for (const side of ['left', 'right', 'top', 'bottom']) {
    const s = host(); enterScene(s, 'dungeon', 0, map);
    const e = s.enemies.find(e => e.kind === 'boss'); assert.ok(e, map);
    s.enemies = [e];
    const w = getWorld(s.scene, s.room, s.mapId), points = [];
    for (let x = e.radius + 2; x < w.width - e.radius; x += 8) for (let y = e.radius + 2; y < w.height - e.radius; y += 8) if (!isBlocked(w, x, y, e.radius)) points.push({ x, y });
    const score = p => side === 'left' ? p.x : side === 'right' ? -p.x : side === 'top' ? p.y : -p.y;
    const p = points.sort((a, b) => score(a) - score(b) || Math.hypot(a.x - w.width / 2, a.y - w.height / 2) - Math.hypot(b.x - w.width / 2, b.y - w.height / 2))[0];
    Object.assign(e, p); s.x = p.x; s.y = p.y; activeHero(s).invulnerable = 100;
    // Four attackers surrounding the boss; repeated remote hit strings share poise.
    s.coop.remoteHeroes = [1, 2, 3].map(seat => ({ seat, userId: `${seat}`, name: 'crew', hero: { ...createHero('joe'), invulnerable: 100 }, x: p.x + (seat - 2) * 16, y: p.y + 16, faceX: 1, faceY: 0, moving: false, guard: false, attackTimer: 0, combo: 0, charge: 0, dashTimer: 0, scene: s.scene, room: s.room, mapId: s.mapId }));
    const dx = side === 'left' ? -1 : side === 'right' ? 1 : 0, dy = side === 'top' ? -1 : side === 'bottom' ? 1 : 0;
    for (let n = 0; n < 6; n++) hit(s, e, dx, dy);
    assert.ok(e.burst > 0, `${map}/${side}: wall pressure starts burst`);
    const hp = e.hp; hit(s, e); assert.equal(e.hp, hp, 'burst grants real i-frames');
    for (let n = 0; n < 120 && e.burst > 0; n++) { tick(s); assert.equal(isBlocked(w, e.x, e.y, e.radius), false, 'escape stays collision safe'); }
    assert.equal(e.burst, 0); assert.ok(Math.hypot(e.x - p.x, e.y - p.y) >= 32, `${map}/${side}: escapes wall/surround`);
    assert.ok(e.escapeIframes > 0, 'short protection survives escape');
  }
  const s = host(); enterScene(s, 'dungeon', 0, map); const e = s.enemies.find(e => e.kind === 'boss');
  s.enemies = [e]; s.x = e.x + 48; s.y = e.y; activeHero(s).invulnerable = 100; e.hp = e.maxHp * .49;
  tick(s); assert.equal(e.phase, 2); assert.ok(e.burst > 0, 'phase transition has protected telegraph');
}
const charge = newGame(); charge.enemies = []; charge.x = 120; charge.y = 110;
const dummy = addEnemy(charge, 'grunt', 148, 110); dummy.hp = dummy.maxHp = 1000; dummy.cooldown = 100; dummy.speed = 0;
tick(charge, { ...idleInput(), attack: true }); const tapped = dummy.hp;
tick(charge, { ...idleInput(), attack: true }, 60); assert.ok(charge.meleeCharge >= .6);
dummy.x = charge.x + 25; dummy.y = charge.y; const stamina = activeHero(charge).stamina;
tick(charge); assert.ok(tapped - dummy.hp >= activeHero(charge).power * 2.7, 'release adds a charged strike');
assert.ok(activeHero(charge).stamina < stamina); assert.equal(charge.meleeHolding, false);
const dodge = newGame(); tick(dodge, { ...idleInput(), dash: true }); assert.ok(dodge.dashTimer > 0 && activeHero(dodge).invulnerable >= .22);

for (const archetype of ['charger', 'kiter', 'shield', 'swarm', 'ambusher']) {
  const s = newGame(); s.enemies = []; s.x = 120; s.y = 110; const e = addEnemy(s, 'grunt', archetype === 'shield' ? 155 : 175, 110); e.archetype = archetype; e.cooldown = 0; activeHero(s).invulnerable = 100;
  tick(s, idleInput(), 1);
  if (archetype === 'swarm') assert.notEqual(e.y, 110, 'swarm flanks');
  else assert.ok(e.windup > 0, `${archetype} telegraphs`);
  tick(s, idleInput(), 55);
  if (archetype === 'kiter') { assert.ok(s.projectiles.length); assert.ok(e.x > 175, 'kiter retreats'); }
  else if (archetype !== 'swarm') assert.notEqual(e.x, 175, `${archetype} commits after windup`);
}
const shield = host(); shield.enemies = []; const e = addEnemy(shield, 'grunt', 140, 110); e.hp = e.maxHp = 200; e.archetype = 'shield'; e.aimX = -1; e.aimY = 0;
const hp = e.hp; hit(shield, e, 1, 0, 55, 20); const blocked = hp - e.hp; hit(shield, e, 1, 0, 180, 20); assert.ok(blocked < hp - blocked - e.hp, 'charged force bypasses shield');
const low = newGame(), high = newGame(); high.character.level = 30;
enterScene(low, 'dungeon', 0); enterScene(high, 'dungeon', 0);
assert.ok(high.enemies[0].maxHp > low.enemies[0].maxHp * 5, 'high-level revisit scales');
assert.equal(combatXp(high, 100, 1, 100), combatXp(high, 100, 1, 1.5), 'boost capped');
assert.ok(combatXp(high, 100, 1) < 10, 'obsolete content has diminishing XP');
const scaled = host(); enterScene(scaled, 'dungeon', 0); const enemy = scaled.enemies[0]; enemy.hp *= .4;
setCoopPlayerCount(scaled, 4); assert.ok(Math.abs(enemy.hp / enemy.maxHp - .4) < 1e-9);
scaled.character.level = 10; syncCoopLevel(scaled); assert.equal(enemy.combatLevel, encounterLevel(scaled)); assert.ok(Math.abs(enemy.hp / enemy.maxHp - .4) < 1e-9);
const normal = newGame(), hard = newGame(); hard.difficulty = 'hard';
for (const s of [normal, hard]) { s.enemies = []; s.x = 120; s.y = 110; const e = addEnemy(s, 'grunt', 138, 110); e.archetype = 'swarm'; e.cooldown = 0; tick(s); }
assert.ok(activeHero(hard).hp < activeHero(normal).hp, 'Hard deals more damage');
const saved = makeSave(hard, null); assert.equal(restoreSave(saved).difficulty, 'hard');
for (const version of [3, 4]) { const old = structuredClone(saved); old.version = version; delete old.settings.difficulty; assert.equal(parseSave(old).settings.difficulty, 'normal'); }
assert.equal(progressReport(hard).score, progressReport(normal).score, 'difficulty has no ticket bonus');
const envelope = { ...scaled, protocolVersion: 3, combatLevel: 10, spawnedExtras: 3 }; assert.ok(cleanWorld(envelope));
assert.equal(cleanWorld({ ...envelope, difficulty: 'impossible' }), null);
assert.equal(cleanWorld({ ...envelope, enemies: [{ ...enemy, escapeIframes: -1 }] }), null);

for (const [id, beams] of [['joe', 1], ['matt', 3], ['alex', 2], ['jon', 1]]) {
  const s = newGame(); s.active = id; s.party = [id, 'you']; s.enemies = [];
  const h = activeHero(s); h.ki = h.maxKi; h.stamina = 20; s.heroes.you.hp = 50;
  tick(s, { ...idleInput(), ki: true }); tick(s);
  assert.equal(s.projectiles.filter(p => p.beam).length, beams);
  if (id === 'matt') assert.ok(h.stamina > 40, 'Matt restores combo/dodge stamina');
  if (id === 'alex') assert.ok(h.invulnerable > .4, 'Alex signature gives evasive protection');
  if (id === 'jon') assert.ok(s.heroes.you.hp > 50, 'Jon rallies his living tag partner');
}

const remote = { hero: createHero('joe'), x: 120, y: 110, faceX: 1, faceY: 0, moving: false, guard: false, attackTimer: 0, combo: 1, charge: 0, dashTimer: 0, meleeCharge: .8, scene: 'test', room: 0 };
assert.equal(cleanHero(remote).meleeCharge, .8);
assert.equal(cleanHero({ ...remote, meleeCharge: 2 }), null);

const legacyNova = { ...enemy, kind: 'boss', behavior: undefined, archetype: undefined, burst: 0, windup: .8, pattern: 1 };
assert.equal(drawLunarTelegraph(null, legacyNova), false, 'legacy nova retains its radial telegraph renderer');

// Each co-op seat uses its permanent sheet, including delayed/map-crossing rewards.
const veteran = newGame(); veteran.character.level = 30; enterScene(veteran, 'realm');
const reward = { id: 'combat:old-room-kill', kind: 'kill', xp: 100, xpLevel: 1, candy: 2 };
assert.equal(applyCoopReward(veteran, reward), true);
assert.equal(veteran.character.xp, combatXp(veteran, 100, 1));
assert.equal(applyCoopReward(veteran, reward), false);
const rookie = newGame(); applyCoopReward(rookie, reward); assert.equal(rookie.character.level, 2);
assert.equal(cleanRelay({ type: 'reward', reward }).reward.xpLevel, 1);
assert.equal(cleanRelay({ type: 'reward', reward: { ...reward, xpLevel: 1001 } }), null);
console.log('Combat: all boss wall edges/surrounds, phases, charged attack, dodge, five archetypes, scaling, XP cap, Hard, saves and protocol pass.');
