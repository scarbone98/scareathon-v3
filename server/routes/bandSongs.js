import pool from '../db/mockDB.js';

// Tunes made in One Man Band (the arcade cart) and sent to the radio on the station's bench.
// A tune is its notes, not a recording: the radio plays them itself (src/station/radio.ts).
// Yours are on one frequency; everyone else's newest are on another. Nobody types anything:
// a tune's name is made up here, and nothing says whose it is.

const KEEP = 8; // tunes a player keeps (the oldest goes when a ninth comes)
const ON_AIR = 30; // how many of everyone's newest the other frequency plays
// (the game had seven instruments when this began and has grown since; new ones go on the end)
const MIN_TRACKS = 7;
const MAX_TRACKS = 12;
const MAX_NOTES = 800;
const BARS = [1, 2, 4, 8];

const FIRST = ['Midnight', 'Rusty', 'Velvet', 'Crooked', 'Lantern', 'Hollow', 'Brass', 'Paper', 'Moonlit', 'Dusty', 'Clockwork', 'Wandering', 'Sleepy', 'Thirteenth', 'Platform', 'Pumpkin'];
const SECOND = ['Polka', 'Waltz', 'Shuffle', 'March', 'Rag', 'Stomp', 'Lullaby', 'Jig', 'Serenade', 'Two-Step', 'Parade', 'Ramble', 'Reel', 'Hop', 'Blues', 'Fanfare'];
const pick = (words) => words[Math.floor(Math.random() * words.length)];

// The table, made if missing (run at start-up, see index.js)
export const BAND_SONGS_SQL = `
    CREATE TABLE IF NOT EXISTS public.band_songs (
        id BIGSERIAL PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        song JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS band_songs_user_idx ON public.band_songs (user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS band_songs_recent_idx ON public.band_songs (created_at DESC);
`;

// A tune as the game sends it, checked and trimmed to plain numbers: { bpm, bars, tracks }
// where tracks is one list per instrument of [beat, beats long, button, note]. null if it
// isn't one, or is empty.
export function cleanSong(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const bpm = Number(raw.bpm);
    const bars = Number(raw.bars);
    if (!(bpm >= 50 && bpm <= 200) || !BARS.includes(bars) || !Array.isArray(raw.tracks) || raw.tracks.length < MIN_TRACKS || raw.tracks.length > MAX_TRACKS) return null;
    const beats = bars * 4;
    let count = 0;
    const tracks = [];
    for (const track of raw.tracks) {
        if (!Array.isArray(track)) return null;
        const notes = [];
        for (const note of track) {
            if (!Array.isArray(note) || note.length < 4) return null;
            const [t, d, b, n] = note.map(Number);
            if (![t, d, b, n].every(Number.isFinite)) return null;
            if (t < 0 || t >= beats) continue;
            count += 1;
            if (count > MAX_NOTES) return null;
            notes.push([Math.round(t * 1000) / 1000, Math.round(Math.min(Math.max(d, 0.05), beats) * 1000) / 1000,
                Math.max(-1, Math.min(4, Math.round(b))), // (a drum's note runs from -46 to 46: its kit and how far it is bent)
                Math.max(-64, Math.min(127, Math.round(n)))]);
        }
        tracks.push(notes);
    }
    return count > 0 ? { bpm: Math.round(bpm), bars, tracks } : null;
}

const row = (r) => ({ id: Number(r.id), name: r.name, song: r.song });

export default async function bandSongsRoutes(fastify) {
    // Yours, newest first
    fastify.get('/mine', async (request, reply) => {
        try {
            const mine = await pool.query('SELECT id, name, song FROM public.band_songs WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2', [request.user.sub, KEEP]);
            return { data: mine.rows.map(row) };
        } catch (error) {
            fastify.log.error(error);
            return reply.code(500).send({ error: 'Could not load your tunes' });
        }
    });

    // Everyone else's newest (guests hear all of them)
    fastify.get('/air', async (request, reply) => {
        try {
            const me = request.user?.sub ?? null;
            const others = await pool.query(`
                SELECT id, name, song FROM public.band_songs
                WHERE $1::uuid IS NULL OR user_id <> $1::uuid
                ORDER BY created_at DESC LIMIT $2
            `, [me, ON_AIR]);
            return { data: others.rows.map(row) };
        } catch (error) {
            fastify.log.error(error);
            return reply.code(500).send({ error: 'Could not tune in' });
        }
    });

    // A new tune from the game
    fastify.post('/', async (request, reply) => {
        const song = cleanSong(request.body?.song);
        if (!song) return reply.code(400).send({ error: 'That is not a tune' });
        try {
            const userId = request.user.sub;
            const name = `${pick(FIRST)} ${pick(SECOND)}`;
            const made = await pool.query('INSERT INTO public.band_songs (user_id, name, song) VALUES ($1, $2, $3::jsonb) RETURNING id, name, song',
                [userId, name, JSON.stringify(song)]);
            await pool.query(`
                DELETE FROM public.band_songs WHERE user_id = $1 AND id NOT IN (
                    SELECT id FROM public.band_songs WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2
                )
            `, [userId, KEEP]);
            return { data: row(made.rows[0]) };
        } catch (error) {
            fastify.log.error(error);
            return reply.code(500).send({ error: 'Could not put the tune on the radio' });
        }
    });

    // Taking one of yours off
    fastify.delete('/:id', async (request, reply) => {
        try {
            await pool.query('DELETE FROM public.band_songs WHERE user_id = $1 AND id = $2', [request.user.sub, Number(request.params.id) || 0]);
            return { data: { ok: true } };
        } catch (error) {
            fastify.log.error(error);
            return reply.code(500).send({ error: 'Could not take the tune off' });
        }
    });
}
