import { HUB_QUEST_RULES, sanitizeHubQuests } from '../shared/waysideFury/u1HubQuests.js';

const entry = (id, overrides = {}) => ({ id, status: 'active', progress: 0, eventProgress: 0,
    baseline: { kills: 0, bosses: [], rooms: [], hidden: [] }, ...overrides });

describe('Wayside Fury hub quest save boundary', () => {
    test('migrates missing old-save namespaces to independent empty player data', () => {
        const first = sanitizeHubQuests(), second = sanitizeHubQuests();
        expect(first).toEqual({ entries: [], cosmetics: [], pendingChips: [], seenEvents: [] });
        first.entries.push(entry('alex-patrol'));
        first.seenEvents.push('host:kill-1');
        expect(second.entries).toEqual([]);
        expect(second.seenEvents).toEqual([]);
        for (const raw of [null, false, true, [], 'quests', 8]) expect(sanitizeHubQuests(raw)).toEqual(second);
    });

    test('only accepts known quest IDs and exact statuses without prototype coercion', () => {
        const save = sanitizeHubQuests({ entries: [
            entry('unknown'), entry('__proto__'), entry('constructor'), entry(['alex-patrol']),
            entry('alex-patrol', { status: 'ready' }), entry('jon-trails', { status: 'active' }),
            entry('jon-trails', { status: 'claimed' }), null, [],
        ] });
        expect(save.entries).toEqual([entry('jon-trails')]);
    });

    test('bounds objective progress, handles nonfinite values and normalizes baselines', () => {
        const save = sanitizeHubQuests({ entries: [
            entry('alex-patrol', { progress: 99, eventProgress: 5.9,
                baseline: { kills: 1e12, bosses: ['blast-watcher', 'blast-watcher', '<bad>', 0],
                    rooms: ['blast-1', 'realm-0', 'loot-orchard', '../room'], hidden: ['hidden:card-1', 'hidden:card-1'] } }),
            entry('jon-trails', { progress: Infinity, eventProgress: -4, baseline: { kills: NaN } }),
            entry('nia-watch', { status: 'claimed', progress: -9, eventProgress: Infinity }),
        ] });
        expect(save.entries[0]).toEqual(entry('alex-patrol', { progress: 8, eventProgress: 5,
            baseline: { kills: 1_000_000, bosses: ['blast-watcher'], rooms: ['blast-1', 'realm-0'], hidden: ['hidden:card-1'] } }));
        expect(save.entries[1]).toEqual(entry('jon-trails'));
        expect(save.entries[2].progress).toBe(1);
        expect(save.entries[2].eventProgress).toBe(0);
    });

    test('retains only owned cosmetic rewards backed by a claimed quest', () => {
        const save = sanitizeHubQuests({ entries: [entry('joe-bbq', { status: 'claimed' }), entry('marnie-display')],
            cosmetics: ['bbq-apron', 'bbq-apron', 'station-scarf', 'shop-pay-to-win', null] });
        expect(save.cosmetics).toEqual(['bbq-apron']);
        expect(save.entries[0].progress).toBe(HUB_QUEST_RULES['joe-bbq'].amount);
        expect(sanitizeHubQuests({ cosmetics: ['bbq-apron'] }).cosmetics).toEqual([]);
    });

    test('keeps exact pending chip receipts and rejects unclaimed, swapped or replayed grants', () => {
        const save = sanitizeHubQuests({ entries: [entry('alex-patrol', { status: 'claimed' }), entry('ravi-supplies')],
            pendingChips: [
                { id: 'scanner', source: 'u8:alex-patrol' }, { id: 'scanner', source: 'u8:alex-patrol' },
                { id: 'ki-coil', source: 'u8:alex-patrol' }, { id: 'scanner', source: 'u8:unknown' },
                { id: 'candy-magnet', source: 'u8:ravi-supplies' }, { id: 'scanner', source: '../grant' },
                null, [],
            ] });
        expect(save.pendingChips).toEqual([{ id: 'scanner', source: 'u8:alex-patrol' }]);
        expect(sanitizeHubQuests({ pendingChips: [{ id: 'scanner', source: 'u8:alex-patrol' }] }).pendingChips).toEqual([]);
    });

    test('round trips one-time claim and event receipts without adding rewards', () => {
        const raw = { entries: [entry('alex-patrol', { status: 'claimed' })],
            cosmetics: [], pendingChips: [{ id: 'scanner', source: 'u8:alex-patrol' }],
            seenEvents: ['coop:room-a:enemy-1', 'coop:room-a:enemy-1', 'boss-kill:arena:1'] };
        const save = sanitizeHubQuests(raw), reloaded = sanitizeHubQuests(JSON.parse(JSON.stringify(save)));
        expect(reloaded).toEqual(save);
        expect(reloaded.entries[0].status).toBe('claimed');
        expect(reloaded.seenEvents).toEqual(['coop:room-a:enemy-1', 'boss-kill:arena:1']);
        expect(sanitizeHubQuests({ ...save, pendingChips: [] }).pendingChips).toEqual([]);
        expect(Object.keys(save)).toEqual(['entries', 'cosmetics', 'pendingChips', 'seenEvents']);
    });

    test('caps arrays, rejects huge or malformed IDs, and owns its normalized arrays', () => {
        const raw = { entries: [entry('alex-patrol', { baseline: {
            kills: 1, bosses: Array.from({ length: 200 }, (_, i) => `boss-${i}`),
            rooms: Array.from({ length: 200 }, (_, i) => `blast-${i}`), hidden: ['z'.repeat(129), 'card-one'],
        } })], seenEvents: [null, '<script>', ...Array.from({ length: 400 }, (_, i) => `kill:${i}`)] };
        const save = sanitizeHubQuests(raw);
        expect(save.entries[0].baseline.bosses).toHaveLength(128);
        expect(save.entries[0].baseline.rooms).toHaveLength(128);
        expect(save.entries[0].baseline.hidden).toEqual(['card-one']);
        expect(save.seenEvents).toHaveLength(256);
        save.entries[0].baseline.bosses.push('changed');
        save.seenEvents.push('changed');
        expect(raw.entries[0].baseline.bosses).not.toContain('changed');
        expect(raw.seenEvents).not.toContain('changed');
    });

    test('the bounded reward catalog stays immutable', () => {
        expect(Object.keys(HUB_QUEST_RULES)).toHaveLength(7);
        expect(Object.isFrozen(HUB_QUEST_RULES)).toBe(true);
        for (const rule of Object.values(HUB_QUEST_RULES)) {
            expect(Object.isFrozen(rule)).toBe(true);
            expect(Object.isFrozen(rule.rewards)).toBe(true);
            expect(rule.amount).toBeGreaterThan(0);
        }
    });
});
