import { DAILY_REWARD, DAILY_RUNS_TARGET, dayStartFromDocumentId, generateDailyChallenge } from '../utils/dailyChallengeGenerator.js';
import { weeklyChallengeRewardMail } from '../routes/weeklyChallenges.js';

describe('the daily challenge', () => {
    const today = generateDailyChallenge({ date: new Date('2026-10-02T15:00:00Z') });

    test('runs of a game, for a few tickets, all of one UTC day', () => {
        expect(today).toMatchObject({
            documentId: 'generated-daily-2026-10-02',
            verificationType: 'arcade_runs',
            targetMetricValue: DAILY_RUNS_TARGET,
            rewardCoins: DAILY_REWARD,
            startsAt: '2026-10-02T00:00:00.000Z',
            endsAt: '2026-10-02T23:59:59.999Z',
            daily: true,
            status: 'published',
        });
        expect(today.title).toContain(today.gameName.replace(/[‘’]/g, "'"));
    });

    test('the same from its documentId, whenever it is claimed', () => {
        expect(generateDailyChallenge({ documentId: 'generated-daily-2026-10-02' })).toEqual(today);
        expect(dayStartFromDocumentId('generated-daily-2026-13-40')).toBeNull();
        expect(generateDailyChallenge({ documentId: 'generated-weekly-2026-09-27' })).toBeNull();
    });

    test('a different game the next day', () => {
        const tomorrow = generateDailyChallenge({ date: new Date('2026-10-03T15:00:00Z') });
        expect(tomorrow.gameName).not.toBe(today.gameName);
    });

    test('its mail says daily, and tomorrow', () => {
        const mail = weeklyChallengeRewardMail(today);
        expect(mail.subject).toMatch(/^Daily challenge complete/);
        expect(mail.body).toContain("tomorrow's challenge");
    });
});
