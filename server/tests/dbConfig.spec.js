import { buildProductionPoolConfig } from '../db/mockDB.js';

describe('production database config', () => {
    test('applies DB_PASSWORD to DB_CONNECTION_STRING before pg parses it', () => {
        const config = buildProductionPoolConfig({
            DB_CONNECTION_STRING: 'postgresql://postgres:old-password@db.example.com:5432/postgres?sslmode=require',
            DB_PASSWORD: 'new:p@ss/word',
        });

        const parsed = new URL(config.connectionString);

        expect(decodeURIComponent(parsed.password)).toBe('new:p@ss/word');
        expect(parsed.searchParams.has('sslmode')).toBe(false);
        expect(config).not.toHaveProperty('password');
        expect(config.ssl).toEqual({ rejectUnauthorized: false });
    });

    test('requires DB_CONNECTION_STRING in production config', () => {
        expect(() => buildProductionPoolConfig({})).toThrow(/DB_CONNECTION_STRING/);
    });
});
