import { MIN_BET, parseBetRequest } from '../routes/monsterBash.js';
import { CHAT_LIMITS, createChatRoom, normalizeChatText } from '../monsterBash/chatRoom.js';

describe('parseBetRequest', () => {
    test('accepts a well-formed bet', () => {
        expect(parseBetRequest({ matchId: '12', side: 1, amount: 50 }, 500)).toEqual({ matchId: '12', side: 1, amount: 50 });
        expect(parseBetRequest({ matchId: 12, side: 0, amount: MIN_BET }, 500)).toEqual({ matchId: '12', side: 0, amount: MIN_BET });
    });

    test.each([
        [{ matchId: '12', side: 2, amount: 50 }],
        [{ matchId: '12', side: '1', amount: 50 }],
        [{ matchId: '12', side: 1, amount: 0 }],
        [{ matchId: '12', side: 1, amount: 501 }],
        [{ matchId: '12', side: 1, amount: 10.5 }],
        [{ matchId: '12', side: 1, amount: '50' }],
        [{ matchId: '12; drop', side: 1, amount: 50 }],
        [{ side: 1, amount: 50 }],
        [null],
    ])('rejects %j', (body) => {
        expect(parseBetRequest(body, 500)).toBeNull();
    });
});

describe('monster bash chat', () => {
    const room = () => createChatRoom({ lookupUsername: async (id) => (id === 'nameless' ? null : `name-${id}`) });

    test('cleans whitespace and control characters', () => {
        expect(normalizeChatText('  hi\u0000 \n there  ')).toBe('hi there');
    });

    test('masks profanity instead of rejecting the message', async () => {
        const message = await room().post('u1', 'what a shitty dodge');
        expect(message).toMatchObject({ name: 'name-u1', text: 'what a ****ty dodge' });
    });

    test('refuses empty, overlong and rapid-fire messages', async () => {
        const chat = room();
        await expect(chat.post('u1', '   ')).rejects.toMatchObject({ code: 'empty' });
        await expect(chat.post('u1', 'x'.repeat(CHAT_LIMITS.maxLength + 1))).rejects.toMatchObject({ code: 'too_long' });
        await chat.post('u1', 'first');
        await expect(chat.post('u1', 'second')).rejects.toMatchObject({ code: 'slow_down' });
        await expect(chat.post('u2', 'someone else is fine')).resolves.toMatchObject({ name: 'name-u2' });
    });

    test('keeps only the most recent messages and falls back to a default name', async () => {
        const chat = createChatRoom({ lookupUsername: async () => null, limits: { ...CHAT_LIMITS, historySize: 3, minIntervalMs: 0 } });
        for (let i = 0; i < 5; i++) await chat.post('u1', `msg ${i}`);
        chat.system('Payouts sent');
        expect(chat.recent().map((message) => message.text)).toEqual(['msg 3', 'msg 4', 'Payouts sent']);
        expect(chat.recent()[0].name).toBe('Monster fan');
    });
});
