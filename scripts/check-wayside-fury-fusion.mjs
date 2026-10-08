import assert from 'node:assert/strict';
import { newGame, enterScene, step, idleInput, nextPartyHero } from '../src/pages/WaysideFury/game/sim.ts';
import { createFusionRuntime, requestFusion, tickFusion, localFusion, consumeFusionSpecial, resetFusion, syncFusionWorld, fusionStatus, beginFusionSession,
  elapsedFusionWorld, FUSION_DURATION, FUSION_COOLDOWN, FUSION_INTENT } from '../src/pages/WaysideFury/game/u1/combat/fusion.ts';

const fresh = (role, seat = 0) => {
  const s = newGame(71); s.fusion = createFusionRuntime(); s.enemies = [];
  if (role) s.coop = { role, seat, remoteHeroes: [], appliedHits: [] };
  for (const hero of Object.values(s.heroes)) hero.ki = hero.maxKi;
  return s;
};
const peer = (s, seat = 1, overrides = {}) => ({
  seat, userId: `peer-${seat}`, name: `Peer ${seat}`, hero: structuredClone(s.heroes.joe), x: s.x + 20, y: s.y,
  faceX: 1, faceY: 0, moving: false, guard: false, attackTimer: 0, combo: 0, charge: 0, dashTimer: 0,
  scene: s.scene, room: s.room, fusionIntent: FUSION_INTENT, ...overrides,
});
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 0.00001, `${actual} differs from ${expected}`);

// Solo fuses exactly the lead and next tag partner, consumes their full Ki once,
// and can release only one special while its 12-second window is active.
const solo = fresh();
assert.equal(fusionStatus(solo).ready, true); assert.equal(requestFusion(solo), true);
assert.deepEqual(localFusion(solo).heroes, ['you', 'joe']);
assert.equal(solo.heroes.you.ki, 0); assert.equal(solo.heroes.joe.ki, 0); assert.ok(solo.heroes.matt.ki > 0);
assert.equal(solo.events.filter(event => event.type === 'fusion-start').length, 1);
assert.equal(requestFusion(solo), false); assert.equal(consumeFusionSpecial(solo), true); assert.equal(consumeFusionSpecial(solo), false);
tickFusion(solo, 11.5); near(localFusion(solo).remaining, 0.5);
tickFusion(solo, 1); assert.equal(localFusion(solo), undefined); near(solo.fusion.cooldown, FUSION_COOLDOWN - 0.5);
for (const hero of Object.values(solo.heroes)) hero.ki = hero.maxKi;
assert.equal(requestFusion(solo), false); enterScene(solo, 'dungeon', 1); assert.equal(requestFusion(solo), false);
tickFusion(solo, FUSION_COOLDOWN); assert.equal(requestFusion(solo), true);
resetFusion(solo); near(solo.fusion.cooldown, FUSION_COOLDOWN); resetFusion(solo); near(solo.fusion.cooldown, FUSION_COOLDOWN);

for (const change of [
  s => { s.heroes.you.ki--; }, s => { s.heroes.joe.ki--; }, s => { s.heroes.you.hp = 0; },
  s => { s.heroes.joe.hp = 0; }, s => { s.party = ['you']; }, s => { s.scene = 'hub'; },
]) {
  const s = fresh(); change(s); assert.equal(requestFusion(s), false); assert.equal(s.fusion.world.forms.length, 0);
}
const changedLead = fresh(); changedLead.party = ['you', 'joe', 'matt']; changedLead.active = 'joe';
assert.equal(requestFusion(changedLead), true); assert.deepEqual(localFusion(changedLead).heroes, ['joe', 'matt']);
const livingTag = fresh(); livingTag.party = ['you', 'joe', 'matt']; livingTag.heroes.joe.hp = 0;
assert.equal(nextPartyHero(livingTag), 'matt'); assert.equal(requestFusion(livingTag), true);
assert.deepEqual(localFusion(livingTag).heroes, ['you', 'matt'], 'fusion matches the tag HUD and skips a downed partner');
const futureArena = fresh(); futureArena.scene = 'arena'; assert.equal(requestFusion(futureArena), true);

// Exercise the production Input/step path, including simultaneous swap, held
// fusion throughout recovery, and Ki press/release using the special only once.
const frame = (s, input = {}, delta = 1 / 60) => { step(s, { ...idleInput(), ...input }, delta); return [...s.events]; };
const inputSolo = fresh();
assert.equal(frame(inputSolo, { fusion: true, swap: true }).filter(event => event.type === 'fusion-start').length, 1);
assert.equal(inputSolo.active, 'you', 'swap on the fusion activation frame is locked');
assert.equal(frame(inputSolo, { fusion: true, swap: true }).filter(event => event.type === 'fusion-start').length, 0);
assert.equal(inputSolo.active, 'you', 'held swap cannot change the fused lead');
frame(inputSolo, { fusion: true, ki: true });
const release = frame(inputSolo, { fusion: true });
assert.equal(release.filter(event => event.type === 'fusion-special').length, 1);
assert.equal(inputSolo.projectiles.length, 3); assert.ok(inputSolo.projectiles.every(projectile => projectile.beam && projectile.damage === inputSolo.heroes.you.power * 5));
inputSolo.projectiles = []; frame(inputSolo, { fusion: true, ki: true });
assert.equal(frame(inputSolo, { fusion: true }).filter(event => event.type === 'fusion-special').length, 0);
assert.equal(inputSolo.projectiles.length, 0, 'releasing Ki again cannot recreate the fusion special');
for (let f = 0; f < Math.ceil((FUSION_DURATION + FUSION_COOLDOWN + 1) / 0.05); f++) frame(inputSolo, { fusion: true }, 0.05);
assert.equal(localFusion(inputSolo), undefined); assert.equal(fusionStatus(inputSolo).ready, true);
assert.equal(inputSolo.fusion.world.nextId, 2, 'held fusion never activates again after expiry and recovery');
frame(inputSolo); assert.equal(frame(inputSolo, { fusion: true }).filter(event => event.type === 'fusion-start').length, 1);
const inputGuest = fresh('guest', 1); frame(inputGuest, { fusion: true });
for (let f = 0; f < 90; f++) frame(inputGuest, { fusion: true });
assert.equal(inputGuest.fusion.intent, 0, 'held guest input cannot keep consent fresh forever'); assert.equal(inputGuest.fusion.world.forms.length, 0);

// Both co-op seats consent in the short window, remain in the same scene/room,
// and meet the inclusive 32-unit range. The host also pairs two remote seats.
const host = fresh('host'); host.coop.remoteHeroes = [peer(host, 1, { x: host.x + 32, fusionIntent: 0 })];
assert.equal(requestFusion(host), true); assert.equal(localFusion(host), undefined); assert.ok(host.heroes.you.ki > 0);
host.coop.remoteHeroes[0].fusionIntent = FUSION_INTENT; tickFusion(host, 1 / 60);
assert.deepEqual(localFusion(host).seats, [0, 1]); assert.equal(host.heroes.you.ki, 0); assert.equal(host.coop.remoteHeroes[0].hero.ki, 0);
assert.equal(consumeFusionSpecial(host), true);
for (const change of [
  remote => { remote.x += 12.01; }, remote => { remote.room++; }, remote => { remote.scene = 'realm'; },
  remote => { remote.hero.ki--; }, remote => { remote.hero.hp = 0; }, remote => { remote.downed = true; },
  remote => { remote.fusionIntent = 0; }, remote => { remote.x = NaN; },
]) {
  const s = fresh('host'); const remote = peer(s); change(remote); s.coop.remoteHeroes = [remote];
  requestFusion(s); tickFusion(s, 1 / 60); assert.equal(s.fusion.world.forms.length, 0);
}
const stale = fresh('host'); stale.coop.remoteHeroes = [peer(stale)]; tickFusion(stale, 1.3);
requestFusion(stale); assert.equal(stale.fusion.world.forms.length, 0, 'cached consent expires even without a new peer packet');
const remotePair = fresh('host'); remotePair.coop.remoteHeroes = [peer(remotePair, 2), peer(remotePair, 1)];
tickFusion(remotePair, 1 / 60); assert.deepEqual(remotePair.fusion.world.forms[0].seats, [1, 2]);
assert.equal(localFusion(remotePair), undefined); assert.ok(remotePair.heroes.you.ki > 0);
const four = fresh('host'); four.coop.remoteHeroes = [peer(four, 3), peer(four, 2), peer(four, 1)];
requestFusion(four); assert.deepEqual(four.fusion.world.forms.map(form => form.seats), [[0, 1], [2, 3]]);

// Guests never create forms or spend Ki before an authoritative activation.
// Repeated snapshots cannot spend recharged Ki or restore a spent special.
const guest = fresh('guest', 1); guest.coop.remoteHeroes = [peer(guest, 0, { hero: structuredClone(guest.heroes.you) })];
assert.equal(requestFusion(guest), true); tickFusion(guest, 0.1); assert.equal(guest.fusion.world.forms.length, 0); assert.ok(guest.heroes.you.ki > 0);
const authoritative = structuredClone(host.fusion.world); authoritative.forms[0].heroes[1] = 'you';
assert.equal(syncFusionWorld(guest, authoritative), true); assert.equal(guest.heroes.you.ki, 0);
guest.heroes.you.ki = guest.heroes.you.maxKi; syncFusionWorld(guest, authoritative); assert.ok(guest.heroes.you.ki > 0);
assert.equal(guest.events.filter(event => event.type === 'fusion-start').length, 1); assert.equal(consumeFusionSpecial(guest), false, 'the second participant does not release a second special');

const leadGuest = fresh('guest', 1); leadGuest.coop.remoteHeroes = [peer(leadGuest, 2)];
const guestWorld = structuredClone(remotePair.fusion.world); guestWorld.forms[0].heroes[0] = 'you';
syncFusionWorld(leadGuest, guestWorld); leadGuest.coop.remoteHeroes = []; tickFusion(leadGuest, 0.1);
assert.ok(localFusion(leadGuest), 'a guest retains the host form while peer packets are unavailable');
assert.equal(consumeFusionSpecial(leadGuest), true, 'host-granted guest lead special does not depend on interpolated peer presence');
assert.equal(leadGuest.fusion.specialRequest, guestWorld.forms[0].id);
syncFusionWorld(leadGuest, guestWorld); assert.equal(localFusion(leadGuest).specialUsed, true); assert.equal(consumeFusionSpecial(leadGuest), false);
leadGuest.heroes.you.hp = 0; assert.equal(localFusion(leadGuest), undefined);
assert.equal(leadGuest.fusion.world.forms.length, 1, 'guest gameplay buffs hide on own death while the authoritative form remains stored');
leadGuest.heroes.you.hp = leadGuest.heroes.you.maxHp;
remotePair.coop.remoteHeroes.find(remote => remote.seat === 1).fusionSpecial = guestWorld.forms[0].id;
tickFusion(remotePair, 1 / 60); assert.equal(remotePair.fusion.world.forms[0].specialUsed, true);

// Death, disconnect and scene changes terminate the form and retain cooldown;
// a guest leaving co-op cannot bypass recovery by changing its seat to solo 0.
for (const change of [
  s => { s.coop.remoteHeroes = []; }, s => { s.coop.remoteHeroes[0].hero.hp = 0; },
  s => { s.coop.remoteHeroes[0].room++; }, s => { s.heroes.you.hp = 0; },
]) {
  const s = fresh('host'); s.coop.remoteHeroes = [peer(s)]; requestFusion(s); change(s); tickFusion(s, 0.1);
  assert.equal(s.fusion.world.forms.length, 0); near(s.fusion.cooldown, FUSION_COOLDOWN);
}
resetFusion(leadGuest); delete leadGuest.coop; leadGuest.heroes.you.ki = leadGuest.heroes.you.maxKi;
assert.equal(requestFusion(leadGuest), false); near(leadGuest.fusion.cooldown, FUSION_COOLDOWN);
const previousSolo = fresh(); requestFusion(previousSolo); resetFusion(previousSolo);
previousSolo.coop = { role: 'guest', seat: 1, remoteHeroes: [], appliedHits: [] };
beginFusionSession(previousSolo); near(previousSolo.fusion.cooldown, FUSION_COOLDOWN);
tickFusion(previousSolo, FUSION_COOLDOWN); previousSolo.heroes.you.ki = previousSolo.heroes.you.maxKi;
syncFusionWorld(previousSolo, guestWorld); assert.equal(previousSolo.heroes.you.ki, 0, 'new host IDs cannot collide with a previous solo activation ledger');
assert.equal(syncFusionWorld(guest, { nextId: NaN, forms: [], cooldowns: {} }), false);
const cached = structuredClone(guestWorld), cachedCopy = structuredClone(cached);
near(elapsedFusionWorld(cached, 2).forms[0].remaining, cached.forms[0].remaining - 2);
const atExpiry = elapsedFusionWorld(cached, cached.forms[0].remaining);
assert.equal(atExpiry.forms.length, 0); near(atExpiry.cooldowns[1], FUSION_COOLDOWN);
const delayed = elapsedFusionWorld(cached, cached.forms[0].remaining + 8);
assert.equal(delayed.forms.length, 0); near(delayed.cooldowns[1], FUSION_COOLDOWN - 8);
near(elapsedFusionWorld(cached, 100_000).cooldowns[1], 0); assert.deepEqual(cached, cachedCopy, 'elapsed snapshot calculations do not mutate the cached host data');
for (const elapsed of [-1, NaN, Infinity]) assert.equal(elapsedFusionWorld(cached, elapsed), null);
const dropped = fresh('guest', 1); syncFusionWorld(dropped, cached);
for (let elapsed = 0; elapsed < FUSION_DURATION + FUSION_COOLDOWN + 1; elapsed += 0.05) {
  tickFusion(dropped, 0.05); syncFusionWorld(dropped, elapsedFusionWorld(cached, elapsed + 0.05));
}
assert.equal(dropped.fusion.world.forms.length, 0); near(dropped.fusion.cooldown, 0);
assert.equal(FUSION_DURATION, 12);
console.log('Wayside Fury fusion: solo/tag rules, nearby consent, host pairings, guest authority, one special, expiry and cooldown pass.');
