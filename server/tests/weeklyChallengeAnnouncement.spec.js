import {
    buildAnnouncementPost,
    isActiveChallenge,
} from '../../scripts/sync-weekly-challenge-announcement.mjs';

describe('weekly challenge announcement script helpers', () => {
    test('finds active challenges that need draft announcements', () => {
        const challenge = {
            documentId: 'challenge-doc',
            title: 'Haunted house week',
            startsAt: '2026-10-04T07:00:00.000Z',
            endsAt: '2026-10-11T06:59:59.000Z',
            autoAnnouncementEnabled: true,
            status: 'published',
        };

        expect(isActiveChallenge(challenge, new Date('2026-10-05T12:00:00.000Z'))).toBe(true);
        expect(isActiveChallenge({
            ...challenge,
            announcementPostDocumentId: 'post-doc',
        }, new Date('2026-10-05T12:00:00.000Z'))).toBe(false);
    });

    test('builds a draft post that includes points and coin reward copy', () => {
        const post = buildAnnouncementPost({
            title: 'Creature feature week',
            summary: 'Watch a monster movie.',
            points: 1,
            rewardCoins: 40,
            verificationType: 'arcade_score',
            gameName: '8 Bit Evil Returns',
            metricName: 'score',
            targetMetricValue: 5000,
        });

        expect(post.Title).toBe('Weekly Challenge: Creature feature week');
        expect(JSON.stringify(post.Content)).toContain('Worth 1 weekly point.');
        expect(JSON.stringify(post.Content)).toContain('Score at least 5,000 in 8 Bit Evil Returns.');
        expect(JSON.stringify(post.Content)).toContain('claim 40 coins');
    });
});
