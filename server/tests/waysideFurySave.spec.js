import { parseSaveRequest } from '../routes/waysideFury.js';
import { MAX_LEVEL, MAX_MILESTONES, MAX_SAVE_BYTES, inferGear, mergeReceipts, migrateSave, progressScore, sanitizeSave } from '../shared/waysideFury/save.js';
import { hero, legacySave, currentSave, makeServer, memoryDatabase, PLAYER, OTHER_PLAYER } from './helpers/waysideFurySaveFixtures.js';

const checked = extra => sanitizeSave(legacySave(extra)).save;
describe('Wayside Fury save sheets', () => {
    test('migrates PR1 without resetting progress or its ticket receipt and whitelists fields', () => {
        const old = legacySave({ extra: 'discard me', savedAt: 1234 });
        old.heroes.joe.unknown = 'discard me';
        const save = migrateSave(old);
        expect(save.version).toBe(3); expect(save.candy).toBe(19); expect(save.heroes.joe.unknown).toBeUndefined();
        expect(save.lastReported).toEqual(old.lastReported); expect(save.extra).toBeUndefined();
        expect(save.settings).toEqual({ musicVolume: 0.6, sfxVolume: 0.8, controls: { tutorialDismissed: false, stickSensitivity: 1 } });
        expect(save.gear).toEqual({ power: 0, ward: 0 }); expect(save.savedAt).toBe(1234);
        expect(sanitizeSave(save).save).toEqual(save);
    });
    test('infers gear from level-derived stats independently for the HOME snapshot', () => {
        const heroes = { joe: hero('joe', 4), matt: hero('matt', 4) };
        for (const h of Object.values(heroes)) { h.power += 4; h.defense += 2; }
        expect(inferGear(heroes)).toEqual({ power: 4, ward: 2 });
        expect(checked({ heroes, gear: { power: 0, ward: 0 } }).gear).toEqual({ power: 4, ward: 2 });
        const save = checked({ heroes, home: { heroes: legacySave().heroes, active: 'matt', party: ['matt'], candy: 7, chapter: 1 } });
        expect(save.gear).toEqual({ power: 4, ward: 2 }); expect(save.home.gear).toEqual({ power: 0, ward: 0 });
        expect(save.home.party).toEqual(['you', 'matt']);
    });
    test('version2 migrates the strongest legacy progression once and keeps earlier HOME progression and gear', () => {
        const heroes = { joe: hero('joe', 2), matt: hero('matt', 5) };
        heroes.joe.hp = 17; heroes.matt.hp = 27; heroes.joe.xp = 19; heroes.matt.xp = 11;
        for (const h of Object.values(heroes)) { h.power += 4; h.defense += 2; }
        const homeHeroes = { joe: hero('joe'), matt: hero('matt') };
        for (const h of Object.values(homeHeroes)) { h.power += 2; h.defense++; h.xp = 5; }
        const raw = legacySave({ version: 2, heroes, active: 'matt', gear: { power: 4, ward: 2 },
            savedAt: 3456, settings: { musicVolume: 0.3, sfxVolume: 0.4, controls: { tutorialDismissed: true, stickSensitivity: 1.5 } },
            home: { heroes: homeHeroes, active: 'joe', party: ['joe', 'matt'], candy: 7, chapter: 1 },
            lastReported: { areas: ['wayside'], bosses: ['blast-watcher'], rooms: ['blast-0'], level: 5 } });
        const save = migrateSave(raw);
        expect(save.character).toEqual({ level: 5, xp: 11 });
        expect(Object.values(save.heroes).every(h => h.level === 5 && h.xp === 11)).toBe(true);
        expect(save.heroes.joe.hp).toBe(17); expect(save.heroes.matt.hp).toBe(27);
        expect(save.heroes.you.power).toBe(28); expect(save.gear).toEqual({ power: 4, ward: 2 });
        expect(save.active).toBe('you'); expect(save.party).toEqual(['you', 'matt']);
        expect(save.unlockedHeroes).toEqual(['you', 'joe', 'matt', 'alex', 'jon']);
        expect(save.home.character).toEqual({ level: 1, xp: 5 }); expect(save.home.gear).toEqual({ power: 2, ward: 1 });
        expect(save.lastReported).toEqual(raw.lastReported); expect(save.settings).toEqual(raw.settings); expect(save.savedAt).toBe(3456);
        expect(sanitizeSave(save).save).toEqual(save);
    });
    test('equal legacy levels choose higher XP without adding duplicated party XP', () => {
        const heroes = { joe: hero('joe', 3), matt: hero('matt', 3) };
        heroes.joe.xp = 20; heroes.matt.xp = 40;
        expect(checked({ heroes }).character).toEqual({ level: 3, xp: 40 });
    });
    test('current sheets retain all partners and their selection while stats depend only on shared level and gear', () => {
        const raw = currentSave({ character: { level: 3, xp: 10 }, gear: { power: 2, ward: 1 },
            active: 'alex', party: ['alex', 'jon'], look: { body: 'ghost', power: 999 } });
        raw.heroes.you.power = 9999; raw.heroes.you.defense = 9999; raw.heroes.you.outfit = 'legendary';
        const save = sanitizeSave(raw).save;
        expect(save.heroes.you.power).toBe(20); expect(save.heroes.you.defense).toBe(6);
        expect(save.heroes.you.outfit).toBeUndefined(); expect(save.look).toBeUndefined();
        expect(save.active).toBe('alex'); expect(save.party).toEqual(['alex', 'jon']);
        expect(sanitizeSave(save).save).toEqual(save);
        const missing = structuredClone(raw); delete missing.heroes.you;
        expect(sanitizeSave(missing).error).toBeDefined();
        expect(sanitizeSave({ ...raw, character: null }).error).toBeDefined();
        expect(sanitizeSave({ ...raw, gear: null }).error).toBeDefined();
    });
    test('bounds numbers, deduplicates and caps milestone arrays and clears invulnerability', () => {
        const old = legacySave({ candy: -5, chapter: 999, kills: 1e12, deaths: -1,
            areas: [...Array.from({ length: 140 }, (_, n) => `area-${n}`), '<script>', 5] });
        old.heroes.joe.level = 1e10; old.heroes.joe.xp = 1e10; old.heroes.joe.hp = 500;
        old.heroes.joe.invulnerable = 999;
        const save = sanitizeSave(old).save;
        expect(save.candy).toBe(0); expect(save.chapter).toBe(99); expect(save.kills).toBe(1_000_000); expect(save.deaths).toBe(0);
        expect(save.areas).toHaveLength(MAX_MILESTONES); expect(save.heroes.joe.level).toBe(MAX_LEVEL);
        expect(save.heroes.joe.xp).toBe(75 + (MAX_LEVEL - 1) * 45 - 1); expect(save.heroes.joe.hp).toBe(100);
        expect(save.heroes.joe.invulnerable).toBe(0);
    });
    test('settings and party choices are bounded without allowing unknown heroes', () => {
        const save = sanitizeSave(currentSave({ party: ['matt', 'matt', 'alien'], active: 'joe', settings: { musicVolume: 9, sfxVolume: -2,
            controls: { tutorialDismissed: true, stickSensitivity: 40 }, extra: true } })).save;
        expect(save.active).toBe('matt'); expect(save.party).toEqual(['matt']);
        expect(save.settings).toEqual({ musicVolume: 1, sfxVolume: 0, controls: { tutorialDismissed: true, stickSensitivity: 2 } });
        expect(sanitizeSave(currentSave({ party: [] })).save.party).toEqual(['you']);
        const legacy = legacySave(); delete legacy.party; expect(migrateSave(legacy).party).toEqual(['you', 'joe']);
    });
    test.each([null, [], {}, { version: 999 }, legacySave({ heroes: {} }), legacySave({ candy: '19' }),
        legacySave({ active: 'alex' }), legacySave({ lastReported: null }), legacySave({ unlockedHeroes: ['joe'] })])('rejects malformed or unsupported sheets: %p', raw => {
        expect(sanitizeSave(raw).error).toBeDefined(); expect(migrateSave(raw)).toBeNull();
    });
    test('receipt unions preserve milestones and the level high-water mark through retries', () => {
        expect(mergeReceipts({ areas: ['wayside'], bosses: ['blast-watcher'], rooms: ['blast-0'], level: 7 },
            null, { areas: ['blast'], bosses: ['blast-watcher'], rooms: ['blast-1'], level: 1 })).toEqual({
            areas: ['wayside', 'blast'], bosses: ['blast-watcher'], rooms: ['blast-0', 'blast-1'], level: 7 });
    });
    test('progress ranking counts chapter, areas, bosses, rooms, levels and XP', () => {
        const base = checked();
        for (const extra of [{ chapter: 2 }, { areas: ['wayside', 'blast'] }, { bosses: ['blast-watcher'] },
            { clearedRooms: ['blast-0', 'blast-1'] }, { heroes: { joe: hero('joe', 2), matt: hero('matt') } }]) {
            expect(progressScore(checked(extra))).toBeGreaterThan(progressScore(base));
        }
        const xp = checked(); xp.character.xp = 1;
        expect(progressScore(xp)).toBeGreaterThan(progressScore(base));
    });
    test('requests require a bounded revision and count UTF-8 bytes before dropping unknown fields', () => {
        expect(parseSaveRequest({ save: legacySave(), revision: null }).revision).toBeNull();
        expect(parseSaveRequest({ save: legacySave(), revision: 4 }).revision).toBe(4);
        for (const revision of [undefined, 0, -1, '1', 1.5, 2_147_483_647]) expect(parseSaveRequest({ save: legacySave(), revision }).error).toMatch(/revision/);
        const utf8 = legacySave({ junk: '🎃'.repeat(17_000) });
        expect(JSON.stringify(utf8).length).toBeLessThan(MAX_SAVE_BYTES);
        expect(parseSaveRequest({ save: utf8, revision: null }).error).toMatch(/large/);
        expect(sanitizeSave(utf8).error).toMatch(/large/);
    });
});

describe('Wayside Fury revisioned routes', () => {
    test('GET is empty, first PUT creates revision1, updates advance, and stale PUT returns the newer save', async () => {
        const { app, db } = await makeServer();
        try {
            expect((await app.inject({ method: 'GET', url: '/wayside-fury/save' })).json()).toEqual({ save: null, revision: null });
            const create = await app.inject({ method: 'PUT', url: '/wayside-fury/save', payload: { save: legacySave(), revision: null } });
            expect(create.statusCode).toBe(200); expect(create.json()).toEqual({ revision: 1 });
            const latest = legacySave({ candy: 91, areas: ['wayside', 'blast'] });
            const update = await app.inject({ method: 'PUT', url: '/wayside-fury/save', payload: { save: latest, revision: 1 } });
            expect(update.json()).toEqual({ revision: 2 });
            for (const revision of [null, 1]) {
                const stale = await app.inject({ method: 'PUT', url: '/wayside-fury/save', payload: { save: legacySave(), revision } });
                expect(stale.statusCode).toBe(409); expect(stale.json().revision).toBe(2);
                expect(stale.json().save).toEqual(sanitizeSave(latest).save);
            }
            expect(db.rows.get(PLAYER).save.candy).toBe(91);
            expect((await app.inject({ method: 'GET', url: '/wayside-fury/save' })).json().save.version).toBe(3);
        } finally { await app.close(); }
    });
    test('malformed and oversized requests get400 without touching the database', async () => {
        const { app, db } = await makeServer();
        try {
            for (const payload of [{ save: {}, revision: null }, { save: legacySave(), revision: 0 },
                { save: legacySave({ junk: 'x'.repeat(MAX_SAVE_BYTES) }), revision: null }]) {
                const result = await app.inject({ method: 'PUT', url: '/wayside-fury/save', payload });
                expect(result.statusCode).toBe(400);
            }
            expect(db.queries).toHaveLength(0);
        } finally { await app.close(); }
    });
    test('guest GET and PUT get401 even when registered without the global auth hook', async () => {
        const { app, db } = await makeServer({ user: null });
        try {
            for (const method of ['GET', 'PUT']) {
                const result = await app.inject({ method, url: '/wayside-fury/save', ...(method === 'PUT' ? { payload: { save: legacySave(), revision: null } } : {}) });
                expect(result.statusCode).toBe(401);
            }
            expect(db.queries).toHaveLength(0);
        } finally { await app.close(); }
    });
    test('accounts remain isolated and a stale revision for a deleted sheet cannot recreate it', async () => {
        const db = memoryDatabase(), first = await makeServer({ db }), other = await makeServer({ db, user: OTHER_PLAYER });
        try {
            await first.app.inject({ method: 'PUT', url: '/wayside-fury/save', payload: { save: legacySave(), revision: null } });
            expect((await other.app.inject({ method: 'GET', url: '/wayside-fury/save' })).json()).toEqual({ save: null, revision: null });
            const missing = await other.app.inject({ method: 'PUT', url: '/wayside-fury/save', payload: { save: legacySave(), revision: 1 } });
            expect(missing.statusCode).toBe(409); expect(missing.json().save).toBeNull(); expect(missing.json().revision).toBeNull();
            expect(db.rows.size).toBe(1);
        } finally { await first.app.close(); await other.app.close(); }
    });
    test('database outages return500 with safe error messages', async () => {
        const { app } = await makeServer({ db: { async query() { throw new Error('private database details'); } } });
        try {
            for (const method of ['GET', 'PUT']) {
                const result = await app.inject({ method, url: '/wayside-fury/save', ...(method === 'PUT' ? { payload: { save: legacySave(), revision: null } } : {}) });
                expect(result.statusCode).toBe(500); expect(result.body).not.toContain('private database details');
            }
        } finally { await app.close(); }
    });
});
