export default {
    transform: {},
    // Avoid spawning a large worker pool for these small, module-heavy suites.
    maxWorkers: 2,
    moduleNameMapper: {
        '^(\\.{1,2}/.*)\\.js$': '$1',
    },
    testEnvironment: '<rootDir>/tests/simulationEnvironment.cjs',
    setupFilesAfterEnv: ['<rootDir>/tests/teardown.js'],
    testEnvironmentOptions: {
        node: {
            version: 'latest'
        }
    },
    extensionsToTreatAsEsm: ['.ts'], // Remove .js from here
};
