import fastify from 'fastify';
import { jest } from '@jest/globals';

const query = jest.fn();
const release = jest.fn();
const clientQuery = jest.fn();
const connect = jest.fn(() => ({
    query: clientQuery,
    release,
}));

jest.unstable_mockModule('../db/mockDB.js', () => ({
    default: {
        query,
        connect,
    },
}));

const { default: routes } = await import('../routes/8bitevilreturns.js');

const userId = '11111111-1111-4111-8111-111111111111';
const gameId = 7;

function mockGameLookup(mockQuery = query) {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: gameId }] });
}

describe('8bitevilreturns Routes', () => {
    let app;

    beforeAll(async () => {
        app = fastify();
        app.register(routes, { prefix: '/8bitevilreturns' });
        await app.ready();
    });

    afterAll(async () => {
        await app.close();
    });

    beforeEach(() => {
        jest.clearAllMocks();
        release.mockClear();
    });

    test('GET /getUserData reads player data from game_specific_data', async () => {
        mockGameLookup();
        query
            .mockResolvedValueOnce({ rows: [{ username: 'testUser' }] })
            .mockResolvedValueOnce({
                rows: [{
                    data: {
                        silverAmount: 100,
                        userName: 'testUser',
                        unlockedCharacters: ['Matt'],
                    },
                }],
            });

        const response = await app.inject({
            method: 'GET',
            url: `/8bitevilreturns/getUserData?userId=${userId}`,
        });

        expect(response.statusCode).toBe(200);
        expect(JSON.parse(response.payload)).toEqual({
            silverAmount: 100,
            userName: 'testUser',
            unlockedCharacters: ['Matt'],
        });
    });

    test('POST /setUserData merges and upserts player data', async () => {
        mockGameLookup();
        query
            .mockResolvedValueOnce({ rows: [{ username: 'updatedUser' }] })
            .mockResolvedValueOnce({
                rows: [{
                    data: {
                        silverAmount: 100,
                        userName: 'updatedUser',
                        unlockedCharacters: ['Matt'],
                    },
                }],
            })
            .mockResolvedValueOnce({ rows: [{ data: {} }] });

        const response = await app.inject({
            method: 'POST',
            url: '/8bitevilreturns/setUserData',
            payload: {
                userId,
                silverAmount: 250,
                userName: 'updatedUser',
                unlockedCharacters: ['Matt', 'Alex'],
            },
        });

        expect(response.statusCode).toBe(200);
        expect(JSON.parse(response.payload)).toEqual({ data: 'success' });
        expect(query.mock.calls.at(-1)[0]).toContain('INSERT INTO game_specific_data');
        expect(query.mock.calls.at(-1)[1][3]).toBe(JSON.stringify({
            userName: 'updatedUser',
            silverAmount: 250,
            unlockedCharacters: ['Matt', 'Alex'],
        }));
    });

    test('POST /unlockCharacter spends silver and returns updated player data', async () => {
        clientQuery
            .mockResolvedValueOnce({})
            .mockResolvedValueOnce({ rows: [{ id: gameId }] })
            .mockResolvedValueOnce({ rows: [{ username: 'testUser' }] })
            .mockResolvedValueOnce({
                rows: [{
                    data: {
                        silverAmount: 600,
                        userName: 'testUser',
                        unlockedCharacters: ['Matt'],
                    },
                }],
            })
            .mockResolvedValueOnce({
                rows: [{
                    data: {
                        silverAmount: 100,
                        userName: 'testUser',
                        unlockedCharacters: ['Matt', 'Alex'],
                    },
                }],
            })
            .mockResolvedValueOnce({});

        const response = await app.inject({
            method: 'POST',
            url: `/8bitevilreturns/unlockCharacter?userId=${userId}`,
            payload: {
                characterName: 'Alex',
                cost: 500,
            },
        });

        expect(response.statusCode).toBe(200);
        expect(JSON.parse(response.payload)).toEqual({
            data: 'success',
            playerData: {
                silverAmount: 100,
                userName: 'testUser',
                unlockedCharacters: ['Matt', 'Alex'],
            },
        });
        expect(clientQuery).toHaveBeenCalledWith('BEGIN');
        expect(clientQuery).toHaveBeenCalledWith('COMMIT');
        expect(release).toHaveBeenCalled();
    });
});
