import assert from 'node:assert/strict';
import { layoutLabels } from '../src/pages/WaysideFury/game/labelLayout.ts';
const label = (id, text, x = .5, y = .5) => ({ id, text, x, y, kind: 'hub' });
const source = [label('taxi', 'Taxi'), label('diner', 'Diner'), label('shop', 'Shop')];
const original = structuredClone(source);
const laid = layoutLabels(source, 393, 660, 40, { x: .5, y: .5 });
assert.deepEqual(source, original, 'layout is presentation-only');
assert.equal(laid.length, 3);
for (const item of laid) {
  assert.ok(item.bottom <= 330 - 81 || item.bottom - 28 >= 345, 'labels avoid the hero silhouette');
  assert.ok(item.left >= 8 && item.left <= 385 && item.bottom >= 68 && item.bottom <= 652);
}
for (let i = 0; i < laid.length; i++) for (let j = i + 1; j < laid.length; j++) assert.ok(Math.abs(laid[i].bottom - laid[j].bottom) >= 33, 'stacked labels are separated');
const crowded = layoutLabels(Array.from({ length: 20 }, (_, i) => label(i, 'A long location name', .02, .05)), 180, 180, 40);
assert.ok(crowded.length < 20 && crowded.length > 0, 'excess edge labels are suppressed');
const floater = { ...label('damage', '24'), kind: 'floater' };
assert.equal(layoutLabels([floater], 393, 660, 40, { x: .5, y: .5 })[0].bottom, 330, 'combat text keeps its animated anchor');
const edge = layoutLabels([label('station', 'Wayside Station', .99, .5)], 393, 660, 40)[0];
assert.equal(edge.width, 'Wayside Station'.length * 7 + 22, 'DOM receives the reserved width at screen edges');
assert.equal(edge.height, 28);
assert.ok(edge.left + edge.width / 2 <= 385);
const wrapped = layoutLabels([label('long', 'A distant station with a very long location name', .99, .5)], 180, 300, 40)[0];
assert.equal(wrapped.height, 28, 'long lines keep a fixed box and truncate in CSS');
assert.equal(wrapped.width, 164);
assert.equal(layoutLabels([label('multiline', 'Wayside\nStation')], 393, 660, 40)[0].height, 41, 'explicit lines reserve full height');
console.log('Wayside Fury label layout checks passed.');
