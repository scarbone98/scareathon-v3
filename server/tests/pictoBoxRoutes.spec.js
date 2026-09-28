import { jest } from '@jest/globals';
import Fastify from 'fastify';

// The routes against a fake database: each test queues up the rows its queries return
const query = jest.fn();
jest.unstable_mockModule('../db/mockDB.js', () => ({ default: { query } }));
const { default: pictoBoxRoutes, DAILY_LIMIT } = await import('../routes/pictoBox.js');

const ADMIN = '11111111-1111-4111-8111-111111111111';
const ALICE = '22222222-2222-4222-8222-222222222222';
const BOB = '33333333-3333-4333-8333-333333333333';
const PHOTO = '0b6c1f3e-9a2d-4c1e-8f00-1234567890ab';

function jpegDataUrl(size = 1000) {
    const bytes = Buffer.alloc(size, 0x41);
    bytes[0] = 0xff;
    bytes[1] = 0xd8;
    bytes[size - 2] = 0xff;
    bytes[size - 1] = 0xd9;
    return `data:image/jpeg;base64,${bytes.toString('base64')}`;
}

async function app() {
    const fastify = Fastify();
    fastify.decorateRequest('user', null);
    // Stands in for the JWT check: x-test-user is the signed-in player
    fastify.addHook('preValidation', async (request) => {
        const id = request.headers['x-test-user'];
        request.user = id ? { sub: id, email: `${id}@example.com` } : null;
    });
    fastify.register(pictoBoxRoutes, { prefix: '/picto-box' });
    await fastify.ready();
    return fastify;
}

const rows = (...list) => ({ rows: list });

beforeEach(() => {
    query.mockReset();
    process.env.ADMIN_USER_IDS = ADMIN;
});

describe('the wall', () => {
    const wallRows = rows(
        { id: 'a', user_id: ALICE, username: 'alice', style: 'sepia', created_at: new Date() },
        { id: 'b', user_id: BOB, username: null, style: 'color', created_at: new Date() },
    );

    test('guests see the photos but can take none down', async () => {
        query.mockResolvedValueOnce(wallRows);
        const response = await (await app()).inject({ method: 'GET', url: '/picto-box/photos' });
        const body = response.json();
        expect(body.admin).toBe(false);
        expect(body.photos.map((p) => [p.username, p.canDelete])).toEqual([['alice', false], ['Someone', false]]);
        // only the last day, newest first
        expect(query.mock.calls[0][0]).toMatch(/created_at > now\(\) - \$1::interval/);
        expect(query.mock.calls[0][1][0]).toBe('1 day');
    });

    test('players can take down their own, admins any', async () => {
        query.mockResolvedValueOnce(wallRows);
        let body = (await (await app()).inject({ method: 'GET', url: '/picto-box/photos', headers: { 'x-test-user': ALICE } })).json();
        expect(body.photos.map((p) => [p.mine, p.canDelete])).toEqual([[true, true], [false, false]]);
        query.mockResolvedValueOnce(wallRows);
        body = (await (await app()).inject({ method: 'GET', url: '/picto-box/photos', headers: { 'x-test-user': ADMIN } })).json();
        expect(body.admin).toBe(true);
        expect(body.photos.every((p) => p.canDelete)).toBe(true);
    });
});

describe('posting', () => {
    const post = async (user, payload = { image: jpegDataUrl(), style: 'sepia' }) =>
        (await app()).inject({ method: 'POST', url: '/picto-box/photos', headers: { 'x-test-user': user }, payload });

    test('saves the photo with the username and clears out expired ones', async () => {
        query
            .mockResolvedValueOnce(rows({ today: 0, latest: null }))
            .mockResolvedValueOnce(rows({ username: 'alice' }))
            .mockResolvedValueOnce(rows({ id: PHOTO, created_at: new Date() }))
            .mockResolvedValueOnce(rows());
        const response = await post(ALICE);
        expect(response.statusCode).toBe(200);
        expect(response.json().id).toBe(PHOTO);
        const [insertSql, insertArgs] = query.mock.calls[2];
        expect(insertSql).toMatch(/INSERT INTO picto_box_photos/);
        expect(insertArgs.slice(0, 3)).toEqual([ALICE, 'alice', 'sepia']);
        expect(Buffer.isBuffer(insertArgs[3])).toBe(true);
        expect(query.mock.calls[3][0]).toMatch(/DELETE FROM picto_box_photos WHERE created_at <=/);
    });

    test('holds back a player who has hit the daily limit, or just posted', async () => {
        query.mockResolvedValueOnce(rows({ today: DAILY_LIMIT, latest: new Date(Date.now() - 3600000) }));
        expect((await post(ALICE)).statusCode).toBe(429);
        query.mockResolvedValueOnce(rows({ today: 1, latest: new Date() }));
        expect((await post(ALICE)).statusCode).toBe(429);
        expect(query).toHaveBeenCalledTimes(2); // nothing inserted
    });

    test('rejects anything that is not a JPEG', async () => {
        const response = await post(ALICE, { image: 'data:image/png;base64,AAAA' });
        expect(response.statusCode).toBe(400);
        expect(query).not.toHaveBeenCalled();
    });
});

describe('taking photos down', () => {
    const remove = async (user) => (await app()).inject({ method: 'DELETE', url: `/picto-box/photos/${PHOTO}`, headers: { 'x-test-user': user } });

    test('an owner can only remove their own', async () => {
        query.mockResolvedValueOnce(rows());
        expect((await remove(BOB)).statusCode).toBe(404);
        expect(query.mock.calls[0][0]).toMatch(/AND user_id = \$2/);
        expect(query.mock.calls[0][1]).toEqual([PHOTO, BOB]);
    });

    test('an admin can remove anyone\'s', async () => {
        query.mockResolvedValueOnce(rows({ id: PHOTO }));
        const response = await remove(ADMIN);
        expect(response.statusCode).toBe(200);
        expect(query.mock.calls[0][0]).not.toMatch(/user_id/);
    });
});

describe('pictures', () => {
    test('serves a live photo as a JPEG, and 404s for anything else', async () => {
        const image = Buffer.from([0xff, 0xd8, 1, 2, 0xff, 0xd9]);
        query.mockResolvedValueOnce(rows({ image }));
        const response = await (await app()).inject({ method: 'GET', url: `/picto-box/photos/${PHOTO}.jpg` });
        expect(response.statusCode).toBe(200);
        expect(response.headers['content-type']).toBe('image/jpeg');
        expect(response.rawPayload.equals(image)).toBe(true);
        query.mockResolvedValueOnce(rows());
        expect((await (await app()).inject({ method: 'GET', url: `/picto-box/photos/${PHOTO}.jpg` })).statusCode).toBe(404);
        expect((await (await app()).inject({ method: 'GET', url: '/picto-box/photos/nope.jpg' })).statusCode).toBe(404);
    });
});
