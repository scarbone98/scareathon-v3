import pool from '../db/mockDB.js';
import { blockedUsers } from '../utils/contentSafety.js';
import { isAdminUser } from './inbox.js';
import {
    RegExpMatcher,
    TextCensor,
    englishDataset,
    englishRecommendedTransformers,
} from 'obscenity';

// Wayside Online: the arcade's message board. Two boards (General, and the Scareathon's
// for talking about the films); on each, posts that others reply to and react to. Anyone
// can read; posting, replying and reacting need a login. Whoever wrote a post, and
// admins, can take it down (it stays as "removed" so replies keep their place).

export const BOARDS = ['general', 'scareathon'];
export const REACTIONS = ['👻', '🎃', '💀', '❤️', '😂', '🔥'];
export const MAX_BODY = 1000;
export const PAGE_SIZE = 30;
export const POST_COOLDOWN_SECONDS = 10;   // between one player's posts and replies
export const DAILY_LIMIT = 100;            // posts and replies per player per day

const matcher = new RegExpMatcher({ ...englishDataset.build(), ...englishRecommendedTransformers });
const censor = new TextCensor();

// A post's text, trimmed and with any swearing masked. Returns { body } or { error }.
export function parsePostBody(raw) {
    if (typeof raw !== 'string') return { error: 'Write something first' };
    const text = raw.replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    if (!text) return { error: 'Write something first' };
    if (text.length > MAX_BODY) return { error: `Keep it under ${MAX_BODY} characters` };
    return { body: censor.applyTo(text, matcher.getAllMatches(text)) };
}

// The tables, made if missing (run at start-up, see index.js)
export const WAYSIDE_ONLINE_SQL = `
    CREATE TABLE IF NOT EXISTS public.wayside_online_posts (
        id BIGSERIAL PRIMARY KEY,
        board TEXT NOT NULL CHECK (board IN ('general', 'scareathon')),
        parent_id BIGINT REFERENCES public.wayside_online_posts (id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
        body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND ${MAX_BODY}),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        removed_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS wayside_online_posts_board_idx
        ON public.wayside_online_posts (board, id DESC) WHERE parent_id IS NULL;
    CREATE INDEX IF NOT EXISTS wayside_online_posts_parent_idx
        ON public.wayside_online_posts (parent_id, id);
    CREATE INDEX IF NOT EXISTS wayside_online_posts_user_idx
        ON public.wayside_online_posts (user_id, created_at DESC);
    CREATE TABLE IF NOT EXISTS public.wayside_online_reactions (
        post_id BIGINT NOT NULL REFERENCES public.wayside_online_posts (id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
        emoji TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (post_id, user_id, emoji)
    );
`;

const POST_COLUMNS = `
    p.id, p.board, p.parent_id, p.user_id, p.body, p.created_at, p.removed_at,
    u.username
`;

// Each post's reactions: [{ emoji, count, mine }] in REACTIONS order
async function reactionsFor(ids, viewer) {
    if (ids.length === 0) return new Map();
    const result = await pool.query(`
        SELECT post_id, emoji, count(*)::int AS count, bool_or(user_id = $2) AS mine
        FROM public.wayside_online_reactions
        WHERE post_id = ANY($1::bigint[])
        GROUP BY post_id, emoji
    `, [ids, viewer]);
    const byPost = new Map();
    result.rows.forEach((row) => {
        const list = byPost.get(String(row.post_id)) ?? [];
        list.push({ emoji: row.emoji, count: row.count, mine: Boolean(row.mine) });
        byPost.set(String(row.post_id), list);
    });
    byPost.forEach((list) => list.sort((a, b) => REACTIONS.indexOf(a.emoji) - REACTIONS.indexOf(b.emoji)));
    return byPost;
}

function serializePost(row, reactions, viewer, admin) {
    const removed = Boolean(row.removed_at);
    const mine = viewer !== null && row.user_id === viewer;
    return {
        id: String(row.id),
        board: row.board,
        parentId: row.parent_id ? String(row.parent_id) : null,
        // (a removed post keeps its place, but not its words or its author)
        userId: removed ? null : row.user_id,
        username: removed ? null : row.username || 'Someone',
        body: removed ? null : row.body,
        removed,
        createdAt: row.created_at,
        mine,
        canRemove: !removed && (admin || mine),
        reactions: removed ? [] : reactions.get(String(row.id)) ?? [],
        replyCount: row.reply_count ?? undefined,
        lastReplyAt: row.last_reply_at ?? undefined,
    };
}

export default async function waysideOnlineRoutes(fastify) {
    // A board's posts, newest first (with how many replies each has). Open to guests.
    // ?board=general|scareathon, ?before=<post id> for the next page.
    fastify.get('/threads', async (request, reply) => {
        const board = String(request.query?.board || 'general');
        if (!BOARDS.includes(board)) return reply.code(400).send({ error: 'No such board' });
        const before = /^\d+$/.test(String(request.query?.before || '')) ? String(request.query.before) : null;
        const viewer = request.user?.sub ?? null;
        const admin = request.user ? isAdminUser(request.user) : false;
        try {
            const result = await pool.query(`
                SELECT ${POST_COLUMNS},
                    (SELECT count(*)::int FROM public.wayside_online_posts r
                        WHERE r.parent_id = p.id AND r.removed_at IS NULL) AS reply_count,
                    (SELECT max(r.created_at) FROM public.wayside_online_posts r
                        WHERE r.parent_id = p.id AND r.removed_at IS NULL) AS last_reply_at
                FROM public.wayside_online_posts p
                LEFT JOIN public.users u ON u.id = p.user_id
                WHERE p.board = $1 AND p.parent_id IS NULL AND p.removed_at IS NULL
                  AND ($2::bigint IS NULL OR p.id < $2::bigint)
                ORDER BY p.id DESC
                LIMIT $3
            `, [board, before, PAGE_SIZE + 1]);
            const blocked = await blockedUsers(pool, viewer);
            const rows = result.rows.slice(0, PAGE_SIZE).filter(row => !blocked.has(row.user_id));
            const reactions = await reactionsFor(rows.map((row) => row.id), viewer);
            return {
                admin,
                signedIn: viewer !== null,
                reactions: REACTIONS,
                threads: rows.map((row) => serializePost(row, reactions, viewer, admin)),
                hasMore: result.rows.length > PAGE_SIZE,
            };
        } catch (error) {
            fastify.log.error(error);
            return reply.code(500).send({ error: 'Could not load the board' });
        }
    });

    // One post and all its replies, oldest reply first. Open to guests.
    fastify.get('/threads/:id', async (request, reply) => {
        const id = String(request.params.id);
        if (!/^\d+$/.test(id)) return reply.code(404).send({ error: 'No such post' });
        const viewer = request.user?.sub ?? null;
        const admin = request.user ? isAdminUser(request.user) : false;
        try {
            const result = await pool.query(`
                SELECT ${POST_COLUMNS}
                FROM public.wayside_online_posts p
                LEFT JOIN public.users u ON u.id = p.user_id
                WHERE p.id = $1 OR p.parent_id = $1
                ORDER BY (p.parent_id IS NOT NULL), p.id
            `, [id]);
            const blocked = await blockedUsers(pool, viewer);
            const [head, ...replies] = result.rows.filter(row => !blocked.has(row.user_id));
            if (!head || head.parent_id || head.removed_at) return reply.code(404).send({ error: 'That post has been taken down' });
            const reactions = await reactionsFor(result.rows.map((row) => row.id), viewer);
            return {
                admin,
                signedIn: viewer !== null,
                reactions: REACTIONS,
                post: serializePost(head, reactions, viewer, admin),
                replies: replies.map((row) => serializePost(row, reactions, viewer, admin)),
            };
        } catch (error) {
            fastify.log.error(error);
            return reply.code(500).send({ error: 'Could not load the post' });
        }
    });

    // Post to a board ({ board, body }), or reply to a post ({ parentId, body })
    fastify.post('/posts', async (request, reply) => {
        const parsed = parsePostBody(request.body?.body);
        if (parsed.error) return reply.code(400).send({ error: parsed.error });
        const userId = request.user.sub;
        const parentId = request.body?.parentId != null ? String(request.body.parentId) : null;
        try {
            let board = String(request.body?.board || '');
            if (parentId) {
                if (!/^\d+$/.test(parentId)) return reply.code(404).send({ error: 'No such post' });
                const parent = await pool.query(
                    'SELECT board, parent_id, removed_at FROM public.wayside_online_posts WHERE id = $1',
                    [parentId]
                );
                const row = parent.rows[0];
                if (!row || row.removed_at) return reply.code(404).send({ error: 'That post has been taken down' });
                if (row.parent_id) return reply.code(400).send({ error: 'Reply to the post itself' });
                board = row.board;
            } else if (!BOARDS.includes(board)) {
                return reply.code(400).send({ error: 'No such board' });
            }
            const recent = await pool.query(`
                SELECT count(*) FILTER (WHERE created_at > now() - interval '1 day')::int AS today,
                    max(created_at) AS latest
                FROM public.wayside_online_posts WHERE user_id = $1
            `, [userId]);
            const { today, latest } = recent.rows[0] ?? { today: 0, latest: null };
            if (today >= DAILY_LIMIT) return reply.code(429).send({ error: "That's plenty for today. The line's busy; try tomorrow." });
            if (latest && Date.now() - new Date(latest).getTime() < POST_COOLDOWN_SECONDS * 1000) {
                return reply.code(429).send({ error: 'Hold on a moment before posting again.' });
            }
            const inserted = await pool.query(`
                INSERT INTO public.wayside_online_posts (board, parent_id, user_id, body)
                VALUES ($1, $2, $3, $4)
                RETURNING id, created_at
            `, [board, parentId, userId, parsed.body]);
            return { id: String(inserted.rows[0].id), createdAt: inserted.rows[0].created_at };
        } catch (error) {
            fastify.log.error(error);
            return reply.code(500).send({ error: 'Could not post that' });
        }
    });

    // React to a post ({ emoji }); reacting again with the same one takes it back
    fastify.post('/posts/:id/reactions', async (request, reply) => {
        const id = String(request.params.id);
        const emoji = String(request.body?.emoji || '');
        if (!/^\d+$/.test(id)) return reply.code(404).send({ error: 'No such post' });
        if (!REACTIONS.includes(emoji)) return reply.code(400).send({ error: 'Not one of the reactions' });
        const userId = request.user.sub;
        try {
            const post = await pool.query('SELECT removed_at FROM public.wayside_online_posts WHERE id = $1', [id]);
            if (!post.rows[0] || post.rows[0].removed_at) return reply.code(404).send({ error: 'That post has been taken down' });
            const removed = await pool.query(
                'DELETE FROM public.wayside_online_reactions WHERE post_id = $1 AND user_id = $2 AND emoji = $3 RETURNING post_id',
                [id, userId, emoji]
            );
            if (!removed.rows[0]) {
                await pool.query(
                    'INSERT INTO public.wayside_online_reactions (post_id, user_id, emoji) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
                    [id, userId, emoji]
                );
            }
            const reactions = await reactionsFor([id], userId);
            return { reacted: !removed.rows[0], reactions: reactions.get(id) ?? [] };
        } catch (error) {
            fastify.log.error(error);
            return reply.code(500).send({ error: 'Could not react to that' });
        }
    });

    // Take a post down: whoever wrote it, or an admin
    fastify.delete('/posts/:id', async (request, reply) => {
        const id = String(request.params.id);
        if (!/^\d+$/.test(id)) return reply.code(404).send({ error: 'No such post' });
        const admin = isAdminUser(request.user);
        try {
            const result = admin
                ? await pool.query('UPDATE public.wayside_online_posts SET removed_at = now() WHERE id = $1 AND removed_at IS NULL RETURNING id', [id])
                : await pool.query('UPDATE public.wayside_online_posts SET removed_at = now() WHERE id = $1 AND user_id = $2 AND removed_at IS NULL RETURNING id', [id, request.user.sub]);
            if (!result.rows[0]) return reply.code(404).send({ error: 'No such post, or not yours to take down' });
            return { removed: id };
        } catch (error) {
            fastify.log.error(error);
            return reply.code(500).send({ error: 'Could not take that down' });
        }
    });
}
