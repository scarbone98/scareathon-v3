import baseConfig from './jest.config.js';

export default {
    ...baseConfig,
    testMatch: ['**/tests/**/*.test.js'],
};
