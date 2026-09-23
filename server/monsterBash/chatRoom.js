import {
    RegExpMatcher,
    TextCensor,
    asteriskCensorStrategy,
    englishDataset,
    englishRecommendedTransformers,
} from 'obscenity';

// Monster Bash chat is ephemeral: the last few messages live in memory for
// late joiners and nothing is ever written to the database.

export const CHAT_LIMITS = {
    maxLength: 200,
    historySize: 50,
    minIntervalMs: 1500,
};
const NAME_CACHE_MS = 5 * 60 * 1000;
const FALLBACK_NAME = 'Monster fan';

const profanityMatcher = new RegExpMatcher({
    ...englishDataset.build(),
    ...englishRecommendedTransformers,
});
const censor = new TextCensor().setStrategy(asteriskCensorStrategy());

export class ChatRefusedError extends Error {
    constructor(code) {
        super(code);
        this.code = code;
    }
}

export function normalizeChatText(raw) {
    return String(raw ?? '')
        .replace(/\p{Cc}/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

export function createChatRoom({ lookupUsername, limits = CHAT_LIMITS }) {
    const messages = [];
    const lastPostAt = new Map();
    const names = new Map();
    let nextId = 1;

    async function nameFor(userId) {
        const cached = names.get(userId);
        if (cached && Date.now() - cached.at < NAME_CACHE_MS) return cached.name;
        const name = (await lookupUsername(userId)) || FALLBACK_NAME;
        names.set(userId, { name, at: Date.now() });
        return name;
    }

    function remember(message) {
        messages.push(message);
        if (messages.length > limits.historySize) messages.shift();
        return message;
    }

    return {
        async post(userId, rawText) {
            const text = normalizeChatText(rawText);
            if (!text) throw new ChatRefusedError('empty');
            if (text.length > limits.maxLength) throw new ChatRefusedError('too_long');

            const now = Date.now();
            if (now - (lastPostAt.get(userId) ?? 0) < limits.minIntervalMs) {
                throw new ChatRefusedError('slow_down');
            }
            lastPostAt.set(userId, now);
            // Keep the rate-limit map from growing forever.
            if (lastPostAt.size > 5000) {
                for (const [id, at] of lastPostAt) {
                    if (now - at > limits.minIntervalMs) lastPostAt.delete(id);
                }
            }

            const clean = censor.applyTo(text, profanityMatcher.getAllMatches(text));
            return remember({ id: nextId++, name: await nameFor(userId), text: clean, at: now });
        },

        // Announcements from the arena itself (payouts, refunds).
        system(text) {
            return remember({ id: nextId++, system: true, text, at: Date.now() });
        },

        recent() {
            return [...messages];
        },
    };
}
