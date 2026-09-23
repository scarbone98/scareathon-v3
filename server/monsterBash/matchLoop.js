import { createHash, randomBytes } from 'node:crypto';
import {
    ENGINE_VERSION,
    MONSTERS,
    TICK_RATE,
    simulateFight,
} from '../shared/monster-bash/index.js';
import { ACTIVE_MATCH_CONFLICT, BetRefusedError } from './repository.js';

export const DEFAULT_LOOP_CONFIG = {
    bettingMs: 30_000,
    chunkMs: 1_000,
    resultMs: 8_000,
    retryMs: 15_000,
    retentionDays: 14,
    pruneEveryMs: 60 * 60 * 1000,
    historySize: 8,
    // Pay out just after spectators (who watch ~1.5s behind) see the KO, so
    // balances never spoil the ending.
    settleDelayMs: 2_500,
    settleRetryMs: 5_000,
    settleAttempts: 5,
    poolBroadcastMs: 500,
    // Late joiners get this much recent movement; older frames aren't needed
    // because spectators only ever watch the last few seconds.
    catchUpTicks: 5 * TICK_RATE,
};

export function hashSeed(seed) {
    return createHash('sha256').update(seed).digest('hex');
}

// Two random monsters, never an exact rematch of the previous bout.
export function pickFighters(random = Math.random, previous = null) {
    const ids = MONSTERS.map((monster) => monster.id);
    for (;;) {
        const pool = [...ids];
        const left = pool.splice(Math.floor(random() * pool.length), 1)[0];
        const right = pool[Math.floor(random() * pool.length)];
        const rematch = previous && new Set([left, right, ...previous]).size === 2;
        if (!rematch) return [left, right];
    }
}

function historyEntry(match) {
    return { id: match.id, fighters: match.fighters, winner: match.winner };
}

// Runs Monster Bash forever: open betting, lock, stream the fight, record the
// result, repeat. The database row is the source of truth for recovery; the
// fight itself lives in memory and goes straight to spectators.
export class MonsterBashLoop {
    constructor({ repo, odds, hub, chat = null, log, config = {}, random = Math.random, createSeed = () => randomBytes(16).toString('hex') }) {
        this.repo = repo;
        this.chat = chat;
        this.odds = odds;
        this.hub = hub;
        this.log = log;
        this.config = { ...DEFAULT_LOOP_CONFIG, ...config };
        this.random = random;
        this.createSeed = createSeed;
        this.current = null;
        this.history = [];
        this.lastFighters = null;
        this.timers = new Set();
        this.pruneTimer = null;
        this.poolTimer = null;
        this.stopped = false;
        this.needsRecovery = false;
    }

    async start() {
        await this.recover();
        this.history = (await this.repo.listRecent(this.config.historySize)).map(historyEntry);
        this.pruneTimer = setInterval(() => this.run(() => this.prune()), this.config.pruneEveryMs);
        this.pruneTimer.unref?.();
        this.run(() => this.prune());
        await this.openMatch();
    }

    stop() {
        this.stopped = true;
        this.timers.forEach((timer) => clearTimeout(timer));
        this.timers.clear();
        clearInterval(this.pruneTimer);
        clearTimeout(this.poolTimer);
    }

    // --- scheduling --------------------------------------------------------

    run(step) {
        return Promise.resolve()
            .then(step)
            .catch((error) => this.log.error({ err: error }, 'Monster Bash loop step failed'));
    }

    schedule(step, delayMs) {
        if (this.stopped) return;
        const timer = setTimeout(() => {
            this.timers.delete(timer);
            this.run(step);
        }, Math.max(0, delayMs));
        this.timers.add(timer);
    }

    // --- lifecycle ---------------------------------------------------------

    // Settles bouts left open by a crash or deploy. A bout that was mid-fight
    // is replayed from its seed, so the true winner stands; a bout still taking
    // bets never started and is called off.
    async recover() {
        const open = await this.repo.findOpenMatches();
        for (const match of open) {
            if (match.status === 'fighting' && match.engineVersion === ENGINE_VERSION) {
                const fight = simulateFight({ seed: match.seed, fighters: match.fighters }, { frameEvery: 1e9 });
                await this.repo.markFinished(match.id, {
                    winner: fight.winner,
                    durationTicks: fight.durationTicks,
                    rounds: fight.rounds,
                    finishedAt: match.fightStartsAt + (fight.durationTicks * 1000) / TICK_RATE,
                });
                this.log.info({ matchId: match.id, winner: fight.winner }, 'Monster Bash bout recovered from its seed');
            } else {
                await this.repo.markCancelled(match.id);
                this.log.info({ matchId: match.id, status: match.status }, 'Monster Bash bout cancelled during recovery');
            }
        }

        // Pay out (or refund) any closed bout that still owes coins.
        for (const matchId of await this.repo.findUnsettledMatchIds()) {
            const summary = await this.repo.settleMatch(matchId);
            this.log.info({ matchId, summary }, 'Monster Bash bets settled during recovery');
        }
    }

    async openMatch() {
        if (this.stopped) return;
        if (this.needsRecovery) {
            await this.recover();
            this.needsRecovery = false;
        }

        const fighters = pickFighters(this.random, this.lastFighters);
        const seed = this.createSeed();
        const bettingClosesAt = Date.now() + this.config.bettingMs;

        let row;
        try {
            row = await this.repo.insertMatch({
                fighters,
                engineVersion: ENGINE_VERSION,
                seed,
                seedHash: hashSeed(seed),
                bettingClosesAt,
                fightStartsAt: bettingClosesAt,
            });
        } catch (error) {
            const reason = error.code === ACTIVE_MATCH_CONFLICT ? 'another bout is still open' : 'database error';
            this.log.error({ err: error }, `Monster Bash could not open a bout (${reason}); retrying`);
            this.schedule(() => this.openMatch(), this.config.retryMs);
            return;
        }

        const pregame = await this.odds.pregame(seed, fighters).catch((error) => {
            this.log.warn({ err: error }, 'Monster Bash pre-fight odds failed');
            return null;
        });

        this.current = {
            id: row.id,
            fighters,
            seed,
            seedHash: row.seedHash,
            bettingClosesAt,
            fightStartsAt: bettingClosesAt,
            status: 'betting',
            fight: null,
            pendingOdds: [],
            released: { frames: [], events: [], odds: pregame ? [pregame] : [] },
            pools: { amounts: [0, 0], bettors: [0, 0] },
            result: null,
        };
        this.hub.broadcast(this.matchMessage(this.current));
        this.schedule(() => this.lock(), bettingClosesAt - Date.now());
    }

    async lock() {
        const match = this.current;
        if (!match || match.status !== 'betting') return;

        await this.repo.markFighting(match.id).catch((error) => {
            // The bout still runs; recovery or markFinished will catch the row up.
            this.log.error({ err: error, matchId: match.id }, 'Monster Bash could not mark bout as fighting');
        });

        match.status = 'fighting';
        // Betting is over: take the final pools from the database, which is
        // what payouts will be based on.
        try {
            match.pools = await this.repo.poolTotals(match.id);
        } catch (error) {
            this.log.warn({ err: error, matchId: match.id }, 'Monster Bash could not reload the betting pools');
        }
        clearTimeout(this.poolTimer);
        this.poolTimer = null;
        this.broadcastPools(match);
        match.fight = simulateFight({ seed: match.seed, fighters: match.fighters });
        this.odds
            .stream(match.seed, match.fighters, (point) => {
                // The pre-fight point and the final result are released by the loop.
                if (point.t > 0 && point.t < match.fight.durationTicks) match.pendingOdds.push(point);
            })
            .catch((error) => this.log.warn({ err: error, matchId: match.id }, 'Monster Bash live odds failed'));

        this.schedule(() => this.releaseChunk(), this.config.chunkMs);
    }

    // Sends everything that has "happened" since the last chunk. Nothing is
    // released before its time, so no one can see the ending early.
    releaseChunk() {
        const match = this.current;
        if (!match || match.status !== 'fighting') return;

        const liveTick = ((Date.now() - match.fightStartsAt) * TICK_RATE) / 1000;
        const { fight, released } = match;
        const frames = fight.frames.slice(released.frames.length).filter((frame) => frame.t <= liveTick);
        const events = fight.events.slice(released.events.length).filter((event) => event.t <= liveTick);
        const lastOddsT = released.odds.at(-1)?.t ?? -1;
        const odds = match.pendingOdds.filter((point) => point.t > lastOddsT && point.t <= liveTick);

        released.frames.push(...frames);
        released.events.push(...events);
        released.odds.push(...odds);
        if (frames.length || events.length || odds.length) {
            this.hub.broadcast({ type: 'chunk', chunk: { matchId: match.id, frames, events, odds } });
        }

        if (released.frames.length === fight.frames.length) {
            return this.finish();
        }
        this.schedule(() => this.releaseChunk(), this.config.chunkMs);
    }

    async finish() {
        const match = this.current;
        const { fight } = match;
        match.status = 'finished';
        match.result = { winner: fight.winner, durationTicks: fight.durationTicks };

        const finalOdds = { t: fight.durationTicks, p: fight.winner === 0 ? 1 : 0 };
        match.released.odds.push(finalOdds);
        this.hub.broadcast({ type: 'chunk', chunk: { matchId: match.id, frames: [], events: [], odds: [finalOdds] } });
        this.hub.broadcast({ type: 'result', matchId: match.id, result: match.result });

        this.history = [historyEntry({ ...match, winner: fight.winner }), ...this.history].slice(0, this.config.historySize);
        this.lastFighters = match.fighters;

        try {
            await this.repo.markFinished(match.id, {
                winner: fight.winner,
                durationTicks: fight.durationTicks,
                rounds: fight.rounds,
                finishedAt: Date.now(),
            });
            this.schedule(() => this.settle(match.id), this.config.settleDelayMs);
        } catch (error) {
            // The row stays open; the next bout runs recovery before opening.
            this.needsRecovery = true;
            this.log.error({ err: error, matchId: match.id }, 'Monster Bash could not record the result');
        }

        this.schedule(() => this.openMatch(), this.config.resultMs);
    }

    async settle(matchId, attempt = 1) {
        let summary;
        try {
            summary = await this.repo.settleMatch(matchId);
        } catch (error) {
            this.log.error({ err: error, matchId, attempt }, 'Monster Bash settlement failed');
            if (attempt < this.config.settleAttempts) {
                this.schedule(() => this.settle(matchId, attempt + 1), this.config.settleRetryMs * attempt);
            } else {
                // Recovery before the next bout will pick it up.
                this.needsRecovery = true;
            }
            return;
        }

        this.hub.broadcast({ type: 'settled', matchId, summary });
        if (this.chat && summary.settled > 0) {
            const coins = summary.pool.toLocaleString('en-US');
            const text = summary.refunded
                ? `Bets refunded: ${coins} coins went back (one side had no bets).`
                : `Payouts sent: ${coins} coins split among the winners.`;
            this.hub.broadcast({ type: 'chat', message: this.chat.system(text) });
        }
    }

    // --- betting -----------------------------------------------------------

    async placeBet({ userId, matchId, side, amount }) {
        const match = this.current;
        const open = match
            && match.id === String(matchId)
            && match.status === 'betting'
            && Date.now() < match.bettingClosesAt;
        if (!open) throw new BetRefusedError('betting_closed');

        const result = await this.repo.placeBet({ userId, matchId: match.id, side, amount });
        if (this.current === match && match.status === 'betting') {
            match.pools.amounts[side] += amount;
            match.pools.bettors[side] += 1;
            this.schedulePoolBroadcast(match);
        }
        return result;
    }

    // Pool updates are batched so a rush of bets is one message, not dozens.
    schedulePoolBroadcast(match) {
        if (this.poolTimer) return;
        this.poolTimer = setTimeout(() => {
            this.poolTimer = null;
            if (this.current === match) this.broadcastPools(match);
        }, this.config.poolBroadcastMs);
    }

    broadcastPools(match) {
        this.hub.broadcast({ type: 'pool', matchId: match.id, pools: match.pools });
    }

    async prune() {
        const removed = await this.repo.pruneOlderThan(this.config.retentionDays);
        if (removed > 0) this.log.info({ removed }, 'Pruned old Monster Bash bouts');
    }

    // --- spectator messages -----------------------------------------------

    matchMessage(match) {
        return {
            type: 'match',
            match: {
                id: match.id,
                fighters: match.fighters,
                seedHash: match.seedHash,
                bettingClosesAt: match.bettingClosesAt,
                fightStartsAt: match.fightStartsAt,
                pools: match.pools,
            },
            odds: [...match.released.odds],
        };
    }

    // Everything a spectator needs to join mid-bout.
    welcomeMessages() {
        const messages = [{ type: 'hello', serverTime: Date.now(), history: this.history }];
        if (this.chat) messages.push({ type: 'chatHistory', messages: this.chat.recent() });
        const match = this.current;
        if (!match) return messages;

        messages.push(this.matchMessage(match));
        const lastTick = match.released.frames.at(-1)?.t ?? 0;
        const frames = match.released.frames.filter((frame) => frame.t >= lastTick - this.config.catchUpTicks);
        if (frames.length || match.released.events.length) {
            messages.push({
                type: 'chunk',
                chunk: { matchId: match.id, frames, events: [...match.released.events], odds: [] },
            });
        }
        if (match.result) messages.push({ type: 'result', matchId: match.id, result: match.result });
        return messages;
    }
}
