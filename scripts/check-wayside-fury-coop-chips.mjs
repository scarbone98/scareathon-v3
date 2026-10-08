import assert from 'node:assert/strict';
import { newGame, createHero, activeHero, idleInput, step, applyCoopDamage, enterScene, interact, restAtHome } from '../src/pages/WaysideFury/game/sim.ts';
import { grantChip, equipChip, chipEffects, itemsState } from '../src/pages/WaysideFury/game/u1/items/chips.ts';
import { progressReport, makeSave, restoreSave } from '../src/pages/WaysideFury/game/save.ts';
import { getWorld } from '../src/pages/WaysideFury/game/world.ts';
import { cleanHero, cleanRelay } from '../server/wayside-fury/protocol.js';

const cooperative = (role, seat) => {
  const state = newGame();
  state.coop = { role, seat, remoteHeroes: [], appliedHits: [], playerCount: 2, downed: false };
  state.enemies = []; state.projectiles = [];
  return state;
};
const peer = (state, extras = {}) => ({ seat: 1, userId: 'guest-one', name: 'Guest', hero: { ...createHero('you'), hp: 8 },
  x: 180, y: 110, faceX: -1, faceY: 0, moving: false, guard: false, attackTimer: 0, combo: 0,
  charge: 0, dashTimer: 0, scene: state.scene, room: state.room, ...extras });
const bullet = (state, target, damage = 9) => state.projectiles.push({ id: state.nextId++, x: target.x, y: target.y,
  vx: 0, vy: 0, radius: 4, damage, ttl: 1, owner: 'enemy', beam: false, hits: [] });
const hostWithLastSurvivor = extras => {
  const state = cooperative('host', 0), survivor = peer(state, extras);
  activeHero(state).hp = 0; state.coop.downed = true; state.coop.remoteHeroes = [survivor];
  return { state, survivor };
};
const hit = (state, survivor) => {
  bullet(state, survivor); step(state, idleInput(), 1 / 60);
  return state.events.find(event => event.type === 'coop-damage');
};
const guestWithChip = id => {
  const state = cooperative('guest', 1); grantChip(state, id); equipChip(state, id, 0);
  activeHero(state).hp = 8; state.events = [];
  return state;
};

const guarded = hostWithLastSurvivor({ chipDamageMultiplier: 0.88, secondWindReady: false });
const guardedDamage = hit(guarded.state, guarded.survivor);
assert.equal(guardedDamage.damage, 8, 'damage envelope retains pre-chip damage');
assert.equal(guarded.survivor.hero.hp, 1, 'host predicts Iron Guard before wiping');
assert.equal(guarded.survivor.downed, false); assert.equal(guarded.state.scene, 'test');
const guardedGuest = guestWithChip('iron-guard');
applyCoopDamage(guardedGuest, guardedDamage.damage, guardedDamage.sourceX, guardedDamage.sourceY);
assert.equal(activeHero(guardedGuest).hp, 1, 'guest scales raw damage exactly once');
assert.equal(guardedGuest.coop.downed, false);
applyCoopDamage(guardedGuest, guardedDamage.damage, guardedDamage.sourceX, guardedDamage.sourceY);
assert.equal(activeHero(guardedGuest).hp, 1, 'repeated delivery respects local invulnerability');

const wind = hostWithLastSurvivor({ chipDamageMultiplier: 1, secondWindReady: true, chipSnapshotAt: 10 });
const oldSample = structuredClone(wind.survivor);
const windDamage = hit(wind.state, wind.survivor);
assert.equal(wind.survivor.hero.hp, 35, 'host predicts the personal revive before deciding a party wipe');
assert.equal(wind.survivor.hero.invulnerable, 1.4); assert.equal(wind.survivor.downed, false);
assert.equal(wind.survivor.secondWindReady, false); assert.equal(wind.state.scene, 'test');
assert.deepEqual(wind.state.coop.remoteSecondWindSpent[1], { userId: 'guest-one', at: 10 });
const windGuest = guestWithChip('second-wind');
applyCoopDamage(windGuest, windDamage.damage, windDamage.sourceX, windDamage.sourceY);
assert.equal(activeHero(windGuest).hp, 35); assert.equal(itemsState(windGuest).chips.secondWindUsed, true);
assert.equal(chipEffects(windGuest).secondWind, false);

// Replaying an earlier ready packet cannot produce another host shadow revive.
wind.state.coop.remoteHeroes = [structuredClone(oldSample)];
assert.equal(hit(wind.state, wind.state.coop.remoteHeroes[0]), undefined, 'host keeps the revive invulnerability across stale packets');
wind.state.projectiles = []; wind.state.time += 2;
const staleSurvivor = structuredClone(oldSample); wind.state.coop.remoteHeroes = [staleSurvivor];
hit(wind.state, staleSurvivor);
assert.equal(staleSurvivor.hero.hp, 0); assert.equal(wind.state.scene, 'dead', 'spent readiness cannot repeat after invulnerability expires');

const legacy = hostWithLastSurvivor({});
hit(legacy.state, legacy.survivor);
assert.equal(legacy.survivor.hero.hp, 0); assert.equal(legacy.state.scene, 'dead', 'old peers default to no mitigation or revive');
const protocolLegacy = cleanHero(peer(cooperative('host', 0)));
assert.ok(protocolLegacy); assert.equal(protocolLegacy.chipDamageMultiplier, undefined); assert.equal(protocolLegacy.secondWindReady, undefined);
const modernPacket = peer(cooperative('host', 0), { chipDamageMultiplier: 0.88, secondWindReady: true });
const modern = cleanHero(modernPacket);
assert.equal(modern.chipDamageMultiplier, 0.88); assert.equal(modern.secondWindReady, true);
assert.equal(cleanRelay({ type: 'hero', hero: modernPacket, input: idleInput() }).hero.secondWindReady, true);
for (const invalid of [{ chipDamageMultiplier: 0.5 }, { chipDamageMultiplier: '0.88' }, { chipDamageMultiplier: NaN },
  { secondWindReady: 'true' }, { secondWindReady: 1 }]) assert.equal(cleanHero({ ...modernPacket, ...invalid }), null);
const spentPacket = cleanHero({ ...modernPacket, chipDamageMultiplier: 1, secondWindReady: false, chipSnapshotAt: 999 });
assert.equal(spentPacket.secondWindReady, false); assert.equal(spentPacket.chipSnapshotAt, undefined, 'host receipt timestamps never come from peers');

// Guests can use HOME locally while host authority still owns world travel.
const homeGuest = guestWithChip('second-wind');
applyCoopDamage(homeGuest, 8, 0, 0); assert.equal(itemsState(homeGuest).chips.secondWindUsed, true);
enterScene(homeGuest, 'hub'); homeGuest.x = 776; homeGuest.y = 256;
homeGuest.heroes.joe.hp = 0;
for (const hero of Object.values(homeGuest.heroes)) { hero.ki = 0; hero.stamina = 1; }
homeGuest.vx = 10; homeGuest.vy = 20; homeGuest.moving = true;
const personalProgress = structuredClone({ character: homeGuest.character, candy: homeGuest.candy, kills: homeGuest.kills, deaths: homeGuest.deaths });
interact(homeGuest);
assert.equal(homeGuest.overlay, 'home'); assert.equal(homeGuest.vx, 0); assert.equal(homeGuest.vy, 0); assert.equal(homeGuest.moving, false);
restAtHome(homeGuest);
assert.equal(chipEffects(homeGuest).secondWind, true, 'guest HOME recharges its personal Second Wind');
for (const hero of Object.values(homeGuest.heroes)) {
  assert.equal(hero.hp, hero.maxHp); assert.equal(hero.ki, hero.maxKi); assert.equal(hero.stamina, hero.maxStamina);
}
const firstHomeReport = progressReport(homeGuest);
assert.equal(firstHomeReport.score, 1000, 'first HOME grants only the existing Wayside area delta');
assert.deepEqual(homeGuest.clearedRooms, [], 'personal rest adds no room milestones');
homeGuest.overlay = null; activeHero(homeGuest).invulnerable = 0;
applyCoopDamage(homeGuest, 100000, 0, 0);
assert.equal(itemsState(homeGuest).chips.secondWindUsed, true);
interact(homeGuest); assert.equal(homeGuest.overlay, 'home'); restAtHome(homeGuest);
assert.equal(chipEffects(homeGuest).secondWind, true, 'a later guest rest recharges again');
assert.equal(progressReport(homeGuest, firstHomeReport.receipt).score, 0, 'later rests pay no second Wayside ticket delta');
assert.deepEqual({ character: homeGuest.character, candy: homeGuest.candy, kills: homeGuest.kills, deaths: homeGuest.deaths }, personalProgress);
homeGuest.overlay = null; activeHero(homeGuest).invulnerable = 0; applyCoopDamage(homeGuest, 100000, 0, 0);
activeHero(homeGuest).invulnerable = 0; applyCoopDamage(homeGuest, 100000, 0, 0);
assert.equal(homeGuest.coop.downed, true);
interact(homeGuest); assert.equal(homeGuest.overlay, null, 'downed guests cannot open HOME');
restAtHome(homeGuest); assert.equal(activeHero(homeGuest).hp, 0); assert.equal(itemsState(homeGuest).chips.secondWindUsed, true);

const travelGuest = cooperative('guest', 1);
enterScene(travelGuest, 'hub'); travelGuest.x = 480; travelGuest.y = 440; interact(travelGuest);
assert.equal(travelGuest.scene, 'hub', 'guest HOME access does not allow taxi travel');
enterScene(travelGuest, 'overworld'); travelGuest.x = 208; travelGuest.y = 480; interact(travelGuest);
assert.equal(travelGuest.scene, 'overworld', 'overworld world travel stays host-authoritative');
enterScene(travelGuest, 'dungeon', 0); travelGuest.enemies = [];
travelGuest.x = getWorld('dungeon', 0).width - 18; travelGuest.y = getWorld('dungeon', 0).spawn.y;
interact(travelGuest); assert.equal(travelGuest.room, 0, 'dungeon exits stay host-authoritative');

const oldBosses = ['blast-gatekeeper', 'blast-watcher'], oldCaches = ['loot-blast-8', 'loot-blast-9'];
const legacyFixture = { version: 1, chapter: 1, heroes: { joe: createHero('joe'), matt: createHero('matt') }, active: 'joe',
  party: ['joe', 'matt'], unlockedHeroes: ['joe', 'matt'], candy: 19, areas: ['wayside'], bosses: oldBosses,
  clearedRooms: oldCaches, kills: 3, deaths: 0, lastReported: { areas: ['wayside'], bosses: oldBosses, rooms: oldCaches, level: 1 }, home: null };
const restoredLegacy = restoreSave(legacyFixture);
const expectedBackfill = ['iron-guard', 'focus-lens', 'candy-magnet', 'ki-saver'];
assert.deepEqual(itemsState(restoredLegacy).chips.owned, expectedBackfill, 'old completed bosses/caches grant their new chips');
assert.deepEqual(restoredLegacy.bosses, oldBosses); assert.deepEqual(restoredLegacy.clearedRooms, oldCaches);
assert.equal(restoredLegacy.candy, legacyFixture.candy); assert.equal(restoredLegacy.kills, legacyFixture.kills);
assert.deepEqual(restoredLegacy.events, [], 'restore does not queue acquisition sounds');
assert.equal(progressReport(restoredLegacy, legacyFixture.lastReported).score, 0, 'chip backfill changes no ticket progress');
const backfilledSave = makeSave(restoredLegacy, null, false, legacyFixture.lastReported);
assert.deepEqual(backfilledSave.lastReported, legacyFixture.lastReported);
assert.deepEqual(itemsState(restoreSave(backfilledSave)).chips.owned, expectedBackfill, 'repeated restores cannot duplicate backfilled chips');
console.log('Wayside Fury co-op chips: last-survivor mitigation/revive, one-time readiness, raw damage parity and legacy/validated hero metadata pass.');
