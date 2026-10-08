import assert from 'node:assert/strict';
import { QualityRecovery } from '../src/pages/WaysideFury/game/qualityRecovery.ts';

const recovery = new QualityRecovery();
const healthy = frames => Array.from({ length: frames }, () => recovery.sample(1 / 60)).filter(Boolean).length;
assert.equal(healthy(599), 0, 'brief recovery does not raise rendering workload');
assert.equal(healthy(2), 1, 'ten healthy seconds recover one tier');
assert.equal(healthy(100), 0, 'another tier needs a fresh healthy interval');
for (const interruption of [0, -1, .025, .3, Infinity, NaN]) {
  recovery.reset(); healthy(500);
  assert.equal(recovery.sample(interruption), false);
  assert.equal(healthy(100), 0, 'paused, slow and invalid samples reset recovery');
}
recovery.reset(); healthy(500); recovery.reset();
assert.equal(healthy(100), 0, 'hidden-tab and scene resets clear the sample');
console.log('Wayside Fury conservative quality recovery checks passed.');
