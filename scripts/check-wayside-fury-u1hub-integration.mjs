import assert from 'node:assert/strict';
import { newGame, enterScene, interact, idleInput, step, activeHero, createHero, HERO_IDS, syncCoopLevel } from '../src/pages/WaysideFury/game/sim.ts';
import { acceptHubQuest, claimHubQuest, trackHubCoopReward } from '../src/pages/WaysideFury/u1/hub/hubRules.ts';
import { QUESTS } from '../src/pages/WaysideFury/u1/hub/quests.ts';
import { startArena, finishArena, tickArena } from '../src/pages/WaysideFury/u1/hub/arena.ts';
import { makeSave, restoreSave, progressReport } from '../src/pages/WaysideFury/game/save.ts';
import { applyCoopReward } from '../src/pages/WaysideFury/game/coopRewards.ts';
import { cleanWorld, cleanRelay } from '../server/wayside-fury/protocol.js';
import { compatibleMap } from '../server/shared/waysideFury/campaign.js';
const s = newGame(); enterScene(s, 'hub');
for (const q of QUESTS) {
  s.x = q.npc.x; s.y = q.npc.y; interact(s);
  assert.equal(s.overlay, 'quest', `${q.npc.name} interaction reachable`);
  assert.equal(acceptHubQuest(s, q.id), true); s.overlay = null;
}
s.x = 624; s.y = 240; const hp = activeHero(s).hp = 37;
const campaignScore = progressReport(s).score; startArena(s);
assert.equal(compatibleMap('arena', 0, s.mapId, 6), true);
for (let i = 0; i < 181; i++) step(s, idleInput(), 1/60);
assert.equal(s.enemies.length, 5);
for (const e of s.enemies) assert.ok(e.hp >= activeHero(s).power * 5, 'several attacks required');
const world = { ...s, protocolVersion: 6 }; assert.ok(cleanWorld(world), 'arena accepted by relay protocol');
assert.equal(cleanWorld({ ...world, arena: { ...s.arena, wave: Infinity } }), null);
assert.equal(makeSave(s, null).heroes[s.active].hp, hp);
finishArena(s); assert.equal(progressReport(s).score, campaignScore);
const fetch = QUESTS.find(q => q.id === 'joe-bbq'); s.x = fetch.npc.x; s.y = fetch.npc.y; s.candy = 40;
assert.equal(claimHubQuest(s, fetch.id), true); assert.equal(s.candy, 22); assert.equal(claimHubQuest(s, fetch.id), false);
const saved = restoreSave(makeSave(s, null)); assert.equal(saved.hubQuests.entries.find(e => e.id === fetch.id).status, 'claimed');
const guest = newGame(); enterScene(guest, 'hub'); guest.coop = { role: 'guest', seat: 1, remoteHeroes: [], appliedHits: [], playerCount: 2 };
guest.x = 344; guest.y = 248; acceptHubQuest(guest, 'alex-patrol');
for (let i = 0; i < 8; i++) { const reward = { id: `arena-kill:${i}`, kind: 'kill', enemyKind: 'boss', xp: 0, candy: 0 }; assert.ok(applyCoopReward(guest, reward)); assert.equal(applyCoopReward(guest, reward), false); }
assert.equal(guest.hubQuests.entries[0].progress, 8); assert.equal(guest.candy, 0);
assert.equal(cleanRelay({ type: 'reward', reward: { id: 'boss:1', kind: 'kill', enemyKind: 'boss', xp: 0, candy: 0 } }).reward.enemyKind, 'boss');
assert.equal(cleanRelay({ type: 'reward', reward: { id: 'boss:1', kind: 'kill', enemyKind: 'fake', xp: 0, candy: 0 } }), null);
for (const level of [20, 1000]) { const high = newGame(); high.character = { level, xp: 0 }; high.heroes = Object.fromEntries(HERO_IDS.map(id => [id, createHero(id, high.character)])); enterScene(high,'hub'); startArena(high); tickArena(high, 3.01); assert.ok(high.enemies.every(e => e.maxHp > high.heroes[high.active].power * 3)); syncCoopLevel(high); }
// Independent event tracking never lends one player's progress to another.
const previous = guest.hubQuests.entries[0].progress; trackHubCoopReward(guest, { id: 'arena-kill:0', kind: 'kill', enemyKind: 'boss' }); assert.equal(guest.hubQuests.entries[0].progress, previous);
console.log('U1 hub integration: seven reachable NPCs, claims, saves, no campaign inflation, high-level scaling and co-op relays pass.');
