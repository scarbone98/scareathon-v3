import {
    MONSTERS,
    ROUNDS_TO_WIN,
    buildOddsSeries,
    createFight,
    estimateWinProbability,
    getMonster,
    isFightOver,
    simulateFight,
    stepFight,
} from '../shared/monster-bash/index.js';

const ids = MONSTERS.map((monster) => monster.id);

function summary(result) {
    return {
        winner: result.winner,
        durationTicks: result.durationTicks,
        rounds: result.rounds,
        events: result.events.length,
        lastFrame: result.frames[result.frames.length - 1],
    };
}

describe('monster bash roster', () => {
    test('every monster has a unique id, a sprite and a full move set', () => {
        expect(new Set(ids).size).toBe(ids.length);
        for (const monster of MONSTERS) {
            expect(monster.sprite.url).toMatch(/^\/sprites\/.+\.png$/);
            expect(monster.moves.length).toBeGreaterThan(0);
            for (const move of [...monster.moves, monster.special]) {
                expect(['strike', 'dash', 'projectile']).toContain(move.kind);
                expect(move.damage[0]).toBeGreaterThan(0);
                expect(move.damage[1]).toBeGreaterThanOrEqual(move.damage[0]);
                if (move.kind !== 'strike') expect(move.speed).toBeGreaterThan(0);
            }
        }
    });

    test('rejects unknown monsters and missing seeds', () => {
        expect(() => getMonster('dracula')).toThrow('Unknown monster');
        expect(() => createFight({ seed: '', fighters: ['rat', 'imp'] })).toThrow('seed');
        expect(() => createFight({ seed: 'x', fighters: ['rat'] })).toThrow('two fighters');
    });
});

describe('monster bash fights', () => {
    test('the same seed replays the exact same fight', () => {
        const options = { seed: 'replay-me', fighters: ['werewolf', 'ghost'] };
        expect(summary(simulateFight(options))).toEqual(summary(simulateFight(options)));
    });

    test('different seeds produce different winners for the same pairing', () => {
        const winners = new Set();
        for (let n = 0; n < 40; n++) {
            winners.add(simulateFight({ seed: `vary-${n}`, fighters: ['zombie', 'rat'] }).winner);
        }
        expect(winners).toEqual(new Set([0, 1]));
    });

    test('every pairing finishes as a best-of-three with sane frames', () => {
        for (const a of ids) {
            for (const b of ids) {
                if (a === b) continue;
                const result = simulateFight({ seed: `pair-${a}-${b}`, fighters: [a, b] });
                const roundWins = [0, 1].map((side) => result.rounds.filter((round) => round.winner === side).length);

                expect(roundWins[result.winner]).toBe(ROUNDS_TO_WIN);
                expect(result.rounds.length).toBeGreaterThanOrEqual(ROUNDS_TO_WIN);
                expect(result.rounds.length).toBeLessThanOrEqual(ROUNDS_TO_WIN * 2 - 1);
                const maxHp = result.fighters.map((id) => getMonster(id).stats.maxHp);
                const badFrames = result.frames.filter((frame) =>
                    frame.fighters.some((fighter, side) => fighter.hp < 0 || fighter.hp > maxHp[side])
                );
                expect(badFrames).toEqual([]);
                expect(result.events.at(-1)).toMatchObject({ type: 'fightEnd', winner: result.winner });
            }
        }
    });

    test('no monster dominates or collapses across the roster', () => {
        const wins = Object.fromEntries(ids.map((id) => [id, 0]));
        const played = Object.fromEntries(ids.map((id) => [id, 0]));
        for (let i = 0; i < ids.length; i++) {
            for (let j = i + 1; j < ids.length; j++) {
                for (let n = 0; n < 30; n++) {
                    const fighters = n % 2 === 0 ? [ids[i], ids[j]] : [ids[j], ids[i]];
                    const { winner } = simulateFight({ seed: `guard-${i}-${j}-${n}`, fighters }, { frameEvery: 1e9 });
                    wins[fighters[winner]] += 1;
                    played[fighters[0]] += 1;
                    played[fighters[1]] += 1;
                }
            }
        }
        for (const id of ids) {
            const rate = wins[id] / played[id];
            expect({ id, ok: rate > 0.4 && rate < 0.6 }).toEqual({ id, ok: true });
        }
    });
});

describe('monster bash live odds', () => {
    test('odds are a probability, repeatable, and leave the fight untouched', () => {
        const state = createFight({ seed: 'odds', fighters: ['candle', 'imp'] });
        for (let i = 0; i < 300; i++) stepFight(state);
        const before = structuredClone(state);

        const p = estimateWinProbability(state, { rollouts: 24, salt: 'test' });
        expect(p).toBeGreaterThan(0);
        expect(p).toBeLessThan(1);
        expect(estimateWinProbability(state, { rollouts: 24, salt: 'test' })).toBe(p);
        expect(state).toEqual(before);
    });

    test('a finished fight has certain odds', () => {
        const state = createFight({ seed: 'done', fighters: ['skull', 'ufo'] });
        while (!isFightOver(state)) stepFight(state);
        expect(estimateWinProbability(state)).toBe(state.winner === 0 ? 1 : 0);
    });

    test('the odds series covers the fight and lands on the winner', () => {
        const result = simulateFight({ seed: 'series', fighters: ['scarecrow', 'pumpkin'] }, { checkpointEvery: 30 });
        const series = buildOddsSeries(result.checkpoints, result.finalState, { rollouts: 16 });

        expect(series).toHaveLength(result.checkpoints.length + 1);
        expect(series[0].t).toBe(0);
        expect(series.at(-1)).toEqual({ t: result.durationTicks, p: result.winner === 0 ? 1 : 0 });
        for (const point of series) {
            expect(point.p).toBeGreaterThanOrEqual(0);
            expect(point.p).toBeLessThanOrEqual(1);
        }
    });
});
