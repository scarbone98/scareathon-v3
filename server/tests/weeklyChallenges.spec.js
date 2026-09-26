import {
    getGeneratedWeeklyChallenge,
    getCurrentWeeklyChallengePayload,
    getRecentWeeklyChallengesPayload,
    getWeeklyChallengeByDocumentId,
    grantWeeklyChallengeReward,
    isWeeklyChallengeActive,
    normalizeChallengeLoopItem,
    normalizeWeeklyChallenge,
    scoreSubmissionCompletesChallenge,
    weeklyChallengeRewardMail,
} from '../routes/weeklyChallenges.js';
import { deleteCachePrefix } from '../utils/cacheManager.js';

describe('weekly challenge helpers', () => {
    const originalFetch = global.fetch;
    const originalStrapiUrl = process.env.STRAPI_URL;
    const originalStrapiToken = process.env.STRAPI_TOKEN;

    beforeEach(() => {
        deleteCachePrefix('weekly_challenge_');
    });

    afterEach(() => {
        global.fetch = originalFetch;
        if (originalStrapiUrl === undefined) {
            delete process.env.STRAPI_URL;
        } else {
            process.env.STRAPI_URL = originalStrapiUrl;
        }
        if (originalStrapiToken === undefined) {
            delete process.env.STRAPI_TOKEN;
        } else {
            process.env.STRAPI_TOKEN = originalStrapiToken;
        }
        deleteCachePrefix('weekly_challenge_');
    });

    test('normalizes Strapi weekly challenge fields and reward coins', () => {
        const challenge = normalizeWeeklyChallenge({
            id: 7,
            documentId: 'challenge-doc',
            title: 'Watch a haunted house movie',
            summary: 'Pick a haunted house movie and post your reaction.',
            startsAt: '2026-10-04T07:00:00.000Z',
            endsAt: '2026-10-11T06:59:59.000Z',
            points: '1',
            rewardCoins: '50',
            verificationType: 'arcade_score',
            gameName: '8 Bit Evil Returns',
            metricName: 'score',
            targetMetricValue: '5000',
            status: 'published',
        });

        expect(challenge).toMatchObject({
            documentId: 'challenge-doc',
            title: 'Watch a haunted house movie',
            points: 1,
            rewardCoins: 50,
            verificationType: 'arcade_score',
            gameName: '8 Bit Evil Returns',
            targetMetricValue: 5000,
            status: 'published',
        });
    });

    test('checks active published challenge windows', () => {
        const challenge = normalizeWeeklyChallenge({
            documentId: 'challenge-doc',
            title: 'Final girl week',
            startsAt: '2026-10-04T07:00:00.000Z',
            endsAt: '2026-10-11T06:59:59.000Z',
            status: 'published',
        });

        expect(isWeeklyChallengeActive(challenge, new Date('2026-10-05T12:00:00.000Z'))).toBe(true);
        expect(isWeeklyChallengeActive(challenge, new Date('2026-10-12T12:00:00.000Z'))).toBe(false);
    });

    test('normalizes challenge loop item with a view cta', () => {
        const challenge = normalizeWeeklyChallenge({
            documentId: 'challenge-doc',
            title: 'Creature feature week',
            summary: 'Watch something with a monster.',
            rewardCoins: 75,
            status: 'published',
        });

        expect(normalizeChallengeLoopItem(challenge)).toMatchObject({
            type: 'weekly_challenge',
            documentId: 'challenge-doc',
            ctaLabel: 'View Challenge',
            rewardCoins: 75,
        });
    });

    test('verifies matching arcade score submissions', () => {
        const challenge = normalizeWeeklyChallenge({
            documentId: 'challenge-doc',
            title: 'Score week',
            rewardCoins: 75,
            verificationType: 'arcade_score',
            gameName: '8 Bit Evil Returns',
            metricName: 'score',
            targetMetricValue: 1000,
            comparisonOperator: '>=',
            status: 'published',
        });

        expect(scoreSubmissionCompletesChallenge(challenge, {
            game: '8 Bit Evil Returns',
            metricName: 'score',
            metricValue: 1200,
        })).toBe(true);
        expect(scoreSubmissionCompletesChallenge(challenge, {
            game: '8 Bit Evil Returns',
            metricName: 'score',
            metricValue: 900,
        })).toBe(false);
    });

    // No saved scores, so generated weeks under the new rules are "play runs" ones
    const emptyDb = { query: async () => ({ rows: [] }) };

    test('generates a weekly challenge fallback when the Strapi collection is missing', async () => {
        process.env.STRAPI_URL = 'https://cms.example.test';
        process.env.STRAPI_TOKEN = 'test-token';
        global.fetch = async () => ({
            ok: false,
            status: 404,
            json: async () => ({ error: { message: 'Not Found' } }),
        });

        const date = new Date('2026-10-05T12:00:00.000Z');
        const generated = await getGeneratedWeeklyChallenge({ date, db: emptyDb });

        await expect(getCurrentWeeklyChallengePayload({ date, db: emptyDb })).resolves.toEqual({ data: generated });
        await expect(getRecentWeeklyChallengesPayload({ date, db: emptyDb })).resolves.toEqual({ data: [generated] });
        await expect(getWeeklyChallengeByDocumentId(generated.documentId, { db: emptyDb })).resolves.toEqual(generated);
        await expect(getWeeklyChallengeByDocumentId('missing-doc', { db: emptyDb })).resolves.toBeNull();
    });

    test('generated weekly challenges are active only during their generated week', async () => {
        const challenge = await getGeneratedWeeklyChallenge({
            date: new Date('2026-10-05T12:00:00.000Z'),
            db: emptyDb,
        });

        expect(challenge).toMatchObject({
            documentId: 'generated-weekly-2026-10-04',
            title: expect.stringContaining('Weekly Arcade Challenge'),
            gameName: 'Frog Ball',
            verificationType: 'arcade_runs',
            metricName: 'score',
            status: 'published',
        });
        expect(isWeeklyChallengeActive(challenge, new Date('2026-10-05T12:00:00.000Z'))).toBe(true);
        expect(isWeeklyChallengeActive(challenge, new Date('2026-10-11T00:00:00.000Z'))).toBe(false);
    });
});

describe('weekly challenge reward mail', () => {
    const challenge = {
        documentId: 'challenge-1',
        title: 'Survive 60 seconds',
        rewardCoins: 1500,
        startsAt: null,
        endsAt: null,
        points: 1,
        verificationType: 'arcade_score',
    };

    // Records every query and answers the few the grant path reads from
    function fakeClient({ existingGrant = null } = {}) {
        const queries = [];
        return {
            queries,
            async query(sql, params = []) {
                queries.push({ sql, params });
                if (sql.includes('FROM currency_transactions')) return { rows: existingGrant ? [existingGrant] : [] };
                if (sql.includes('grant_currency')) return { rows: [{ coin_balance: 4200 }] };
                if (sql.includes('INSERT INTO inbox_conversations')) return { rows: [{ id: 11 }] };
                if (sql.includes('INSERT INTO inbox_messages')) return { rows: [{ id: 22 }] };
                return { rows: [], rowCount: 0 };
            },
        };
    }

    test('writes a friendly subject and body', () => {
        const mail = weeklyChallengeRewardMail(challenge);
        expect(mail.subject).toBe('Weekly challenge complete: Survive 60 seconds');
        expect(mail.body).toContain('1,500 coins have been added to your wallet');
    });

    test('granting a reward sends an inbox message with the coins already added', async () => {
        const client = fakeClient();
        const result = await grantWeeklyChallengeReward(client, 'user-1', challenge, null);

        expect(result).toMatchObject({ claimed: true, coinBalance: 4200, rewardCoins: 1500 });
        const conversation = client.queries.find((q) => q.sql.includes('INSERT INTO inbox_conversations'));
        expect(conversation.params).toEqual(['admin_dm', null, 'Weekly challenge complete: Survive 60 seconds', false, expect.any(String)]);
        const participant = client.queries.find((q) => q.sql.includes('INSERT INTO inbox_participants'));
        expect(participant.params).toEqual([11, 'user-1', 'member', null]);
        const message = client.queries.find((q) => q.sql.includes('INSERT INTO inbox_messages'));
        expect(message.params.slice(0, 3)).toEqual([11, null, 'system']);
        const reward = client.queries.find((q) => q.sql.includes('INSERT INTO inbox_rewards'));
        expect(reward.params).toEqual([11, 22, 'user-1', 1500, null, null, expect.any(String), 'claimed']);
    });

    test('an already granted challenge does not send another message', async () => {
        const client = fakeClient({ existingGrant: { balance_after: 900 } });
        const result = await grantWeeklyChallengeReward(client, 'user-1', challenge, null);

        expect(result).toMatchObject({ claimed: false, alreadyClaimed: true });
        expect(client.queries.some((q) => q.sql.includes('inbox_'))).toBe(false);
    });
});
