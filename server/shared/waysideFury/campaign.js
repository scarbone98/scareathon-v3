// Shared identity/protocol and economy policy. New content must be registered here
// before the server accepts it; unknown IDs never inherit legacy room rewards.
export const CAMPAIGN_CONTENT_VERSION = 1;
export const COOP_PROTOCOL_VERSION = 2;
export const CAMPAIGN_MAPS = Object.freeze([
    { id: 'overworld', scene: 'overworld', room: 0, areaId: 'county', minProtocol: 1 },
    { id: 'hub', scene: 'hub', room: 0, areaId: 'wayside', minProtocol: 1 },
    ...Array.from({ length: 10 }, (_, room) => ({ id: `blast-${room}`, scene: 'dungeon', room, areaId: 'blast', minProtocol: 1 })),
    { id: 'realm-0', scene: 'realm', room: 0, areaId: 'eightbit-realm', minProtocol: 1 },
    { id: 'training', scene: 'test', room: 0, areaId: 'training', minProtocol: 1 },
].map(Object.freeze));
export function mapDefinition(id) { return CAMPAIGN_MAPS.find(map => map.id === id); }
export function legacyMapId(scene, room = 0) {
    return CAMPAIGN_MAPS.find(map => map.scene === scene && map.room === room)?.id ??
        (['prologue', 'shift', 'results', 'dead'].includes(scene) && room <= 9 ? (room ? `blast-${room}` : 'training') : undefined);
}
export function compatibleMap(scene, room, mapId, protocol = 1) {
    const canonical = legacyMapId(scene, room);
    const id = mapId ?? canonical;
    const map = mapDefinition(id);
    return !!map && map.minProtocol <= protocol &&
        ((['prologue', 'shift', 'results', 'dead'].includes(scene) && map.room === room) || canonical === id || (protocol >= 2 && map.scene === scene && map.room === room));
}
// These are existing Chapter 1 awards only. New chapter budgets are explicit
// additions, never a prefix match or a payment for entering an arbitrary area.
export const CHAPTER_REWARDS = Object.freeze([
    ...['wayside', 'blast', 'eightbit-realm'].map(id => ({ id, receipt: 'areas', tickets: 1000 })),
    ...CAMPAIGN_MAPS.filter(map => map.scene === 'dungeon' || map.scene === 'realm')
        .map(map => ({ id: map.id, receipt: 'rooms', tickets: 50 })),
].map(Object.freeze));
export function chapterRewardScore(receipt, before = {}) {
    return CHAPTER_REWARDS.reduce((total, reward) => total +
        (receipt[reward.receipt]?.includes(reward.id) && !before[reward.receipt]?.includes(reward.id) ? reward.tickets : 0), 0);
}
