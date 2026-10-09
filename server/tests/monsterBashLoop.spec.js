import { jest } from '@jest/globals';
import { ENGINE_VERSION, TICK_RATE, simulateFight } from '../shared/monster-bash/index.js';
import { MonsterBashLoop, hashSeed, pickFighters, splitHouseSeed, storedWinChance } from '../monsterBash/matchLoop.js';
import { ACTIVE_MATCH_CONFLICT, BetRefusedError } from '../monsterBash/repository.js';
import { createChatRoom } from '../monsterBash/chatRoom.js';

const BETTING_MS = 5_000;
const RESULT_MS = 3_000;
const RETRY_MS = 2_000;
const activeLoops = new Set();

function createFakeRepo(openMatches = []) {
    let nextId = 1;
    return {
        open: openMatches,
        inserted: [],
        finished: [],
        cancelled: [],
        fighting: [],
        insertMatch: jest.fn(async function insertMatch(match) {
            const row = { ...match, id: String(nextId++), status: 'betting' };
            this.inserted.push(row);
            return row;
        }),
        markFighting: jest.fn(async function markFighting(id) {
            this.fighting.push(id);
        }),
        markFinished: jest.fn(async function markFinished(id, result) {
            this.finished.push({ id, ...result });
        }),
        markCancelled: jest.fn(async function markCancelled(id) {
            this.cancelled.push(id);
        }),
        findOpenMatches: jest.fn(async function findOpenMatches() {
            const open = this.open;
            this.open = [];
            return open;
        }),
        listRecent: jest.fn(async () => []),
        pruneOlderThan: jest.fn(async () => 0),
        bets: [],
        placeBet: jest.fn(async function placeBet(bet) {
            this.bets.push(bet);
            return { betId: this.bets.length, balance: 1000 - bet.amount };
        }),
        poolTotals: jest.fn(async function poolTotals() {
            const pools = { amounts: [0, 0], bettors: [0, 0] };
            this.bets.forEach((bet) => {
                pools.amounts[bet.side] += bet.amount;
                pools.bettors[bet.side] += 1;
            });
            return pools;
        }),
        settleMatch: jest.fn(async () => ({ settled: 2, pool: 400, playerPool: 300, winningPool: 150, paidOut: 300, refunded: false })),
        findUnsettledMatchIds: jest.fn(async () => []),
    };
}

const fakeOdds = {
    pregame: jest.fn(async () => ({ t: 0, p: 0.5 })),
    stream: jest.fn(async (seed, fighters, onPoint) => {
        for (let t = TICK_RATE; t < 60 * TICK_RATE; t += TICK_RATE) onPoint({ t, p: 0.6 });
    }),
};

const silentLog = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };

function createLoop(repo, overrides = {}) {
    const messages = [];
    let seedCount = 0;
    const loop = new MonsterBashLoop({
        repo,
        odds: fakeOdds,
        hub: { broadcast: (message) => messages.push(message) },
        chat: createChatRoom({ lookupUsername: async () => 'Tester' }),
        log: silentLog,
        config: { bettingMs: BETTING_MS, resultMs: RESULT_MS, retryMs: RETRY_MS },
        createSeed: () => `test-seed-${seedCount++}`,
        ...overrides,
    });
    activeLoops.add(loop);
    return { loop, messages };
}

// Runs the loop until the current bout's result goes out.
async function playToResult(messages, stepMs = 1_000, limitMs = 5 * 60_000) {
    for (let elapsed = 0; elapsed < limitMs; elapsed += stepMs) {
        if (messages.some((message) => message.type === 'result')) return;
        await jest.advanceTimersByTimeAsync(stepMs);
    }
    throw new Error('bout never finished');
}

beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-10-01T20:00:00Z') });
    jest.clearAllMocks();
});

afterEach(() => {
    for (const loop of activeLoops) loop.stop();
    activeLoops.clear();
    jest.useRealTimers();
});

describe('splitHouseSeed', () => {
    test('splits the stake by win chance with at least a ticket on each side', () => {
        expect(splitHouseSeed(100, 0.5)).toEqual([50, 50]);
        expect(splitHouseSeed(100, 0.52)).toEqual([52, 48]);
        expect(splitHouseSeed(100, 0.999)).toEqual([99, 1]);
        expect(splitHouseSeed(100, 0)).toEqual([1, 99]);
        expect(splitHouseSeed(100, Number.NaN)).toEqual([50, 50]);
    });

    test('a stake too small to split turns the seed off', () => {
        expect(splitHouseSeed(0, 0.5)).toEqual([0, 0]);
        expect(splitHouseSeed(1, 0.5)).toEqual([0, 0]);
    });
});

describe('storedWinChance', () => {
    test('keeps a usable estimate to three places', () => {
        expect(storedWinChance(0.5)).toBe(0.5);
        expect(storedWinChance(0.01234)).toBe(0.012);
        expect(storedWinChance(0.99)).toBe(0.99);
    });

    test('drops estimates the fair-odds floor could not divide by', () => {
        expect(storedWinChance(undefined)).toBeNull();
        expect(storedWinChance(Number.NaN)).toBeNull();
        expect(storedWinChance(0)).toBeNull();
        expect(storedWinChance(0.0004)).toBeNull();
        expect(storedWinChance(0.9996)).toBeNull();
        expect(storedWinChance(1)).toBeNull();
    });
});

describe('pickFighters', () => {
    test('picks two different monsters and never repeats the last pairing', () => {
        for (let i = 0; i < 200; i++) {
            const previous = pickFighters();
            const next = pickFighters(Math.random, previous);
            expect(next[0]).not.toBe(next[1]);
            expect(new Set([...next, ...previous]).size).toBeGreaterThan(2);
        }
    });
});

describe('MonsterBashLoop', () => {
    test('opens betting with the seed hidden behind its hash', async () => {
        const repo = createFakeRepo();
        const { loop, messages } = createLoop(repo);
        await loop.start();

        const [row] = repo.inserted;
        expect(row.seedHash).toBe(hashSeed(row.seed));
        expect(row.engineVersion).toBe(ENGINE_VERSION);
        expect(row.bettingClosesAt).toBe(Date.now() + BETTING_MS);
        expect(row.houseSeed).toEqual([50, 50]);
        expect(row.pregameP).toBe(0.5);

        const matchMessage = messages.find((message) => message.type === 'match');
        expect(matchMessage.match).toMatchObject({ id: row.id, seedHash: row.seedHash, fighters: row.fighters });
        expect(JSON.stringify(messages)).not.toContain(row.seed);
        expect(matchMessage.odds).toEqual([{ t: 0, p: 0.5 }]);
        expect(repo.pruneOlderThan).toHaveBeenCalledWith(14);
        loop.stop();
    });

    test('streams the fight in real time and records the true winner', async () => {
        const repo = createFakeRepo();
        const { loop, messages } = createLoop(repo);
        await loop.start();
        const [row] = repo.inserted;
        const fight = simulateFight({ seed: row.seed, fighters: row.fighters });

        await jest.advanceTimersByTimeAsync(BETTING_MS);
        expect(repo.fighting).toEqual([row.id]);

        const chunks = [];
        for (let second = 1; !messages.some((message) => message.type === 'result'); second++) {
            const seen = messages.length;
            await jest.advanceTimersByTimeAsync(1_000);
            const liveTick = second * TICK_RATE;
            for (const message of messages.slice(seen)) {
                if (message.type !== 'chunk') continue;
                chunks.push(message.chunk);
                // Nothing is ever released ahead of the fight clock.
                const ticks = [...message.chunk.frames, ...message.chunk.events, ...message.chunk.odds].map((item) => item.t);
                expect(Math.max(...ticks)).toBeLessThanOrEqual(liveTick);
            }
            if (second > 600) throw new Error('bout never finished');
        }

        expect(chunks.flatMap((chunk) => chunk.frames)).toEqual(fight.frames);
        expect(chunks.flatMap((chunk) => chunk.events)).toEqual(fight.events);
        expect(chunks.flatMap((chunk) => chunk.odds).at(-1)).toEqual({ t: fight.durationTicks, p: fight.winner === 0 ? 1 : 0 });

        const result = messages.find((message) => message.type === 'result');
        expect(result).toEqual({ type: 'result', matchId: row.id, result: { winner: fight.winner, durationTicks: fight.durationTicks } });
        expect(repo.finished).toEqual([expect.objectContaining({ id: row.id, winner: fight.winner, durationTicks: fight.durationTicks })]);

        await jest.advanceTimersByTimeAsync(RESULT_MS);
        expect(repo.inserted).toHaveLength(2);
        expect(new Set([...repo.inserted[1].fighters, ...row.fighters]).size).toBeGreaterThan(2);
        loop.stop();
        // A full simulated bout yields between chunks; concurrent check runs can
        // consume the default five-second wall-clock budget despite fake time.
    }, 30_000);

    test('recovery replays bouts whose fight is already over and cancels the rest', async () => {
        const longAgo = Date.now() - 10 * 60_000;
        const fighting = { id: '41', status: 'fighting', engineVersion: ENGINE_VERSION, seed: 'crashed-mid-fight', fighters: ['rat', 'ghost'], bettingClosesAt: longAgo, fightStartsAt: longAgo };
        const oldEngine = { id: '42', status: 'fighting', engineVersion: ENGINE_VERSION - 1, seed: 'old', fighters: ['imp', 'ufo'], bettingClosesAt: Date.now(), fightStartsAt: Date.now() };
        const betting = { id: '43', status: 'betting', engineVersion: ENGINE_VERSION, seed: 'never-started', fighters: ['zombie', 'skull'], bettingClosesAt: longAgo, fightStartsAt: longAgo };
        const repo = createFakeRepo([fighting, oldEngine, betting]);
        const { loop } = createLoop(repo);
        await loop.start();

        const expected = simulateFight({ seed: fighting.seed, fighters: fighting.fighters });
        expect(repo.finished).toEqual([expect.objectContaining({ id: '41', winner: expected.winner, durationTicks: expected.durationTicks })]);
        expect(repo.cancelled).toEqual(['42', '43']);
        expect(repo.inserted).toHaveLength(1);
        loop.stop();
    });

    test('a restart mid-fight picks the bout up where it was and plays it to the end', async () => {
        const seed = 'restarted-mid-fight';
        const fighters = ['rat', 'ghost'];
        const fight = simulateFight({ seed, fighters });
        const startedAt = Date.now() - 10_000;
        const row = { id: '41', status: 'fighting', engineVersion: ENGINE_VERSION, seed, seedHash: hashSeed(seed), fighters, bettingClosesAt: startedAt, fightStartsAt: startedAt, houseSeed: [60, 40], pregameP: 0.6 };
        const repo = createFakeRepo([row]);
        repo.bets.push({ userId: 'u1', matchId: '41', side: 1, amount: 30 });
        const { loop, messages } = createLoop(repo);
        await loop.start();

        expect(repo.inserted).toHaveLength(0);
        expect(repo.finished).toHaveLength(0);
        expect(repo.cancelled).toHaveLength(0);
        const match = messages.find((message) => message.type === 'match');
        expect(match.match).toMatchObject({ id: '41', fighters, pools: { amounts: [0, 30], bettors: [0, 1], house: [60, 40], winChance: 0.6 } });

        await jest.advanceTimersByTimeAsync(1_000);
        const firstChunk = messages.find((message) => message.type === 'chunk').chunk;
        // Only the last few seconds of movement, like a late joiner gets.
        expect(Math.min(...firstChunk.frames.map((frame) => frame.t))).toBeGreaterThanOrEqual(5 * TICK_RATE);

        await playToResult(messages);
        expect(messages.find((message) => message.type === 'result').result).toEqual({ winner: fight.winner, durationTicks: fight.durationTicks });
        expect(repo.finished).toEqual([expect.objectContaining({ id: '41', winner: fight.winner })]);
        await jest.advanceTimersByTimeAsync(RESULT_MS);
        expect(repo.settleMatch).toHaveBeenCalledWith('41');
        expect(repo.inserted).toHaveLength(1);
        loop.stop();
    });

    test('a restart during betting keeps taking bets until the original close time', async () => {
        const seed = 'restarted-while-betting';
        const closesAt = Date.now() + 3_000;
        const row = { id: '43', status: 'betting', engineVersion: ENGINE_VERSION, seed, seedHash: hashSeed(seed), fighters: ['zombie', 'skull'], bettingClosesAt: closesAt, fightStartsAt: closesAt, houseSeed: [50, 50] };
        const repo = createFakeRepo([row]);
        const { loop } = createLoop(repo);
        await loop.start();

        expect(repo.inserted).toHaveLength(0);
        await loop.placeBet({ userId: 'u1', matchId: '43', side: 0, amount: 10 });
        expect(repo.bets).toHaveLength(1);

        await jest.advanceTimersByTimeAsync(3_000);
        expect(repo.fighting).toEqual(['43']);
        await expect(loop.placeBet({ userId: 'u2', matchId: '43', side: 0, amount: 10 })).rejects.toEqual(new BetRefusedError('betting_closed'));
        loop.stop();
    });

    test('retries opening a bout while another one is still open', async () => {
        const repo = createFakeRepo();
        const conflict = Object.assign(new Error('duplicate key'), { code: ACTIVE_MATCH_CONFLICT });
        repo.insertMatch.mockRejectedValueOnce(conflict);
        const { loop, messages } = createLoop(repo);

        await loop.start();
        expect(messages.filter((message) => message.type === 'match')).toHaveLength(0);

        await jest.advanceTimersByTimeAsync(RETRY_MS);
        expect(repo.inserted).toHaveLength(1);
        expect(messages.filter((message) => message.type === 'match')).toHaveLength(1);
        loop.stop();
    });

    test('a result that fails to save is repaired before the next bout opens', async () => {
        const repo = createFakeRepo();
        repo.markFinished.mockRejectedValueOnce(new Error('connection lost'));
        const { loop, messages } = createLoop(repo);
        await loop.start();
        expect(repo.findOpenMatches).toHaveBeenCalledTimes(1);

        await jest.advanceTimersByTimeAsync(BETTING_MS);
        await playToResult(messages);
        await jest.advanceTimersByTimeAsync(RESULT_MS);

        expect(repo.findOpenMatches).toHaveBeenCalledTimes(2);
        expect(repo.inserted).toHaveLength(2);
        loop.stop();
    });

    test('late joiners get the bout so far without the full frame history', async () => {
        const repo = createFakeRepo();
        const { loop } = createLoop(repo);
        await loop.start();
        await jest.advanceTimersByTimeAsync(BETTING_MS + 20_000);

        const [hello, chatHistory, match, chunk] = loop.welcomeMessages();
        expect(chatHistory).toEqual({ type: 'chatHistory', messages: [] });
        expect(hello).toMatchObject({ type: 'hello', serverTime: Date.now(), history: [] });
        expect(match.type).toBe('match');
        expect(match.odds.length).toBeGreaterThan(1);
        const frameTicks = chunk.chunk.frames.map((frame) => frame.t);
        expect(Math.max(...frameTicks) - Math.min(...frameTicks)).toBeLessThanOrEqual(5 * TICK_RATE);
        expect(chunk.chunk.events.length).toBe(loop.current.released.events.length);
        loop.stop();
    });

    test('takes bets while betting is open and batches pool updates', async () => {
        const repo = createFakeRepo();
        const { loop, messages } = createLoop(repo);
        await loop.start();
        const matchId = repo.inserted[0].id;

        await loop.placeBet({ userId: 'u1', matchId, side: 0, amount: 100 });
        await loop.placeBet({ userId: 'u2', matchId, side: 1, amount: 50 });
        await loop.placeBet({ userId: 'u3', matchId, side: 1, amount: 25 });
        expect(messages.filter((message) => message.type === 'pool')).toHaveLength(0);

        await jest.advanceTimersByTimeAsync(500);
        const pools = messages.filter((message) => message.type === 'pool');
        const expected = { amounts: [100, 75], bettors: [1, 2], house: [50, 50], winChance: 0.5 };
        expect(pools).toEqual([{ type: 'pool', matchId, pools: expected }]);
        expect(loop.welcomeMessages().find((message) => message.type === 'match').match.pools).toEqual(expected);
        loop.stop();
    });

    test('refuses bets on the wrong bout or once betting has closed', async () => {
        const repo = createFakeRepo();
        const { loop } = createLoop(repo);
        await loop.start();
        const matchId = repo.inserted[0].id;

        await expect(loop.placeBet({ userId: 'u1', matchId: '999', side: 0, amount: 10 })).rejects.toEqual(new BetRefusedError('betting_closed'));
        await jest.advanceTimersByTimeAsync(BETTING_MS);
        await expect(loop.placeBet({ userId: 'u1', matchId, side: 0, amount: 10 })).rejects.toEqual(new BetRefusedError('betting_closed'));
        expect(repo.placeBet).not.toHaveBeenCalled();
        loop.stop();
    });

    test('pays out just after spectators see the KO and announces it in chat', async () => {
        const repo = createFakeRepo();
        const { loop, messages } = createLoop(repo);
        await loop.start();
        const matchId = repo.inserted[0].id;

        await jest.advanceTimersByTimeAsync(BETTING_MS);
        await playToResult(messages);
        expect(repo.settleMatch).not.toHaveBeenCalled();

        await jest.advanceTimersByTimeAsync(2_500);
        expect(repo.settleMatch).toHaveBeenCalledWith(matchId);
        expect(messages).toContainEqual(expect.objectContaining({ type: 'settled', matchId }));
        const announcement = messages.find((message) => message.type === 'chat');
        expect(announcement.message).toMatchObject({ system: true, text: 'Payouts sent: 300 tickets to the winners.' });
        loop.stop();
    });

    test('retries a failed payout', async () => {
        const repo = createFakeRepo();
        repo.settleMatch.mockRejectedValueOnce(new Error('deadlock'));
        const { loop, messages } = createLoop(repo);
        await loop.start();

        await jest.advanceTimersByTimeAsync(BETTING_MS);
        await playToResult(messages);
        await jest.advanceTimersByTimeAsync(2_500);
        expect(messages.some((message) => message.type === 'settled')).toBe(false);

        await jest.advanceTimersByTimeAsync(5_000);
        expect(repo.settleMatch).toHaveBeenCalledTimes(2);
        expect(messages.some((message) => message.type === 'settled')).toBe(true);
        loop.stop();
    });

    test('recovery pays out bouts that still owe tickets', async () => {
        const repo = createFakeRepo();
        repo.findUnsettledMatchIds.mockResolvedValueOnce(['7', '8']);
        const { loop } = createLoop(repo);
        await loop.start();
        expect(repo.settleMatch.mock.calls).toEqual([['7'], ['8']]);
        loop.stop();
    });
});

// One database shared by two server processes, enforcing the same "one open
// bout" rule as the unique index, to play out a deploy's overlap.
function createSharedDb() {
    const db = { matches: [], bets: [], settledCounts: {}, nextId: 100 };
    const repoFor = () => ({
        insertMatch: jest.fn(async (match) => {
            if (db.matches.some((row) => row.status === 'betting' || row.status === 'fighting')) {
                throw Object.assign(new Error('duplicate key'), { code: ACTIVE_MATCH_CONFLICT });
            }
            const row = { ...match, id: String(db.nextId++), status: 'betting' };
            db.matches.push(row);
            return { ...row };
        }),
        markFighting: jest.fn(async (id) => {
            const row = db.matches.find((match) => match.id === id);
            if (row.status === 'betting') row.status = 'fighting';
        }),
        markFinished: jest.fn(async (id, result) => {
            const row = db.matches.find((match) => match.id === id);
            if (row.status === 'betting' || row.status === 'fighting') Object.assign(row, result, { status: 'finished' });
        }),
        markCancelled: jest.fn(async (id) => {
            const row = db.matches.find((match) => match.id === id);
            if (row.status === 'betting' || row.status === 'fighting') row.status = 'cancelled';
        }),
        findOpenMatches: jest.fn(async () => db.matches
            .filter((row) => row.status === 'betting' || row.status === 'fighting')
            .map((row) => ({ ...row }))),
        listRecent: jest.fn(async () => []),
        pruneOlderThan: jest.fn(async () => 0),
        placeBet: jest.fn(async (bet) => {
            db.bets.push(bet);
            return { betId: db.bets.length, balance: 0 };
        }),
        poolTotals: jest.fn(async (matchId) => {
            const pools = { amounts: [0, 0], bettors: [0, 0] };
            db.bets.filter((bet) => bet.matchId === matchId).forEach((bet) => {
                pools.amounts[bet.side] += bet.amount;
                pools.bettors[bet.side] += 1;
            });
            return pools;
        }),
        settleMatch: jest.fn(async (matchId) => {
            db.settledCounts[matchId] = (db.settledCounts[matchId] ?? 0) + 1;
            // Settling is idempotent: only the first call moves tickets.
            return { settled: db.settledCounts[matchId] === 1 ? 1 : 0, pool: 0, paidOut: 0, refunded: false };
        }),
        findUnsettledMatchIds: jest.fn(async () => []),
    });
    return { db, repoFor };
}

function expectTrueResults(db) {
    for (const row of db.matches.filter((match) => match.status === 'finished')) {
        expect(row.winner).toBe(simulateFight({ seed: row.seed, fighters: row.fighters }).winner);
    }
}

describe('MonsterBashLoop across a deploy', () => {
    test('the new server takes over a fight in progress and plays it out after the old one stops', async () => {
        const { db, repoFor } = createSharedDb();
        const old = createLoop(repoFor(), { createSeed: () => `old-${db.nextId}` });
        await old.loop.start();
        const bout = db.matches[0];
        await old.loop.placeBet({ userId: 'u1', matchId: bout.id, side: 1, amount: 10 });
        await jest.advanceTimersByTimeAsync(BETTING_MS + 10_000);
        expect(bout.status).toBe('fighting');

        // Deploy: the new server boots while the old one is still running...
        const next = createLoop(repoFor(), { createSeed: () => `new-${db.nextId}` });
        await next.loop.start();
        expect(next.loop.current.id).toBe(bout.id);
        expect(next.loop.current.pools.amounts).toEqual([0, 10]);
        await jest.advanceTimersByTimeAsync(3_000);
        // ...then the old one is shut down.
        old.loop.stop();

        await playToResult(next.messages);
        expect(bout.status).toBe('finished');
        expect(next.messages.find((message) => message.type === 'result').matchId).toBe(bout.id);
        await jest.advanceTimersByTimeAsync(RESULT_MS + 3_000);
        expect(db.matches.filter((row) => row.status === 'cancelled')).toHaveLength(0);
        expect(db.matches).toHaveLength(2);
        expect(next.loop.current.id).toBe(db.matches[1].id);
        expectTrueResults(db);
        next.loop.stop();
    });

    test('if the old server opens the next bout and then dies, the new server adopts it', async () => {
        const { db, repoFor } = createSharedDb();
        const old = createLoop(repoFor(), { createSeed: () => `old-${db.nextId}` });
        await old.loop.start();
        await jest.advanceTimersByTimeAsync(BETTING_MS + 5_000);

        // Both run the same fight to the end; the old one wins the race to
        // open the next bout.
        const next = createLoop(repoFor(), { createSeed: () => `new-${db.nextId}` });
        await next.loop.start();
        next.loop.repo.insertMatch.mockImplementationOnce(async () => {
            throw Object.assign(new Error('duplicate key'), { code: ACTIVE_MATCH_CONFLICT });
        });
        await playToResult(old.messages);
        await jest.advanceTimersByTimeAsync(RESULT_MS + 100);
        const second = db.matches[1];
        expect(second.status).toBe('betting');

        await jest.advanceTimersByTimeAsync(2_000);
        old.loop.stop();
        expect(next.loop.current.id).toBe(second.id);
        expect(silentLog.warn).toHaveBeenCalledWith('Monster Bash found another bout already open; adopting it');

        await jest.advanceTimersByTimeAsync(BETTING_MS);
        expect(second.status).toBe('fighting');
        for (let i = 0; i < 300 && second.status !== 'finished'; i++) await jest.advanceTimersByTimeAsync(1_000);
        expect(second.status).toBe('finished');
        expect(db.matches.filter((row) => row.status === 'cancelled')).toHaveLength(0);
        expectTrueResults(db);
        // Both servers may settle; only one payout happens.
        expect(Object.values(db.settledCounts).every((count) => count >= 1)).toBe(true);
        next.loop.stop();
    });

    test('a server killed during betting leaves the bout open for the next one to finish', async () => {
        const { db, repoFor } = createSharedDb();
        const old = createLoop(repoFor());
        await old.loop.start();
        const bout = db.matches[0];
        await old.loop.placeBet({ userId: 'u1', matchId: bout.id, side: 0, amount: 25 });
        await jest.advanceTimersByTimeAsync(2_000);
        old.loop.stop();

        await jest.advanceTimersByTimeAsync(1_000);
        const next = createLoop(repoFor());
        await next.loop.start();
        expect(next.loop.current).toMatchObject({ id: bout.id, status: 'betting' });
        await next.loop.placeBet({ userId: 'u2', matchId: bout.id, side: 1, amount: 5 });
        await jest.advanceTimersByTimeAsync(BETTING_MS);
        expect(next.loop.current.pools.amounts).toEqual([25, 5]);
        await playToResult(next.messages);
        expect(bout.status).toBe('finished');
        expectTrueResults(db);
        next.loop.stop();
    });
});
