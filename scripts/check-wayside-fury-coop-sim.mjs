import assert from 'node:assert/strict';
import { newGame, enterScene, addEnemy, activeHero, idleInput, step, interact, interactTarget, applyCoopHit, applyCoopDamage,
  setCoopPlayerCount, syncCoopLevel, coopLevelBand, reviveCoopHero, requestSwap, exitCoop, gainXp, grantGear, restAtHome, buyItem, xpForLevel, createHero, HERO_IDS } from '../src/pages/WaysideFury/game/sim.ts';
import { getWorld, WATCHER_ROOM } from '../src/pages/WaysideFury/game/world.ts';
import { HERO_OBSTACLES, isObstacleCleared } from '../src/pages/WaysideFury/game/u1/world/obstacles.ts';

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
// emits reward metadata for the per-player ledger rather than granting twice.
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
assert.equal(host.kills, 0); assert.equal(host.candy, 0); assert.equal(host.character.xp, 0);
assert.equal(host.events.filter(e => e.type === 'kill').length, 1);
assert.equal(host.events.find(e => e.type === 'kill').xp, 28);
assert.equal(applyCoopHit(host, kill, 1), false); assert.equal(host.kills, 0);
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

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} is near ${b}`);
const peer = (s, seat = 1, x = s.x + 24, y = s.y) => ({ seat, userId: `player-${seat}`, name: `Player ${seat}`,
  hero: createHero('you'), x, y, faceX: -1, faceY: 0, moving: false, guard: false,
  attackTimer: 0, combo: 0, charge: 0, dashTimer: 0, scene: s.scene, room: s.room, interact: false });
const hostileBullet = (s, x = s.x, y = s.y, damage = 20) => s.projectiles.push({ id: s.nextId++, x, y, vx: 0, vy: 0,
  radius: 4, damage, ttl: 1, owner: 'enemy', beam: false, hits: [] });

// Joining and leaving rescale every live enemy's maximum while retaining the
// health percentage. Spawn slots are paid once per encounter, even on rejoin.
const scaled = cooperative('host', 0);
enterScene(scaled, 'dungeon');
const originalCount = scaled.enemies.length, grunt = scaled.enemies[0], boss = addEnemy(scaled, 'boss', 250, 170);
grunt.hp = grunt.maxHp * 0.37; boss.hp = boss.maxHp * 0.62;
setCoopPlayerCount(scaled, 2);
near(grunt.maxHp, 32 * 1.6); near(boss.maxHp, 260 * 1.75);
near(grunt.hp / grunt.maxHp, 0.37); near(boss.hp / boss.maxHp, 0.62);
assert.equal(scaled.enemies.length, originalCount + 2);
setCoopPlayerCount(scaled, 4);
near(grunt.maxHp, 32 * 2.8); near(boss.maxHp, 260 * 3.25);
near(grunt.hp / grunt.maxHp, 0.37); near(boss.hp / boss.maxHp, 0.62);
assert.equal(scaled.enemies.length, originalCount + 4);
setCoopPlayerCount(scaled, 1); setCoopPlayerCount(scaled, 4);
assert.equal(scaled.enemies.length, originalCount + 4, 'leave/rejoin cannot farm more wave enemies');
setCoopPlayerCount(scaled, 1); near(grunt.maxHp, 32); near(boss.maxHp, 260);
near(grunt.hp / grunt.maxHp, 0.37); near(boss.hp / boss.maxHp, 0.62);
setCoopPlayerCount(scaled, 4); enterScene(scaled, 'dungeon', 4);
near(scaled.enemies.find(e => e.miniBoss).maxHp, 165 * 3.25);
assert.equal(scaled.enemies.length, getWorld('dungeon', 4).spawns.length + 3);
scaled.enemies = []; setCoopPlayerCount(scaled, 1); setCoopPlayerCount(scaled, 4);
assert.equal(scaled.enemies.length, 0, 'joining an already cleared wave cannot respawn it');
scaled.coop.worldClearedRooms = ['blast-2']; enterScene(scaled, 'dungeon', 2);
assert.equal(scaled.enemies.length, 0, 'promoted host preserves the original host world clears');
assert.equal(scaled.clearedRooms.includes('blast-2'), false, 'migration does not grant personal story progress');

// Enemy damage follows the party multiplier before defense and guarding.
for (const guard of [false, true]) {
  const damageRules = cooperative('host', 0); setCoopPlayerCount(damageRules, 4); damageRules.enemies = [];
  hostileBullet(damageRules);
  tick(damageRules, { guard });
  assert.equal(activeHero(damageRules).hp, 100 - (guard ? 6 : 25));
}

// Hosts target nearby guests, including shooters and boss warning aim, without
// temporarily replacing their own position or character state.
const targeting = cooperative('host', 0); targeting.enemies = [];
const remote = peer(targeting, 1, 210, targeting.y); targeting.coop.remoteHeroes = [remote];
setCoopPlayerCount(targeting, 2); targeting.enemies = [];
const contact = addEnemy(targeting, 'grunt', 200, targeting.y); contact.cooldown = 0;
const hostPosition = [targeting.x, targeting.y], hostHero = structuredClone(activeHero(targeting));
const contactEvents = tick(targeting).filter(e => e.type === 'coop-damage');
assert.equal(contactEvents.length, 1); assert.equal(contactEvents[0].seat, 1); assert.equal(contactEvents[0].damage, 8);
assert.deepEqual([targeting.x, targeting.y], hostPosition); assert.equal(activeHero(targeting).hp, hostHero.hp);
near(remote.hero.hp, 92);
hostileBullet(targeting, remote.x, remote.y, 20);
assert.equal(tick(targeting).filter(e => e.type === 'coop-damage').length, 0, 'host cooldown covers stale guest invulnerability samples');
targeting.enemies = []; const shooter = addEnemy(targeting, 'shooter', 200, targeting.y); shooter.cooldown = 0;
tick(targeting); assert.ok(shooter.aimX > 0, 'shooter aims at the guest to its right');
targeting.enemies = []; const aimedBoss = addEnemy(targeting, 'boss', 160, targeting.y); aimedBoss.cooldown = 0;
tick(targeting); assert.ok(aimedBoss.aimX > 0); assert.ok(aimedBoss.windup > 0);
remote.hero.hp = 0; remote.downed = true; aimedBoss.windup = 0; aimedBoss.cooldown = 0;
tick(targeting); assert.ok(aimedBoss.aimX < 0, 'boss ignores downed guests');
const fallenHostTargeting = cooperative('host', 0); fallenHostTargeting.enemies = [];
activeHero(fallenHostTargeting).hp = 0;
fallenHostTargeting.coop.remoteHeroes = [peer(fallenHostTargeting, 1, 200, fallenHostTargeting.y)];
setCoopPlayerCount(fallenHostTargeting, 2);
const walking = addEnemy(fallenHostTargeting, 'grunt', 100, fallenHostTargeting.y);
tick(fallenHostTargeting); assert.ok(walking.x > 100, 'host world AI keeps running while the host is downed');

// Host projectile contacts produce guest damage. Guests consume only that
// already reduced damage, so rendering an enemy projectile cannot hit twice.
const projectileHost = cooperative('host', 0); projectileHost.enemies = [];
const projectilePeer = peer(projectileHost, 1, 180, projectileHost.y); projectileHost.coop.remoteHeroes = [projectilePeer];
setCoopPlayerCount(projectileHost, 2); projectileHost.enemies = [];
hostileBullet(projectileHost, projectilePeer.x, projectilePeer.y);
const reportedDamage = tick(projectileHost).find(e => e.type === 'coop-damage');
assert.equal(reportedDamage.damage, 21); assert.equal(projectileHost.projectiles.length, 0);
const projectileGuest = cooperative('guest', 1); projectileGuest.enemies = [];
hostileBullet(projectileGuest); tick(projectileGuest); assert.equal(activeHero(projectileGuest).hp, 100);
applyCoopDamage(projectileGuest, reportedDamage.damage, reportedDamage.sourceX, reportedDamage.sourceY);
assert.equal(activeHero(projectileGuest).hp, 79);
applyCoopDamage(projectileGuest, reportedDamage.damage, reportedDamage.sourceX, reportedDamage.sourceY);
assert.equal(activeHero(projectileGuest).hp, 79, 'local invulnerability also ignores stale damage delivery');
activeHero(projectileGuest).invulnerable = 0;
applyCoopDamage(projectileGuest, NaN, 0, 0); assert.equal(activeHero(projectileGuest).hp, 79);

// Co-op downs the player immediately without tagging their offline partner.
// A living guest can revive a downed host by holding Interact for two seconds.
const downHost = cooperative('host', 0); downHost.enemies = [];
const rescuer = peer(downHost); downHost.coop.remoteHeroes = [rescuer]; setCoopPlayerCount(downHost, 2);
hostileBullet(downHost, downHost.x, downHost.y, 1000); tick(downHost);
assert.equal(activeHero(downHost).hp, 0); assert.equal(downHost.active, 'you'); assert.equal(downHost.scene, 'test');
assert.equal(downHost.coop.downed, true); assert.equal(requestSwap(downHost), false);
const fallenPosition = [downHost.x, downHost.y];
tick(downHost, { x: 1, attack: true, ki: true, dash: true, swap: true }, 10);
assert.deepEqual([downHost.x, downHost.y], fallenPosition); assert.equal(downHost.active, 'you');
rescuer.interact = true;
tick(downHost, {}, 119); assert.equal(activeHero(downHost).hp, 0);
tick(downHost); near(activeHero(downHost).hp, 40); assert.equal(downHost.coop.downed, false);
assert.ok(activeHero(downHost).invulnerable > 0.9); assert.equal(downHost.deaths, 0);
assert.equal(reviveCoopHero(downHost), false, 'living hero cannot receive free revive healing');
const tooFar = cooperative('host', 0); tooFar.enemies = []; activeHero(tooFar).hp = 0;
const distantRescuer = peer(tooFar, 1, tooFar.x + 40); distantRescuer.interact = true;
tooFar.coop.remoteHeroes = [distantRescuer]; setCoopPlayerCount(tooFar, 2);
tick(tooFar, {}, 130); assert.equal(activeHero(tooFar).hp, 0, 'revive requires a helper within 32 pixels');
distantRescuer.x = tooFar.x; distantRescuer.room++;
tick(tooFar, {}, 130); assert.equal(activeHero(tooFar).hp, 0, 'revive requires the same scene and room');

// Interrupted holds reset. A host revives a guest once and reports the seat.
const reviving = cooperative('host', 0); reviving.enemies = [];
const fallen = peer(reviving); fallen.hero.hp = 0; fallen.downed = true;
reviving.coop.remoteHeroes = [fallen]; setCoopPlayerCount(reviving, 2);
assert.match(interactTarget(reviving).name, /Hold to revive/);
tick(reviving, { interact: true }, 90); assert.equal(fallen.hero.hp, 0); near(fallen.reviveProgress, 0.75);
tick(reviving); near(fallen.reviveProgress, 0);
tick(reviving, { interact: true }, 119); assert.equal(fallen.hero.hp, 0);
const revival = tick(reviving, { interact: true });
assert.equal(revival.filter(e => e.type === 'coop-revive').length, 1); assert.equal(revival.find(e => e.type === 'coop-revive').seat, 1);
near(fallen.hero.hp, 40); assert.equal(fallen.downed, false);
fallen.hero.hp = 0; fallen.downed = true;
assert.equal(tick(reviving, { interact: true }, 120).filter(e => e.type === 'coop-revive').length, 0, 'stale down samples cannot duplicate a revive');

// A guest waits downed for host authority. A party wipes only when all connected
// seats have supplied their state and are down; a joining seat cannot cause it.
activeHero(projectileGuest).invulnerable = 0; projectileGuest.hitStop = 0;
applyCoopDamage(projectileGuest, 1000, 0, 0); tick(projectileGuest, { x: 1, swap: true });
assert.equal(projectileGuest.scene, 'test'); assert.equal(projectileGuest.active, 'you'); assert.equal(projectileGuest.coop.downed, true);
const wiping = cooperative('host', 0); wiping.enemies = []; setCoopPlayerCount(wiping, 3);
activeHero(wiping).hp = 0;
const downOne = peer(wiping, 1); downOne.hero.hp = 0; wiping.coop.remoteHeroes = [downOne];
tick(wiping, {}, 3); assert.equal(wiping.scene, 'test', 'wait for the joining seat state');
const lastStanding = peer(wiping, 2); wiping.coop.remoteHeroes.push(lastStanding);
tick(wiping); assert.equal(wiping.scene, 'test');
lastStanding.hero.hp = 0;
const wipeEvents = tick(wiping); assert.equal(wiping.scene, 'dead'); assert.equal(wiping.deaths, 1);
assert.equal(wipeEvents.filter(e => e.type === 'death').length, 1); tick(wiping); assert.equal(wiping.deaths, 1);

// Temporary area sync works upward and downward, never grants permanent levels
// or XP, and restores each hero's own derived stats/HP ratios after leaving.
const synced = cooperative('guest', 1); synced.character = { level: 50, xp: 17 };
for (const id of HERO_IDS) { synced.heroes[id] = createHero(id, synced.character); synced.heroes[id].hp *= 0.5; }
const permanent = structuredClone(synced.character);
enterScene(synced, 'realm'); assert.deepEqual(coopLevelBand('realm', 0), [6, 9]);
assert.equal(activeHero(synced).level, 9); assert.equal(activeHero(synced).maxHp, 260); near(activeHero(synced).hp, 130);
assert.deepEqual(synced.character, permanent); syncCoopLevel(synced); near(activeHero(synced).hp, 130);
delete synced.coop; syncCoopLevel(synced);
assert.equal(activeHero(synced).level, 50); assert.equal(activeHero(synced).maxHp, 1080); near(activeHero(synced).hp, 540);
assert.deepEqual(synced.character, permanent);
const lowLevel = cooperative('guest', 1); activeHero(lowLevel).hp = 50;
enterScene(lowLevel, 'realm'); assert.equal(activeHero(lowLevel).level, 6); near(activeHero(lowLevel).hp, 100);
assert.deepEqual(lowLevel.character, { level: 1, xp: 0 });
const leaving = cooperative('guest', 1); activeHero(leaving).hp = 0; leaving.coop.playerCount = 2;
const remainingEnemy = addEnemy(leaving, 'grunt', 200, 110);
remainingEnemy.baseMaxHp = 32; remainingEnemy.maxHp = 51.2; remainingEnemy.hp = 25.6;
exitCoop(leaving);
assert.equal(leaving.coop, undefined); assert.equal(leaving.active, 'joe'); assert.equal(leaving.scene, 'test');
assert.ok(activeHero(leaving).hp > 0); near(remainingEnemy.maxHp, 32); near(remainingEnemy.hp, 16);
const stranded = cooperative('guest', 1);
for (const h of Object.values(stranded.heroes)) h.hp = 0;
exitCoop(stranded); assert.equal(stranded.scene, 'dead'); assert.equal(stranded.deaths, 1);
assert.equal(stranded.events.filter(e => e.type === 'death').length, 1);
exitCoop(stranded); assert.equal(stranded.deaths, 1, 'leaving cannot create repeated solo deaths');

// Every enemy reports its authored XP once. Host personal rewards are applied
// through the same ledger as guests, so the simulation grants nothing directly.
for (const [kind, miniBoss, xp] of [['grunt', false, 28], ['shooter', false, 35], ['boss', true, 95], ['boss', false, 130]]) {
  const rewardsHost = cooperative('host', 0); rewardsHost.enemies = [];
  const victim = addEnemy(rewardsHost, kind, 180, 110); victim.miniBoss = miniBoss;
  const reported = { type: 'coop-hit', enemyId: victim.id, damage: 1000, dx: 1, dy: 0, force: 55, attackId: 'reward-test' };
  assert.equal(applyCoopHit(rewardsHost, reported, 1), true);
  assert.equal(rewardsHost.events.find(e => e.type === 'kill').xp, xp);
  assert.equal(rewardsHost.kills, 0); assert.equal(rewardsHost.candy, 0); assert.equal(rewardsHost.character.xp, 0);
  assert.deepEqual(rewardsHost.coopRewards, []);
  assert.equal(applyCoopHit(rewardsHost, reported, 1), false);
}

// Level rewards cannot replace the teammate revive mechanic. Living heroes
// receive one real level's healing, even when their combat level is synced.
const growingHost = cooperative('host', 0); growingHost.character.xp = 74;
activeHero(growingHost).hp = 0; growingHost.heroes.joe.hp = 0; growingHost.heroes.matt.hp = 25;
growingHost.coop.downed = true;
gainXp(growingHost, 1);
assert.deepEqual(growingHost.character, { level: 2, xp: 0 });
assert.equal(activeHero(growingHost).hp, 0); assert.equal(growingHost.heroes.joe.hp, 0);
assert.equal(growingHost.heroes.matt.hp, 55); assert.equal(growingHost.coop.downed, true);
const growingLow = cooperative('guest', 1); enterScene(growingLow, 'realm');
activeHero(growingLow).hp = 0; growingLow.heroes.joe.hp = 50; growingLow.coop.downed = true;
gainXp(growingLow, 75);
assert.deepEqual(growingLow.character, { level: 2, xp: 0 });
assert.equal(activeHero(growingLow).level, 6); assert.equal(activeHero(growingLow).maxHp, 200);
assert.equal(activeHero(growingLow).power, 27); assert.equal(activeHero(growingLow).hp, 0);
assert.equal(growingLow.heroes.joe.hp, 80); assert.equal(growingLow.coop.downed, true);
const growingHigh = cooperative('guest', 1); growingHigh.character = { level: 50, xp: xpForLevel(50) - 1 };
for (const id of HERO_IDS) growingHigh.heroes[id] = createHero(id, growingHigh.character);
enterScene(growingHigh, 'realm'); activeHero(growingHigh).hp = 130; growingHigh.heroes.joe.hp = 0;
gainXp(growingHigh, 1);
assert.deepEqual(growingHigh.character, { level: 51, xp: 0 });
assert.equal(activeHero(growingHigh).level, 9); assert.equal(activeHero(growingHigh).maxHp, 260);
assert.equal(activeHero(growingHigh).power, 36); assert.equal(activeHero(growingHigh).hp, 160);
assert.equal(growingHigh.heroes.joe.hp, 0, 'synced levels cannot inflate healing or revive benched heroes');

// Co-op caches delegate all personal supplies to the reward ledger. Opening
// cannot double-pay the host or revive a benched/downed hero before that ledger.
function openHeroCacheGate(state, chest) {
  const gate = HERO_OBSTACLES.find(entry => entry.rewardId === chest.id);
  assert.ok(gate, 'optional supply cache has its authored hero gate');
  const active = state.active;
  state.active = gate.hero; state.x = gate.x + gate.w / 2; state.y = gate.y + gate.h + 12;
  interact(state);
  assert.equal(isObstacleCleared(state, gate.id), true, 'required hero opens the shared supply-cache entrance');
  state.active = active; state.events.length = 0;
}
for (const room of [8, 9]) {
  const cacheHost = cooperative('host', 0); enterScene(cacheHost, 'dungeon', room); cacheHost.enemies = [];
  const chest = getWorld('dungeon', room).props.find(prop => prop.kind === 'chest');
  openHeroCacheGate(cacheHost, chest);
  cacheHost.x = chest.x + chest.w / 2; cacheHost.y = chest.y + chest.h / 2;
  activeHero(cacheHost).hp = 50; activeHero(cacheHost).ki = 10; cacheHost.heroes.joe.hp = 0;
  const beforeSupplies = structuredClone({ heroes: cacheHost.heroes, gear: cacheHost.gear, candy: cacheHost.candy });
  interact(cacheHost);
  assert.deepEqual({ heroes: cacheHost.heroes, gear: cacheHost.gear, candy: cacheHost.candy }, beforeSupplies);
  assert.ok(cacheHost.clearedRooms.includes(chest.id));
  assert.equal(cacheHost.events.filter(e => e.type === 'checkpoint' && e.id === chest.id).length, 1);
  interact(cacheHost);
  assert.equal(cacheHost.events.filter(e => e.type === 'checkpoint' && e.id === chest.id).length, 1, 'cache opens once');
}
const blockedDown = cooperative('host', 0); enterScene(blockedDown, 'dungeon', 9); blockedDown.enemies = [];
const unopened = getWorld('dungeon', 9).props.find(prop => prop.kind === 'chest');
openHeroCacheGate(blockedDown, unopened);
blockedDown.x = unopened.x + unopened.w / 2; blockedDown.y = unopened.y + unopened.h / 2;
activeHero(blockedDown).hp = 0; blockedDown.coop.downed = true; blockedDown.candy = 100;
const downResources = structuredClone({ heroes: blockedDown.heroes, candy: blockedDown.candy, gear: blockedDown.gear });
interact(blockedDown); restAtHome(blockedDown);
for (const item of ['heal', 'power', 'defense']) assert.equal(buyItem(blockedDown, item), false);
assert.deepEqual({ heroes: blockedDown.heroes, candy: blockedDown.candy, gear: blockedDown.gear }, downResources);
assert.deepEqual(blockedDown.clearedRooms, []); assert.deepEqual(blockedDown.areas, []); assert.deepEqual(blockedDown.events, []);
const gearedGuest = cooperative('guest', 1); gearedGuest.character = { level: 50, xp: 12 };
for (const id of HERO_IDS) gearedGuest.heroes[id] = createHero(id, gearedGuest.character);
enterScene(gearedGuest, 'realm'); activeHero(gearedGuest).hp = 130; activeHero(gearedGuest).ki = 70;
gearedGuest.heroes.joe.hp = 0;
grantGear(gearedGuest, 1, 1);
assert.deepEqual(gearedGuest.character, { level: 50, xp: 12 });
assert.deepEqual(gearedGuest.gear, { power: 1, ward: 1 });
assert.equal(activeHero(gearedGuest).level, 9); assert.equal(activeHero(gearedGuest).maxHp, 260);
assert.equal(activeHero(gearedGuest).hp, 130); assert.equal(activeHero(gearedGuest).ki, 70);
assert.equal(activeHero(gearedGuest).power, 37); assert.equal(activeHero(gearedGuest).defense, 12);
assert.equal(gearedGuest.heroes.joe.hp, 0, 'gear grants cannot revive a co-op hero');

// Migration between a remote finishing hit and the next simulation step must
// retain the pending encounter clear without re-emitting paid kill rewards.
const finishingHost = cooperative('host', 0); enterScene(finishingHost, 'dungeon', WATCHER_ROOM);
for (const e of finishingHost.enemies) assert.ok(applyCoopHit(finishingHost, { type: 'coop-hit', enemyId: e.id, damage: 100000, dx: 0, dy: 0, force: 0, attackId: `finish-${e.id}` }, 1));
const promoted = cooperative('host', 1); enterScene(promoted, 'dungeon', WATCHER_ROOM);
promoted.enemies = finishingHost.enemies.map(e => ({ ...e, hp: Math.max(0, e.hp) }));
const migratedEvents = tick(promoted);
assert.equal(migratedEvents.filter(e => e.type === 'kill').length, 0, 'a paid kill cannot replay after promotion');
assert.ok(migratedEvents.some(e => e.type === 'checkpoint' && e.id === `blast-${WATCHER_ROOM}`));
assert.ok(promoted.areas.includes('blast')); assert.ok(promoted.bosses.includes('blast-watcher'));

console.log('Wayside Fury co-op simulation: prediction/authority, migration clears, scaling, downs/revives, level sync and per-player reward metadata pass.');
