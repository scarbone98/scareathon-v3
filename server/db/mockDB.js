import dotenv from 'dotenv';
import pg from 'pg';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const { Pool } = pg;

// Get the directory name of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Create a new pool
let pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'scareathon',
  password: 'postgres',
  port: 5432,
});

// if (process.env.NODE_ENV === 'production') {
  // Create a new pool
  pool = new Pool({
    connectionString: process.env.DB_CONNECTION_STRING,
    password: process.env.DB_PASSWORD
  });
// }

// Function to initialize the database
async function initializeDB() {
  const client = await pool.connect();
  try {
    // Read the SQL file
    const sqlFile = path.join(__dirname, 'db.sql');
    const sql = fs.readFileSync(sqlFile, 'utf8');

    // Execute the SQL
    await client.query(sql);
    console.log('Database initialized successfully');

    // Insert sample data (if needed)
    // await insertSampleData(client);
  } catch (err) {
    console.error('Error initializing database:', err);
  } finally {
    client.release();
  }
}

// Function to insert sample data
async function insertSampleData(client) {
  try {

    const gameNames = ['8-Bit Evil Returns', 'Another Game', 'Yet Another Game'];

    const gameResult = await client.query(`
      INSERT INTO games (name)
      SELECT UNNEST($1::text[])
      ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
      RETURNING id
    `, [gameNames]);

    const gameId = gameResult.rows[0].id;
    console.log('Sample game inserted or updated successfully with id:', gameId);

    // Insert sample game-specific data
    const gameData = {
      silverAmount: 1000,
      email: 'samiam98@gmail.com',
      unlockedCharacters: ['DefaultCharacter']
    };
    await client.query(`
      INSERT INTO game_specific_data (user_id, game_id, data_type, data)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (user_id, game_id, data_type) DO UPDATE SET data = $4
    `, [userId, gameId, 'user_data', JSON.stringify(gameData)]);
    console.log('Sample game-specific data inserted or updated successfully');

    // Insert sample leaderboard entries
    const leaderboardEntries = [
      { metric: 'runTimeSeconds', value: 300 },
      { metric: 'kills', value: 50 },
      { metric: 'candyCollected', value: 200 }
    ];
    for (const entry of leaderboardEntries) {
      await client.query(`
        INSERT INTO leaderboards (user_id, game_id, metric_name, metric_value)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (game_id, user_id, metric_name) DO UPDATE SET metric_value = $4
      `, [userId, gameId, entry.metric, entry.value]);
    }
    console.log('Sample leaderboard entries inserted or updated successfully');

  } catch (err) {
    console.error('Error inserting sample data:', err);
    throw err;  // Re-throw the error so it can be caught in the calling function
  }
}

if (process.env.NODE_ENV === 'development') {
  // Initialize the database
  initializeDB();
}

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