import { afterAll } from '@jest/globals';

afterAll(async () => {
    // Import after the tests so their ESM database mocks remain effective.
    // Each Jest environment owns its pool; globalTeardown cannot close it.
    const { default: pool } = await import('../db/mockDB.js');
    await pool.end?.();
});
