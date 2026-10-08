import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { AREAS, CHAPTERS, canEnter, campaignLocations, getMap, sameCampaignMap } from '../src/pages/WaysideFury/game/campaign.ts';
import { newGame, enterScene, enterCampaignMap, interact, interactTarget, idleInput, step, HERO_IDS } from '../src/pages/WaysideFury/game/sim.ts';
import { ALL_WORLDS, BLAST_WORLDS, HUB_WORLD, REALM_WORLD, isBlocked } from '../src/pages/WaysideFury/game/world.ts';
import { makeSave, restoreSave } from '../src/pages/WaysideFury/game/save.ts';
import { CAMPAIGN_MAPS, CHAPTER_REWARDS, COOP_PROTOCOL_VERSION, compatibleMap } from '../server/shared/waysideFury/campaign.js';
import { sanitizeSave, ticketDelta, receiptTotalScore, MAX_MILESTONES, MAX_SAVE_BYTES } from '../server/shared/waysideFury/save.js';
import { cleanWorld, cleanHero } from '../server/wayside-fury/protocol.js';
import { createRoomManager } from '../server/wayside-fury/rooms.js';

assert.equal(BLAST_WORLDS.length, 10);
assert.deepEqual(CHAPTERS.map(chapter => chapter.id), ['blast', 'woods', 'space', 'city', 'finale']);
for (const registry of [AREAS, CHAPTERS, CAMPAIGN_MAPS]) assert.equal(new Set(registry.map(entry => entry.id)).size, registry.length);
assert.deepEqual(ALL_WORLDS.map(map => map.id), CAMPAIGN_MAPS.map(map => map.id));
// Pre-extraction geometry hashes include every tile, footprint, prop, road and
// encounter. Exit destinations intentionally change only at the coda handoff.
const hashes = [
  'a4aa5db2728dbbada3496b065cea20125c8bbabd1ebc957c4020171460396270',
  'ffd29900e657244adfc5fc104d098c5f3cdb0728ebced3c28e25d75546aea5a6',
  '3573a15d79082ec2e77f799306d3e121276445692ce62d5c2428ab874e308f94',
  'd4c5a3f6a820eae75bc3539990841b330b6be733854dce35c4763876412c233b',
  'a93b7df53b18b697bbe5fb729458397e3ba1cb1e764de0136eea5dbcb1ca33ad',
  '4b9a299aa4ca2bce9e1986e3dda83afcb9e517e20333db5d74ba280064b17877',
  '38c8c2d7013232ad8b7d833aeb95d1cd66490c6debd569df2dba8068490c87c8',
  'c078d5cf321feeef330e2c3fc52c4353ef55e819e8747d98f80c37722f2e88d8',
  'c3ced219650f6c5a132c370385237de22df58e5dd8685390901e65f20722ddae',
  '42dbecffac1418f4d6e36a06107da3e666ec6545aa794d63f93983e109b89b9b',
  '802e692e4216493ef6cf13d83817b3c0804ea5d21b8c18f71a05d307cc9e7dc4',
  '5c9e472f08ccf13dbe456d855f1f2b7695922dd70969c79e61aae1cd9acd23f4',
  'f3923cf123ff8b0e4a18b00fdc2a2592fbdba98ae477bc86a0c0f04ec9b3d189',
  'e73f9f2f9ee14f3df6bf444c442c9dbf9159babfce81cc092837b072cf13f15b',
];
for (const [index, world] of ALL_WORLDS.slice(0,14).entries()) {
  const { exits, ...geometry } = world;
  if (index !== 0) assert.equal(createHash('sha256').update(JSON.stringify(geometry)).digest('hex'), hashes[index], world.id);
  else { assert.equal(world.width,1920); assert.equal(world.height,960); }
  assert.ok(!isBlocked(world, world.spawn.x, world.spawn.y));
  for (const exit of exits) {
    const destination = getMap(exit.targetMapId);
    assert.ok(destination, `${world.id}/${exit.id} names a registered map`);
    assert.ok(!isBlocked(destination, exit.entryX, exit.entryY), `${world.id}/${exit.id} has a safe destination`);
  }
}
assert.equal(AREAS.find(area => area.id === 'space').renderer, 'space');
for (const id of ['woods', 'city', 'finale']) assert.equal(AREAS.find(area => area.id === id).renderer, 'shared-2d');
const state = newGame();
assert.equal(canEnter(state, 'forest'), false); assert.equal(canEnter(state, 'unknown'), false);
const visitor = newGame();
visitor.coop = { role: 'guest', seat: 1, remoteHeroes: [], appliedHits: [], worldClearedRooms: ['realm-0'] };
assert.equal(canEnter(visitor, 'forest'), true, 'late join uses shared gate permissions');
assert.deepEqual(visitor.clearedRooms, [], 'host gates never grant personal story receipts');
assert.deepEqual(makeSave(visitor, null).campaignMilestones, [], 'shared permissions stay transient');
state.bosses.push('blast-watcher'); state.clearedRooms.push('realm-0');
assert.equal(canEnter(state, 'forest'), true); assert.equal(canEnter(state, 'city'), false);
assert.equal(campaignLocations(state).find(location => location.id === 'forest').locked, false);
assert.equal(sameCampaignMap({ scene: 'dungeon', room: 0, mapId: 'woods-pump-house' }, { scene: 'dungeon', room: 0 }), false, 'legacy room zero cannot alias a new map');
assert.equal(sameCampaignMap({ scene: 'dungeon', room: 0, mapId: 'blast-0' }, { scene: 'dungeon', room: 0 }), true);
assert.equal(enterCampaignMap(state, 'unknown-map'), false); assert.equal(state.scene, 'hub');
assert.match(state.notice, /Unknown area/); assert.equal(state.mapId, 'hub');
for (const id of HERO_IDS) {
  state.active = id; state.party = [id]; enterScene(state, 'realm');
  state.x = REALM_WORLD.width - 64; state.y = REALM_WORLD.spawn.y;
  assert.equal(interactTarget(state).id, 'east'); interact(state);
  assert.equal(state.scene, 'hub'); assert.equal(state.chapter, 2); assert.match(state.notice, /Hollow Woods/);
  assert.equal(state.x, HUB_WORLD.spawn.x); assert.equal(state.y, HUB_WORLD.spawn.y);
}
// Named exits go through the same guarded router as overworld travel.
enterScene(state, 'dungeon');
const unknownExit = { ...BLAST_WORLDS[0].exits[0], id: 'unknown-exit', targetMapId: 'unregistered-area' };
BLAST_WORLDS[0].exits.push(unknownExit);
try {
  interact(state, { id: unknownExit.id, name: unknownExit.name, kind: 'use', x: state.x, y: state.y });
  assert.equal(state.mapId, 'hub'); assert.match(state.notice, /Unknown area/);
} finally { BLAST_WORLDS[0].exits.pop(); }
enterScene(state, 'overworld'); state.x = 656; state.y = 176;
interact(state); assert.equal(state.scene, 'overworld'); assert.match(state.dialogue.lines[0], /coming next/);
assert.ok(!state.areas.includes('woods'), 'stub never grants an area receipt');

const current = makeSave(state, null, true);
for (const version of [1, 2, 3, 4]) {
  const fixture = structuredClone(current); fixture.version = version;
  fixture.party = ['alex', 'jon']; fixture.active = 'alex';
  if (version < 3) {
    fixture.heroes = { joe: fixture.heroes.joe, matt: fixture.heroes.matt };
    fixture.active = 'matt'; fixture.unlockedHeroes = ['joe', 'matt'];
    fixture.home.heroes = fixture.heroes; fixture.home.active = 'joe';
  }
  const migrated = sanitizeSave(fixture).save;
  assert.ok(migrated, `v${version} migrates`); assert.equal(migrated.version, 4);
  assert.deepEqual(Object.keys(migrated.heroes), HERO_IDS);
  if (version >= 3) { assert.equal(migrated.active, 'alex'); assert.deepEqual(migrated.party, ['alex', 'jon']); }
  assert.ok(migrated.campaignMilestones.includes('realm-0'));
  const continued = restoreSave(migrated), retry = restoreSave(migrated, true);
  assert.equal(continued.scene, 'hub'); assert.equal(retry.scene, 'hub');
  assert.match(continued.notice, /Hollow Woods/); assert.deepEqual(retry.clearedRooms, migrated.clearedRooms);
}
const forgedCheckpoint = sanitizeSave({ ...current, checkpointMapId: 'moon-m01' }).save;
assert.equal(forgedCheckpoint.checkpointMapId, 'hub');
assert.equal(sanitizeSave({ ...current, checkpointMapId: 'blast-2' }).save.checkpointMapId, 'hub');
const resume = sanitizeSave({ ...current, checkpointMapId: 'blast-2', clearedRooms: [...current.clearedRooms, 'blast-2'] }).save;
assert.equal(restoreSave(resume).mapId, 'blast-2'); assert.equal(restoreSave(resume, true).mapId, 'hub');
const full = { ...current, campaignMilestones: Array.from({ length: MAX_MILESTONES }, (_, i) => `campaign-${i}`),
  solvedInteractions: Array.from({ length: MAX_MILESTONES }, (_, i) => `obstacle-${i}`),
  completedCinematics: Array.from({ length: MAX_MILESTONES }, (_, i) => `film-${i}`) };
assert.ok(new TextEncoder().encode(JSON.stringify(full)).length < MAX_SAVE_BYTES);
assert.equal(sanitizeSave(full).save.solvedInteractions.length, MAX_MILESTONES);
const receipt = { areas: ['wayside', 'blast', 'eightbit-realm'], rooms: BLAST_WORLDS.map(map => map.id).concat('realm-0'), bosses: [], level: 1 };
assert.equal(receiptTotalScore(receipt), 3550); assert.equal(ticketDelta(receipt), 3550);
assert.equal(CHAPTER_REWARDS.reduce((sum, reward) => sum + reward.tickets, 0), 3550);
assert.equal(ticketDelta(receipt, receipt), 0);
assert.equal(ticketDelta({ ...receipt, areas: [...receipt.areas, 'moon', 'forged-area'], rooms: [...receipt.rooms, 'blast-999', 'realm-999', 'moon-m01'] }, receipt), 0);
const before = makeSave(state, current); step(state, idleInput(), 1 / 60);
assert.equal(ticketDelta(makeSave(state, before).lastReported, before.lastReported), 0);

const world = { scene: 'dungeon', room: 0, mapId: 'blast-0', protocolVersion: COOP_PROTOCOL_VERSION,
  time: 1, x: 56, y: 192, enemies: [], projectiles: [], palette: 'real', transitionTarget: null,
  transitionPalette: 'real', cutscene: 0, sceneTimer: 0, clearedRooms: [], areas: [], bosses: [], chapter: 1, rngSeed: 1, nextId: 1 };
assert.ok(cleanWorld(world));
assert.ok(cleanWorld({ ...world, mapId: 'moon-m01' }));
assert.equal(cleanWorld({ ...world, mapId: 'moon-m01', protocolVersion: 2 }), null);
assert.equal(cleanWorld({ ...world, mapId: 'hub' }), null);
assert.equal(cleanWorld({ ...world, mapId: null }), null);
assert.equal(cleanWorld({ ...world, room: 999, mapId: undefined }), null);
assert.equal(cleanWorld({ ...world, protocolVersion: 999 }), null);
assert.equal(cleanWorld({ ...world, solvedInteractions: Array(129).fill('a') }), null);
assert.equal(cleanHero({ hero: state.heroes.you, scene: 'dungeon', room: 0, mapId: 'unregistered' }), null);
assert.equal(compatibleMap('dungeon', 0, 'moon-m01', 1), false);
const rooms = createRoomManager();
const socket = () => ({ readyState: 1, sent: [], send(data) { this.sent.push(JSON.parse(data)); }, close() { this.readyState = 3; } });
const auth = (id, version) => {
  const peer = socket(); rooms.auth(peer, { ticket: rooms.issueTicket({ userId: id, name: id }), protocolVersion: version }); return peer;
};
try {
  const modern = auth('modern', 2), legacy = auth('legacy', 1), room = rooms.create(modern);
  rooms.join(legacy, { code: room.code });
  assert.equal(modern.sent.filter(message => message.type === 'room').at(-1).protocolVersion, 1);
  rooms.relay(modern, { type: 'state', state: world });
  assert.ok(legacy.sent.some(message => message.type === 'state'));
  assert.throws(() => rooms.relay(modern, { type: 'state', state: { ...world, mapId: 'moon-m01' } }), /version/);
  assert.throws(() => auth('future-client', 999), /version/);
  rooms.leave(legacy);
  assert.equal(modern.sent.filter(message => message.type === 'room').at(-1).protocolVersion, 2);
} finally { rooms.close(); }
console.log('Campaign foundation: unchanged Chapter 1 dungeon geometry, expanded county, gates/handoff, five solo heroes, v1-v4/HOME migration, checkpoint safety, bounded saves, ticket allowlist/replay and mixed-version co-op pass.');
