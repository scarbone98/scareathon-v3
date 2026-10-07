import { randomInt, randomUUID } from 'node:crypto';
import {
    POKER_HAND_SIZE,
    RACE_FIELD,
    dealCards,
    dealerHolds,
    drawCards,
    evaluateHand,
    isPokerCard,
    makeRaceCard,
    parseHolds,
    parseRouletteBets,
    pokerOutcome,
    pokerPayout,
    racePayout,
    rouletteColor,
    runRace,
    settleRoulette,
    slotResult,
    spinReels,
    spinRoulette,
} from '../shared/casino/index.js';
import { RoundRefusedError, createCasinoRepository } from '../casino/repository.js';

const PRUNE_INTERVAL_MS = 24 * 60 * 60 * 1000;
// Race cards wait in memory for a bet; a restart just deals everyone a new one.
const MAX_RACE_CARDS = 5000;

export const MIN_BET = 1;

function readPositiveInt(value, fallback) {
    const parsed = Number.parseInt(value ?? '', 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function isCasinoEnabled(env = process.env) {
    return env.CASINO_ENABLED !== 'false';
}

// Outcomes come from the operating system's generator, not Math.random.
export function secureRandom() {
    return randomInt(0, 2 ** 32) / 2 ** 32;
}

// The coins to bet, or null if the amount isn't a whole number in range.
export function parseStake(amount, maxBet) {
    return Number.isSafeInteger(amount) && amount >= MIN_BET && amount <= maxBet ? amount : null;
}

// Returns the bet on a race, or null if the request is malformed.
export function parseRaceBet(body, maxBet) {
    const amount = parseStake(body?.amount, maxBet);
    const { cardId, lane } = body ?? {};
    if (amount === null || typeof cardId !== 'string') return null;
    if (!Number.isInteger(lane) || lane < 0 || lane >= RACE_FIELD) return null;
    return { cardId, lane, amount };
}

// A poker round's saved cards, or null if the row isn't what a deal wrote.
function readPokerState(state) {
    const valid = (cards) => Array.isArray(cards) && cards.length === POKER_HAND_SIZE && cards.every(isPokerCard);
    return valid(state?.cards) && valid(state?.dealer) ? state : null;
}

const REFUSAL_MESSAGES = {
    insufficient_funds: "You don't have enough coins for that bet.",
    round_in_progress: 'Finish the hand you have first.',
    round_not_open: 'That hand is already over.',
    invalid_amount: 'That bet amount is not allowed.',
};

export default async function casinoRoutes(fastify, { repo = createCasinoRepository(), rng = secureRandom } = {}) {
    const log = fastify.log.child({ feature: 'casino' });
    const maxBet = readPositiveInt(process.env.CASINO_MAX_BET, 100);
    const retentionDays = readPositiveInt(process.env.CASINO_RETENTION_DAYS, 14);
    const limits = { minBet: MIN_BET, maxBet };
    const raceCards = new Map();

    const badBet = (reply, message) => reply.code(400).send({ error: 'invalid_bet', message });

    // Runs a route's coin movement, turning refusals and failures into replies.
    async function settle(request, reply, work) {
        try {
            return await work();
        } catch (error) {
            if (error instanceof RoundRefusedError) {
                return reply.code(409).send({ error: error.code, message: REFUSAL_MESSAGES[error.code] });
            }
            request.log.error({ err: error }, 'Casino round failed');
            return reply.code(503).send({ error: 'round_failed', message: 'The casino is having trouble. Try again.' });
        }
    }

    function raceCardFor(userId) {
        let card = raceCards.get(userId);
        if (!card) {
            if (raceCards.size >= MAX_RACE_CARDS) raceCards.delete(raceCards.keys().next().value);
            card = { id: randomUUID(), runners: makeRaceCard(rng) };
            raceCards.set(userId, card);
        }
        return card;
    }

    // The card as a player sees it: the odds, not the chances behind them.
    const publicCard = (card) => ({
        id: card.id,
        runners: card.runners.map(({ monster, odds }) => ({ monster, odds })),
    });

    // The signed-in player's coins and the betting limits.
    fastify.get('/me', async (request, reply) => {
        try {
            return { balance: await repo.getBalance(request.user.sub), limits };
        } catch (error) {
            request.log.error({ err: error }, 'Failed to load casino account');
            return reply.code(503).send({ error: 'Account unavailable' });
        }
    });

    fastify.post('/slots/spin', async (request, reply) => {
        const stake = parseStake(request.body?.amount, maxBet);
        if (stake === null) return badBet(reply, `Bet ${MIN_BET} to ${maxBet} coins.`);
        const reels = spinReels(rng);
        const { line, multiplier } = slotResult(reels);
        const payout = stake * multiplier;
        return settle(request, reply, async () => {
            const { balance } = await repo.playRound({ userId: request.user.sub, game: 'slots', stake, payout, state: { reels } });
            return { reels, line, multiplier, stake, payout, balance };
        });
    });

    fastify.post('/roulette/spin', async (request, reply) => {
        const bets = parseRouletteBets(request.body?.bets, limits);
        if (!bets) return badBet(reply, `Place ${MIN_BET} to ${maxBet} coins in all.`);
        const stake = bets.reduce((sum, bet) => sum + bet.amount, 0);
        const number = spinRoulette(rng);
        const result = settleRoulette(bets, number);
        return settle(request, reply, async () => {
            const { balance } = await repo.playRound({
                userId: request.user.sub, game: 'roulette', stake, payout: result.payout, state: { number, bets },
            });
            return { number, color: rouletteColor(number), bets: result.bets, stake, payout: result.payout, balance };
        });
    });

    // The race the player can bet on next. It stays the same until they do.
    fastify.get('/racing/card', async (request) => publicCard(raceCardFor(request.user.sub)));

    fastify.post('/racing/bet', async (request, reply) => {
        const bet = parseRaceBet(request.body, maxBet);
        if (!bet) return badBet(reply, `Pick a monster and bet ${MIN_BET} to ${maxBet} coins.`);
        const userId = request.user.sub;
        const card = raceCards.get(userId);
        if (!card || card.id !== bet.cardId) {
            return reply.code(409).send({
                error: 'race_changed',
                message: 'That race is over. Here is the next one.',
                card: publicCard(raceCardFor(userId)),
            });
        }
        // The card is spent whatever happens next, so it can't be bet on twice.
        raceCards.delete(userId);
        const race = runRace(card.runners, rng);
        const payout = race.winner === bet.lane ? racePayout(bet.amount, card.runners[bet.lane].odds) : 0;
        return settle(request, reply, async () => {
            const { balance } = await repo.playRound({
                userId,
                game: 'racing',
                stake: bet.amount,
                payout,
                state: { runners: card.runners.map((runner) => runner.monster), lane: bet.lane, order: race.order },
            });
            return { ...race, lane: bet.lane, stake: bet.amount, payout, balance, next: publicCard(raceCardFor(userId)) };
        });
    });

    // The hand the player is in the middle of, if any (the dealer's stays hidden).
    fastify.get('/poker', async (request, reply) => {
        try {
            const round = await repo.findOpenRound(request.user.sub, 'picture_poker');
            const state = round && readPokerState(round.state);
            return { round: state ? { id: round.id, stake: round.stake, cards: state.cards } : null };
        } catch (error) {
            request.log.error({ err: error }, 'Failed to load picture poker hand');
            return reply.code(503).send({ error: 'Hand unavailable' });
        }
    });

    fastify.post('/poker/deal', async (request, reply) => {
        const stake = parseStake(request.body?.amount, maxBet);
        if (stake === null) return badBet(reply, `Bet ${MIN_BET} to ${maxBet} coins.`);
        const state = { cards: dealCards(rng), dealer: dealCards(rng) };
        return settle(request, reply, async () => {
            const { roundId, balance } = await repo.openRound({ userId: request.user.sub, game: 'picture_poker', stake, state });
            return { round: { id: roundId, stake, cards: state.cards }, balance };
        });
    });

    fastify.post('/poker/draw', async (request, reply) => {
        const holds = parseHolds(request.body?.holds);
        if (!holds) return badBet(reply, 'Choose which cards to keep.');
        const userId = request.user.sub;
        return settle(request, reply, async () => {
            const round = await repo.findOpenRound(userId, 'picture_poker');
            const state = round && readPokerState(round.state);
            if (!state) throw new RoundRefusedError('round_not_open');
            const cards = drawCards(state.cards, holds, rng);
            const dealerKept = dealerHolds(state.dealer);
            const dealer = drawCards(state.dealer, dealerKept, rng);
            const payout = pokerPayout(round.stake, cards, dealer);
            const { balance } = await repo.settleRound({
                userId, roundId: round.id, payout, state: { ...state, holds, final: cards, dealerFinal: dealer },
            });
            return {
                cards,
                hand: evaluateHand(cards).id,
                dealer: { dealt: state.dealer, holds: dealerKept, cards: dealer, hand: evaluateHand(dealer).id },
                outcome: pokerOutcome(cards, dealer),
                stake: round.stake,
                payout,
                balance,
            };
        });
    });

    const prune = () => {
        repo.pruneOlderThan(retentionDays)
            .then((removed) => removed > 0 && log.info({ removed }, 'Old casino rounds cleared'))
            .catch((error) => log.warn({ err: error }, 'Could not clear old casino rounds'));
    };
    let pruneTimer = null;
    fastify.addHook('onReady', async () => {
        prune();
        pruneTimer = setInterval(prune, PRUNE_INTERVAL_MS);
        pruneTimer.unref?.();
    });
    fastify.addHook('onClose', async () => {
        clearInterval(pruneTimer);
    });
}
