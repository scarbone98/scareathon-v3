import { jest } from '@jest/globals';
import { ENGINE_VERSION, TICK_RATE, simulateFight } from '../shared/monster-bash/index.js';
import { MonsterBashLoop, hashSeed, pickFighters } from '../monsterBash/matchLoop.js';
import { ACTIVE_MATCH_CONFLICT } from '../monsterBash/repository.js';

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

        const [hello, match, chunk] = loop.welcomeMessages();
        expect(hello).toMatchObject({ type: 'hello', serverTime: Date.now(), history: [] });
        expect(match.type).toBe('match');
        expect(match.odds.length).toBeGreaterThan(1);
        const frameTicks = chunk.chunk.frames.map((frame) => frame.t);
        expect(Math.max(...frameTicks) - Math.min(...frameTicks)).toBeLessThanOrEqual(5 * TICK_RATE);
        expect(chunk.chunk.events.length).toBe(loop.current.released.events.length);
        loop.stop();
    });
});
