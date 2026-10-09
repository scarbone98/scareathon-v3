import assert from 'node:assert/strict';
import { newGame, enterScene, interact, interactTarget } from '../src/pages/WaysideFury/game/sim.ts';
import { makeSave, restoreSave } from '../src/pages/WaysideFury/game/save.ts';
import { collectRadar, toggleRadar, radarReading, radarTargets, registerRelicRadarTargets, relicRadarLayer } from '../src/pages/WaysideFury/u1/minimap/relicRadar.ts';
const s = newGame(); enterScene(s, 'hub'); s.x = 448; s.y = 384;
assert.equal(interactTarget(s)?.id, 'u1-relic-radar'); interact(s);
assert.equal(s.relicRadar.owned, true); assert.equal(collectRadar(s), false);
const unregister = registerRelicRadarTargets(() => [
  { id: 'test-relic', name: 'Wayside relic', scene: 'hub', room: 0, mapId: 'hub', area: 'wayside', x: s.x + 16, y: s.y, kind: 'relic' },
  { id: 'found-relic', scene: 'hub', room: 0, x: s.x, y: s.y, found: true, kind: 'relic' },
  { id: 'another-room', scene: 'hub', room: 1, x: s.x, y: s.y },
  { id: 'interior', scene: 'hub', room: 0, mapId: 'interior-wayside-home', x: s.x, y: s.y },
]);
assert.equal(radarReading(s).id, 'test-relic'); assert.equal(radarReading(s).direction, 'E');
assert.equal(radarReading(s).distanceTiles, 1); assert.equal(relicRadarLayer.available(s), true);
assert.ok(radarTargets(s).every(target => !['found-relic','another-room','interior'].includes(target.id)));
assert.equal(toggleRadar(s), true); assert.equal(radarReading(s), null);
const restored = restoreSave(makeSave(s, null)); assert.deepEqual(restored.relicRadar, { owned: true, enabled: false });
unregister(); assert.ok(!radarTargets(s).some(target => target.id === 'test-relic'));
const legacy = makeSave(newGame(), null); delete legacy.u1;
assert.deepEqual(restoreSave(legacy).relicRadar, { owned: false, enabled: false });
console.log('Relic radar minimap hook: pickup, personal migration, toggle, nearest bearing and map filtering pass.');
