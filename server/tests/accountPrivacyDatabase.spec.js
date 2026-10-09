/** @jest-environment node */
import { jest } from '@jest/globals';
import Fastify from 'fastify';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';

jest.setTimeout(30000);
let database;
const db = { query: (...args) => database.query(...args), connect: async () => ({ query: (...args) => database.query(...args), release() {} }) };
jest.unstable_mockModule('../db/mockDB.js', () => ({ default: db }));
const { default: routes } = await import('../routes/accountPrivacy.js');
const { default: legacyRoutes } = await import('../routes/8bitevilreturns.js');
const { getAccountStandings, getLeaderboardPayload, getPastWinners } = await import('../routes/leaderboard.js');
const { getGameLeaderboardPayload } = await import('../routes/games.js');
const { authenticateAgent, hashAgentToken } = await import('../utils/agentTokens.js');
const ID = '22222222-2222-4222-8222-222222222222';
const OTHER = '33333333-3333-4333-8333-333333333333';
let app;
let supabase;

beforeAll(async () => {
    database = new PGlite();
    await database.exec(`
        CREATE ROLE anon; CREATE ROLE authenticated;
        CREATE SCHEMA auth; CREATE SCHEMA storage;
        CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
        CREATE TABLE auth.users (id uuid PRIMARY KEY, email text);
        CREATE TABLE public.users (id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
            username varchar(32) UNIQUE, email text UNIQUE, created_at timestamptz DEFAULT now(), avatar_url text);
        CREATE TABLE storage.objects (bucket_id text, name text, owner uuid);
        ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
        GRANT USAGE ON SCHEMA storage, auth TO authenticated;
        GRANT SELECT, INSERT ON storage.objects TO authenticated;
        CREATE POLICY test_storage_access ON storage.objects FOR ALL TO authenticated USING (true) WITH CHECK (true);
        CREATE TABLE games (id integer PRIMARY KEY, name text);
        CREATE TABLE leaderboards (id integer PRIMARY KEY, user_id uuid REFERENCES users(id) ON DELETE CASCADE,
            game_id integer REFERENCES games(id), metric_name text, metric_value numeric, achieved_at timestamptz DEFAULT now());
        CREATE TABLE user_wallets (user_id uuid PRIMARY KEY REFERENCES users(id), coin_balance integer);
        CREATE TABLE currency_transactions (id integer PRIMARY KEY, user_id uuid REFERENCES users(id), counterparty_user_id uuid REFERENCES users(id), amount integer, metadata jsonb DEFAULT '{}');
        CREATE TABLE user_item_instances (id bigint PRIMARY KEY, user_id uuid REFERENCES users(id));
        CREATE TABLE marketplace_listings (id integer PRIMARY KEY, item_instance_id bigint REFERENCES user_item_instances(id) ON DELETE RESTRICT,
            seller_user_id uuid REFERENCES users(id), buyer_user_id uuid REFERENCES users(id), status text);
        CREATE TABLE user_inventory (user_id uuid REFERENCES users(id), item_id integer);
        CREATE TABLE user_avatar (user_id uuid REFERENCES users(id), item_id integer);
        CREATE TABLE user_outfit_items (user_id uuid REFERENCES users(id), item_instance_id bigint REFERENCES user_item_instances(id));
        CREATE TABLE user_avatar_profile (user_id uuid PRIMARY KEY REFERENCES users(id));
        CREATE TABLE user_carts (user_id uuid REFERENCES users(id), cart_key text);
        CREATE TABLE lounge_chat (user_id uuid REFERENCES users(id), body text);
    `);
    for (const name of ['20260507_add_inbox_foundation.sql', '20260930_add_scareathon_scoring.sql', '20260928_add_picto_box_photos.sql', '20261003_wayside_online.sql', '20261008_agent_tokens.sql']) {
        // Inbox rewards reference the catalog even though this test has no catalog items.
        if (name.startsWith('20260507')) await database.exec('CREATE TABLE avatar_items (id integer PRIMARY KEY);');
        await database.exec(await readFile(new URL(`../db/migrations/${name}`, import.meta.url), 'utf8'));
    }
    await database.exec(await readFile(new URL('../db/migrations/20260509_cleanup_deleted_auth_users.sql', import.meta.url), 'utf8'));
    await database.exec(await readFile(new URL('../db/migrations/20261013_account_privacy.sql', import.meta.url), 'utf8'));
    // A second startup run must be safe.
    await database.exec(await readFile(new URL('../db/migrations/20261013_account_privacy.sql', import.meta.url), 'utf8'));
    await database.exec(await readFile(new URL('../db/migrations/20261014_compliance.sql', import.meta.url), 'utf8'));
    await database.query('INSERT INTO auth.users (id, email) VALUES ($1, $3), ($2, $4)', [ID, OTHER, 'rider@example.com', 'other@example.com']);
    await database.query('INSERT INTO users (id, username, email, avatar_url) VALUES ($1, $3, $5, $7), ($2, $4, $6, NULL)', [ID, OTHER, 'Rider', 'Other', 'rider@example.com', 'other@example.com', 'private-avatar.png']);
    await database.exec("INSERT INTO games VALUES (1, 'test'), (2, '8 Bit Evil Returns')");
    await database.query("INSERT INTO leaderboards VALUES (1, $1, 1, 'score', 123, now())", [ID]);
    await database.query('INSERT INTO user_wallets VALUES ($1, 10), ($2, 20)', [ID, OTHER]);
    await database.query("INSERT INTO currency_transactions VALUES (1, $1, $2, 10, '{}'), (2, $2, $1, 20, '{\"name\":\"Rider\"}')", [ID, OTHER]);
    await database.query('INSERT INTO user_item_instances VALUES (1, $1), (2, $2)', [ID, OTHER]);
    await database.query("INSERT INTO marketplace_listings VALUES (1, 1, $1, NULL, 'active'), (2, 2, $1, $2, 'sold')", [ID, OTHER]);
    for (const table of ['user_avatar_profile']) await database.query(`INSERT INTO ${table} VALUES ($1)`, [ID]);
    for (const table of ['user_inventory', 'user_avatar', 'user_outfit_items']) await database.query(`INSERT INTO ${table} VALUES ($1, 1)`, [ID]);
    await database.query("INSERT INTO user_carts VALUES ($1, 'cart');", [ID]);
    await database.query("INSERT INTO lounge_chat VALUES ($1, 'private chat')", [ID]);
    await database.query('INSERT INTO scareathon_watches (user_id, season, day) VALUES ($1, 2026, 1), ($1, 2026, 4), ($1, 2025, 7)', [ID]);
    await database.query("INSERT INTO scareathon_points (user_id, season, category, points, reason, source_key) VALUES ($1, 2026, 'bonus', 2, 'Rider personal note', 'personal-source')", [ID]);
    await database.query("INSERT INTO picto_box_photos (id, user_id, username, image) VALUES ('44444444-4444-4444-8444-444444444444', $1, 'Rider', decode('ff', 'hex'))", [ID]);
    await database.query("INSERT INTO storage.objects VALUES ('picto-box', 'photo.jpg', $1), ('avatar-composites', $1::text || '.png', NULL)", [ID]);
    await database.query("INSERT INTO wayside_online_posts (user_id, board, body) VALUES ($1, 'general', 'private post')", [ID]);
    await database.query('INSERT INTO agent_tokens (user_id, name, token_hash, hint) VALUES ($1, $2, $3, $4)', [ID, 'CLI', hashAgentToken('wsa_old'), 'old1']);
    const conversation = (await database.query("INSERT INTO inbox_conversations (conversation_type, created_by_user_id, subject) VALUES ('user_dm', $1, 'Private subject') RETURNING id", [ID])).rows[0].id;
    await database.query('INSERT INTO inbox_participants (conversation_id, user_id) VALUES ($1, $2), ($1, $3)', [conversation, ID, OTHER]);
    await database.query("INSERT INTO inbox_messages (conversation_id, sender_user_id, body) VALUES ($1, $2, 'Incoming private mail')", [conversation, OTHER]);
    await database.exec("INSERT INTO scareathon_history (season, name, movies, weekly, bonus, total) VALUES (2024, 'Rider', 3, 2, 0, 5)");
    await database.exec("INSERT INTO scareathon_winners (season, name) VALUES (2024, 'Rider')");
    supabase = {
        auth: {
            admin: {
                getUserById: async () => ({ data: { user: { id: ID, email: 'rider@example.com' } }, error: null }),
                deleteUser: jest.fn(async id => { await database.query('DELETE FROM auth.users WHERE id = $1', [id]); return { error: null }; }),
            },
            signInWithPassword: async () => ({ data: { user: { id: ID } }, error: null }),
            signOut: async () => ({ error: null }),
        },
        storage: { from: bucket => ({ remove: async names => {
            await database.query('DELETE FROM storage.objects WHERE bucket_id = $1 AND name = ANY($2::text[])', [bucket, names]);
            return { error: null };
        } }) },
    };
    app = Fastify();
    app.decorateRequest('user', null);
    app.addHook('preValidation', async request => { if (request.headers['x-user']) request.user = { sub: ID }; });
    await app.register(legacyRoutes, { prefix: '/8bitevilreturns' });
    await app.register(routes, { prefix: '/user', db, accountAuth: () => supabase });
    await app.ready();
});
afterAll(async () => { await app?.close(); await database?.close(); });

test('real PostgreSQL export and deletion preserve anonymous results through the actual Auth trigger', async () => {
    const exported = await app.inject({ method: 'GET', url: '/user/export', headers: { 'x-user': ID } });
    expect(exported.statusCode).toBe(200);
    const data = exported.json();
    expect(data.wallet.coin_balance).toBe(10);
    expect(data.inboxConversations[0].subject).toBe('Private subject');
    expect(data.inbox[0].body).toBe('Incoming private mail');
    expect(data.agentKeys[0].name).toBe('CLI');
    expect(exported.body).not.toContain(hashAgentToken('wsa_old'));
    expect((await getAccountStandings(db, 2026))[0].total).toBe(4);
    await database.query('UPDATE users SET age_confirmed_at = now(), content_restricted_at = now() WHERE id = $1', [ID]);
    await database.query('INSERT INTO user_blocks (blocker_id, blocked_id) VALUES ($1, $2), ($2, $1)', [ID, OTHER]);
    await database.query("INSERT INTO content_reports (reporter_id, target_type, target_id, target_user_id, reason, snapshot) VALUES ($1, 'post', '1', $2, 'Review', '{\"text\":\"Private words\"}'), ($2, 'post', '2', $1, 'Review', '{\"text\":\"Rider words\"}')", [ID, OTHER]);
    const response = await app.inject({ method: 'DELETE', url: '/user/account', headers: { 'x-user': ID }, payload: { confirmation: 'DELETE', currentPassword: 'secret' } });
    expect(response.statusCode).toBe(200);
    const user = (await database.query('SELECT * FROM users WHERE id = $1', [ID])).rows[0];
    expect(user.deleted_at).toBeTruthy(); expect(user.username).toMatch(/^Deleted rider_/);
    expect(user.email).not.toBe('rider@example.com'); expect(user.avatar_url).toBeNull();
    expect(user.age_confirmed_at).toBeNull(); expect(user.content_restricted_at).toBeNull();
    expect((await database.query('SELECT * FROM user_blocks')).rows).toEqual([]);
    const report = (await database.query('SELECT * FROM content_reports')).rows[0];
    expect(report.reporter_id).toBe(OTHER); expect(report.target_user_id).toBeNull(); expect(report.snapshot).toBeNull();
    expect((await database.query('SELECT * FROM auth.users WHERE id = $1', [ID])).rows).toEqual([]);
    expect((await getGameLeaderboardPayload({ game: 'test' })).data[0].username).toBe('Deleted rider');
    expect((await getAccountStandings(db, 2026))[0]).toMatchObject({ name: 'Deleted rider', total: 4 });
    expect((await getAccountStandings(db, 2025))[0]).toMatchObject({ name: 'Deleted rider', total: 1 });
    expect((await getLeaderboardPayload({ requestedYear: 2024, db })).data[0]).toMatchObject({ name: 'Deleted rider', total: 5 });
    expect(await getPastWinners({ db, date: new Date('2026-10-09T12:00:00Z') })).toContainEqual({ year: '2024', name: 'Deleted rider' });
    for (const table of ['user_wallets', 'currency_transactions', 'user_item_instances', 'user_inventory', 'user_avatar', 'user_outfit_items', 'user_avatar_profile', 'user_carts', 'lounge_chat', 'scareathon_watches', 'picto_box_photos', 'wayside_online_posts', 'agent_tokens']) {
        expect((await database.query(`SELECT * FROM ${table} WHERE user_id = $1`, [ID])).rows).toEqual([]);
    }
    for (const table of ['storage.objects', 'account_deletion_jobs', 'inbox_messages', 'inbox_conversations', 'marketplace_listings']) {
        expect((await database.query(`SELECT * FROM ${table}`)).rows).toEqual([]);
    }
    const retained = (await database.query('SELECT * FROM currency_transactions WHERE user_id = $1', [OTHER])).rows[0];
    expect(retained.counterparty_user_id).toBeNull(); expect(retained.metadata).toEqual({});
    const reply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
    expect(await authenticateAgent(db, { method: 'GET', url: '/leaderboard' }, reply, 'wsa_old')).toBe(true);
    expect(reply.code).toHaveBeenCalledWith(401);
    expect((await app.inject({ method: 'GET', url: '/user/export', headers: { 'x-user': ID } })).statusCode).toBe(401);
    // Legacy UUID-only save endpoints must reject a closed rider too.
    expect((await app.inject({ method: 'POST', url: '/8bitevilreturns/setUserData', payload: { userId: ID } })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: `/8bitevilreturns/getUserData?userId=${ID}` })).statusCode).toBe(401);
    // An already-issued Supabase JWT must not recreate Storage files after closure.
    await database.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [ID]);
    await database.exec('SET ROLE authenticated');
    await expect(database.query("INSERT INTO storage.objects VALUES ('picto-box', 'resurrect.jpg', $1)", [ID])).rejects.toThrow(/row-level security/);
    await database.exec('RESET ROLE');
    // The real email can immediately register again under a new Auth identity.
    await database.query("INSERT INTO auth.users VALUES ('55555555-5555-4555-8555-555555555555', 'rider@example.com')");
    await database.query("INSERT INTO users (id, username, email) VALUES ('55555555-5555-4555-8555-555555555555', 'NewRider', 'rider@example.com')");
});
