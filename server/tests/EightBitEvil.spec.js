import fastify from 'fastify';
import routes from '../routes/8bitevilreturns.js';
import pool from '../db/mockDB.js';

// Mock the database pool
jest.mock('../db/mockDB.js', () => ({
    query: jest.fn(),
    connect: jest.fn(() => ({
        query: jest.fn(),
        release: jest.fn(),
    })),
}));

describe('8bitevilreturns Routes', () => {
    let app;

    beforeAll(async () => {
        app = fastify();
        app.register(routes, { prefix: '/8bitevilreturns' });
        await app.ready();
    });

    afterAll(() => {
        app.close();
    });

    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('GET /getUserData', async () => {
        const mockUserData = { silverAmount: 100, userName: 'testUser', unlockedCharacters: ['char1'] };
        pool.query.mockResolvedValueOnce({ rows: [{ data: mockUserData }] });

        const response = await app.inject({
            method: 'GET',
            url: '/8bitevilreturns/getUserData?userId=testUserId',
        });

        expect(response.statusCode).toBe(200);
        expect(JSON.parse(response.payload)).toEqual(mockUserData);
    });

    test('POST /setUserData', async () => {
        pool.query.mockResolvedValueOnce({});

        const response = await app.inject({
            method: 'POST',
            url: '/8bitevilreturns/setUserData',
            payload: {
                userId: 'testUserId',
                silverAmount: 200,
                userName: 'updatedUser',
                unlockedCharacters: ['char1', 'char2'],
            },
        });

        expect(response.statusCode).toBe(200);
        expect(JSON.parse(response.payload)).toEqual({ data: 'success' });
    });

    // Add more tests for other endpoints...
});
