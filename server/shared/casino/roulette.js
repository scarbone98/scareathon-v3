// Casino roulette: a single-zero wheel with the usual inside and outside bets.
// `pays` is the winnings per ticket bet; the stake comes back on top.

// The pockets in the order they sit around the wheel.
export const ROULETTE_WHEEL = [
    0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10,
    5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
];

const REDS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

export const ROULETTE_MAX_BETS = 24;

export function rouletteColor(number) {
    if (number === 0) return 'green';
    return REDS.has(number) ? 'red' : 'black';
}

// `values` lists what a bet of that kind may be placed on (none: the kind is
// the whole bet).
export const ROULETTE_BETS = {
    straight: { pays: 35, values: ROULETTE_WHEEL.length, wins: (n, value) => n === value },
    red: { pays: 1, wins: (n) => rouletteColor(n) === 'red' },
    black: { pays: 1, wins: (n) => rouletteColor(n) === 'black' },
    odd: { pays: 1, wins: (n) => n > 0 && n % 2 === 1 },
    even: { pays: 1, wins: (n) => n > 0 && n % 2 === 0 },
    low: { pays: 1, wins: (n) => n >= 1 && n <= 18 },
    high: { pays: 1, wins: (n) => n >= 19 },
    // value 0, 1, 2: the first, second and third dozen / column.
    dozen: { pays: 2, values: 3, wins: (n, value) => n > 0 && Math.floor((n - 1) / 12) === value },
    column: { pays: 2, values: 3, wins: (n, value) => n > 0 && (n - 1) % 3 === value },
};

export function rouletteBetKey(bet) {
    return ROULETTE_BETS[bet.type]?.values ? `${bet.type}:${bet.value}` : bet.type;
}

// Returns the bets to place (same spots merged), or null if any is malformed
// or the total is outside the limits.
export function parseRouletteBets(raw, { minBet, maxBet }) {
    if (!Array.isArray(raw) || raw.length === 0 || raw.length > ROULETTE_MAX_BETS * 4) return null;
    const merged = new Map();
    let total = 0;
    for (const entry of raw) {
        const kind = typeof entry?.type === 'string' && Object.hasOwn(ROULETTE_BETS, entry.type) ? ROULETTE_BETS[entry.type] : null;
        if (!kind) return null;
        if (!Number.isSafeInteger(entry.amount) || entry.amount < minBet) return null;
        let value = null;
        if (kind.values) {
            if (!Number.isInteger(entry.value) || entry.value < 0 || entry.value >= kind.values) return null;
            value = entry.value;
        }
        const bet = { type: entry.type, value, amount: entry.amount };
        const key = rouletteBetKey(bet);
        const existing = merged.get(key);
        if (existing) existing.amount += bet.amount;
        else merged.set(key, bet);
        total += bet.amount;
        if (total > maxBet) return null;
    }
    if (merged.size > ROULETTE_MAX_BETS) return null;
    return [...merged.values()];
}

export function spinRoulette(rng) {
    return Math.floor(rng() * ROULETTE_WHEEL.length);
}

// Each bet with what it paid back (stake included; 0 for a loser), and the sum.
export function settleRoulette(bets, number) {
    let payout = 0;
    const results = bets.map((bet) => {
        const kind = ROULETTE_BETS[bet.type];
        const won = kind.wins(number, bet.value);
        const paid = won ? bet.amount * (kind.pays + 1) : 0;
        payout += paid;
        return { ...bet, payout: paid };
    });
    return { payout, bets: results };
}
