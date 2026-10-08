import {roadPoints} from '../src/pages/WaysideFury/game/roadNetwork.ts';
import assert from 'node:assert/strict';
import { GLOBE_DESTINATIONS, globeAvailable, globeDistance, globeProject, newGlobe, stepGlobe, startLanding, wrapLongitude, spherePoint } from '../src/pages/WaysideFury/game/globe.ts';
import { newGame, enterCampaignMap, idleInput, step, enterScene } from '../src/pages/WaysideFury/game/sim.ts';
import { makeSave, restoreSave, progressReport } from '../src/pages/WaysideFury/game/save.ts';
import { OVERWORLD, isBlocked, overlaps } from '../src/pages/WaysideFury/game/world.ts';
import { COUNTY_STOPS } from '../src/pages/WaysideFury/game/county.ts';
const state=newGame();
assert.deepEqual(GLOBE_DESTINATIONS.filter(d=>globeAvailable(state,d)).map(d=>d.id),['county','wayside','blast']);
for(const id of ['woods','city','finale','launch'])assert.equal(globeAvailable(state,GLOBE_DESTINATIONS.find(d=>d.id===id)),false);
state.campaignMilestones.push('blast-watcher');
assert.equal(globeAvailable(state,GLOBE_DESTINATIONS.find(d=>d.id==='launch')),false,'Chapter 1 cannot bypass the Woods launch key');
state.campaignMilestones.push('woods-complete');
assert.ok(globeAvailable(state,GLOBE_DESTINATIONS.find(d=>d.id==='launch')));
state.coop={role:'host'};
assert.ok(GLOBE_DESTINATIONS.every(d=>!globeAvailable(state,d)),'no client can enter unsynchronized travel');delete state.coop;
for(const d of GLOBE_DESTINATIONS) {const p=spherePoint(d.lat,d.lon);assert.ok(Math.abs(p.x*p.x+p.y*p.y+p.z*p.z-1)<1e-12);}
const a=newGlobe('county',5),b=newGlobe('county',5),input={turn:0,throttle:0,brake:false,auto:true};
a.selected=b.selected='wayside';
const target=GLOBE_DESTINATIONS.find(d=>d.id==='wayside');
for(let i=0;i<1000;i++){stepGlobe(a,1/60,input);stepGlobe(b,1/60,input);globeProject(target.lat,target.lon,a);}
assert.deepEqual(a,b,'projection leaves deterministic travel unchanged');assert.ok(globeDistance(a,target)<.22);
assert.equal(startLanding(a,false),false);assert.equal(startLanding(a,true),true);
a.phase='cruise';a.phaseTime=0;assert.equal(startLanding(a,true),true);
let arrival=false;for(let i=0;i<109;i++)arrival=stepGlobe(a,1/60,input)||arrival;assert.ok(arrival);
assert.ok(globeProject(.25,Math.PI,newGlobe('county')).z<0,'rear hemisphere is hidden');assert.ok(Math.abs(wrapLongitude(Math.PI*4+.1)-.1)<1e-10);
assert.equal(b.offer,true,'seeded balloon offer appears once after 12 seconds of cruise');
const old=progressReport(state);enterCampaignMap(state,target.mapId);state.checkpointMapId=target.mapId;
const saved=makeSave(state);assert.equal(restoreSave(saved).mapId,'hub');assert.equal(progressReport(state).score,old.score,'travel cannot create ticket credit');
assert.equal(OVERWORLD.width,2304);assert.equal(OVERWORLD.height,1536);
for(const stop of COUNTY_STOPS)assert.equal(isBlocked(OVERWORLD,stop.x,stop.y,10),false);
for(const road of OVERWORLD.roads.filter(r=>['county','garden-loop','reservoir-loop','orchard-loop','county-shortcut','reservoir-causeway'].includes(r.id))) {
 const points=roadPoints(road);
 for(let i=1;i<points.length;i++) {
  const a=points[i-1],b=points[i],length=Math.hypot(b.x-a.x,b.y-a.y);
  for(let d=24;d<length-24;d+=16) {
   const x=a.x+(b.x-a.x)*d/length,y=a.y+(b.y-a.y)*d/length;
   if(road.start==='barrier'&&x<64||road.end==='barrier'&&x>OVERWORLD.width-64)continue;
   assert.equal(isBlocked(OVERWORLD,x,y,10),false,`${road.id} clear at ${x},${y}`);
  }
 }
}
const scene=newGame();enterScene(scene,'overworld');const drive=idleInput();drive.x=1;drive.dash=true;for(let i=0;i<60;i++)step(scene,drive,1/60);assert.ok(scene.x>400,'taxi boost is playable');
const host=newGame();enterScene(host,'overworld');host.coop={role:'host',seat:0,remoteHeroes:[],appliedHits:[],protocolVersion:3};host.x=1870;
for(let i=0;i<60;i++)step(host,{...idleInput(),x:1},1/60);assert.ok(host.x<=1878,'old parties cannot cross into new county districts');
const samples=[];for(const [x,y] of [[160,704],[768,1280],[1760,1280],[2144,800],[1216,1136],[700,960]]){
 const count=OVERWORLD.props.filter(p=>overlaps(p,{x:x-120,y:y-80,w:240,h:160})).length;samples.push({x,y,count});
}
assert.ok(samples.filter(s=>s.count>=8).length>=samples.length*.8,`route dressing target: ${JSON.stringify(samples)}`);
console.log('Globe: registry gates, deterministic travel, sphere/wrap/occlusion, safe arrival, ticket invariance, blocked co-op, loops, boost, stop clearance and route density pass.',samples);
