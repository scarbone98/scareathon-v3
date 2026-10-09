import assert from 'node:assert/strict';
import { countyRoadPaint } from '../src/pages/WaysideFury/game/countyRoadPaint.ts';
import { roadDistance, junctionAt } from '../src/pages/WaysideFury/game/roadNetwork.ts';
import { OVERWORLD, COOP_OVERWORLD } from '../src/pages/WaysideFury/game/world.ts';
const r={id:'curve',curve:[{x:0,y:0},{x:92,y:0},{x:200,y:30}],curveWidth:64,direction:'horizontal',start:'junction',end:'junction'};
const marks=countyRoadPaint({roads:[r],props:[]}).filter(m=>m.kind==='lane');
assert.ok(marks.some(m=>m.a.x<92&&m.b.x>92&&m.points.some(p=>p.x===92&&p.y===0)),'one complete dash follows the bend');
for(const world of [OVERWORLD,COOP_OVERWORLD]) {
  const before=JSON.stringify(world), paint=countyRoadPaint(world);
  assert.equal(JSON.stringify(world),before,'drawing never mutates navigation');
  for(const mark of paint.filter(m=>m.kind==='lane')) {
    const owner=world.roads.find(r=>roadDistance(r,mark.a.x,mark.a.y)<.01&&roadDistance(r,mark.b.x,mark.b.y)<.01);
    assert.ok(owner,'dash follows its authored road');
    for(const p of [mark.a,mark.b])assert.ok(!junctionAt(world,owner,p.x,p.y),'junctions have no lane paint');
  }
}
console.log('Audit paint: arc-length dashes cross bends without phase resets; county/co-op paint follows roads, clears junctions and preserves navigation.');
