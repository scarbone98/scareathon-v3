export default {
    transform: {},
    moduleNameMapper: {
        '^(\\.{1,2}/.*)\\.js$': '$1',
    },
    testEnvironment: 'node',
    testEnvironmentOptions: {
        node: {
            version: 'latest'
        }
    },
    extensionsToTreatAsEsm: ['.ts'], // Remove .js from here
};
