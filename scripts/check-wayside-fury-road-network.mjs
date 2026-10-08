import assert from 'node:assert/strict';
import {drawRoadNetwork,onRoad,networkPaint,roadPoints,junctionAt,roadDistance,roadWidth} from '../src/pages/WaysideFury/game/roadNetwork.ts';
import {OVERWORLD,COOP_OVERWORLD,HUB_WORLD,isBlocked,TILE} from '../src/pages/WaysideFury/game/world.ts';
const segment=(id,curve)=>({id,curve,curveWidth:64,x:0,y:0,w:320,h:320,direction:'horizontal',start:'junction',end:'junction'});
for(const [name,roads] of [
 ['T',[segment('main',[{x:32,y:160},{x:320,y:160}]),segment('branch',[{x:160,y:32},{x:160,y:160}])]],
 ['X',[segment('main',[{x:32,y:160},{x:320,y:160}]),segment('branch',[{x:160,y:32},{x:160,y:320}])]],
 ['Y',[segment('stem',[{x:160,y:320},{x:160,y:160}]),segment('left',[{x:32,y:32},{x:160,y:160}]),segment('right',[{x:160,y:160},{x:320,y:32}])]],
]) {
 const world={roads};assert.ok(onRoad(world,160,160),`${name}: merged center`);
 let radii=0;drawRoadNetwork({save(){},restore(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},fill(){},closePath(){},quadraticCurveTo(){radii++;}},world);assert.ok(radii>0,`${name}: tangent curb radii`);
 const marks=networkPaint(world);assert.ok(marks.some(m=>m.kind==='stop'),`${name}: stop bars`);
 for(const m of marks.filter(m=>m.kind==='lane')) {
  const owner=roads.find(r=>roadDistance(r,m.a.x,m.a.y)<1);assert.ok(owner);
  for(const p of [m.a,m.b])assert.equal(junctionAt(world,owner,p.x,p.y),false,`${name}: no lanes inside junction`);
 }
}
for(const world of [OVERWORLD,COOP_OVERWORLD,HUB_WORLD])for(const r of world.roads) {
 const points=roadPoints(r);
 for(let i=1;i<points.length;i++) {
  const a=points[i-1],b=points[i],n=Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)/8);
  for(let j=2;j<n-2;j++) {
   const x=a.x+(b.x-a.x)*j/n,y=a.y+(b.y-a.y)*j/n;
   if(world.props.some(p=>p.kind==='barrier'&&x>=p.x-16&&x<=p.x+p.w+16&&y>=p.y-16&&y<=p.y+p.h+16))continue;
   assert.equal(isBlocked(world,x,y,7),false,`${world.id}/${r.id}: ribbon center clear at ${x},${y}`);
  }
 }
}
for(let row=0;row<OVERWORLD.rows;row++)for(let col=0;col<OVERWORLD.cols;col++) {
 const tile=OVERWORLD.tiles[row*OVERWORLD.cols+col];
 if(!['road','bridge'].includes(tile))continue;
 assert.ok(OVERWORLD.roads.some(r=>roadDistance(r,col*TILE+8,row*TILE+8)<=roadWidth(r)/2),`no leftover asphalt tile ${col},${row}`);
}
for(let i=0;i<OVERWORLD.tiles.length;i++)if(OVERWORLD.tiles[i]==='bridge') {
 const x=i%OVERWORLD.cols*TILE,y=Math.floor(i/OVERWORLD.cols)*TILE;
 for(const dx of [.1,15.9])for(const dy of [.1,15.9])if(!onRoad(OVERWORLD,x+dx,y+dy))assert.equal(isBlocked(OVERWORLD,x+dx,y+dy,0),true,'water outside the ribbon remains solid');
}
console.log('Road network: T/X/Y junction paint, exact ribbon coverage and all county/co-op/hub centerlines pass.');
