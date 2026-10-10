import assert from 'node:assert/strict';
import {getRenderViewport} from '../src/pages/WaysideFury/game/viewport.ts';
import { OVERWORLD,COOP_OVERWORLD,ALL_WORLDS,map,prop,road,isBlocked,TILE } from '../src/pages/WaysideFury/game/world.ts';
import { propPlacementViolations,placementRects } from '../src/pages/WaysideFury/game/propPlacement.ts';
import { roadPoints,onRoad,projectRoad } from '../src/pages/WaysideFury/game/roadNetwork.ts';
import { createOverworldElevation } from '../src/pages/WaysideFury/game/terrainElevation.ts';
import { HOUSE_KINDS,HOUSE_VARIANT_COUNT,houseStyle,assignHouseVariants,adjacentHouses } from '../src/pages/WaysideFury/game/houseVariants.ts';
for(const world of [OVERWORLD,COOP_OVERWORLD]) {
 assert.deepEqual(propPlacementViolations(world),[],`${world===OVERWORLD?'solo':'co-op'}: every prop grounded and clear`);
 for(const p of world.props.filter(p=>p.kind==='mailbox')) {
  const point={x:p.x+p.w/2,y:p.y+p.h};
  assert.ok(world.props.some(b=>['station','home','shed','diner'].includes(b.kind)&&Math.hypot(Math.max(0,b.x-point.x,point.x-b.x-b.w),Math.max(0,b.y-point.y,point.y-b.y-b.h))<64),'mailbox beside a building/driveway');
  const nearest=world.roads.flatMap(r=>{const pts=roadPoints(r);return pts.slice(1).map((b,i)=>projectRoad(point,pts[i],b));}).sort((a,b)=>a.distance-b.distance)[0];
  assert.ok(nearest.distance<72);
  assert.ok(Math.abs(p.mailboxFacing-Math.atan2(nearest.y-point.y,nearest.x-point.x))<1e-6,'mailbox faces road');
 }
 // Flood the actual drivable ribbon at taxi radius, checking route reachability,
 // not just graph intersections that might be blocked by a hidden collider.
 const spacing=8,cols=Math.ceil(world.width/spacing),rows=Math.ceil(world.height/spacing),seen=new Set();
 const start={c:Math.round(world.spawn.x/spacing),r:Math.round(world.spawn.y/spacing)},queue=[start];seen.add(start.r*cols+start.c);
 for(let i=0;i<queue.length;i++) {
  const {c,r}=queue[i];
  for(const [dc,dr] of [[1,0],[-1,0],[0,1],[0,-1]]) {
   const nc=c+dc,nr=r+dr,key=nr*cols+nc,x=nc*spacing,y=nr*spacing;
   if(nc<0||nr<0||nc>=cols||nr>=rows||seen.has(key)||!onRoad(world,x,y,-14)||isBlocked(world,x,y,14))continue;
   seen.add(key);queue.push({c:nc,r:nr});
  }
 }
 for(const r of world.roads)for(const [i,b] of roadPoints(r).entries()) {
  if(!i)continue;const a=roadPoints(r)[i-1],n=Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)/8);
  for(let j=0;j<=n;j++) {
   const x=a.x+(b.x-a.x)*j/n,y=a.y+(b.y-a.y)*j/n;
   // The visible stop barriers are the finite network's endpoints.
   if(world.props.some(p=>p.kind==='barrier'&&placementRects(p).some(q=>x>=q.x-20&&x<=q.x+q.w+20&&y>=q.y-20&&y<=q.y+q.h+20)))continue;
   assert.equal(isBlocked(world,x,y,14),false,`${r.id}: taxi clearance at ${x},${y}`);
   assert.ok(seen.has(Math.round(y/spacing)*cols+Math.round(x/spacing)),`${r.id}: reachable from spawn at ${x},${y}`);
  }
 }
 console.log(`${world===OVERWORLD?'solo':'co-op'}: ${world.props.length} prop placements and ${world.roads.length} reachable roads pass`);
}
const elevation=createOverworldElevation(OVERWORLD);
let deckSamples=0;
for(let i=0;i<OVERWORLD.tiles.length;i++)if(OVERWORLD.tiles[i]==='bridge') {
 const x=i%OVERWORLD.cols*TILE+8,y=Math.floor(i/OVERWORLD.cols)*TILE+8;
 if(onRoad(OVERWORLD,x,y,-10)) { assert.ok(elevation.heightAt(x,y)>=3.9,'causeway never sinks to lake bed');deckSamples++; }
}
assert.ok(deckSamples>20,'exercise real reservoir deck');
const tower=OVERWORLD.props.find(p=>p.kind==='water-tower');assert.ok(tower.x<400&&tower.y<800&&tower.w===64&&tower.h===96,'native-aspect tower by station rain garden');
// Negative fixtures prove the sweep catches every class of regression.
const bad=map('fixture','fixture',20,20,'grass');road(bad,{id:'road',x:0,y:128,w:320,h:32,direction:'horizontal',start:'junction',end:'junction'});prop(bad,'crate',40,130,24,20);prop(bad,'crate',40,130,24,20);bad.tiles[1*bad.cols+1]='water';prop(bad,'flower',16,16,16,16);
const errors=propPlacementViolations(bad);for(const kind of ['road overlap','prop overlap','invalid terrain'])assert.ok(errors.some(e=>e.includes(kind)));
for(const world of [...ALL_WORLDS,COOP_OVERWORLD]) {
 const houses=world.props.filter(p=>HOUSE_KINDS.has(p.kind)).sort((a,b)=>(a.y+a.h)-(b.y+b.h)||a.x-b.x||a.id.localeCompare(b.id));
 for(const [i,p] of houses.entries()) {
  assert.ok(p.house&&houseStyle(p));
  for(const [j,q] of houses.slice(0,i).entries())if(j===i-1||adjacentHouses(p,q))assert.notEqual(p.house.variant,q.house.variant,`${world.id}: adjacent ${p.id}/${q.id}`);
 }
}
for(const biome of ['town','woods','blast','city','moon']) {
 const fixture=()=>{const w=map(`${biome}-variants`,'fixture',200,100,'grass');for(let n=0;n<12;n++)prop(w,'home',100+n*150,300,100,80);assignHouseVariants(w);return w;};
 const a=fixture(),b=fixture();assert.deepEqual(a,b,'level/position selection is deterministic');
 const signatures=Array.from({length:HOUSE_VARIANT_COUNT},(_,variant)=>JSON.stringify(houseStyle({house:{variant,biome}})));
 assert.equal(new Set(signatures).size,6,`${biome}: six distinct part configurations`);
 assert.ok(a.props.some(p=>p.house.mirrored)&&a.props.some(p=>!p.house.mirrored),'mirroring is seeded');
}
console.log('Causeway grade, rejection fixtures, six original-part house variants per biome and all adjacent houses pass.');

for(const [width,height] of [[390,700],[390,844],[1440,900]])for(const dpr of [1,1.25,2,3,4]) {
 const normal=getRenderViewport(width,height,dpr);
 for(const cap of [1,1.5,2,3]) {
  const quality=getRenderViewport(width,height,dpr,cap);
  assert.deepEqual([quality.zoom,quality.width,quality.height],[normal.zoom,normal.width,normal.height],'quality tier never changes camera geometry');
 }
}
console.log('Viewport geometry stays identical across all adaptive quality tiers.');
