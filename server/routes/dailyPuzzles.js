import pool from '../db/mockDB.js';
import { crossBonesPuzzleFor, loadContent, scaredleAnswerFor } from '../dailyPuzzles/content.js';
import {
    GAME_NAMES,
    GAMES,
    SCAREDLE_TRIES,
    cleanFill,
    crossBonesScore,
    emptyFill,
    isFull,
    isGuessable,
    isSolved,
    markGuess,
    msUntilNextPuzzle,
    openCells,
    publicCrossword,
    puzzleDate,
    puzzleNumberAt,
    scaredleScore,
    ticketsFor,
    wrongCells,
} from '../dailyPuzzles/rules.js';
import { deleteCachePrefix } from '../utils/cacheManager.js';

const TICKETS_SOURCE = 'daily_puzzle';
const MAX_REVEAL = 11;

class PlayError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

function puzzleParam(raw, now = new Date()) {
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 1) throw new PlayError(400, 'No such puzzle');
    if (n > puzzleNumberAt(now)) throw new PlayError(404, "That puzzle isn't out yet");
    return n;
}

// A player's go at one puzzle, locked for the length of the transaction. The first time
// it's opened, the answer (or grid) is copied into the row: the lists can change later
// without moving a puzzle out from under someone.
async function openPlay(client, userId, game, n) {
    const select = () => client.query(
        'SELECT * FROM daily_puzzle_plays WHERE user_id = $1 AND game = $2 AND puzzle = $3 FOR UPDATE',
        [userId, game, n]
    );
    const found = await select();
    if (found.rows[0]) return found.rows[0];
    const content = await loadContent();
    const secret = game === 'scaredle'
        ? { answer: scaredleAnswerFor(n, content) }
        : { puzzle: crossBonesPuzzleFor(n, content) };
    const state = game === 'scaredle' ? { guesses: [] } : { fill: emptyFill(secret.puzzle), checks: 0, revealed: [] };
    await client.query(`
        INSERT INTO daily_puzzle_plays (user_id, game, puzzle, secret, state)
        VALUES ($1, $2, $3, $4::jsonb, $5::jsonb)
        ON CONFLICT (user_id, game, puzzle) DO NOTHING
    `, [userId, game, n, JSON.stringify(secret), JSON.stringify(state)]);
    return (await select()).rows[0];
}

async function saveState(client, row, state) {
    await client.query(
        'UPDATE daily_puzzle_plays SET state = $4::jsonb, updated_at = now() WHERE user_id = $1 AND game = $2 AND puzzle = $3',
        [row.user_id, row.game, row.puzzle, JSON.stringify(state)]
    );
    row.state = state;
}

// Over: the score, the tickets (once, here, with the row locked) and, for a solve on the
// puzzle's own day, a leaderboard entry. Nothing a page posts can make any of these.
async function finish(client, row, { won, score, revealed = 0, open = 0 }, now = new Date()) {
    const sameDay = puzzleNumberAt(now) === row.puzzle;
    const tickets = ticketsFor({ won, sameDay, revealed, open });
    await client.query(`
        UPDATE daily_puzzle_plays
        SET finished_at = $4, won = $5, score = $6, tickets = $7, updated_at = now()
        WHERE user_id = $1 AND game = $2 AND puzzle = $3
    `, [row.user_id, row.game, row.puzzle, now, won, score, tickets]);
    Object.assign(row, { finished_at: now, won, score, tickets });

    let coinBalance = null;
    if (tickets > 0) {
        const granted = await client.query('SELECT public.grant_currency($1, $2, $3, $4, $5::jsonb) AS coin_balance', [
            row.user_id,
            tickets,
            TICKETS_SOURCE,
            `${row.game}:${row.puzzle}`,
            JSON.stringify({ game: GAME_NAMES[row.game], puzzle: row.puzzle, sameDay, score }),
        ]);
        coinBalance = Number(granted.rows[0].coin_balance);
    }
    if (won && sameDay) {
        const name = GAME_NAMES[row.game];
        const gameRow = await client.query('SELECT id FROM games WHERE name = $1 ORDER BY id ASC LIMIT 1', [name]);
        if (gameRow.rows[0]) {
            await client.query(
                "INSERT INTO leaderboards (game_id, user_id, metric_name, metric_value) VALUES ($1, $2, 'score', $3)",
                [gameRow.rows[0].id, row.user_id, score]
            );
            deleteCachePrefix(`gameLeaderboard:${name}:score:`);
        }
    }
    return { tickets, coinBalance, sameDay };
}

function common(row, now) {
    const done = Boolean(row.finished_at);
    return {
        puzzle: row.puzzle,
        date: puzzleDate(row.puzzle),
        today: puzzleNumberAt(now),
        nextInMs: msUntilNextPuzzle(now),
        done,
        won: done ? row.won : null,
        score: done ? row.score : null,
        tickets: done ? row.tickets : null,
        sameDay: done ? puzzleNumberAt(new Date(row.finished_at)) === row.puzzle : null,
    };
}

export function scaredleView(row, now = new Date()) {
    const view = common(row, now);
    const guesses = row.state.guesses ?? [];
    return {
        ...view,
        guesses,
        marks: guesses.map((g) => markGuess(g, row.secret.answer)),
        // Only once it's over: until then the page never has it
        answer: view.done ? row.secret.answer : null,
    };
}

export function crossBonesView(row, now = new Date()) {
    const view = common(row, now);
    const end = row.finished_at ? new Date(row.finished_at) : now;
    return {
        ...view,
        layout: publicCrossword(row.secret.puzzle),
        fill: row.state.fill,
        checks: row.state.checks,
        revealed: row.state.revealed,
        elapsed: Math.max(0, end - new Date(row.started_at)),
    };
}

function elapsedSeconds(row, now) {
    return Math.max(0, (now - new Date(row.started_at)) / 1000);
}

// After a fill changes: over if it's right
async function settleCrossword(client, row, now) {
    const puzzle = row.secret.puzzle;
    if (!isSolved(row.state.fill, puzzle)) return { fullButWrong: isFull(row.state.fill) };
    const score = crossBonesScore(elapsedSeconds(row, now), row.state.checks, row.state.revealed.length);
    return finish(client, row, { won: true, score, revealed: row.state.revealed.length, open: openCells(puzzle) }, now);
}

// Scaredle (a word a day) and Cross Bones (a crossword a day). Every move goes through
// here: the page never sees an answer it hasn't earned, and the server alone decides
// what's solved and pays for it. Sign-in only: a guest's moves couldn't be kept.
export default async function dailyPuzzleRoutes(fastify) {
    async function inPlay(request, reply, game, act) {
        const now = new Date();
        const client = await pool.connect();
        try {
            const n = puzzleParam(request.params.n, now);
            await client.query('BEGIN');
            const row = await openPlay(client, request.user.sub, game, n);
            const result = await act(client, row, now);
            await client.query('COMMIT');
            return result;
        } catch (error) {
            await client.query('ROLLBACK').catch(() => {});
            if (error instanceof PlayError) return reply.code(error.status).send({ error: error.message });
            fastify.log.error(error);
            return reply.code(500).send({ error: 'Something went wrong with the puzzle' });
        } finally {
            client.release();
        }
    }

    // Every puzzle out so far and how this player did on each, for the archive and stats
    fastify.get('/:game', async (request, reply) => {
        const { game } = request.params;
        if (!GAMES.includes(game)) return reply.code(404).send({ error: 'No such game' });
        const now = new Date();
        try {
            const result = await pool.query(`
                SELECT puzzle, finished_at, won, score, tickets,
                       COALESCE(jsonb_array_length(state -> 'guesses'), 0) AS tries
                FROM daily_puzzle_plays
                WHERE user_id = $1 AND game = $2
                ORDER BY puzzle
            `, [request.user.sub, game]);
            return {
                today: puzzleNumberAt(now),
                nextInMs: msUntilNextPuzzle(now),
                plays: result.rows.map((row) => ({
                    puzzle: row.puzzle,
                    done: Boolean(row.finished_at),
                    won: row.won,
                    score: row.score,
                    tickets: row.tickets,
                    tries: row.tries,
                    sameDay: row.finished_at ? puzzleNumberAt(new Date(row.finished_at)) === row.puzzle : null,
                })),
            };
        } catch (error) {
            fastify.log.error(error);
            return reply.code(500).send({ error: 'Could not load your puzzles' });
        }
    });

    fastify.get('/scaredle/:n', (request, reply) =>
        inPlay(request, reply, 'scaredle', async (client, row, now) => scaredleView(row, now)));

    fastify.post('/scaredle/:n/guess', (request, reply) =>
        inPlay(request, reply, 'scaredle', async (client, row, now) => {
            if (row.finished_at) throw new PlayError(409, 'This one is already over');
            const guess = String(request.body?.guess ?? '').toUpperCase();
            if (!/^[A-Z]{5}$/.test(guess) || !isGuessable(guess)) throw new PlayError(400, 'Not in the word list');
            const guesses = [...row.state.guesses, guess];
            await saveState(client, row, { ...row.state, guesses });
            const won = guess === row.secret.answer;
            let reward = null;
            if (won || guesses.length >= SCAREDLE_TRIES) {
                reward = await finish(client, row, { won, score: won ? scaredleScore(guesses.length) : 0 }, now);
            }
            return { ...scaredleView(row, now), reward };
        }));

    fastify.get('/cross-bones/:n', (request, reply) =>
        inPlay(request, reply, 'cross-bones', async (client, row, now) => crossBonesView(row, now)));

    // The page saves its letters as they're typed; a right grid is a solve
    fastify.put('/cross-bones/:n', (request, reply) =>
        inPlay(request, reply, 'cross-bones', async (client, row, now) => {
            if (row.finished_at) return { ...crossBonesView(row, now), reward: null };
            const fill = cleanFill(request.body?.fill, row.secret.puzzle, row.state.revealed);
            await saveState(client, row, { ...row.state, fill });
            const settled = await settleCrossword(client, row, now);
            return { ...crossBonesView(row, now), fullButWrong: Boolean(settled.fullButWrong), reward: settled.fullButWrong === undefined ? settled : null };
        }));

    // Marks the wrong letters, for a penalty
    fastify.post('/cross-bones/:n/check', (request, reply) =>
        inPlay(request, reply, 'cross-bones', async (client, row, now) => {
            if (row.finished_at) throw new PlayError(409, 'This one is already solved');
            const fill = cleanFill(request.body?.fill, row.secret.puzzle, row.state.revealed);
            await saveState(client, row, { ...row.state, fill, checks: row.state.checks + 1 });
            return { ...crossBonesView(row, now), wrong: wrongCells(fill, row.secret.puzzle) };
        }));

    // Fills in squares with their answers, for a penalty each
    fastify.post('/cross-bones/:n/reveal', (request, reply) =>
        inPlay(request, reply, 'cross-bones', async (client, row, now) => {
            if (row.finished_at) throw new PlayError(409, 'This one is already solved');
            const puzzle = row.secret.puzzle;
            const asked = Array.isArray(request.body?.cells) ? request.body.cells : [];
            if (!asked.length || asked.length > MAX_REVEAL) throw new PlayError(400, 'Pick a square or a word to reveal');
            const fill = cleanFill(request.body?.fill, puzzle, row.state.revealed);
            const revealed = row.state.revealed.slice();
            for (const i of asked) {
                if (!Number.isInteger(i) || puzzle.cells[i] === undefined || puzzle.cells[i] === '#') throw new PlayError(400, 'Not a square');
                // Already right: nothing to show, nothing to pay
                if (fill[i] !== puzzle.cells[i] && !revealed.includes(i)) revealed.push(i);
            }
            await saveState(client, row, { ...row.state, fill: cleanFill(fill, puzzle, revealed), revealed });
            const settled = await settleCrossword(client, row, now);
            return { ...crossBonesView(row, now), fullButWrong: Boolean(settled.fullButWrong), reward: settled.fullButWrong === undefined ? settled : null };
        }));
}
