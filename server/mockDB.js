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
        const userId = uuidv4();
        await client.query(`
      INSERT INTO users (id, username, email)
      VALUES ($1, $2, $3)
      ON CONFLICT (username) DO NOTHING
    `, [userId, 'sampleuser', 'sample@example.com']);
        console.log('Sample user inserted successfully');

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