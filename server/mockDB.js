import pg from 'pg';
import { v4 as uuidv4 } from 'uuid';

const { Pool } = pg;

// Create a new pool
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'scareathon',
  password: 'postgres',
  port: 5432,
});

// Function to initialize the database
async function initializeDB() {
  const client = await pool.connect();
  try {
    // Create users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('Users table created successfully');

    // Insert a sample user
    const userId = '029e9d80-2ee9-4c48-a3f2-2cc29c4448ec';
    await client.query(`
      INSERT INTO users (id, username, email)
      VALUES ($1, $2, $3)
      ON CONFLICT (username) DO NOTHING
    `, [userId, 'samiam98', 'scarbone.bsopr@gmail.com']);
    console.log('Sample user inserted successfully');

    // Create game_specific_data table
    await client.query(`
      CREATE TABLE IF NOT EXISTS game_specific_data (
        id UUID PRIMARY KEY,
        user_id UUID REFERENCES users(id),
        game_id UUID REFERENCES games(id),
        data_type VARCHAR(50) NOT NULL,
        data JSONB NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, game_id, data_type)
      )
    `);
    console.log('Game specific data table created successfully');

    // Insert a sample game-specific data (inventory for Space Invaders)
    const gameSpecificDataId = uuidv4();
    await client.query(`
      INSERT INTO game_specific_data (id, user_id, game_id, data_type, data)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (user_id, game_id, data_type) DO UPDATE SET data = $5, updated_at = CURRENT_TIMESTAMP
    `, [gameSpecificDataId, userId, gameId, 'inventory', JSON.stringify({
      lives: 3,
      powerups: ['shield', 'rapid_fire'],
      coins: 100
    })]);
    console.log('Sample game-specific data inserted successfully');

    // Create a more flexible leaderboards table
    await client.query(`
      CREATE TABLE IF NOT EXISTS leaderboards (
        id UUID PRIMARY KEY,
        game_id UUID REFERENCES games(id),
        user_id UUID REFERENCES users(id),
        metric_name VARCHAR(50) NOT NULL,
        metric_value NUMERIC NOT NULL,
        achieved_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('Leaderboards table created successfully');

  } catch (err) {
    console.error('Error initializing database:', err);
  } finally {
    client.release();
  }
}

// Initialize the database
initializeDB();

// Export the pool for use in other files
export default pool;

// Function to update a specific field in game_specific_data
async function updateGameSpecificDataField(userId, gameId, dataType, field, value) {
  const client = await pool.connect();
  try {
    await client.query(`
      UPDATE game_specific_data
      SET data = jsonb_set(data, $1, $2::jsonb),
          updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $3 AND game_id = $4 AND data_type = $5
    `, [
      `{${field}}`,
      JSON.stringify(value),
      userId,
      gameId,
      dataType
    ]);
    console.log(`Updated ${field} for user ${userId} in game ${gameId}`);
  } catch (err) {
    console.error('Error updating game-specific data:', err);
  } finally {
    client.release();
  }
}

// Example usage:
// updateGameSpecificDataField(userId, gameId, 'inventory', 'coins', 150);

// Function to update multiple fields in game_specific_data
async function updateMultipleGameSpecificDataFields(userId, gameId, dataType, updates) {
  const client = await pool.connect();
  try {
    await client.query(`
      UPDATE game_specific_data
      SET data = data || $1::jsonb,
          updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $2 AND game_id = $3 AND data_type = $4
    `, [
      JSON.stringify(updates),
      userId,
      gameId,
      dataType
    ]);
    console.log(`Updated multiple fields for user ${userId} in game ${gameId}`);
  } catch (err) {
    console.error('Error updating multiple game-specific data fields:', err);
  } finally {
    client.release();
  }
}

// Example usage:
// updateMultipleGameSpecificDataFields(userId, gameId, 'inventory', { coins: 150, lives: 2 });

// Function to add or update a leaderboard entry
async function upsertLeaderboardEntry(userId, gameId, metricName, metricValue) {
  const client = await pool.connect();
  try {
    await client.query(`
      INSERT INTO leaderboards (id, user_id, game_id, metric_name, metric_value)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (user_id, game_id, metric_name) 
      DO UPDATE SET 
        metric_value = CASE 
          WHEN leaderboards.metric_value < $5 THEN $5 
          ELSE leaderboards.metric_value 
        END,
        achieved_at = CASE 
          WHEN leaderboards.metric_value < $5 THEN CURRENT_TIMESTAMP 
          ELSE leaderboards.achieved_at 
        END
    `, [uuidv4(), userId, gameId, metricName, metricValue]);
    console.log(`Upserted leaderboard entry for user ${userId} in game ${gameId} for metric ${metricName}`);
  } catch (err) {
    console.error('Error upserting leaderboard entry:', err);
  } finally {
    client.release();
  }
}

// Function to get top leaderboard entries for a game and metric
async function getTopLeaderboardEntries(gameId, metricName, limit = 10) {
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT l.user_id, u.username, l.metric_value, l.achieved_at
      FROM leaderboards l
      JOIN users u ON l.user_id = u.id
      WHERE l.game_id = $1 AND l.metric_name = $2
      ORDER BY l.metric_value DESC
      LIMIT $3
    `, [gameId, metricName, limit]);
    return result.rows;
  } catch (err) {
    console.error('Error getting top leaderboard entries:', err);
    return [];
  } finally {
    client.release();
  }
}

// Example usage:
// await upsertLeaderboardEntry(userId, gameId, 'score', 1000);
// await upsertLeaderboardEntry(userId, gameId, 'time', 120.5);
// const topScores = await getTopLeaderboardEntries(gameId, 'score');
// const topTimes = await getTopLeaderboardEntries(gameId, 'time', 5);