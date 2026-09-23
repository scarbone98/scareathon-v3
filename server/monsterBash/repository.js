import pool from '../db/mockDB.js';

const PRUNE_BATCH_SIZE = 500;

export const ACTIVE_MATCH_CONFLICT = '23505';

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

        // Deletes closed bouts past the retention window in small batches so a
        // big backlog never holds a long lock. Returns how many rows went.
        async pruneOlderThan(days) {
            let total = 0;
            for (;;) {
                const { rowCount } = await db.query(
                    `DELETE FROM monster_bash_matches
                     WHERE id IN (
                         SELECT id FROM monster_bash_matches
                         WHERE created_at < now() - make_interval(days => $1)
                           AND status IN ('finished', 'cancelled')
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
