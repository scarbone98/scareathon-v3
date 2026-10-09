import { jest } from '@jest/globals';
import Fastify from 'fastify';
import { readFile } from 'node:fs/promises';

const query = jest.fn();
const release = jest.fn();
const connect = jest.fn(async () => ({ query, release }));
jest.unstable_mockModule('../db/mockDB.js', () => ({ default: { query, connect } }));
const { default: routes } = await import('../routes/accountPrivacy.js');
const { requireActiveAccount, finishAccountDeletion, retryAccountDeletions } = await import('../utils/accountPrivacy.js');
const { getGameLeaderboardPayload } = await import('../routes/games.js');
const { getAccountStandings } = await import('../routes/leaderboard.js');
const { deleteCachePrefix, setCache } = await import('../utils/cacheManager.js');
const { isPublicRoute, isOptionalAuthRoute } = await import('../utils/authRoutes.js');
const { authenticateAgent, hashAgentToken } = await import('../utils/agentTokens.js');
const { accountClosed } = await import('../utils/accountSessions.js');
const { createLounge } = await import('../waysideOnline/lounge.js');
const { createRoomManager } = await import('../wayside-fury/rooms.js');
const { createChatRoom } = await import('../monsterBash/chatRoom.js');

const ID = '22222222-2222-4222-8222-222222222222';
const empty = () => ({ rows: [], rowCount: 0 });
const tables = ['users', 'leaderboards', 'scareathon_points', 'scareathon_watches', 'user_wallets',
    'currency_transactions', 'user_item_instances', 'user_inventory', 'user_avatar', 'user_avatar_profile',
    'user_outfit_items', 'picto_box_photos', 'agent_tokens', 'inbox_messages', 'inbox_participants',
    'inbox_rewards', 'inbox_conversations', 'wayside_online_posts', 'wayside_online_reactions',
    'marketplace_listings', 'user_carts', 'wayside_fury_saves', 'user_banners', 'user_banner_choice'];
let deleted;
let pending;
let points;
let watches;
const remove = jest.fn();
const deleteUser = jest.fn();
const getUserById = jest.fn();
const signInWithPassword = jest.fn();
const signOut = jest.fn();
const supabase = {
    auth: { admin: { deleteUser, getUserById }, signInWithPassword, signOut },
    storage: { from: jest.fn(() => ({ remove })) },
};
let app;

beforeEach(async () => {
    deleted = false; pending = false; points = 2; watches = [1, 4, 6];
    jest.clearAllMocks(); deleteCachePrefix('');
    deleteUser.mockResolvedValue({ error: null });
    remove.mockResolvedValue({ error: null });
    getUserById.mockResolvedValue({ data: { user: { id: ID, email: 'rider@example.com' } }, error: null });
    signInWithPassword.mockResolvedValue({ data: { user: { id: ID } }, error: null });
    signOut.mockResolvedValue({ error: null });
    query.mockImplementation(async (sql) => {
        if (sql.includes('SELECT 1 FROM users')) return deleted ? empty() : { rows: [{ '?column?': 1 }], rowCount: 1 };
        if (sql.includes('information_schema.tables')) return { rows: tables.map(table_name => ({ table_name })) };
        if (sql.includes('information_schema.columns')) return { rows: [{ table_name: 'lounge_chat', column_name: 'user_id' }] };
        if (sql.includes('SELECT * FROM users')) return { rows: [{ id: ID, username: 'Rider', email: 'rider@example.com', deleted_at: deleted ? 'now' : null }] };
        if (sql.includes('INSERT INTO scareathon_points')) { points += watches.length; return empty(); }
        if (sql.includes('DELETE FROM public.scareathon_watches')) watches = [];
        if (sql.includes('UPDATE users SET username')) deleted = true;
        if (sql.includes('INSERT INTO account_deletion_jobs')) pending = true;
        if (sql.includes('DELETE FROM account_deletion_jobs')) pending = false;
        if (sql.includes('SELECT storage_files')) return pending ? { rows: [{ storage_files: [{ bucket_id: 'picto-box', name: `${ID}/photo.jpg` }] }] } : empty();
        if (sql.includes('SELECT user_id FROM account_deletion_jobs')) return { rows: pending ? [{ user_id: ID }] : [] };
        if (sql.includes('FROM storage.objects')) return { rows: [{ bucket_id: 'picto-box', name: `${ID}/photo.jpg` }] };
        if (sql.includes('FROM leaderboards l') && sql.includes('JOIN users')) {
            expect(sql).toContain("CASE WHEN u.deleted_at IS NOT NULL THEN 'Deleted rider'");
            return { rows: [{ username: deleted ? 'Deleted rider' : 'Rider', id: ID, metric_value: 123 }] };
        }
        if (sql.includes('WITH tallies')) {
            expect(sql).toContain("CASE WHEN u.deleted_at IS NOT NULL THEN 'Deleted rider'");
            return { rows: [{ username: deleted ? 'Deleted rider' : 'Rider', user_id: ID, movies: watches.length, weekly: points, bonus: 0 }] };
        }
        if (sql.includes('SELECT id, username, email')) return { rows: [{ id: ID, username: 'Rider', email: 'stale@example.com' }] };
        if (sql.includes('FROM public.agent_tokens')) {
            expect(sql).not.toMatch(/SELECT \*/);
            return { rows: [{ name: 'CLI', created_at: 'now', last_used_at: null, revoked_at: null }] };
        }
        if (sql.includes('FROM public.picto_box_photos')) return { rows: [{ id: 'photo-id', style: 'sepia', created_at: 'now' }] };
        if (sql.includes('FROM public.currency_transactions')) return { rows: [{ id: 1, amount: 10 }] };
        if (sql.includes('FROM public.user_wallets')) return { rows: [{ coin_balance: 10 }] };
        if (sql.includes('SELECT * FROM marketplace_listings')) return { rows: [] };
        return empty();
    });
    app = Fastify();
    app.decorateRequest('user', null);
    app.addHook('preValidation', async req => {
        if (req.headers['x-user']) req.user = { sub: ID, agent: req.headers['x-agent'] === 'yes' };
    });
    await app.register(routes, { prefix: '/user', db: { query, connect }, accountAuth: () => supabase });
    await app.ready();
});
afterEach(async () => { await app.close(); });
const headers = { 'x-user': ID };
const close = () => app.inject({ method: 'DELETE', url: '/user/account', headers, payload: { confirmation: 'DELETE', currentPassword: 'secret' } });

test.each([['GET', '/user/export'], ['DELETE', '/user/account']])('%s %s requires account auth and refuses agent keys', async (method, url) => {
    expect(isPublicRoute(method, url)).toBe(false);
    expect(isOptionalAuthRoute(method, url)).toBe(false);
    expect((await app.inject({ method, url })).statusCode).toBe(401);
    expect((await app.inject({ method, url, headers: { ...headers, 'x-agent': 'yes' } })).statusCode).toBe(401);
    expect(connect).not.toHaveBeenCalled();
});

test('export includes complete categories, confirmed email, attachment headers and no key hashes', async () => {
    const response = await app.inject({ method: 'GET', url: '/user/export', headers });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-disposition']).toContain('wayside-station-data.json');
    expect(response.headers['cache-control']).toBe('no-store');
    const data = response.json();
    expect(data).toEqual(expect.objectContaining({
        profile: expect.objectContaining({ username: 'Rider', email: 'rider@example.com' }),
        email: 'rider@example.com', wallet: { coin_balance: 10 }, transactions: [{ id: 1, amount: 10 }],
        items: [], inventory: [], avatar: [], outfit: [], scores: [], standings: [], watches: [],
        posts: [], photos: [expect.objectContaining({ url: '/picto-box/photos/photo-id.jpg' })],
        listings: [], inbox: [], agentKeys: [expect.objectContaining({ name: 'CLI' })],
    }));
    expect(response.body).not.toMatch(/token_hash|password|service_role/);
    expect(query.mock.calls.find(([sql]) => sql.includes('FROM public.currency_transactions'))[0]).not.toContain('LIMIT');
    expect(release).toHaveBeenCalled();
});

test('delete needs DELETE and the matching current password before any transaction', async () => {
    const invalid = await app.inject({ method: 'DELETE', url: '/user/account', headers, payload: { confirmation: 'delete', currentPassword: 'secret' } });
    expect(invalid.statusCode).toBe(400);
    signInWithPassword.mockResolvedValueOnce({ error: { message: 'wrong password' }, data: {} });
    expect((await close()).statusCode).toBe(403);
    expect(connect).not.toHaveBeenCalled();
    signInWithPassword.mockResolvedValueOnce({ error: null, data: { user: { id: 'another-user' } } });
    expect((await close()).statusCode).toBe(403);
});

test('delete anonymizes and retains arcade scores and standing totals, erases private rows and files, then deletes Auth', async () => {
    setCache('gameLeaderboard:test:score:10', [{ username: 'Rider', metric_value: 123 }]);
    const response = await close();
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ deleted: true, cleanupPending: false });
    expect(deleted).toBe(true);
    expect(watches).toEqual([]);
    expect(points).toBe(5);
    const sql = query.mock.calls.map(([text]) => text).join('\n');
    expect(sql).toContain('FOR UPDATE');
    expect(sql).toContain('DELETE FROM public.agent_tokens');
    expect(sql).toContain('DELETE FROM public.user_outfit_items');
    expect(sql).toContain('DELETE FROM public.user_wallets');
    expect(sql).toContain('DELETE FROM public.picto_box_photos');
    expect(sql).toContain('DELETE FROM public.wayside_online_posts');
    expect(sql).toContain('DELETE FROM public.user_carts');
    expect(sql).toContain('DELETE FROM public."lounge_chat"');
    expect(sql).toContain('DELETE FROM inbox_conversations');
    expect(sql).toContain('DELETE FROM currency_transactions');
    expect(sql).toContain('DELETE FROM marketplace_listings');
    expect(sql).not.toMatch(/DELETE FROM (?:public\.)?(users|leaderboards|scareathon_points|monster_bash_matches)\b/);
    expect(signInWithPassword).toHaveBeenCalledWith({ email: 'rider@example.com', password: 'secret' });
    expect(remove).toHaveBeenCalledWith([`${ID}/photo.jpg`]);
    expect(deleteUser).toHaveBeenCalledWith(ID);
    expect(remove.mock.invocationCallOrder[0]).toBeLessThan(deleteUser.mock.invocationCallOrder[0]);
    expect(query.mock.calls.findIndex(([sql]) => sql === 'COMMIT')).toBeLessThan(query.mock.calls.findIndex(([sql]) => sql.includes('SELECT storage_files')));
    expect((await getGameLeaderboardPayload({ game: 'test' })).data[0]).toEqual(expect.objectContaining({ username: 'Deleted rider', metricValue: 123 }));
    expect((await getAccountStandings({ query }, 2026))[0]).toEqual(expect.objectContaining({ name: 'Deleted rider', total: 5 }));
    const reply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
    expect(await requireActiveAccount({ query }, { user: { sub: ID } }, reply)).toBe(false);
    expect(reply.code).toHaveBeenCalledWith(401);
    await authenticateAgent({ query }, { method: 'GET', url: '/leaderboard' }, reply, 'wsa_old-key');
    expect(query).toHaveBeenCalledWith(expect.stringContaining('users.deleted_at IS NULL'), [hashAgentToken('wsa_old-key')]);
});

test('rolls back SQL failures without deleting Auth or Storage', async () => {
    const original = query.getMockImplementation();
    query.mockImplementation(async (sql, ...args) => {
        if (sql.includes('DELETE FROM public.user_wallets')) throw new Error('database failed');
        return original(sql, ...args);
    });
    expect((await close()).statusCode).toBe(503);
    expect(query).toHaveBeenCalledWith('ROLLBACK');
    expect(deleteUser).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalled();
});

test('Storage failure leaves a durable job and denies sessions while remote cleanup retries', async () => {
    remove.mockResolvedValueOnce({ error: { message: 'offline' } });
    const response = await close();
    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({ deleted: true, cleanupPending: true });
    expect(pending).toBe(true);
    expect(deleteUser).not.toHaveBeenCalled();
    expect((await app.inject({ method: 'GET', url: '/user/export', headers })).statusCode).toBe(401);
    await finishAccountDeletion({ query }, ID, supabase);
    expect(pending).toBe(false);
    expect(deleteUser).toHaveBeenCalledWith(ID);
});

test('Auth cleanup failure retains the job; retry accepts an already-deleted Auth user', async () => {
    deleteUser.mockResolvedValueOnce({ error: { status: 503 } });
    expect((await close()).statusCode).toBe(202);
    expect(pending).toBe(true);
    deleteUser.mockResolvedValueOnce({ error: { status: 404, code: 'user_not_found' } });
    await finishAccountDeletion({ query }, ID, supabase);
    expect(pending).toBe(false);
});

test('worker reports failed jobs without losing them', async () => {
    pending = true;
    const log = { error: jest.fn() };
    remove.mockResolvedValueOnce({ error: { message: 'offline' } });
    await retryAccountDeletions({ query }, log, () => supabase);
    expect(log.error).toHaveBeenCalled();
    expect(pending).toBe(true);
});

test('closure preserves public user tombstones in the Auth cleanup migration', async () => {
    const sql = await readFile(new URL('../db/migrations/20261013_account_privacy.sql', import.meta.url), 'utf8');
    expect(sql).toContain('deleted_at IS NOT NULL');
    expect(sql).toMatch(/IF EXISTS[\s\S]*deleted_at IS NOT NULL[\s\S]*RETURN OLD/);
    expect(sql).toContain('DROP CONSTRAINT');
    expect(sql).toContain('REVOKE ALL ON public.account_deletion_jobs FROM anon, authenticated');
});

test('lounge closure purges spoken chat, tickets and active sockets', () => {
    const lounge = createLounge();
    const socket = { readyState: 1, send: jest.fn(), close: jest.fn() };
    lounge.watch(socket);
    lounge.join(socket, { ticket: lounge.ticket({ userId: ID, name: 'Rider' }) });
    lounge.say(socket, { text: 'private chat' });
    const unused = lounge.ticket({ userId: ID, name: 'Rider' });
    lounge.forgetUser(ID);
    expect(lounge.size).toBe(0);
    expect(socket.close).toHaveBeenCalledWith(4001, 'Account closed');
    expect(() => lounge.join(socket, { ticket: unused })).toThrow();
    lounge.close();
});

test('co-op closure revokes unused tickets and removes reconnectable seats', () => {
    const rooms = createRoomManager();
    const socket = { readyState: 1, send: jest.fn(), close: jest.fn() };
    rooms.auth(socket, { ticket: rooms.issueTicket({ userId: ID, name: 'Rider' }) });
    rooms.create(socket);
    const unused = rooms.issueTicket({ userId: ID, name: 'Rider' });
    rooms.forgetUser(ID);
    expect(rooms.size).toBe(0);
    expect(socket.waysideFuryUser).toBeNull();
    expect(socket.close).toHaveBeenCalledWith(4001, 'Account closed');
    expect(() => rooms.auth(socket, { ticket: unused })).toThrow();
    rooms.close();
});

test('ephemeral Monster Bash chat forgets closed riders but retains other chat', async () => {
    const chat = createChatRoom({ lookupUsername: async id => id === ID ? 'Rider' : 'Other' });
    await chat.post(ID, 'my message');
    await chat.post('other', 'other message');
    chat.forgetUser(ID);
    expect(chat.recent()).toEqual([expect.objectContaining({ name: 'Other' })]);
    // Emission with no subscribers is harmless (the server routes subscribe to this event).
    expect(() => accountClosed(ID)).not.toThrow();
});
