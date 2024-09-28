import fastify from 'fastify';
import routes from '../routes/8bitevilreturns.js';
import pool from '../db/mockDB.js';
import { v4 as uuidv4 } from 'uuid'; // Add this import

describe('8BitEvil API Endpoints', () => {
  let server;
  const testUserId = uuidv4(); // Generate a valid UUID for testing
  const testGameId = uuidv4(); // Generate a valid UUID for testing
  const testUsername = 'TestUser';
  const testEmail = 'testuser@example.com';

  // Function to create a user
  async function createTestUser() {
    const query = 'INSERT INTO users (id, username, email) VALUES ($1, $2, $3)';
    await pool.query(query, [testUserId, testUsername, testEmail]);
  }

  // Function to create a game
  async function createTestGame() {
    const query = 'INSERT INTO games (id, name, description) VALUES ($1, $2, $3)';
    await pool.query(query, [testGameId, '8BitEvil', 'Test game description']);
  }

  beforeAll(async () => {
    server = fastify();
    server.register(routes);
    await server.ready();
    await createTestUser(); // Create the test user before running tests
    await createTestGame(); // Create the test game before running tests
  });

  afterAll(async () => {
    await server.close();
    // Clean up the test user and game
    await pool.query('DELETE FROM game_specific_data WHERE user_id = $1', [testUserId]);
    await pool.query('DELETE FROM users WHERE id = $1', [testUserId]);
    await pool.query('DELETE FROM games WHERE id = $1', [testGameId]);
    await pool.end(); // Close the database connection pool
  });

  // Test to set up initial user data
  test('POST /setUserData should set initial user data', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/setUserData',
      payload: {
        userId: testUserId, // Use the generated UUID
        gameId: testGameId, // Use the generated UUID
        silverAmount: 1000,
        userName: testUsername,
        unlockedCharacters: ['Character1', 'Character2'],
      },
    });
    console.log('POST /setUserData response:', response.payload);
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.payload)).toEqual({ data: 'success' });
  });

  // Now test GET /getUserData after setting up the data
  test('GET /getUserData should return user data', async () => {
    const response = await server.inject({
      method: 'GET',
      url: `/getUserData?userId=${testUserId}`, // Use the generated UUID
    });
    console.log('GET /getUserData response:', response.payload);
    expect(response.statusCode).toBe(200);
    const responseJson = JSON.parse(response.payload);
    expect(responseJson).toHaveProperty('data');
  });

  // ... (other tests with similar console.log statements)
});