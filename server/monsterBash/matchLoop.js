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
    conflictRetryMs: 1_000,
    retentionDays: 14,
    pruneEveryMs: 60 * 60 * 1000,
    historySize: 8,
    // Pay out just after spectators (who watch ~1.5s behind) see the KO, so
    // balances never spoil the ending.
    settleDelayMs: 2_500,
    settleRetryMs: 5_000,
    settleAttempts: 5,
    poolBroadcastMs: 500,
    // Tickets the house stakes on each bout, split by the pre-fight win chance.
    houseSeed: 100,
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

// Splits the house stake by fighter 0's win chance, keeping at least one ticket
// on each side so there is always something to win.
export function splitHouseSeed(total, p) {
    if (!Number.isInteger(total) || total < 2) return [0, 0];
    const chance = Number.isFinite(p) ? p : 0.5;
    const left = Math.min(total - 1, Math.max(1, Math.round(total * chance)));
    return [left, total - left];
}

// Fighter 0's pre-fight win chance as stored for the fair-odds floor, or null
// when there's no usable estimate (winners are then paid by the pool alone).
export function storedWinChance(p) {
    if (!Number.isFinite(p)) return null;
    const rounded = Math.round(p * 1000) / 1000;
    return rounded > 0 && rounded < 1 ? rounded : null;
}

// Log-friendly timestamp that never throws on a bad value.
function isoTime(ms) {
    return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
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
        this.log.info({ pid: process.pid, engineVersion: ENGINE_VERSION }, 'Monster Bash loop starting');
        const resumable = await this.recover({ resume: true });
        this.history = (await this.repo.listRecent(this.config.historySize)).map(historyEntry);
        this.pruneTimer = setInterval(() => this.run(() => this.prune()), this.config.pruneEveryMs);
        this.pruneTimer.unref?.();
        this.run(() => this.prune());
        if (resumable) await this.resume(resumable);
        else await this.openMatch();
    }

    stop() {
        if (this.current && this.current.status !== 'finished') {
            this.log.warn({ matchId: this.current.id, status: this.current.status }, 'Monster Bash loop stopping with a bout in progress');
        }
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

    // Settles bouts left open by a crash or deploy. On startup (`resume`), a
    // bout whose fight hasn't finished yet on the clock is handed back to be
    // picked up where it left off, so viewers see it through to the end.
    // Otherwise a bout that was mid-fight is replayed from its seed, so the
    // true winner stands; a bout still taking bets never started and is
    // called off.
    async recover({ resume = false } = {}) {
        const open = await this.repo.findOpenMatches();
        let resumable = null;
        for (const match of open) {
            const sameEngine = match.engineVersion === ENGINE_VERSION;
            const fight = sameEngine
                ? simulateFight({ seed: match.seed, fighters: match.fighters }, { frameEvery: 1e9 })
                : null;
            const endsAt = fight ? match.fightStartsAt + (fight.durationTicks * 1000) / TICK_RATE : null;
            const context = {
                matchId: match.id,
                status: match.status,
                fighters: match.fighters,
                engineVersion: match.engineVersion,
                bettingClosesAt: isoTime(match.bettingClosesAt),
                fightEndsAt: isoTime(endsAt),
                msLeft: endsAt ? Math.round(endsAt - Date.now()) : null,
            };

            if (resume && !resumable && fight && endsAt > Date.now()) {
                resumable = match;
                this.log.warn(context, 'Monster Bash found an unfinished bout on startup; resuming it');
            } else if (fight && match.status === 'fighting') {
                await this.repo.markFinished(match.id, {
                    winner: fight.winner,
                    durationTicks: fight.durationTicks,
                    rounds: fight.rounds,
                    finishedAt: endsAt,
                });
                this.log.warn({ ...context, winner: fight.winner }, 'Monster Bash bout recovered from its seed without being shown');
            } else {
                await this.repo.markCancelled(match.id);
                this.log.warn(context, 'Monster Bash bout cancelled during recovery');
            }
        }

        // Pay out (or refund) any closed bout that still owes tickets.
        for (const matchId of await this.repo.findUnsettledMatchIds()) {
            const summary = await this.repo.settleMatch(matchId);
            this.log.info({ matchId, summary }, 'Monster Bash bets settled during recovery');
        }
        return resumable;
    }

    // Picks up a bout left open by the previous process: betting carries on
    // until its original close time, and a fight already underway streams on
    // from wherever its clock has got to.
    async resume(row) {
        const pregame = await this.odds.pregame(row.seed, row.fighters).catch((error) => {
            this.log.warn({ err: error, matchId: row.id }, 'Monster Bash pre-fight odds failed');
            return null;
        });
        let pools = { amounts: [0, 0], bettors: [0, 0] };
        try {
            pools = await this.repo.poolTotals(row.id);
        } catch (error) {
            this.log.warn({ err: error, matchId: row.id }, 'Monster Bash could not reload the betting pools');
        }

        this.current = {
            id: row.id,
            fighters: row.fighters,
            seed: row.seed,
            seedHash: row.seedHash,
            bettingClosesAt: row.bettingClosesAt,
            fightStartsAt: row.fightStartsAt,
            status: 'betting',
            fight: null,
            pendingOdds: [],
            released: { frames: [], events: [], odds: pregame ? [pregame] : [] },
            pools: { ...pools, house: row.houseSeed ?? [0, 0], winChance: row.pregameP ?? null },
            result: null,
        };
        this.log.info(
            { matchId: row.id, fighters: row.fighters, pools: this.current.pools, wasStatus: row.status },
            'Monster Bash bout resumed'
        );
        this.hub.broadcast(this.matchMessage(this.current));
        this.schedule(() => this.lock(), row.bettingClosesAt - Date.now());
    }

    async openMatch() {
        if (this.stopped) return;
        if (this.needsRecovery) {
            this.log.warn('Monster Bash running recovery before the next bout');
            // A bout still in play (e.g. opened by the other server during a
            // deploy's overlap) is adopted and shown, not cut short.
            const resumable = await this.recover({ resume: true });
            this.needsRecovery = false;
            if (resumable) return this.resume(resumable);
        }

        const fighters = pickFighters(this.random, this.lastFighters);
        const seed = this.createSeed();

        // The pre-fight odds decide how the house splits its stake.
        const pregame = await this.odds.pregame(seed, fighters).catch((error) => {
            this.log.warn({ err: error }, 'Monster Bash pre-fight odds failed');
            return null;
        });
        const houseSeed = splitHouseSeed(this.config.houseSeed, pregame?.p ?? 0.5);
        // Winners are paid at least these odds, so they're stored with the bout.
        const winChance = storedWinChance(pregame?.p);
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
                houseSeed,
                pregameP: winChance,
            });
        } catch (error) {
            if (error.code === ACTIVE_MATCH_CONFLICT) {
                // Another server (the old one during a deploy) opened a bout
                // first. Take that bout over rather than waiting on it: if its
                // server is shutting down, nobody else will ever finish it.
                this.log.warn('Monster Bash found another bout already open; adopting it');
                this.needsRecovery = true;
                this.schedule(() => this.openMatch(), this.config.conflictRetryMs);
                return;
            }
            this.log.error({ err: error }, 'Monster Bash could not open a bout (database error); retrying');
            this.schedule(() => this.openMatch(), this.config.retryMs);
            return;
        }

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
            pools: { amounts: [0, 0], bettors: [0, 0], house: houseSeed, winChance },
            result: null,
        };
        this.log.info(
            { matchId: row.id, fighters, houseSeed, pregameP: pregame?.p ?? null, bettingClosesAt: isoTime(bettingClosesAt) },
            'Monster Bash bout opened'
        );
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
            match.pools = { ...(await this.repo.poolTotals(match.id)), house: match.pools.house, winChance: match.pools.winChance };
        } catch (error) {
            this.log.warn({ err: error, matchId: match.id }, 'Monster Bash could not reload the betting pools');
        }
        clearTimeout(this.poolTimer);
        this.poolTimer = null;
        this.broadcastPools(match);
        match.fight = simulateFight({ seed: match.seed, fighters: match.fighters });
        // A resumed fight may already be well underway: skip frames nobody
        // needs any more, exactly as a late joiner would.
        const liveTick = ((Date.now() - match.fightStartsAt) * TICK_RATE) / 1000;
        if (liveTick > this.config.catchUpTicks) {
            const skipBefore = liveTick - this.config.catchUpTicks;
            match.released.frames = match.fight.frames.filter((frame) => frame.t < skipBefore);
        }
        this.log.info(
            {
                matchId: match.id,
                pools: match.pools,
                durationTicks: match.fight.durationTicks,
                fightSeconds: Math.round(match.fight.durationTicks / TICK_RATE),
                lateByMs: Math.round(Date.now() - match.fightStartsAt),
            },
            'Monster Bash betting closed; fight started'
        );
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

        this.log.info(
            { matchId: match.id, winner: fight.winner, winnerId: match.fighters[fight.winner], durationTicks: fight.durationTicks, pools: match.pools },
            'Monster Bash bout finished'
        );

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

        this.log.info({ matchId, summary, attempt }, 'Monster Bash bets settled');
        this.hub.broadcast({ type: 'settled', matchId, summary });
        if (this.chat && summary.settled > 0) {
            const tickets = (summary.paidOut ?? summary.pool).toLocaleString('en-US');
            let text;
            if (summary.refunded) text = `Bets refunded: ${tickets} tickets went back.`;
            else if (summary.paidOut === 0) text = 'Nobody backed the winner. The house keeps the pot.';
            else text = `Payouts sent: ${tickets} tickets to the winners.`;
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
