import pool from '../db/mockDB.js';

const PRUNE_BATCH_SIZE = 500;

export const ACTIVE_MATCH_CONFLICT = '23505';

// Reasons place_monster_bash_bet refuses a bet; anything else is a real error.
const BET_REFUSALS = new Set(['betting_closed', 'already_bet', 'insufficient_funds', 'invalid_side', 'invalid_amount']);

export class BetRefusedError extends Error {
    constructor(code) {
        super(code);
        this.code = code;
    }
}

function toMatch(row) {
    return {
        id: String(row.id),
        fighters: [row.fighter_left, row.fighter_right],
        engineVersion: row.engine_version,
        seed: row.seed,
        seedHash: row.seed_hash,
        status: row.status,
        bettingClosesAt: new Date(row.betting_closes_at).getTime(),
        fightStartsAt: new Date(row.fight_starts_at).getTime(),
        finishedAt: row.finished_at ? new Date(row.finished_at).getTime() : null,
        winner: row.winner,
        durationTicks: row.duration_ticks,
    };
}

// All Monster Bash SQL lives here so the match loop can be tested with a fake.
export function createMatchRepository(db = pool) {
    return {
        async insertMatch({ fighters, engineVersion, seed, seedHash, bettingClosesAt, fightStartsAt }) {
            const { rows } = await db.query(
                `INSERT INTO monster_bash_matches (
                    fighter_left, fighter_right, engine_version, seed, seed_hash,
                    status, betting_closes_at, fight_starts_at
                )
                VALUES ($1, $2, $3, $4, $5, 'betting', $6, $7)
                RETURNING *`,
                [fighters[0], fighters[1], engineVersion, seed, seedHash, new Date(bettingClosesAt), new Date(fightStartsAt)]
            );
            return toMatch(rows[0]);
        },

        async markFighting(id) {
            await db.query(
                `UPDATE monster_bash_matches SET status = 'fighting' WHERE id = $1 AND status = 'betting'`,
                [id]
            );
        },

        async markFinished(id, { winner, durationTicks, rounds, finishedAt }) {
            await db.query(
                `UPDATE monster_bash_matches
                 SET status = 'finished', winner = $2, duration_ticks = $3, rounds = $4, finished_at = $5
                 WHERE id = $1 AND status IN ('betting', 'fighting')`,
                [id, winner, durationTicks, JSON.stringify(rounds), new Date(finishedAt)]
            );
        },

        async markCancelled(id) {
            await db.query(
                `UPDATE monster_bash_matches SET status = 'cancelled', finished_at = now()
                 WHERE id = $1 AND status IN ('betting', 'fighting')`,
                [id]
            );
        },

        async findOpenMatches() {
            const { rows } = await db.query(
                `SELECT * FROM monster_bash_matches WHERE status IN ('betting', 'fighting') ORDER BY id`
            );
            return rows.map(toMatch);
        },

        // Finished bouts, newest first, with the seed revealed for verification.
        async listRecent(limit) {
            const { rows } = await db.query(
                `SELECT * FROM monster_bash_matches
                 WHERE status = 'finished'
                 ORDER BY finished_at DESC
                 LIMIT $1`,
                [limit]
            );
            return rows.map(toMatch);
        },

        async placeBet({ userId, matchId, side, amount }) {
            try {
                const { rows } = await db.query(
                    'SELECT public.place_monster_bash_bet($1, $2, $3::smallint, $4) AS result',
                    [userId, matchId, side, amount]
                );
                return rows[0].result;
            } catch (error) {
                if (BET_REFUSALS.has(error.message)) throw new BetRefusedError(error.message);
                throw error;
            }
        },

        // Pays winners (or refunds everyone) in one transaction. Safe to repeat.
        async settleMatch(matchId) {
            const { rows } = await db.query('SELECT public.settle_monster_bash_match($1) AS result', [matchId]);
            return rows[0].result;
        },

        // Closed bouts that still have unpaid bets, e.g. after a crash.
        async findUnsettledMatchIds() {
            const { rows } = await db.query(
                `SELECT DISTINCT b.match_id
                 FROM monster_bash_bets b
                 JOIN monster_bash_matches m ON m.id = b.match_id
                 WHERE b.status = 'open' AND m.status IN ('finished', 'cancelled')`
            );
            return rows.map((row) => String(row.match_id));
        },

        async poolTotals(matchId) {
            const { rows } = await db.query(
                `SELECT side, SUM(amount) AS amount, COUNT(*) AS bettors
                 FROM monster_bash_bets WHERE match_id = $1 GROUP BY side`,
                [matchId]
            );
            const pools = { amounts: [0, 0], bettors: [0, 0] };
            for (const row of rows) {
                pools.amounts[row.side] = Number(row.amount);
                pools.bettors[row.side] = Number(row.bettors);
            }
            return pools;
        },

        // The player's balance plus their bet on a bout (if any) and its outcome.
        async getAccount(userId, matchId) {
            const [wallet, bet] = await Promise.all([
                db.query('SELECT coin_balance FROM user_wallets WHERE user_id = $1', [userId]),
                matchId
                    ? db.query(
                        'SELECT side, amount, status, payout FROM monster_bash_bets WHERE match_id = $1 AND user_id = $2',
                        [matchId, userId]
                    )
                    : { rows: [] },
            ]);
            const row = bet.rows[0];
            return {
                balance: Number(wallet.rows[0]?.coin_balance ?? 0),
                bet: row
                    ? { side: row.side, amount: Number(row.amount), status: row.status, payout: row.payout === null ? null : Number(row.payout) }
                    : null,
            };
        },

        async getUsername(userId) {
            const { rows } = await db.query('SELECT username FROM users WHERE id = $1', [userId]);
            return rows[0]?.username ?? null;
        },

        // Deletes closed bouts past the retention window in small batches so a
        // big backlog never holds a long lock. Returns how many rows went.
        async pruneOlderThan(days) {
            let total = 0;
            for (;;) {
                const { rowCount } = await db.query(
                    `DELETE FROM monster_bash_matches
                     WHERE id IN (
                         SELECT m.id FROM monster_bash_matches m
                         WHERE m.created_at < now() - make_interval(days => $1)
                           AND m.status IN ('finished', 'cancelled')
                           -- Never drop a bout that still owes someone coins.
                           AND NOT EXISTS (
                               SELECT 1 FROM monster_bash_bets b
                               WHERE b.match_id = m.id AND b.status = 'open'
                           )
                         ORDER BY m.created_at
                         LIMIT $2
                     )`,
                    [days, PRUNE_BATCH_SIZE]
                );
                total += rowCount;
                if (rowCount < PRUNE_BATCH_SIZE) return total;
            }
        },
    };
}
