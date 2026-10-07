// Casino slots: three reels of monsters. Every reel stops on a symbol picked by
// weight, so the odds are exactly what the table below says. `three` pays for
// three of a kind; `pair` pays when only the first two reels match. Both are
// what a 1 ticket bet gets back. Tuned with `npm run balance:casino`.

export const SLOT_REELS = 3;

export const SLOT_SYMBOLS = [
    { id: 'candle', monster: 'candle', weight: 28, three: 4, pair: 1 },
    { id: 'rat', monster: 'rat', weight: 24, three: 8, pair: 2 },
    { id: 'pumpkin', monster: 'pumpkin', weight: 20, three: 15, pair: 3 },
    { id: 'ghost', monster: 'ghost', weight: 14, three: 25, pair: 5 },
    { id: 'skull', monster: 'skull', weight: 9, three: 50, pair: 8 },
    { id: 'werewolf', monster: 'werewolf', weight: 5, three: 100, pair: 10 },
];

const SYMBOLS_BY_ID = Object.fromEntries(SLOT_SYMBOLS.map((symbol) => [symbol.id, symbol]));
const TOTAL_WEIGHT = SLOT_SYMBOLS.reduce((sum, symbol) => sum + symbol.weight, 0);

function pickSymbol(rng) {
    let roll = rng() * TOTAL_WEIGHT;
    for (const symbol of SLOT_SYMBOLS) {
        roll -= symbol.weight;
        if (roll < 0) return symbol.id;
    }
    return SLOT_SYMBOLS[SLOT_SYMBOLS.length - 1].id;
}

export function spinReels(rng) {
    return Array.from({ length: SLOT_REELS }, () => pickSymbol(rng));
}

// What a spin pays per ticket bet, and which line it was.
export function slotResult(reels) {
    const [a, b, c] = reels;
    if (a === b && b === c) return { line: 'three', multiplier: SYMBOLS_BY_ID[a].three };
    if (a === b) return { line: 'pair', multiplier: SYMBOLS_BY_ID[a].pair };
    return { line: null, multiplier: 0 };
}

// The exact share of tickets bet that comes back, over every possible spin.
export function slotReturnToPlayer() {
    let expected = 0;
    for (const a of SLOT_SYMBOLS) {
        for (const b of SLOT_SYMBOLS) {
            for (const c of SLOT_SYMBOLS) {
                const chance = (a.weight * b.weight * c.weight) / TOTAL_WEIGHT ** 3;
                expected += chance * slotResult([a.id, b.id, c.id]).multiplier;
            }
        }
    }
    return expected;
}
