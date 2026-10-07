// Picture Poker: five picture cards each for the player and the dealer, one
// chance to swap any of them, best hand wins. There are no suits or runs, only
// matching pictures, and every card is dealt fresh (any picture can come up
// any number of times). Tuned with `npm run balance:casino`.

export const POKER_HAND_SIZE = 5;

export const POKER_SYMBOLS = ['candle', 'rat', 'pumpkin', 'ghost', 'skull', 'werewolf'];

// Lowest to highest. `multiplier` is what a 1 coin bet gets back for beating
// the dealer with that hand (junk can't beat anything).
export const POKER_HANDS = [
    { id: 'junk', name: 'Junk', multiplier: 0 },
    { id: 'pair', name: 'One pair', multiplier: 2 },
    { id: 'two_pair', name: 'Two pairs', multiplier: 2 },
    { id: 'three', name: 'Three of a kind', multiplier: 2 },
    { id: 'full_house', name: 'Full house', multiplier: 2 },
    { id: 'four', name: 'Four of a kind', multiplier: 3 },
    { id: 'five', name: 'Five of a kind', multiplier: 10 },
];

const HAND_BY_SHAPE = { 11111: 0, 2111: 1, 221: 2, 311: 3, 32: 4, 41: 5, 5: 6 };

export function isPokerCard(card) {
    return POKER_SYMBOLS.includes(card);
}

export function dealCards(rng, count = POKER_HAND_SIZE) {
    return Array.from({ length: count }, () => POKER_SYMBOLS[Math.floor(rng() * POKER_SYMBOLS.length)]);
}

function countCards(cards) {
    const counts = new Map();
    for (const card of cards) counts.set(card, (counts.get(card) ?? 0) + 1);
    return counts;
}

// Which kind of hand the cards make; `rank` indexes POKER_HANDS.
export function evaluateHand(cards) {
    const shape = [...countCards(cards).values()].sort((a, b) => b - a).join('');
    const rank = HAND_BY_SHAPE[shape];
    return { rank, ...POKER_HANDS[rank] };
}

// The player has to show a better kind of hand: the dealer takes equal hands.
export function pokerOutcome(playerCards, dealerCards) {
    return evaluateHand(playerCards).rank > evaluateHand(dealerCards).rank ? 'win' : 'lose';
}

// What the round pays back in all: the hand's multiplier for a win, nothing
// for a loss.
export function pokerPayout(stake, playerCards, dealerCards) {
    return pokerOutcome(playerCards, dealerCards) === 'win' ? stake * evaluateHand(playerCards).multiplier : 0;
}

// The dealer keeps every card that matches another and swaps the rest.
export function dealerHolds(cards) {
    const counts = countCards(cards);
    return cards.map((card) => counts.get(card) > 1);
}

export function drawCards(cards, holds, rng) {
    return cards.map((card, index) => (holds[index] ? card : dealCards(rng, 1)[0]));
}

export function parseHolds(raw) {
    if (!Array.isArray(raw) || raw.length !== POKER_HAND_SIZE) return null;
    return raw.every((hold) => typeof hold === 'boolean') ? raw : null;
}
