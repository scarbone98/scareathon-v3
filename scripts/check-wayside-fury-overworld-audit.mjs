import assert from 'node:assert/strict';
import { OVERWORLD, COOP_OVERWORLD, TILE } from '../src/pages/WaysideFury/game/world.ts';
import { countyLakes, drawCountyWater, isCountyWater } from '../src/pages/WaysideFury/game/overworldWater.ts';
import { countyRoadPaint } from '../src/pages/WaysideFury/game/countyRoadPaint.ts';
import { junctionAt, roadDistance } from '../src/pages/WaysideFury/game/roadNetwork.ts';

for (const world of [OVERWORLD, COOP_OVERWORLD]) {
  const before = JSON.stringify(world), lakes = countyLakes(world);
  assert.ok(lakes.length >= 2);
  assert.strictEqual(countyLakes(world), lakes, 'contours are cached per world identity');
  for (const lake of lakes) {
    assert.ok(lake.points.length >= 4 && lake.w > 0 && lake.h > 0);
    for (const [i,p] of lake.points.entries()) {
      const q = lake.points[(i+1)%lake.points.length];
      assert.ok(p.x===q.x || p.y===q.y, 'trace follows authored bank before curve smoothing');
      assert.ok(Math.hypot(p.x-q.x,p.y-q.y)>0, 'no degenerate curve tangents');
    }
  }
  for (let i=0;i<world.tiles.length;i++) if(world.tiles[i]==='bridge') {
    assert.ok(isCountyWater(world,i%world.cols,Math.floor(i/world.cols)), 'water remains continuous beneath county bridge');
  }
  const strokes=[];
  const c={save(){},restore(){},beginPath(){},moveTo(){},lineTo(){},quadraticCurveTo(){},closePath(){},fill(){},clip(){},stroke(){strokes.push(this.lineWidth);}};
  drawCountyWater(c,world,{x:0,y:0,w:world.width,h:world.height});
  drawCountyWater(c,world,{x:0,y:0,w:world.width,h:world.height},2);
  assert.ok(strokes.includes(32) && strokes.includes(1.1) && strokes.includes(.45),'depth falloff, foam and fine animated highlights');
  for (const mark of countyRoadPaint(world).filter(m=>m.kind==='lane')) {
    const owner=world.roads.find(r=>roadDistance(r,mark.a.x,mark.a.y)<.001 && roadDistance(r,mark.b.x,mark.b.y)<.001);
    assert.ok(owner,'dash follows one authored road');
    for (const p of mark.points) assert.ok(!junctionAt(world,owner,p.x,p.y),'paint stops before junctions');
    const length=mark.points.slice(1).reduce((n,p,i)=>n+Math.hypot(p.x-mark.points[i].x,p.y-mark.points[i].y),0);
    assert.ok(Math.abs(length-14)<.001,'full dash survives a polyline bend');
  }
  assert.equal(JSON.stringify(world),before,'art cannot mutate collision, props, roads or minimap inputs');
}
const fixture={id:'overworld',cols:4,rows:4,width:4*TILE,height:4*TILE,tiles:Array(16).fill('water'),roads:[],props:[]};
assert.equal(countyLakes(fixture).length,1,'adjacent water cells merge into one shoreline');
assert.equal(countyLakes(fixture)[0].points.length,4,'internal tile edges never become banks');
assert.equal(isCountyWater(fixture,-1,0),false);
console.log('Overworld audit: continuous lake unions, bridges, depth/foam/motion, full curved dashes, junction clearance and immutable world pass.');
