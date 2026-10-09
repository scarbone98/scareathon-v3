import assert from 'node:assert/strict';
import { ALL_WORLDS, BLAST_WORLDS } from '../src/pages/WaysideFury/game/world.ts';
import { wornTrails, trailClear, continuousBlastGround } from '../src/pages/WaysideFury/game/roomGround.ts';
let routes=0;
for(const world of ALL_WORLDS) {
 const before=JSON.stringify(world);
 for(const trail of wornTrails(world)) {
  assert.ok(trail.width>=24&&trail.width<=32,'trails are 1.5–2 tiles, never road width');
  const first=trail.points[0],end=trail.points.at(-1);
  assert.ok(world.exits.some(e=>Math.hypot(first.x-e.x-e.w/2,first.y-e.y-e.h/2)<48),`${world.id}: trail starts at an entrance`);
  assert.ok(world.exits.some(e=>Math.hypot(end.x-e.x-e.w/2,end.y-e.y-e.h/2)<48)||world.props.some(p=>p.kind==='chest'&&Math.hypot(end.x-p.x-p.w/2,end.y-p.y-p.h-24)<48),`${world.id}: real destination`);
  for(let i=1;i<trail.points.length;i++) {
   const a=trail.points[i-1],b=trail.points[i],n=Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)/2);
   for(let k=0;k<=n;k++)assert.ok(trailClear(world,a.x+(b.x-a.x)*k/(n||1),a.y+(b.y-a.y)*k/(n||1)),`${world.id}: feathered trail clears walls, props and craters`);
  }
  routes++;
 }
 assert.equal(JSON.stringify(world),before,'ground presentation never changes gameplay');
}
assert.ok(routes>=15,'connected room trails remain visible');
assert.ok(BLAST_WORLDS.every(continuousBlastGround));
console.log(`PATHS: ${routes} narrow obstacle-safe entrance/destination trails; ten continuous Blast grounds; immutable gameplay geometry.`);
