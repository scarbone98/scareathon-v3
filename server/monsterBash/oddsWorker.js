// Computes live odds off the main thread. Each odds point plays the fight out
// ~100 times, which would stall API requests if it ran on the event loop.

import { parentPort } from 'node:worker_threads';
import { estimateWinProbability, simulateFight } from '../../shared/monster-bash/index.js';

function roundProbability(p) {
    return Math.round(p * 1000) / 1000;
}

parentPort.on('message', ({ jobId, seed, fighters, checkpointEvery, rollouts, pregameOnly }) => {
    try {
        const fight = simulateFight({ seed, fighters }, { frameEvery: 1e9, checkpointEvery });
        const checkpoints = pregameOnly ? fight.checkpoints.slice(0, 1) : fight.checkpoints;
        // Points stream back one at a time so the earliest ones are ready first.
        for (const { t, state } of checkpoints) {
            const p = roundProbability(estimateWinProbability(state, { rollouts, salt: seed }));
            parentPort.postMessage({ jobId, point: { t, p } });
        }
        if (!pregameOnly) {
            parentPort.postMessage({ jobId, point: { t: fight.durationTicks, p: fight.winner === 0 ? 1 : 0 } });
        }
        parentPort.postMessage({ jobId, done: true });
    } catch (error) {
        parentPort.postMessage({ jobId, error: error.message });
    }
});
