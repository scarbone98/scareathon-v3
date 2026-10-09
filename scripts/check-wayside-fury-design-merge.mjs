import assert from 'node:assert/strict';
import { newGame, enterScene, interact, interactTarget } from '../src/pages/WaysideFury/game/sim.ts';
import { mergeSaves } from '../src/pages/WaysideFury/game/cloud.ts';
import { makeSave, restoreSave, progressReport } from '../src/pages/WaysideFury/game/save.ts';
import { grantChip, equipChip, itemsState } from '../src/pages/WaysideFury/game/u1/items/chips.ts';
import { HERO_OBSTACLES, obstaclesForState } from '../src/pages/WaysideFury/game/locks/obstacles.ts';

// Item state, gate receipts and the incoming county clock must survive together.
const state = newGame();
enterScene(state, 'hub');
grantChip(state, 'iron-guard');
equipChip(state, 'iron-guard', 0);
state.u1.combat.training.you = 3;
state.worldCycleSeconds = 321;
state.hubArena = { soloBest: 42, coopBest: 17, runs: 3 };
state.relicRadar = { owned: true, enabled: true };
state.solvedInteractions.push('locks-county-danger');
const saved = makeSave(state, null);
const restored = restoreSave(saved);
assert.deepEqual(itemsState(restored), itemsState(state));
assert.equal(restored.worldCycleSeconds, 321);
assert.deepEqual(restored.hubArena, state.hubArena);
assert.deepEqual(restored.relicRadar, state.relicRadar);
assert.equal(restored.u1.combat.training.you, 3);
const stale = structuredClone(saved);
stale.u1.combat.training.you = 0;
stale.u1.items.chips.owned = [];
stale.u1.items.chips.equipped = [null, null, null];
stale.savedAt = saved.savedAt + 1;
const merged = mergeSaves(saved, stale);
assert.equal(merged.u1.combat.training.you, 3);
assert.deepEqual(merged.u1.hub.arena, state.hubArena);
assert.deepEqual(merged.u1.hub.radar, state.relicRadar);
assert.ok(merged.u1.items.chips.owned.includes("iron-guard"));
assert.equal(progressReport(restoreSave(merged), saved.lastReported).score, 0);
assert.ok(restored.solvedInteractions.includes('locks-county-danger'));
assert.equal(progressReport(restored, progressReport(state).receipt).score, 0);
const old = { ...saved };
delete old.worldCycleSeconds;
assert.equal(restoreSave(old).worldCycleSeconds, 0);
assert.deepEqual(itemsState(restoreSave(old)), itemsState(state));

// Protocol 6 peers retain the original geometry; protocol 7 sees the new gates.
enterScene(restored, 'overworld');
restored.coop = { role: 'host', seat: 0, remoteHeroes: [], appliedHits: [], protocolVersion: 6 };
assert.equal(obstaclesForState(restored).length, 0);
restored.coop.protocolVersion = 7;
assert.ok(obstaclesForState(restored).length > 0);
const gate = HERO_OBSTACLES.find(g => g.id === 'locks-county-debris');
restored.x = gate.x + gate.w / 2;
restored.y = gate.y + gate.h + 12;
assert.equal(interactTarget(restored).id, gate.id);
console.log('Design merge: item/clock/gate save parity, default clock migration, ticket dedupe and negotiated gate interactions pass.');

// Both shipped radar views use one world pickup identity.
const radarPlayer = newGame();
enterScene(radarPlayer, "hub");
radarPlayer.x = 448; radarPlayer.y = 384;
interact(radarPlayer);
assert.deepEqual(radarPlayer.relicRadar, { owned: true, enabled: true });
assert.deepEqual(itemsState(radarPlayer).radar, { owned: true, enabled: true });
interact(radarPlayer);
assert.equal(radarPlayer.events.filter(event => event.type === "item" && event.kind === "radar").length, 1);
