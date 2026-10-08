import assert from 'node:assert/strict';
import { QUESTS, createQuestSave, acceptQuest, progressQuests, progressQuestSnapshot, claimQuest, acknowledgeQuestChip, questStatus, questProgress } from '../src/pages/WaysideFury/u1/hub/quests.ts';
import { HUB_QUEST_RULES } from '../server/shared/waysideFury/u1HubQuests.js';
import { applyPendingHubChips, registerHubChipGrant } from '../src/pages/WaysideFury/u1/hub/rewardAdapter.ts';

const context = (patch = {}) => ({ candy: 0, kills: 0, bosses: [], clearedRooms: [], ...patch });
assert.ok(QUESTS.length >= 6, 'the hub offers at least six distinct NPC quests');
assert.ok(QUESTS.some(q => q.objective.type === 'fetch') && QUESTS.some(q => q.objective.type === 'hunt'));
assert.ok(QUESTS.every(q => q.dialogue.length >= 2 && q.npc.name && !q.dialogue.join(' ').includes('[Interact]')));
for (const quest of QUESTS) {
  assert.equal(quest.objective.type, HUB_QUEST_RULES[quest.id].kind, 'client and server share one objective kind catalog');
  assert.equal(quest.objective.amount, HUB_QUEST_RULES[quest.id].amount, 'client and server share one objective catalog');
  assert.deepEqual(quest.rewards, HUB_QUEST_RULES[quest.id].rewards, 'client and server share one reward catalog');
}

const oldSave = createQuestSave();
assert.deepEqual(oldSave, { entries: [], cosmetics: [], pendingChips: [], seenEvents: [] }, 'old saves get independent empty quest progress');
const bad = createQuestSave({ entries: [{ id: 'made-up', status: 'claimed' }, { id: 'alex-patrol', status: 'active', progress: Infinity, eventProgress: -20, baseline: { kills: NaN, bosses: ['evil'.repeat(500)] } }], cosmetics: ['unknown-outfit'], pendingChips: [{ id: 'scanner', source: 'unknown' }], seenEvents: [null, '<script>'] });
assert.equal(bad.entries.length, 1); assert.equal(bad.entries[0].progress, 0); assert.equal(bad.entries[0].eventProgress, 0); assert.equal(bad.entries[0].baseline.kills, 0);
assert.deepEqual(bad.cosmetics, []); assert.deepEqual(bad.pendingChips, []); assert.deepEqual(bad.seenEvents, []);

const hunt = QUESTS.find(q => q.id === 'alex-patrol');
let save = acceptQuest(oldSave, hunt.id, context({ kills: 12 }));
assert.equal(questStatus(save, hunt.id, context()), 'active');
assert.equal(save.entries[0].baseline.kills, 12, 'old kills do not satisfy a new hunt');
assert.equal(acceptQuest(save, hunt.id, context({ kills: 200 })), save, 'accept is idempotent and cannot reset a baseline');
assert.equal(acceptQuest(save, 'made-up', context()), save);
assert.equal(claimQuest(save, hunt.id, context()).claimed, false, 'unfinished hunts give nothing');
assert.equal(claimQuest(save, hunt.id, context()).save, save);
const accepted = structuredClone(save);
save = progressQuests(save, { id: 'room-a:enemy-1', type: 'kill' });
assert.equal(save.entries[0].progress, 1); assert.deepEqual(accepted.entries[0].progress, 0, 'progress returns a fresh save');
assert.equal(progressQuests(save, { id: 'room-a:enemy-1', type: 'kill' }), save, 'replayed co-op kills do not progress twice');
save = progressQuestSnapshot(save, context({ kills: 13 }));
assert.equal(save.entries[0].progress, 1, 'snapshot and event for the same kill are not additive');
save = progressQuests(save, { id: 'room-a:enemy-2', type: 'kill' });
assert.equal(save.entries[0].progress, 2);
save = progressQuestSnapshot(save, context({ kills: 12 + hunt.objective.amount }));
assert.equal(questStatus(save, hunt.id, context()), 'ready');
const reward = claimQuest(save, hunt.id, context({ candy: 5 }));
assert.equal(reward.claimed, true); assert.equal(reward.candy, 5 + hunt.rewards.candy);
assert.deepEqual(reward.save.pendingChips, [{ id: hunt.rewards.chip, source: `u8:${hunt.id}` }]);
assert.equal(claimQuest(reward.save, hunt.id, context({ candy: reward.candy })).claimed, false, 'a reward is granted once');
assert.equal(claimQuest(reward.save, hunt.id, context({ candy: reward.candy })).candy, reward.candy);
const reloaded = createQuestSave(JSON.parse(JSON.stringify(reward.save)));
assert.equal(questStatus(reloaded, hunt.id, context()), 'claimed');
assert.equal(claimQuest(reloaded, hunt.id, context()).claimed, false, 'claim receipt survives save/reload');
assert.deepEqual(acknowledgeQuestChip(reloaded, `u8:${hunt.id}`).pendingChips, []);
assert.equal(applyPendingHubChips({}, reloaded), reloaded, 'missing U1 adapter retains durable pending rewards');
assert.equal(applyPendingHubChips({}, reloaded, () => false), reloaded, 'failed chip grants remain pending');
assert.equal(applyPendingHubChips({}, reloaded, () => { throw new Error('adapter unavailable'); }), reloaded);
const grants = [], unregister = registerHubChipGrant((state, id, source) => { grants.push({ id, source }); return true; });
const delivered = applyPendingHubChips({}, reloaded);
assert.deepEqual(delivered.pendingChips, []); assert.deepEqual(grants, reloaded.pendingChips);
assert.equal(applyPendingHubChips({}, delivered), delivered); assert.equal(grants.length, 1, 'acknowledged reward is not delivered twice');
unregister();
assert.equal(applyPendingHubChips({}, reloaded), reloaded, 'unregister returns to the pending-only state');

const fetch = QUESTS.find(q => q.id === 'joe-bbq');
let fetchSave = acceptQuest(createQuestSave(), fetch.id, context({ candy: 40 }));
assert.equal(questProgress(fetchSave, fetch, context({ candy: 40 })), fetch.objective.amount);
assert.equal(questStatus(fetchSave, fetch.id, context({ candy: 0 })), 'active', 'spent candy is not fetch progress');
assert.equal(claimQuest(fetchSave, fetch.id, context({ candy: fetch.objective.amount - 1 })).claimed, false);
const fetchReward = claimQuest(fetchSave, fetch.id, context({ candy: 40 }));
assert.equal(fetchReward.candy, 40 - fetch.objective.amount + fetch.rewards.candy, 'fetch delivery consumes exactly its stated candy');
assert.ok(fetchReward.save.cosmetics.includes(fetch.rewards.cosmetic));
assert.equal(claimQuest(fetchReward.save, fetch.id, context({ candy: 40 })).claimed, false);
fetchSave = progressQuestSnapshot(fetchSave, context({ candy: 40 }));
assert.equal(fetchSave.entries[0].progress, fetch.objective.amount);
fetchSave = progressQuestSnapshot(fetchSave, context({ candy: 0 }));
assert.equal(fetchSave.entries[0].progress, 0, 'fetch display follows current inventory');

const host = acceptQuest(createQuestSave(), hunt.id, context());
const guest = acceptQuest(createQuestSave(), hunt.id, context());
const hostProgress = progressQuests(host, { id: 'host:enemy-1', type: 'kill' });
assert.equal(hostProgress.entries[0].progress, 1); assert.equal(guest.entries[0].progress, 0, 'co-op quests belong to each player');
assert.equal(progressQuests(createQuestSave(), { id: 'pre-accept', type: 'kill' }).entries.length, 0, 'events before acceptance do not create progress');
const roomQuest = QUESTS.find(q => q.objective.type === 'clear');
let roomSave = acceptQuest(createQuestSave(), roomQuest.id, context({ clearedRooms: ['blast-0'] }));
roomSave = progressQuestSnapshot(roomSave, context({ clearedRooms: ['blast-0', 'blast-1', 'loot-orchard'] }));
assert.equal(roomSave.entries[0].progress, 1, 'old clears and supply caches are not new cleared zones');
roomSave = progressQuests(roomSave, { id: 'replayed-zone', type: 'room-clear', targetId: 'blast-0' });
assert.equal(roomSave.entries[0].progress, 1, 'an old room cannot be repeated as new progress');

console.log(`Wayside Fury hub quests: ${QUESTS.length} NPC quests; migration, progress, co-op isolation, fetch consumption and one-time rewards pass.`);
