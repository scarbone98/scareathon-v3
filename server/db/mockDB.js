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
let pool = null;

if (process.env.NODE_ENV === 'production') {
  // Create a new pool
  pool = new Pool({
    connectionString: process.env.DB_CONNECTION_STRING,
    password: process.env.DB_PASSWORD
  });
} else {
  pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'scareathon',
    password: 'postgres',
    port: 5432,
  })
}

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
  // initializeDB();
}

// Export the pool for use in other files
export default pool;