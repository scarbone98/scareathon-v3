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

describe('8BitEvil API endpoint validation', () => {
  let server;

  beforeAll(async () => {
    server = fastify();
    server.addHook('preHandler', async (request) => {
      const testUserId = request.headers['x-test-user'];
      if (testUserId) {
        request.user = { sub: testUserId };
      }
    });
    server.register(routes);
    await server.ready();
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('GET /getUserData rejects non-UUID user ids before querying', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/getUserData?userId=not-a-uuid',
    });

    expect(response.statusCode).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });

  test('POST /runs records supported leaderboard metrics', async () => {
    const userId = '11111111-1111-4111-8111-111111111111';

    clientQuery
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ id: 7 }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    const response = await server.inject({
      method: 'POST',
      url: '/runs',
      headers: {
        'x-test-user': userId,
      },
      payload: {
        runTimeSeconds: 120,
        kills: 30,
        candyCollected: 12,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.payload)).toEqual({ data: 'success' });
    expect(clientQuery).toHaveBeenCalledWith('BEGIN');
    expect(clientQuery).toHaveBeenCalledWith('COMMIT');
    expect(clientQuery.mock.calls.filter(([sql]) => String(sql).includes('INSERT INTO leaderboards'))).toHaveLength(4);
    expect(release).toHaveBeenCalled();
  });

  test('POST /runs rejects unauthenticated score writes', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/runs',
      payload: {
        userId: '11111111-1111-4111-8111-111111111111',
        runTimeSeconds: 120,
        kills: 30,
        candyCollected: 12,
      },
    });

    expect(response.statusCode).toBe(401);
    expect(clientQuery).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalled();
  });

  test('POST /runs rejects out-of-range metrics', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/runs',
      headers: {
        'x-test-user': '11111111-1111-4111-8111-111111111111',
      },
      payload: {
        runTimeSeconds: 999999,
        kills: 30,
        candyCollected: 12,
      },
    });

    expect(response.statusCode).toBe(400);
    expect(clientQuery).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalled();
  });

  test('POST /runs rejects non-numeric metrics', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/runs',
      headers: {
        'x-test-user': '11111111-1111-4111-8111-111111111111',
      },
      payload: {
        runTimeSeconds: '120oops',
        kills: 30,
        candyCollected: 12,
      },
    });

    expect(response.statusCode).toBe(400);
    expect(clientQuery).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalled();
  });
});
