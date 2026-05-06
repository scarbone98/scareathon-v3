import fastify from 'fastify';
import inboxRoutes, {
    isAdminUser,
    normalizeMessageBody,
    normalizeRewardPayload,
    normalizeSubject,
    normalizeUsernameList,
    parseAllowlist,
} from '../routes/inbox.js';

describe('inbox helpers', () => {
    test('parseAllowlist trims entries and ignores blanks', () => {
        expect(parseAllowlist(' user-1, user-2 ,, ').has('user-1')).toBe(true);
        expect(parseAllowlist(' user-1, user-2 ,, ').has('user-2')).toBe(true);
        expect(parseAllowlist(' user-1, user-2 ,, ').size).toBe(2);
    });

    test('isAdminUser accepts configured ids and emails', () => {
        expect(isAdminUser(
            { sub: 'admin-id', email: 'player@example.com' },
            { ADMIN_USER_IDS: 'admin-id', ADMIN_EMAILS: '' }
        )).toBe(true);

        expect(isAdminUser(
            { sub: 'user-id', email: 'Admin@Example.com' },
            { ADMIN_USER_IDS: '', ADMIN_EMAILS: 'admin@example.com' }
        )).toBe(true);

        expect(isAdminUser(
            { sub: 'user-id', email: 'player@example.com' },
            { ADMIN_USER_IDS: 'admin-id', ADMIN_EMAILS: 'admin@example.com' }
        )).toBe(false);
    });

    test('normalizeUsernameList trims and de-dupes usernames', () => {
        expect(normalizeUsernameList([' Alice ', 'alice', '', null, 'Bob'])).toEqual(['Alice', 'Bob']);
    });

    test('normalizes message body and subject bounds', () => {
        expect(normalizeMessageBody('  hi  ')).toBe('hi');
        expect(normalizeMessageBody('')).toBeNull();
        expect(normalizeMessageBody('x'.repeat(4001))).toBeNull();

        expect(normalizeSubject('  Rewards  ')).toBe('Rewards');
        expect(normalizeSubject('x'.repeat(121))).toBeNull();
    });

    test('normalizes coin and item rewards', () => {
        expect(normalizeRewardPayload({ coinAmount: '25' })).toEqual({
            reward: { coinAmount: 25, itemId: null, itemQuantity: null },
            error: null,
        });

        expect(normalizeRewardPayload({ itemId: '7' })).toEqual({
            reward: { coinAmount: null, itemId: 7, itemQuantity: 1 },
            error: null,
        });

        expect(normalizeRewardPayload({ coinAmount: 10, itemId: 7, itemQuantity: 2 })).toEqual({
            reward: { coinAmount: 10, itemId: 7, itemQuantity: 2 },
            error: null,
        });

        expect(normalizeRewardPayload({ itemQuantity: 2 }).error).toMatch(/requires/);
        expect(normalizeRewardPayload({}).error).toMatch(/must include/);
    });
});

describe('inbox routes', () => {
    test('blocks non-admin users from admin conversation creation before hitting the database', async () => {
        const app = fastify();
        app.addHook('preHandler', async (request) => {
            request.user = { sub: 'user-id', email: 'user@example.com' };
        });
        app.register(inboxRoutes, { prefix: '/inbox' });
        await app.ready();

        const response = await app.inject({
            method: 'POST',
            url: '/inbox/admin/conversations',
            payload: {
                recipientUsernames: ['Alice'],
                body: 'You won!',
            },
        });

        expect(response.statusCode).toBe(403);
        expect(JSON.parse(response.payload)).toEqual({ error: 'Admin access required' });

        await app.close();
    });
});
