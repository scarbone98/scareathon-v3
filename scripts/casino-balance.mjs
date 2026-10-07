// Reports how much of every coin bet each casino game pays back.
// Usage: npm run balance:casino -- [--races=200000]
//
// Slots and roulette are exact. Picture Poker is exact for a player who makes
// the best possible swap every hand (so no one can do better than this).
// Racing is measured over many random cards.

import {
    POKER_HANDS,
    POKER_HAND_SIZE,
    POKER_SYMBOLS,
    ROULETTE_BETS,
    ROULETTE_WHEEL,
    SLOT_SYMBOLS,
    dealerHolds,
    evaluateHand,
    makeRaceCard,
    racePayout,
    slotResult,
    slotReturnToPlayer,
} from '../server/shared/casino/index.js';
import { createRng, random } from '../server/shared/monster-bash/rng.js';

const args = Object.fromEntries(
    process.argv.slice(2).map((arg) => {
        const [key, value = 'true'] = arg.replace(/^--/, '').split('=');
        return [key, value];
    })
);
const pct = (value) => `${(value * 100).toFixed(2)}%`;

function slotsReport() {
    const total = SLOT_SYMBOLS.reduce((sum, symbol) => sum + symbol.weight, 0);
    let hit = 0;
    for (const a of SLOT_SYMBOLS) for (const b of SLOT_SYMBOLS) for (const c of SLOT_SYMBOLS) {
        if (slotResult([a.id, b.id, c.id]).multiplier > 0) hit += (a.weight * b.weight * c.weight) / total ** 3;
    }
    console.log(`Slots          pays back ${pct(slotReturnToPlayer())}, a spin pays ${pct(hit)} of the time`);
}

function rouletteReport() {
    for (const [type, kind] of Object.entries(ROULETTE_BETS)) {
        const wins = ROULETTE_WHEEL.filter((number) => kind.wins(number, 1)).length;
        console.log(`Roulette ${type.padEnd(9)}pays back ${pct((wins * (kind.pays + 1)) / ROULETTE_WHEEL.length)}`);
    }
}

// Every way to fill `count` cards, as [cards, chance].
function everyDraw(count) {
    let draws = [[[], 1]];
    for (let i = 0; i < count; i++) {
        draws = draws.flatMap(([cards, chance]) => POKER_SYMBOLS.map((symbol) => [[...cards, symbol], chance / POKER_SYMBOLS.length]));
    }
    return draws;
}

function pokerReport() {
    const hands = everyDraw(POKER_HAND_SIZE);
    const draws = Array.from({ length: POKER_HAND_SIZE + 1 }, (_, count) => everyDraw(count));

    // How often the dealer ends on each kind of hand.
    const dealer = POKER_HANDS.map(() => 0);
    for (const [cards, chance] of hands) {
        const holds = dealerHolds(cards);
        const swaps = holds.filter((hold) => !hold).length;
        for (const [drawn, drawChance] of draws[swaps]) {
            let next = 0;
            const final = cards.map((card, i) => (holds[i] ? card : drawn[next++]));
            dealer[evaluateHand(final).rank] += chance * drawChance;
        }
    }

    // What a finished player hand is worth against that dealer.
    const worth = new Map();
    const worthOf = (cards) => {
        const key = [...cards].sort().join();
        if (worth.has(key)) return worth.get(key);
        const hand = evaluateHand(cards);
        let value = 0;
        for (let rank = 0; rank < hand.rank; rank++) value += dealer[rank] * hand.multiplier;
        worth.set(key, value);
        return value;
    };

    let best = 0;
    let matching = 0;
    const seen = new Map();
    for (const [cards, chance] of hands) {
        const key = [...cards].sort().join();
        if (!seen.has(key)) {
            const sorted = key.split(',');
            let top = 0;
            for (let mask = 0; mask < 2 ** POKER_HAND_SIZE; mask++) {
                const kept = sorted.filter((_, i) => mask & (1 << i));
                let value = 0;
                for (const [drawn, drawChance] of draws[POKER_HAND_SIZE - kept.length]) value += drawChance * worthOf([...kept, ...drawn]);
                top = Math.max(top, value);
            }
            const holds = dealerHolds(sorted);
            const kept = sorted.filter((_, i) => holds[i]);
            let simple = 0;
            for (const [drawn, drawChance] of draws[POKER_HAND_SIZE - kept.length]) simple += drawChance * worthOf([...kept, ...drawn]);
            seen.set(key, [top, simple]);
        }
        best += chance * seen.get(key)[0];
        matching += chance * seen.get(key)[1];
    }
    console.log(`Picture Poker  pays back ${pct(best)} with perfect swaps, ${pct(matching)} keeping only matching cards`);
    console.log(`               (${POKER_HANDS.filter((hand) => hand.multiplier > 0).map((hand) => `${hand.name} ${hand.multiplier}x`).join(', ')})`);
}

function racingReport() {
    const races = Number.parseInt(args.races ?? '200000', 10);
    const rng = createRng('casino-balance');
    const next = () => random(rng);
    let low = Infinity;
    let high = 0;
    let sum = 0;
    for (let i = 0; i < races; i++) {
        for (const runner of makeRaceCard(next)) {
            const back = runner.chance * (racePayout(100, runner.odds) / 100);
            low = Math.min(low, back);
            high = Math.max(high, back);
            sum += back;
        }
    }
    console.log(`Racing         pays back ${pct(sum / (races * 6))} on average (${pct(low)} to ${pct(high)} depending on the monster)`);
}

slotsReport();
rouletteReport();
pokerReport();
racingReport();
