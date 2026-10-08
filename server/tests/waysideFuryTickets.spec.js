import Fastify from 'fastify';
import gamesRoutes from '../routes/games.js';
import { currentSave, makeServer, PLAYER } from './helpers/waysideFurySaveFixtures.js';

// Exercise the actual payout route and its SQL-bound ledger high-water mark.
function payoutDatabase(saves) {
    const grants = [], ledger = [], queries = [];
    let balance = 0, scoreId = 0;
    return { grants, ledger, queries, async connect() {
        return { release() {}, async query(sql, values = []) {
            queries.push(sql);
            if (/SELECT id FROM games/.test(sql)) return { rows: [{ id: 91 }] };
            if (/COUNT\(\*\)/.test(sql)) return { rows: [{ count: 0 }] };
            if (/INSERT INTO leaderboards/.test(sql)) return { rows: [{ id: ++scoreId, metric_value: values[3] }] };
            if (/SELECT save FROM wayside_fury_saves/.test(sql)) return { rows: [saves.rows.get(values[0])].filter(Boolean) };
            if (/AS progress_max/.test(sql)) {
                const legacy = ledger.filter(row => row.furyProgressMax === undefined).reduce((n, row) => n + row.metricValue, 0);
                return { rows: [{ progress_max: Math.max(legacy, ...ledger.map(row => row.furyProgressMax ?? 0)) }] };
            }
            if (/FROM arcade_reward_rules/.test(sql)) return { rows: [] };
            if (/SUM\(amount\)/.test(sql)) return { rows: [{ paid: balance }] };
            if (/grant_currency/.test(sql)) {
                grants.push(values[1]); ledger.push(JSON.parse(values[4])); balance += values[1];
                return { rows: [{ coin_balance: balance }] };
            }
            if (/^(BEGIN|COMMIT|ROLLBACK|SAVEPOINT|RELEASE)|pg_advisory_xact_lock/.test(sql.trim())) return { rows: [] };
            throw new Error(`Unexpected payout SQL: ${sql}`);
        } };
    } };
}

test('actual server grants no tickets for replay after New Game, even with repeated positive client scores', async () => {
    const saves = await makeServer();
    const db = payoutDatabase(saves.db), app = Fastify();
    app.addHook('preHandler', async request => { request.user = { sub: PLAYER }; });
    await app.register(gamesRoutes, { prefix: '/games', db, awardWeeklyRewards: async () => [] });
    const submit = () => app.inject({ method: 'POST', url: '/games/submitScore', payload: { game: 'Wayside Fury', metricName: 'score', metricValue: 1000 } });
    const save = (sheet, revision) => saves.app.inject({ method: 'PUT', url: '/wayside-fury/save', payload: { save: sheet, revision } });
    try {
        const receipt = { areas: ['wayside'], bosses: [], rooms: [], level: 1 };
        await save(currentSave({ lastReported: receipt }), null);
        const first = await submit();
        expect(first.statusCode).toBe(200); expect(first.json().data.coinsAwarded).toBe(10);
        expect(db.ledger[0].furyProgressMax).toBe(1000);
        await save(currentSave({ candy: 0, areas: [], bosses: [], clearedRooms: [], resetAt: 1000, prologuePending: true,
            lastReported: { areas: [], bosses: [], rooms: [], level: 1 } }), 1);
        for (let i = 0; i < 2; i++) {
            const replay = await submit();
            expect(replay.statusCode).toBe(200); expect(replay.json().data.coinsAwarded).toBe(0);
        }
        expect(db.grants).toEqual([10]);
        await save(currentSave({ resetAt: 1000, lastReported: { ...receipt, areas: ['wayside', 'blast'] } }), 2);
        expect((await submit()).json().data.coinsAwarded).toBe(10);
        expect(db.grants).toEqual([10, 10]);
        expect(db.ledger[1].furyProgressMax).toBe(2000);
        expect(db.queries.findIndex(sql => sql.includes('pg_advisory_xact_lock'))).toBeLessThan(db.queries.findIndex(sql => sql.includes('AS progress_max')));
    } finally { await app.close(); await saves.app.close(); }
});

test('legacy paid checkpoint deltas seed the server max and cannot be granted again after reset', async () => {
    const saves = await makeServer(), db = payoutDatabase(saves.db), app = Fastify();
    db.ledger.push({ game: 'Wayside Fury', metricName: 'score', metricValue: 1000 });
    app.addHook('preHandler', async request => { request.user = { sub: PLAYER }; });
    await app.register(gamesRoutes, { prefix: '/games', db, awardWeeklyRewards: async () => [] });
    saves.db.rows.set(PLAYER, { save: currentSave({ resetAt: 1000, lastReported: { areas: ['wayside'], bosses: [], rooms: [], level: 1 } }), revision: 2 });
    try {
        const replay = await app.inject({ method: 'POST', url: '/games/submitScore', payload: { game: 'Wayside Fury', metricName: 'score', metricValue: 1000 } });
        expect(replay.statusCode).toBe(200); expect(replay.json().data.coinsAwarded).toBe(0);
        expect(db.grants).toEqual([]);
    } finally { await app.close(); await saves.app.close(); }
});

test('lifetime reward max can pass the per-checkpoint 100000 score cap', async () => {
    const saves = await makeServer(), db = payoutDatabase(saves.db), app = Fastify();
    db.ledger.push({ furyProgressMax: 100000, metricValue: 1000 });
    app.addHook('preHandler', async request => { request.user = { sub: PLAYER }; });
    await app.register(gamesRoutes, { prefix: '/games', db, awardWeeklyRewards: async () => [] });
    saves.db.rows.set(PLAYER, { save: currentSave({ lastReported: { areas: ['wayside', 'blast'], bosses: [], rooms: [], level: 1000 } }), revision: 2 });
    try {
        const earned = await app.inject({ method: 'POST', url: '/games/submitScore', payload: { game: 'Wayside Fury', metricName: 'score', metricValue: 100 } });
        expect(earned.statusCode).toBe(200); expect(earned.json().data.coinsAwarded).toBe(1);
        expect(db.ledger.at(-1).furyProgressMax).toBe(100100);
    } finally { await app.close(); await saves.app.close(); }
});
