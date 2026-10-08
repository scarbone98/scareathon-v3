import assert from 'node:assert/strict';
import { newGame, createHero, activeHero, idleInput, step, applyCoopDamage } from '../src/pages/WaysideFury/game/sim.ts';
import { grantChip, equipChip, chipEffects, itemsState } from '../src/pages/WaysideFury/game/u1/items/chips.ts';
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
console.log('Wayside Fury co-op chips: last-survivor mitigation/revive, one-time readiness, raw damage parity and legacy/validated hero metadata pass.');
