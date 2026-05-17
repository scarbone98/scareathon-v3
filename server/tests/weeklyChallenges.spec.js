import {
    isWeeklyChallengeActive,
    normalizeChallengeLoopItem,
    normalizeWeeklyChallenge,
    scoreSubmissionCompletesChallenge,
} from '../routes/weeklyChallenges.js';

describe('weekly challenge helpers', () => {
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
});
