import pool from '../db/mockDB.js';

const PRUNE_BATCH_SIZE = 1000;

// Reasons the casino's SQL functions refuse a round; anything else is a real error.
const ROUND_REFUSALS = new Set(['insufficient_funds', 'round_in_progress', 'round_not_open', 'invalid_amount']);
// (the live races add 'betting_closed' and 'already_bet' of their own)

export class RoundRefusedError extends Error {
    constructor(code) {
        super(code);
        this.code = code;
    }
}

// All the casino's SQL lives here so the routes can be tested with a fake.
export function createCasinoRepository(db = pool) {
    async function call(sql, params) {
        try {
            const { rows } = await db.query(sql, params);
            return { roundId: String(rows[0].result.roundId), balance: Number(rows[0].result.balance) };
        } catch (error) {
            if (ROUND_REFUSALS.has(error.message)) throw new RoundRefusedError(error.message);
            throw error;
        }
    }

    return {
        async getBalance(userId) {
            const { rows } = await db.query('SELECT coin_balance FROM user_wallets WHERE user_id = $1', [userId]);
            return Number(rows[0]?.coin_balance ?? 0);
        },

        // Stake out and winnings in, in one transaction.
        playRound({ userId, game, stake, payout, state }) {
            return call('SELECT public.play_casino_round($1, $2, $3, $4, $5::jsonb) AS result', [
                userId, game, stake, payout, JSON.stringify(state),
            ]);
        },

        openRound({ userId, game, stake, state }) {
            return call('SELECT public.open_casino_round($1, $2, $3, $4::jsonb) AS result', [
                userId, game, stake, JSON.stringify(state),
            ]);
        },

        settleRound({ userId, roundId, payout, state }) {
            return call('SELECT public.settle_casino_round($1, $2, $3, $4::jsonb) AS result', [
                userId, roundId, payout, JSON.stringify(state),
            ]);
        },

        async findOpenRound(userId, game) {
            const { rows } = await db.query(
                `SELECT id, stake, state FROM casino_rounds WHERE user_id = $1 AND game = $2 AND status = 'open'`,
                [userId, game]
            );
            return rows[0] ? { id: String(rows[0].id), stake: Number(rows[0].stake), state: rows[0].state } : null;
        },

        // Every round of a game still waiting to be paid, whoever's it is.
        async findOpenRounds(game) {
            const { rows } = await db.query(
                `SELECT id, user_id, stake FROM casino_rounds WHERE game = $1 AND status = 'open' ORDER BY id`,
                [game]
            );
            return rows.map((row) => ({ id: String(row.id), userId: row.user_id, stake: Number(row.stake) }));
        },

        // Deletes finished rounds past the retention window in small batches
        // (the coin ledger keeps the record). Returns how many rows went.
        async pruneOlderThan(days) {
            let total = 0;
            for (;;) {
                const { rowCount } = await db.query(
                    `DELETE FROM casino_rounds
                     WHERE id IN (
                         SELECT id FROM casino_rounds
                         WHERE created_at < now() - make_interval(days => $1)
                           AND status = 'settled'
                         ORDER BY created_at
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
