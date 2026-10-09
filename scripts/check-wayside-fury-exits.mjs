import assert from 'node:assert/strict';
import {ALL_WORLDS, BLAST_WORLDS, OVERWORLD} from '../src/pages/WaysideFury/game/world.ts';
import {drawExitOpening,nearExit,exitDirection,exitCaption,exitOpacity} from '../src/pages/WaysideFury/game/exitArt.ts';
import {drawRoadNetwork,roadGround} from '../src/pages/WaysideFury/game/roadNetwork.ts';
import {clipRoadEnds,drawRoadEndings} from '../src/pages/WaysideFury/game/roadEndings.ts';
const calls=[];
const context=new Proxy({}, {get:(_,name)=>name==='createLinearGradient'?()=>({addColorStop(){}}):(...args)=>calls.push([name,...args]),set:()=>true});
let exits=0;
for(const world of ALL_WORLDS) {
 const before=JSON.stringify(world);
 for(const e of world.exits) {
  const x=e.x+e.w/2,y=e.y+e.h/2;
  assert.ok(nearExit(e,x,y));assert.ok(nearExit(e,e.x-48,y));assert.equal(nearExit(e,e.x-48.1,y),false,'cue range is three tiles from trigger edge');
  assert.equal(exitCaption(world,e),e.name,'destination names contain no arrow');
  assert.equal(exitOpacity(e,e.x-48,y),0,'area name fades from zero at three tiles');
  assert.equal(exitOpacity(e,e.x-32,y),1,'area name reaches full opacity at two tiles');
  calls.length=0;drawExitOpening(context,world,e,true);assert.ok(calls.some(c=>c[0]==='fill'),'opening is authored artwork');
  assert.equal(calls.filter(c=>c[0]==='arc').length,world.id.startsWith('interior-')?1:0,'only a door handle uses a circle; no green pad');
  if(world.id.startsWith('interior-'))assert.equal(exitDirection(world,e),'south');
  drawExitOpening(context,world,e,false);exits++;
 }
 assert.equal(JSON.stringify(world),before,'presentation preserves all triggers, hitboxes, spawns and destinations');
 if(world.id!=='overworld') {
  calls.length=0;drawRoadEndings(context,world);for(const r of world.roads)clipRoadEnds(context,r,world);
  assert.equal(calls.length,0,'ROADS2 endings are overworld only');
 }
 if(world.id.startsWith('blast-')||world.id.startsWith('interior-')) {
  calls.length=0;drawRoadNetwork(context,world);assert.equal(calls.length,0,'no asphalt ribbons or lane dashes inside Blast/interiors');
 }
}
assert.equal(roadGround(BLAST_WORLDS[0],'road'),'stone','scorched carriageway is ruined paving, never asphalt');
calls.length=0;drawRoadNetwork(context,OVERWORLD);assert.ok(calls.some(c=>c[0]==='stroke'),'county roads retain their authored presentation');
console.log(`Exits: ${exits} immutable openings, three-tile destination cues, interior doors and overworld-only road endings pass.`);
