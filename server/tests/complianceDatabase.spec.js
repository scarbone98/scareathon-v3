import { jest } from '@jest/globals';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import Fastify from 'fastify';
const stub = { query: jest.fn() };
jest.unstable_mockModule('../db/mockDB.js', () => ({ default: stub }));
const { default: routes } = await import('../routes/compliance.js');
let pg;
let app;
const RIDER = '11111111-1111-4111-8111-111111111111';
const AUTHOR = '22222222-2222-4222-8222-222222222222';
const ADMIN = '33333333-3333-4333-8333-333333333333';
beforeAll(async () => {
    pg = new PGlite();
    await pg.exec(`CREATE TABLE users (id uuid PRIMARY KEY, username text, deleted_at timestamptz);
        CREATE TABLE wayside_online_posts (id bigserial PRIMARY KEY, user_id uuid REFERENCES users(id), body text, removed_at timestamptz);
        CREATE TABLE picto_box_photos (id uuid PRIMARY KEY, user_id uuid REFERENCES users(id), style text);
        CREATE TABLE user_item_instances (id bigint PRIMARY KEY, user_id uuid REFERENCES users(id), status text, updated_at timestamptz);
        CREATE TABLE marketplace_listings (id bigint PRIMARY KEY, item_instance_id bigint REFERENCES user_item_instances(id), seller_user_id uuid REFERENCES users(id), status text, canceled_at timestamptz, updated_at timestamptz);
        CREATE ROLE authenticated; CREATE ROLE anon;`);
    const migration = await readFile(new URL('../db/migrations/20261014_compliance.sql', import.meta.url), 'utf8');
    await pg.exec(migration); await pg.exec(migration); // owner restarts are safe
    await pg.query('INSERT INTO users (id, username) VALUES ($1, $2), ($3, $4), ($5, $6)', [RIDER, 'Rider', AUTHOR, 'Author', ADMIN, 'Admin']);
    await pg.query('INSERT INTO wayside_online_posts (user_id, body) VALUES ($1, $2)', [AUTHOR, 'Reported post']);
    await pg.query("INSERT INTO user_item_instances VALUES (1, $1, 'listed', now());", [AUTHOR]);
    await pg.query("INSERT INTO marketplace_listings (id, item_instance_id, seller_user_id, status) VALUES (1, 1, $1, 'active')", [AUTHOR]);
    process.env.ADMIN_USER_IDS = ADMIN;
    const db = { query: (sql, args) => pg.query(sql, args), connect: async () => ({ query: (sql, args) => pg.query(sql, args), release() {} }) };
    app = Fastify(); app.decorateRequest('user', null);
    app.addHook('preValidation', async request => { request.user = { sub: request.headers['x-rider'] || RIDER }; });
    await app.register(routes, { db, env: { REPORTS_ENABLED: 'true', AGE_GATE_MIN_AGE: '13' } });
});
afterAll(async () => { await app?.close(); await pg?.close(); delete process.env.ADMIN_USER_IDS; });
const report = async (targetType, targetId) => (await app.inject({ method: 'POST', url: '/content/reports', payload: { targetType, targetId, reason: 'Please review' } })).json().report;
test('real SQL confirms age once and supports block/unblock records', async () => {
    expect((await app.inject('/user/age-confirmation')).json().required).toBe(true);
    await app.inject({ method: 'POST', url: '/user/age-confirmation', payload: { confirmed: true } });
    const first = (await app.inject('/user/age-confirmation')).json().confirmedAt;
    await app.inject({ method: 'POST', url: '/user/age-confirmation', payload: { confirmed: true } });
    expect((await app.inject('/user/age-confirmation')).json().confirmedAt).toBe(first);
    expect((await app.inject({ method: 'PUT', url: `/user/blocks/${AUTHOR}` })).statusCode).toBe(200);
    expect((await app.inject('/user/blocks')).json().blocks[0].userId).toBe(AUTHOR);
    await app.inject({ method: 'DELETE', url: `/user/blocks/${AUTHOR}` }); expect((await app.inject('/user/blocks')).json().blocks).toEqual([]);
});
test('real moderation transaction cancels a listing, restores item ownership, restricts author and closes report', async () => {
    const saved = await report('listing', '1');
    expect(saved.status).toBe('pending');
    const response = await app.inject({ method: 'POST', url: `/admin/content-reports/${saved.id}/review`, headers: { 'x-rider': ADMIN }, payload: { action: 'remove', restrictUser: true } });
    expect(response.statusCode).toBe(200);
    expect((await pg.query('SELECT status FROM marketplace_listings WHERE id = 1')).rows[0].status).toBe('canceled');
    expect((await pg.query('SELECT status FROM user_item_instances WHERE id = 1')).rows[0].status).toBe('owned');
    expect((await pg.query('SELECT content_restricted_at FROM users WHERE id = $1', [AUTHOR])).rows[0].content_restricted_at).toBeTruthy();
    expect((await pg.query('SELECT status FROM content_reports WHERE id = $1', [saved.id])).rows[0].status).toBe('removed');
});
test('post removal preserves the row while dismissal leaves content intact', async () => {
    const first = await report('post', '1');
    await app.inject({ method: 'POST', url: `/admin/content-reports/${first.id}/review`, headers: { 'x-rider': ADMIN }, payload: { action: 'dismiss' } });
    expect((await pg.query('SELECT removed_at FROM wayside_online_posts WHERE id = 1')).rows[0].removed_at).toBeNull();
    const second = await report('post', '1');
    await app.inject({ method: 'POST', url: `/admin/content-reports/${second.id}/review`, headers: { 'x-rider': ADMIN }, payload: { action: 'remove' } });
    expect((await pg.query('SELECT removed_at FROM wayside_online_posts WHERE id = 1')).rows[0].removed_at).toBeTruthy();
});
test('Supabase client roles cannot read moderation records or clear API restriction fields', async () => {
    await pg.exec('GRANT USAGE ON SCHEMA public TO authenticated; GRANT SELECT ON content_reports, user_blocks TO authenticated; GRANT SELECT, UPDATE ON users TO authenticated; SET ROLE authenticated;');
    try {
        expect((await pg.query('SELECT * FROM content_reports')).rows).toEqual([]);
        await expect(pg.query('UPDATE users SET content_restricted_at = NULL WHERE id = $1', [AUTHOR])).rejects.toThrow('Compliance fields are managed');
    } finally { await pg.exec('RESET ROLE'); }
});
