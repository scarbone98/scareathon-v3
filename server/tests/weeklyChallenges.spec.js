import {
    getCurrentWeeklyChallengePayload,
    getRecentWeeklyChallengesPayload,
    getWeeklyChallengeByDocumentId,
    isWeeklyChallengeActive,
    normalizeChallengeLoopItem,
    normalizeWeeklyChallenge,
    scoreSubmissionCompletesChallenge,
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

    test('normalizes challenge loop item with claim cta when coins are available', () => {
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
            ctaLabel: 'Claim Coins',
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

    test('treats a missing Strapi weekly challenge collection as no active challenge', async () => {
        process.env.STRAPI_URL = 'https://cms.example.test';
        process.env.STRAPI_TOKEN = 'test-token';
        global.fetch = async () => ({
            ok: false,
            status: 404,
            json: async () => ({ error: { message: 'Not Found' } }),
        });

        await expect(getCurrentWeeklyChallengePayload({
            date: new Date('2026-10-05T12:00:00.000Z'),
        })).resolves.toEqual({ data: null });
        await expect(getRecentWeeklyChallengesPayload({
            date: new Date('2026-10-05T12:00:00.000Z'),
        })).resolves.toEqual({ data: [] });
        await expect(getWeeklyChallengeByDocumentId('missing-doc')).resolves.toBeNull();
    });
});
