import { jest } from '@jest/globals';
import { ENGINE_VERSION, TICK_RATE, simulateFight } from '../shared/monster-bash/index.js';
import { MonsterBashLoop, hashSeed, pickFighters, splitHouseSeed } from '../monsterBash/matchLoop.js';
import { ACTIVE_MATCH_CONFLICT, BetRefusedError } from '../monsterBash/repository.js';
import { createChatRoom } from '../monsterBash/chatRoom.js';

const BETTING_MS = 5_000;
const RESULT_MS = 3_000;
const RETRY_MS = 2_000;

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
    jest.useRealTimers();
});

describe('splitHouseSeed', () => {
    test('splits the stake by win chance with at least a coin on each side', () => {
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
                for (const item of [...message.chunk.frames, ...message.chunk.events, ...message.chunk.odds]) {
                    expect(item.t).toBeLessThanOrEqual(liveTick);
                }
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
    });

    test('recovery replays mid-fight bouts from their seed and cancels the rest', async () => {
        const fighting = { id: '41', status: 'fighting', engineVersion: ENGINE_VERSION, seed: 'crashed-mid-fight', fighters: ['rat', 'ghost'], fightStartsAt: Date.now() - 20_000 };
        const oldEngine = { id: '42', status: 'fighting', engineVersion: ENGINE_VERSION - 1, seed: 'old', fighters: ['imp', 'ufo'], fightStartsAt: Date.now() };
        const betting = { id: '43', status: 'betting', engineVersion: ENGINE_VERSION, seed: 'never-started', fighters: ['zombie', 'skull'], fightStartsAt: Date.now() };
        const repo = createFakeRepo([fighting, oldEngine, betting]);
        const { loop } = createLoop(repo);
        await loop.start();

        const expected = simulateFight({ seed: fighting.seed, fighters: fighting.fighters });
        expect(repo.finished).toEqual([expect.objectContaining({ id: '41', winner: expected.winner, durationTicks: expected.durationTicks })]);
        expect(repo.cancelled).toEqual(['42', '43']);
        expect(repo.inserted).toHaveLength(1);
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
        const expected = { amounts: [100, 75], bettors: [1, 2], house: [50, 50] };
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
        expect(announcement.message).toMatchObject({ system: true, text: 'Payouts sent: 300 coins to the winners.' });
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

    test('recovery pays out bouts that still owe coins', async () => {
        const repo = createFakeRepo();
        repo.findUnsettledMatchIds.mockResolvedValueOnce(['7', '8']);
        const { loop } = createLoop(repo);
        await loop.start();
        expect(repo.settleMatch.mock.calls).toEqual([['7'], ['8']]);
        loop.stop();
    });
});
