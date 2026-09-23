import { isOptionalAuthRoute, isPublicRoute } from '../utils/authRoutes.js';

describe('auth route rules', () => {
    test('leaderboard reads are open to guests, score writes are not', () => {
        expect(isOptionalAuthRoute('GET', '/games/getLeaderboard?game=Ooidash&metric=score')).toBe(true);
        expect(isOptionalAuthRoute('POST', '/games/submitScore')).toBe(false);
        expect(isOptionalAuthRoute('GET', '/games/getGameSpecificData')).toBe(false);
        expect(isPublicRoute('POST', '/games/submitScore')).toBe(false);
    });

    test('existing public routes stay public', () => {
        expect(isPublicRoute('GET', '/weekly-challenges/current')).toBe(true);
        expect(isPublicRoute('GET', '/content-loop')).toBe(true);
        expect(isPublicRoute('GET', '/8bitevilreturns/player')).toBe(true);
        expect(isPublicRoute('POST', '/8bitevilreturns/runs')).toBe(false);
        expect(isPublicRoute('OPTIONS', '/inbox/conversations')).toBe(true);
        expect(isPublicRoute('GET', '/inbox/conversations')).toBe(false);
    });
});
