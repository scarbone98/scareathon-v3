// Live win probability. From any mid-fight state we play the fight out many
// times with fresh randomness and count who wins. This is what drives the
// odds chart spectators watch move during a match.

import { isFightOver, stepFight } from './engine.js';
import { hashSeed } from './rng.js';

export const DEFAULT_ROLLOUTS = 96;

// Returns the chance (0..1) that fighter 0 wins from `state`.
export function estimateWinProbability(state, { rollouts = DEFAULT_ROLLOUTS, salt = '' } = {}) {
    if (isFightOver(state)) return state.winner === 0 ? 1 : 0;

    // Rollout i gets the same random stream at every point in the fight
    // (common random numbers), so the line only moves when the fight does.
    let wins = 0;
    for (let i = 0; i < rollouts; i++) {
        const rollout = structuredClone(state);
        rollout.rng.s = hashSeed(`${salt}|${i}`);
        while (!isFightOver(rollout)) stepFight(rollout, null);
        if (rollout.winner === 0) wins += 1;
    }

    // Laplace smoothing keeps the chart off the 0%/100% rails until a KO.
    return (wins + 1) / (rollouts + 2);
}

// Turns the checkpoints from simulateFight(..., { checkpointEvery }) into the
// points of the odds chart: [{ t, p }] where p is fighter 0's win chance.
export function buildOddsSeries(checkpoints, finalState, options = {}) {
    const series = checkpoints.map(({ t, state }) => ({
        t,
        p: roundProbability(estimateWinProbability(state, options)),
    }));
    series.push({ t: finalState.tick, p: finalState.winner === 0 ? 1 : 0 });
    return series;
}

function roundProbability(p) {
    return Math.round(p * 1000) / 1000;
}
