const { TestEnvironment } = require('jest-environment-node');
const { runInContext } = require('node:vm');

module.exports = class SimulationEnvironment extends TestEnvironment {
    async setup() {
        await super.setup();
        // Native ESM ignores Jest's sandboxInjectedGlobals option. Lexical
        // bindings avoid hot-loop VM global lookups, keeping the same objects.
        runInContext('const { Math, Object } = globalThis;', this.getVmContext());
    }
};
