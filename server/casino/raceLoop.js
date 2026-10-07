import { makeRaceCard, racePayout, runRace } from '../shared/casino/index.js';
import { RoundRefusedError } from './repository.js';

export const RACE_GAME = 'racing';

const DEFAULT_CONFIG = {
    // How long a race takes bets before the off.
    bettingMs: 30_000,
    // How long the finish stays up before the next race is announced.
    resultMs: 8_000,
    // Slack after the last monster crosses the line before bets are paid.
    settleDelayMs: 600,
};

// Runs monster races forever, one after another, for everyone at once: announce
// the field and take bets, run the race when betting closes, show it, pay the
// winners, repeat. Nothing touches the database unless someone bets.
//
// A bet's stake is taken when it's placed (an open casino round) and paid when
// the race has been shown. If the server dies in between, the open rounds are
// refunded on the next start.
export class RaceLoop {
    constructor({ repo, hub, log, rng, config = {}, now = Date.now }) {
        this.repo = repo;
        this.hub = hub;
        this.log = log;
        this.rng = rng;
        this.now = now;
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.current = null;
        this.timer = null;
        this.running = false;
        this.raceCount = 0;
        // Set when a bet couldn't be paid, so the next race starts by refunding it.
        this.owesRefunds = false;
    }

    async start() {
        await this.refundOpenBets();
        this.running = true;
        this.openRace();
    }

    stop() {
        this.running = false;
        clearTimeout(this.timer);
        if (this.current?.bets.size) {
            this.log.warn({ raceId: this.current.id, bets: this.current.bets.size }, 'Race loop stopping with bets on a race; they are refunded on the next start');
        }
    }

    schedule(step, ms) {
        if (!this.running) return;
        this.timer = setTimeout(() => {
            Promise.resolve()
                .then(() => step.call(this))
                .catch((error) => {
                    this.log.error({ err: error }, 'Race loop step failed; starting a new race');
                    this.owesRefunds = true;
                    this.schedule(this.nextRace, this.config.resultMs);
                });
        }, ms);
        this.timer.unref?.();
    }

    // Gives back the stake of every racing bet still open. Only called when no
    // race has bets on it, so anything open was left behind by a crash.
    async refundOpenBets() {
        const rounds = await this.repo.findOpenRounds(RACE_GAME);
        for (const round of rounds) {
            await this.repo.settleRound({ userId: round.userId, roundId: round.id, payout: round.stake, state: { refunded: true } });
        }
        if (rounds.length > 0) this.log.warn({ refunded: rounds.length }, 'Refunded bets on races that never finished');
        this.owesRefunds = false;
    }

    async nextRace() {
        if (this.owesRefunds) {
            await this.refundOpenBets().catch((error) => this.log.error({ err: error }, 'Could not refund unfinished race bets'));
        }
        this.openRace();
    }

    openRace() {
        this.raceCount += 1;
        this.current = {
            // Unique across restarts, so an old tab can't bet on a new race by number.
            id: `${this.now().toString(36)}-${this.raceCount}`,
            runners: makeRaceCard(this.rng),
            bettingClosesAt: this.now() + this.config.bettingMs,
            start: null,
            settled: false,
            bets: new Map(),
        };
        this.hub.broadcast(this.raceMessage());
        this.schedule(this.closeRace, this.config.bettingMs);
    }

    // Betting is over: the race is run now, and shown from now.
    closeRace() {
        const race = this.current;
        const result = runRace(race.runners, this.rng);
        race.start = { ...result, startedAt: this.now() };
        this.hub.broadcast({ type: 'start', id: race.id, ...race.start, now: this.now() });
        this.schedule(this.finishRace, Math.max(...result.times) * 1000 + this.config.settleDelayMs);
    }

    async finishRace() {
        const race = this.current;
        for (const [userId, bet] of race.bets) {
            try {
                // A bet still being written when the race ended is waited for.
                const roundId = await bet.placed;
                const payout = race.start.winner === bet.lane ? racePayout(bet.amount, bet.odds) : 0;
                await this.repo.settleRound({
                    userId, roundId, payout, state: { raceId: race.id, lane: bet.lane, odds: bet.odds, order: race.start.order },
                });
            } catch (error) {
                if (error instanceof RoundRefusedError) continue;
                this.owesRefunds = true;
                this.log.error({ err: error, raceId: race.id, userId }, 'Could not pay a race bet; it will be refunded');
            }
        }
        race.settled = true;
        this.hub.broadcast({ type: 'finished', id: race.id });
        this.schedule(this.nextRace, this.config.resultMs);
    }

    async placeBet({ userId, raceId, lane, amount }) {
        const race = this.current;
        if (!race || race.id !== raceId || race.start || this.now() >= race.bettingClosesAt) {
            throw new RoundRefusedError('betting_closed');
        }
        if (race.bets.has(userId)) throw new RoundRefusedError('already_bet');

        const { odds, monster } = race.runners[lane];
        const opening = this.repo.openRound({ userId, game: RACE_GAME, stake: amount, state: { raceId, lane, monster, odds } });
        // Held from before the write starts, so a second request can't slip past.
        const bet = { lane, amount, odds, placed: opening.then((opened) => opened.roundId) };
        bet.placed.catch(() => {});
        race.bets.set(userId, bet);
        try {
            const { balance } = await opening;
            this.hub.broadcast({ type: 'bets', id: race.id, counts: this.betCounts(race) });
            return { bet: this.publicBet(race, bet), balance };
        } catch (error) {
            race.bets.delete(userId);
            // An earlier bet of theirs was never paid: refund it before the next race.
            if (error instanceof RoundRefusedError && error.code === 'round_in_progress') {
                this.owesRefunds = true;
                throw new RoundRefusedError('bet_unsettled');
            }
            throw error;
        }
    }

    // The player's bet on the race that's on now, if they have one.
    betFor(userId) {
        const bet = this.current?.bets.get(userId);
        return bet ? this.publicBet(this.current, bet) : null;
    }

    publicBet(race, bet) {
        return { raceId: race.id, lane: bet.lane, amount: bet.amount, odds: bet.odds };
    }

    betCounts(race) {
        const counts = race.runners.map(() => 0);
        for (const bet of race.bets.values()) counts[bet.lane] += 1;
        return counts;
    }

    // The race as everyone sees it: the odds, not the chances behind them.
    raceMessage() {
        const race = this.current;
        return {
            type: 'race',
            race: {
                id: race.id,
                runners: race.runners.map(({ monster, odds }) => ({ monster, odds })),
                bettingClosesAt: race.bettingClosesAt,
                counts: this.betCounts(race),
                start: race.start,
                settled: race.settled,
            },
            now: this.now(),
        };
    }

    // Everything a new viewer needs to join mid-race.
    welcomeMessages() {
        return this.current ? [this.raceMessage()] : [];
    }
}
