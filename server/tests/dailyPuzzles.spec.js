import { jest } from '@jest/globals';
import Fastify from 'fastify';

const servers = new Set();

// A small in-memory stand-in for the tables the daily puzzle routes use
const db = { content: [], plays: new Map(), grants: [], scores: [] };
const key = (u, g, n) => `${u}|${g}|${n}`;
async function query(sql, params = []) {
    if (/^(BEGIN|COMMIT|ROLLBACK)/.test(sql)) return { rows: [] };
    if (sql.includes('FROM daily_puzzle_content')) return { rows: db.content };
    if (sql.includes('FROM daily_puzzle_plays') && sql.includes('FOR UPDATE')) {
        const row = db.plays.get(key(...params));
        return { rows: row ? [structuredClone(row)] : [] };
    }
    if (sql.includes('INSERT INTO daily_puzzle_plays')) {
        const [u, g, n, secret, state] = params;
        if (!db.plays.has(key(u, g, n))) {
            db.plays.set(key(u, g, n), { user_id: u, game: g, puzzle: n, secret: JSON.parse(secret), state: JSON.parse(state), started_at: new Date(), finished_at: null, won: null, score: null, tickets: 0 });
        }
        return { rows: [] };
    }
    if (sql.includes('SET state')) {
        db.plays.get(key(params[0], params[1], params[2])).state = JSON.parse(params[3]);
        return { rows: [] };
    }
    if (sql.includes('SET finished_at')) {
        Object.assign(db.plays.get(key(params[0], params[1], params[2])), { finished_at: params[3], won: params[4], score: params[5], tickets: params[6] });
        return { rows: [] };
    }
    if (sql.includes('grant_currency')) {
        db.grants.push(params);
        return { rows: [{ coin_balance: 1000 + params[1] }] };
    }
    if (sql.includes('FROM games')) return { rows: [{ id: params[0] === 'Scaredle' ? 50 : 51 }] };
    if (sql.includes('INSERT INTO leaderboards')) {
        db.scores.push(params);
        return { rows: [] };
    }
    if (sql.includes('jsonb_array_length')) {
        return { rows: [...db.plays.values()].filter((r) => r.user_id === params[0] && r.game === params[1]).map((r) => ({ ...r, tries: r.state.guesses?.length ?? 0 })) };
    }
    throw new Error(`Unexpected query: ${sql}`);
}
jest.unstable_mockModule('../db/mockDB.js', () => ({
    default: { query, connect: async () => ({ query, release() {} }) },
}));

const rules = await import('../dailyPuzzles/rules.js');
const { buildCrossword } = await import('../dailyPuzzles/crossBonesLayout.js');
const { clearContentCache } = await import('../dailyPuzzles/content.js');
const { default: dailyPuzzleRoutes } = await import('../routes/dailyPuzzles.js');

const ALICE = '22222222-2222-4222-8222-222222222222';
const THEME = {
    name: 'Test Night',
    words: [
        ['GHOST', 'Boo-er'], ['GOBLIN', 'Green menace'], ['TOMB', 'Burial chamber'], ['SKULL', 'Bony noggin'],
        ['BONES', 'Skeleton parts'], ['WITCH', 'Broom rider'], ['COVEN', 'Witch group'], ['RAVEN', 'Poe bird'],
        ['MUMMY', 'Wrapped pharaoh'], ['CRYPT', 'Church vault'], ['OGRE', 'Brute'], ['SPELL', 'Magic words'],
    ].map(([word, clue]) => ({ word, clue })),
};

async function app() {
    const fastify = Fastify();
    servers.add(fastify);
    fastify.decorateRequest('user', null);
    fastify.addHook('preValidation', async (request) => {
        request.user = { sub: request.headers['x-test-user'] };
    });
    fastify.register(dailyPuzzleRoutes, { prefix: '/daily-puzzles' });
    await fastify.ready();
    return fastify;
}

// Only the clock: fastify's own timers keep running
const setNow = (iso) => jest.useFakeTimers({ now: new Date(iso), doNotFake: ['nextTick', 'setImmediate', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'queueMicrotask', 'hrtime', 'performance'] });

beforeEach(() => {
    db.content = [{ key: 'scaredle_answers', value: ['ghost', 'witch', 'raven'] }, { key: 'cross_bones_themes', value: [THEME] }];
    db.plays.clear();
    db.grants = [];
    db.scores = [];
    clearContentCache();
});
afterEach(async () => {
    try {
        await Promise.all([...servers].map((server) => server.close()));
    } finally {
        servers.clear();
        jest.useRealTimers();
    }
});

describe('rules', () => {
    test('a puzzle day turns over at midnight US Eastern', () => {
        expect(rules.puzzleNumberAt(new Date('2026-10-07T03:59:00Z'))).toBe(0);
        expect(rules.puzzleNumberAt(new Date('2026-10-07T04:00:00Z'))).toBe(1);
        expect(rules.puzzleNumberAt(new Date('2026-11-02T04:59:00Z'))).toBe(26); // EST after the clocks change
        expect(rules.puzzleDate(26)).toBe('2026-11-01');
    });

    test('marks a repeated letter only as often as the answer has it', () => {
        expect(rules.markGuess('SSSSS', 'GHOST')).toEqual(['absent', 'absent', 'absent', 'correct', 'absent']);
        expect(rules.markGuess('TOAST', 'GHOST')).toEqual(['absent', 'present', 'absent', 'correct', 'correct']);
        expect(rules.markGuess('SKULL', 'SKULL').every((m) => m === 'correct')).toBe(true);
    });

    test('pays 100 on the day, 10 after, nothing for a loss or a mostly revealed grid', () => {
        expect(rules.ticketsFor({ won: true, sameDay: true })).toBe(100);
        expect(rules.ticketsFor({ won: true, sameDay: false })).toBe(10);
        expect(rules.ticketsFor({ won: false, sameDay: true })).toBe(0);
        expect(rules.ticketsFor({ won: true, sameDay: true, revealed: 21, open: 40 })).toBe(0);
        expect(rules.ticketsFor({ won: true, sameDay: true, revealed: 20, open: 40 })).toBe(100);
    });

    test('builds a crossword whose entries spell real words on the grid', () => {
        const p = buildCrossword(3, THEME);
        const words = THEME.words.map((w) => w.word);
        expect(p.entries.length).toBeGreaterThanOrEqual(6);
        for (const e of p.entries) {
            let word = '';
            for (let i = 0; i < e.length; i++) word += p.cells[(e.row + (e.dir === 'down' ? i : 0)) * p.cols + e.col + (e.dir === 'across' ? i : 0)];
            expect(words).toContain(word);
        }
        expect(rules.publicCrossword(p).mask).not.toMatch(/[A-Z]/);
        expect(JSON.stringify(rules.publicCrossword(p))).not.toContain('GHOST');
    });

    test('a fill keeps revealed squares and drops anything but letters', () => {
        const p = { cells: 'AB#C' };
        expect(rules.cleanFill('x?#1', p, [1])).toBe('XB# ');
    });
});

describe('Scaredle', () => {
    test('never sends the answer until the game is over, then pays the day rate', async () => {
        setNow('2026-10-07T16:00:00Z');
        const server = await app();
        const headers = { 'x-test-user': ALICE };
        const first = (await server.inject({ method: 'GET', url: '/daily-puzzles/scaredle/1', headers })).json();
        expect(first.answer).toBeNull();
        expect(JSON.stringify(first)).not.toMatch(/ghost/i);

        const miss = (await server.inject({ method: 'POST', url: '/daily-puzzles/scaredle/1/guess', headers, payload: { guess: 'crane' } })).json();
        expect(miss.marks).toEqual([['absent', 'absent', 'absent', 'absent', 'absent']]);
        expect(JSON.stringify(miss)).not.toMatch(/ghost/i);

        const bad = await server.inject({ method: 'POST', url: '/daily-puzzles/scaredle/1/guess', headers, payload: { guess: 'zzzzz' } });
        expect(bad.statusCode).toBe(400);

        const win = (await server.inject({ method: 'POST', url: '/daily-puzzles/scaredle/1/guess', headers, payload: { guess: 'ghost' } })).json();
        expect(win).toMatchObject({ done: true, won: true, score: 500, tickets: 100, answer: 'GHOST', reward: { tickets: 100, sameDay: true } });
        expect(db.grants).toHaveLength(1);
        expect(db.grants[0].slice(1, 4)).toEqual([100, 'daily_puzzle', 'scaredle:1']);
        expect(db.scores).toEqual([[50, ALICE, 500]]);

        // Over is over: no more guesses, no second payout
        const again = await server.inject({ method: 'POST', url: '/daily-puzzles/scaredle/1/guess', headers, payload: { guess: 'ghost' } });
        expect(again.statusCode).toBe(409);
        expect(db.grants).toHaveLength(1);
    });

    test('an old puzzle from the archive pays 10 and skips the leaderboard; tomorrow is locked', async () => {
        setNow('2026-10-09T16:00:00Z');
        const server = await app();
        const headers = { 'x-test-user': ALICE };
        const win = (await server.inject({ method: 'POST', url: '/daily-puzzles/scaredle/2/guess', headers, payload: { guess: 'witch' } })).json();
        expect(win).toMatchObject({ won: true, tickets: 10, sameDay: false });
        expect(db.scores).toEqual([]);
        expect((await server.inject({ method: 'GET', url: '/daily-puzzles/scaredle/4', headers })).statusCode).toBe(404);

        const archive = (await server.inject({ method: 'GET', url: '/daily-puzzles/scaredle', headers })).json();
        expect(archive.today).toBe(3);
        expect(archive.plays).toEqual([expect.objectContaining({ puzzle: 2, done: true, won: true, tries: 1, sameDay: false })]);
    });

    test('six misses lose: the answer shows, nothing is paid', async () => {
        setNow('2026-10-07T16:00:00Z');
        const server = await app();
        const headers = { 'x-test-user': ALICE };
        let last;
        for (let i = 0; i < rules.SCAREDLE_TRIES; i++) {
            const response = await server.inject({ method: 'POST', url: '/daily-puzzles/scaredle/1/guess', headers, payload: { guess: 'crane' } });
            expect(response.statusCode).toBe(200);
            last = response.json();
            expect(last.guesses).toHaveLength(i + 1);
            if (i < rules.SCAREDLE_TRIES - 1) expect(last).toMatchObject({ done: false, answer: null, reward: null });
        }
        expect(last).toMatchObject({ done: true, won: false, score: 0, tickets: 0, answer: 'GHOST', reward: { tickets: 0 } });
        const again = await server.inject({ method: 'POST', url: '/daily-puzzles/scaredle/1/guess', headers, payload: { guess: 'ghost' } });
        expect(again.statusCode).toBe(409);
        const saved = (await server.inject({ method: 'GET', url: '/daily-puzzles/scaredle/1', headers })).json();
        expect(saved).toMatchObject({ done: true, won: false, tickets: 0, answer: 'GHOST' });
        expect(saved.guesses).toHaveLength(rules.SCAREDLE_TRIES);
        expect(db.grants).toEqual([]);
        expect(db.scores).toEqual([]);
    });
});

describe('Cross Bones', () => {
    test('a grid without letters, checked and solved on the server', async () => {
        setNow('2026-10-07T16:00:00Z');
        const server = await app();
        const headers = { 'x-test-user': ALICE };
        const open = (await server.inject({ method: 'GET', url: '/daily-puzzles/cross-bones/1', headers })).json();
        expect(open.layout.mask).not.toMatch(/[A-Z]/);
        expect(open.fill).not.toMatch(/[A-Z]/);
        const answer = db.plays.get(key(ALICE, 'cross-bones', 1)).secret.puzzle.cells;

        // One wrong letter: a check finds it and costs 25
        const wrongAt = answer.search(/[A-Z]/);
        const almost = answer.slice(0, wrongAt) + (answer[wrongAt] === 'Q' ? 'Z' : 'Q') + answer.slice(wrongAt + 1);
        const full = (await server.inject({ method: 'PUT', url: '/daily-puzzles/cross-bones/1', headers, payload: { fill: almost } })).json();
        expect(full).toMatchObject({ done: false, fullButWrong: true });
        const checked = (await server.inject({ method: 'POST', url: '/daily-puzzles/cross-bones/1/check', headers, payload: { fill: almost } })).json();
        expect(checked.wrong).toEqual([wrongAt]);
        expect(checked.checks).toBe(1);

        jest.setSystemTime(new Date('2026-10-07T16:02:00Z'));
        const solved = (await server.inject({ method: 'PUT', url: '/daily-puzzles/cross-bones/1', headers, payload: { fill: answer } })).json();
        // 120 seconds is 60 points, the check 25
        expect(solved).toMatchObject({ done: true, won: true, score: 915, tickets: 100 });
        expect(db.scores).toEqual([[51, ALICE, 915]]);
    });

    test('revealing squares fills them in and costs 40 each', async () => {
        setNow('2026-10-07T16:00:00Z');
        const server = await app();
        const headers = { 'x-test-user': ALICE };
        const open = (await server.inject({ method: 'GET', url: '/daily-puzzles/cross-bones/1', headers })).json();
        const square = open.layout.mask.indexOf('.');
        const shown = (await server.inject({ method: 'POST', url: '/daily-puzzles/cross-bones/1/reveal', headers, payload: { fill: open.fill, cells: [square] } })).json();
        expect(shown.revealed).toEqual([square]);
        expect(shown.fill[square]).toMatch(/[A-Z]/);
        expect(shown.fill.replace(/[ #]/g, '')).toHaveLength(1);
        const block = open.layout.mask.indexOf('#');
        if (block >= 0) {
            const refused = await server.inject({ method: 'POST', url: '/daily-puzzles/cross-bones/1/reveal', headers, payload: { fill: open.fill, cells: [block] } });
            expect(refused.statusCode).toBe(400);
        }
    });
});
