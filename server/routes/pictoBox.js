import pool from '../db/mockDB.js';
import { blockedUsers } from '../utils/contentSafety.js';
import { isAdminUser } from './inbox.js';

// Picto Box: the arcade's community camera. Players take toy-camera photos in
// the browser (the filter is applied there) and post them here; everyone can
// see the wall of the last day's photos. Admins, and each photo's owner, can
// take one down.

export const PHOTO_LIFETIME = '1 day';
export const MAX_PHOTO_BYTES = 200 * 1024;
export const WALL_SIZE = 60;                 // photos shown on the wall at most
export const POST_COOLDOWN_SECONDS = 20;     // between one player's photos
export const DAILY_LIMIT = 12;               // photos per player per day
export const STYLES = ['sepia', 'color'];

// Checks a POST /photos body: { image: "data:image/jpeg;base64,...", style }.
// Returns { bytes, style } or { error }.
export function parsePhotoUpload(body) {
    if (!body || typeof body !== 'object') return { error: 'Missing body' };
    const style = body.style ?? 'sepia';
    if (!STYLES.includes(style)) return { error: 'Unknown style' };
    const image = body.image;
    if (typeof image !== 'string') return { error: 'Missing image' };
    const match = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(image);
    if (!match) return { error: 'Photos must be JPEG' };
    // (a base64 string is 4/3 the size of its bytes; reject oversized ones before decoding)
    if (match[1].length > Math.ceil(MAX_PHOTO_BYTES / 3) * 4) return { error: 'Photo too large' };
    const bytes = Buffer.from(match[1], 'base64');
    if (bytes.length < 200) return { error: 'Photo too small' };
    if (bytes.length > MAX_PHOTO_BYTES) return { error: 'Photo too large' };
    // A real JPEG starts FF D8 and ends FF D9
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9) {
        return { error: 'Photos must be JPEG' };
    }
    return { bytes, style };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function pictoBoxRoutes(fastify) {
    // The wall: the last day's photos, newest first. Open to guests; a signed-in
    // viewer also learns which ones they may take down.
    fastify.get('/photos', async (request, reply) => {
        try {
            const result = await pool.query(`
                SELECT id, user_id, username, style, created_at
                FROM picto_box_photos
                WHERE created_at > now() - $1::interval
                ORDER BY created_at DESC
                LIMIT $2
            `, [PHOTO_LIFETIME, WALL_SIZE]);
            const viewer = request.user?.sub ?? null;
            const admin = request.user ? isAdminUser(request.user) : false;
            const blocked = await blockedUsers(pool, viewer);
            return {
                admin,
                photos: result.rows.filter(row => !blocked.has(row.user_id)).map((row) => ({
                    id: row.id,
                    userId: row.user_id,
                    username: row.username || 'Someone',
                    style: row.style,
                    createdAt: row.created_at,
                    mine: viewer !== null && row.user_id === viewer,
                    canDelete: admin || (viewer !== null && row.user_id === viewer),
                })),
            };
        } catch (error) {
            fastify.log.error(error);
            return reply.code(500).send({ error: 'Could not load the photos' });
        }
    });

    // One photo's picture. Public, so <img> tags can load it.
    fastify.get('/photos/:file', async (request, reply) => {
        const id = String(request.params.file).replace(/\.jpg$/i, '');
        if (!UUID.test(id)) return reply.code(404).send({ error: 'No such photo' });
        try {
            const result = await pool.query(
                `SELECT image FROM picto_box_photos WHERE id = $1 AND created_at > now() - $2::interval`,
                [id, PHOTO_LIFETIME]
            );
            const row = result.rows[0];
            if (!row) return reply.code(404).send({ error: 'No such photo' });
            return reply
                .header('Content-Type', 'image/jpeg')
                .header('Cache-Control', 'public, max-age=3600')
                .send(row.image);
        } catch (error) {
            fastify.log.error(error);
            return reply.code(500).send({ error: 'Could not load the photo' });
        }
    });

    // Take a photo: signed in, a short cooldown, and a daily limit per player
    fastify.post('/photos', { bodyLimit: MAX_PHOTO_BYTES * 2 }, async (request, reply) => {
        const parsed = parsePhotoUpload(request.body);
        if (parsed.error) return reply.code(400).send({ error: parsed.error });
        const userId = request.user.sub;
        try {
            const recent = await pool.query(`
                SELECT
                    count(*) FILTER (WHERE created_at > now() - interval '1 day')::int AS today,
                    max(created_at) AS latest
                FROM picto_box_photos WHERE user_id = $1
            `, [userId]);
            const { today, latest } = recent.rows[0] ?? { today: 0, latest: null };
            if (today >= DAILY_LIMIT) {
                return reply.code(429).send({ error: `That's ${DAILY_LIMIT} photos today. The Picto Box needs a rest.` });
            }
            if (latest && Date.now() - new Date(latest).getTime() < POST_COOLDOWN_SECONDS * 1000) {
                return reply.code(429).send({ error: 'Give the Picto Box a moment to wind on.' });
            }
            const user = await pool.query("SELECT CASE WHEN deleted_at IS NOT NULL THEN 'Deleted rider' ELSE username END AS username FROM users WHERE id = $1", [userId]);
            const inserted = await pool.query(`
                INSERT INTO picto_box_photos (user_id, username, style, image)
                VALUES ($1, $2, $3, $4)
                RETURNING id, created_at
            `, [userId, user.rows[0]?.username ?? null, parsed.style, parsed.bytes]);
            // Anything past its day comes down now
            await pool.query(`DELETE FROM picto_box_photos WHERE created_at <= now() - $1::interval`, [PHOTO_LIFETIME]);
            const row = inserted.rows[0];
            return { id: row.id, createdAt: row.created_at };
        } catch (error) {
            fastify.log.error(error);
            return reply.code(500).send({ error: 'Could not save the photo' });
        }
    });

    // Take a photo down: admins, or whoever took it
    fastify.delete('/photos/:id', async (request, reply) => {
        const id = String(request.params.id);
        if (!UUID.test(id)) return reply.code(404).send({ error: 'No such photo' });
        const admin = isAdminUser(request.user);
        try {
            const result = admin
                ? await pool.query('DELETE FROM picto_box_photos WHERE id = $1 RETURNING id', [id])
                : await pool.query('DELETE FROM picto_box_photos WHERE id = $1 AND user_id = $2 RETURNING id', [id, request.user.sub]);
            if (!result.rows[0]) return reply.code(404).send({ error: 'No such photo, or not yours to remove' });
            return { deleted: id };
        } catch (error) {
            fastify.log.error(error);
            return reply.code(500).send({ error: 'Could not remove the photo' });
        }
    });
}
