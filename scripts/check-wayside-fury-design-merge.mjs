import assert from 'node:assert/strict';
import { newGame, enterScene, interactTarget } from '../src/pages/WaysideFury/game/sim.ts';
import { makeSave, restoreSave, progressReport } from '../src/pages/WaysideFury/game/save.ts';
import { grantChip, equipChip, itemsState } from '../src/pages/WaysideFury/game/u1/items/chips.ts';
import { HERO_OBSTACLES, obstaclesForState } from '../src/pages/WaysideFury/game/locks/obstacles.ts';

// Item state, gate receipts and the incoming county clock must survive together.
const state = newGame();
enterScene(state, 'hub');
grantChip(state, 'iron-guard');
equipChip(state, 'iron-guard', 0);
state.worldCycleSeconds = 321;
state.solvedInteractions.push('locks-county-danger');
const saved = makeSave(state, null);
const restored = restoreSave(saved);
assert.deepEqual(itemsState(restored), itemsState(state));
assert.equal(restored.worldCycleSeconds, 321);
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
