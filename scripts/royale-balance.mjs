// Balance report for the lane battler. Three views:
//   1. Power curve: does each card's raw strength match its elixir cost?
//   2. Duels: every unit card against every other on an empty field.
//   3. Bot matches with random decks: per-card win rates and match pacing.
// Usage: npm run balance:royale -- [--matches=400] [--no-duels] [--no-matches]

import { performance } from 'node:perf_hooks';
import {
    BRIDGE_X,
    CARDS,
    DECK_SIZE,
    TICK_RATE,
    cardPower,
    createMatch,
    simulateMatch,
    spawnCard,
    stepMatch,
} from '../server/shared/royale/index.js';
import { createRng, random } from '../server/shared/monster-bash/rng.js';

const args = Object.fromEntries(
    process.argv.slice(2).map((arg) => {
        const [key, value] = arg.replace(/^--/, '').split('=');
        return [key, value ?? 'true'];
    })
);
const pct = (value) => `${(value * 100).toFixed(0)}%`;
const pad = (value, n) => String(value).padStart(n);

// ---------- 1. power curve ----------

const units = CARDS.filter((c) => c.type !== 'spell');
const perElixir = units.map((c) => cardPower(c) / c.cost).sort((a, b) => a - b);
const median = perElixir[Math.floor(perElixir.length / 2)];
console.log('\nPower curve (power = sqrt(effective hp x dps), flagged when >20% off the median per elixir)');
console.log(`${'card'.padEnd(14)}${pad('cost', 5)}${pad('power', 7)}${pad('/elixir', 9)}`);
for (const card of [...units].sort((a, b) => a.cost - b.cost || cardPower(a) - cardPower(b))) {
    const power = cardPower(card);
    const ratio = power / card.cost / median;
    const flag = ratio > 1.2 ? '  <- strong for its cost' : ratio < 0.8 ? '  <- weak for its cost' : '';
    console.log(`${card.id.padEnd(14)}${pad(card.cost, 5)}${pad(power.toFixed(0), 7)}${pad((power / card.cost).toFixed(0), 9)}${flag}`);
}
const byCost = {};
for (const c of units) (byCost[c.cost] ??= []).push(cardPower(c));
const tiers = Object.entries(byCost).map(([cost, list]) => [Number(cost), list.reduce((a, b) => a + b, 0) / list.length]);
console.log(`avg power by cost: ${tiers.map(([cost, p]) => `${cost}e ${p.toFixed(0)}`).join(', ')}`);
const monotonic = tiers.every(([, p], i) => i === 0 || p > tiers[i - 1][1]);
console.log(monotonic ? 'OK: pricier tiers are stronger on average' : 'WARNING: a pricier tier is weaker on average than a cheaper one');

// ---------- 2. duels ----------

// Counters are allowed to beat pricier cards: air beats ground-only melee,
// swarms beat slow single-target hitters.
function isCounter(winner, loser) {
    if (winner.flying && loser.targets !== 'all') return true;
    if ((winner.count ?? 1) >= 3 && !loser.splash && loser.hitSpeed >= 1.1) return true;
    if (winner.splash && (loser.count ?? 1) >= 3) return true;
    return false;
}

function duel(a, b) {
    const state = createMatch({ seed: `duel-${a.id}-${b.id}`, decks: [CARDS.slice(0, DECK_SIZE).map((c) => c.id), CARDS.slice(0, DECK_SIZE).map((c) => c.id)] }, { towers: false });
    // Same lane, so ground units meet on one bridge instead of splitting.
    spawnCard(state, 0, a.id, BRIDGE_X, 4);
    spawnCard(state, 1, b.id, BRIDGE_X, -4);
    for (let t = 0; t < 60 * TICK_RATE; t++) {
        stepMatch(state);
        const left = [0, 1].map((team) => state.units.filter((u) => u.team === team));
        if (!left[0].length || !left[1].length) break;
    }
    const hpLeft = (team, card) =>
        state.units.filter((u) => u.team === team).reduce((sum, u) => sum + u.hp, 0) / (card.hp * (card.count ?? 1));
    const ha = hpLeft(0, a);
    const hb = hpLeft(1, b);
    if (ha > 0 && hb > 0) return { winner: null };
    return ha > 0 ? { winner: 0, left: ha } : hb > 0 ? { winner: 1, left: hb } : { winner: null };
}

if (args['no-duels'] === undefined) {
    const fighters = units.filter((c) => c.targets !== 'buildings');
    console.log('\nDuels on an empty field (row vs column: % hp the row card keeps, - = loses, = = draw)');
    console.log(`${''.padEnd(12)}${fighters.map((c) => c.id.slice(0, 6).padStart(7)).join('')}`);
    const upsets = [];
    for (const a of fighters) {
        const cells = fighters.map((b) => {
            if (a === b) return '     .';
            const r = duel(a, b);
            if (r.winner === null) return '     =';
            if (r.winner === 1) return '     -';
            if (a.cost + 2 <= b.cost && !isCounter(a, b)) upsets.push(`${a.id} (${a.cost}e) beats ${b.id} (${b.cost}e) with ${pct(r.left)} hp left`);
            return pct(r.left).padStart(6);
        });
        console.log(`${a.id.padEnd(12)}${cells.map((c) => c.padStart(7)).join('')}`);
    }
    console.log(upsets.length ? `\nUpsets (cheaper by 2+ elixir, not a designed counter):\n  ${upsets.join('\n  ')}` : '\nNo upsets: nothing beats a card 2+ elixir pricier unless it is a designed counter');
}

// ---------- 3. bot matches ----------

if (args['no-matches'] === undefined) {
    const matches = Number(args.matches || 400);
    const ids = CARDS.map((c) => c.id);
    const rng = createRng('royale-balance');
    const randomDeck = () => {
        const pool = [...ids];
        for (let i = pool.length - 1; i > 0; i--) {
            const j = Math.floor(random(rng) * (i + 1));
            [pool[i], pool[j]] = [pool[j], pool[i]];
        }
        return pool.slice(0, DECK_SIZE);
    };
    const inDeck = Object.fromEntries(ids.map((id) => [id, { games: 0, wins: 0, plays: 0, damage: 0 }]));
    let side0 = 0;
    let draws = 0;
    let overtime = 0;
    let ticks = 0;
    let crowns = 0;
    let costWinner = 0;
    let costLoser = 0;
    let decided = 0;
    const started = performance.now();
    for (let n = 0; n < matches; n++) {
        const decks = [randomDeck(), randomDeck()];
        const r = simulateMatch({ seed: `balance-${n}`, decks });
        const { winner, reason } = r.result;
        ticks += r.result.tick;
        crowns += r.state.players[0].crowns + r.state.players[1].crowns;
        if (reason === 'overtime' || reason === 'tiebreak' || reason === 'draw') overtime += 1;
        if (winner === null) draws += 1;
        else {
            decided += 1;
            if (winner === 0) side0 += 1;
            const avg = (deck) => deck.reduce((sum, id) => sum + CARDS.find((c) => c.id === id).cost, 0) / DECK_SIZE;
            costWinner += avg(decks[winner]);
            costLoser += avg(decks[1 - winner]);
        }
        for (const team of [0, 1]) {
            for (const id of decks[team]) {
                const s = inDeck[id];
                s.games += 1;
                if (winner === team) s.wins += 1;
                else if (winner === null) s.wins += 0.5;
                s.plays += r.played[team][id] ?? 0;
                s.damage += r.damageByCard[team][id] ?? 0;
            }
        }
    }
    const elapsed = performance.now() - started;
    console.log(`\n${matches} bot matches in ${(elapsed / 1000).toFixed(1)}s (${(elapsed / matches).toFixed(1)} ms/match)`);
    console.log(`avg length ${(ticks / matches / TICK_RATE).toFixed(0)}s, ${pct(overtime / matches)} go to overtime, ${pct(draws / matches)} draws, ${(crowns / matches).toFixed(2)} crowns/match, side 0 wins ${pct(side0 / Math.max(1, decided))}`);
    console.log(`avg deck cost: winners ${(costWinner / Math.max(1, decided)).toFixed(2)}, losers ${(costLoser / Math.max(1, decided)).toFixed(2)}`);
    console.log(`\n${'card'.padEnd(14)}${pad('cost', 5)}${pad('win%', 7)}${pad('plays/g', 9)}${pad('dmg/play', 10)}`);
    const rows = ids.map((id) => ({ id, ...inDeck[id], cost: CARDS.find((c) => c.id === id).cost }));
    rows.sort((a, b) => b.wins / b.games - a.wins / a.games);
    for (const row of rows) {
        console.log(
            `${row.id.padEnd(14)}${pad(row.cost, 5)}${pad(pct(row.wins / row.games), 7)}${pad((row.plays / row.games).toFixed(1), 9)}${pad(row.plays ? (row.damage / row.plays).toFixed(0) : '-', 10)}`
        );
    }
}
