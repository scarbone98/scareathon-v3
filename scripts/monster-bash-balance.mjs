// Plays every Monster Bash pairing many times and reports how balanced the
// roster is. Usage: npm run balance:monster-bash -- [--fights=200] [--odds]

import { performance } from 'node:perf_hooks';
import {
    MONSTERS,
    TICK_RATE,
    buildOddsSeries,
    simulateFight,
} from '../shared/monster-bash/index.js';

const args = Object.fromEntries(
    process.argv.slice(2).map((arg) => {
        const [key, value] = arg.replace(/^--/, '').split('=');
        return [key, value ?? 'true'];
    })
);
const fightsPerSide = Number(args.fights || 200);

const ids = MONSTERS.map((monster) => monster.id);
const wins = Object.fromEntries(ids.map((id) => [id, 0]));
const played = Object.fromEntries(ids.map((id) => [id, 0]));
const matchup = Object.fromEntries(ids.map((a) => [a, Object.fromEntries(ids.map((b) => [b, 0]))]));
let totalTicks = 0;
let totalFights = 0;
let rounds = 0;
let timeouts = 0;
let sideZeroWins = 0;

const started = performance.now();
for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
        for (let n = 0; n < fightsPerSide * 2; n++) {
            // Swap sides every other fight so starting position can't skew results.
            const fighters = n % 2 === 0 ? [ids[i], ids[j]] : [ids[j], ids[i]];
            const result = simulateFight({ seed: `balance-${i}-${j}-${n}`, fighters }, { frameEvery: 1e9 });
            const winner = fighters[result.winner];
            const loser = fighters[1 - result.winner];
            wins[winner] += 1;
            played[winner] += 1;
            played[loser] += 1;
            matchup[winner][loser] += 1;
            totalTicks += result.durationTicks;
            totalFights += 1;
            rounds += result.rounds.length;
            timeouts += result.rounds.filter((round) => round.reason === 'time').length;
            if (result.winner === 0) sideZeroWins += 1;
        }
    }
}
const elapsed = performance.now() - started;

const pct = (value) => `${(value * 100).toFixed(1)}%`.padStart(6);

console.log(`\n${totalFights} fights in ${(elapsed / 1000).toFixed(1)}s (${(elapsed / totalFights).toFixed(2)} ms/fight)`);
console.log(`avg fight ${(totalTicks / totalFights / TICK_RATE).toFixed(1)}s, ${(rounds / totalFights).toFixed(2)} rounds, ${pct(timeouts / rounds)} of rounds end on time, left side wins ${pct(sideZeroWins / totalFights)}\n`);

console.log('Overall win rate');
const ranked = [...ids].sort((a, b) => wins[b] / played[b] - wins[a] / played[a]);
for (const id of ranked) {
    console.log(`  ${id.padEnd(12)} ${pct(wins[id] / played[id])}`);
}

console.log('\nMatchups (row beats column)');
console.log(`${''.padEnd(12)}${ranked.map((id) => id.slice(0, 6).padStart(7)).join('')}`);
let worst = { spread: 0 };
for (const a of ranked) {
    const cells = ranked.map((b) => {
        if (a === b) return '     -';
        const total = matchup[a][b] + matchup[b][a];
        const rate = matchup[a][b] / total;
        if (Math.abs(rate - 0.5) > worst.spread) worst = { spread: Math.abs(rate - 0.5), a, b, rate };
        return pct(rate);
    });
    console.log(`${a.padEnd(12)}${cells.map((cell) => cell.padStart(7)).join('')}`);
}
console.log(`\nMost lopsided matchup: ${worst.a} beats ${worst.b} ${pct(worst.rate)}`);

if (args.odds) {
    const sample = simulateFight({ seed: 'odds-sample', fighters: [ids[0], ids[1]] }, { checkpointEvery: TICK_RATE });
    const oddsStart = performance.now();
    const series = buildOddsSeries(sample.checkpoints, sample.finalState);
    const oddsMs = performance.now() - oddsStart;
    console.log(`\nOdds series for a ${(sample.durationTicks / TICK_RATE).toFixed(0)}s fight: ${series.length} points in ${oddsMs.toFixed(0)}ms (${(oddsMs / series.length).toFixed(1)} ms/point)`);
    console.log(series.map((point) => Math.round(point.p * 100)).join(' '));
}
