import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ALL_WORLDS,isBlocked,distanceToExit} from '../src/pages/WaysideFury/game/world.ts';
import {INTERIORS,interiorDefinition} from '../src/pages/WaysideFury/game/interiors.ts';
import {newGame,enterCampaignMap,interact,step,idleInput} from '../src/pages/WaysideFury/game/sim.ts';
import {makeSave,restoreSave,progressReport,parseSave} from '../src/pages/WaysideFury/game/save.ts';
import {fieldWorld} from '../src/pages/WaysideFury/game/fieldAbilities.ts';
import {availablePickups,collectPickup,authoritativePickupTarget} from '../src/pages/WaysideFury/game/collectibles.ts';
import {BLAST_ENCOUNTER_ANCHORS} from '../src/pages/WaysideFury/game/blastLayouts.ts';
import {compatibleMap,COOP_PROTOCOL_VERSION} from '../server/shared/waysideFury/campaign.js';
const ready=()=>{const s=newGame();s.clearedRooms=['realm-0'];s.campaignMilestones=['woods-complete','space-complete'];return s;};
function reachable(m,radius=7) {
 const grid=8,cols=Math.floor(m.width/grid)+1,rows=Math.floor(m.height/grid)+1,seen=new Uint8Array(cols*rows),queue=[],blocked=new Map();
 const clear=(x,y)=>{const key=y*cols+x;let result=blocked.get(key);if(result===undefined){result=!isBlocked(m,x*grid,y*grid,radius);blocked.set(key,result);}return result;};
 const sx=Math.round(m.spawn.x/grid),sy=Math.round(m.spawn.y/grid);assert.ok(clear(sx,sy),`${m.id} start`);queue.push([sx,sy]);seen[sy*cols+sx]=1;
 for(let i=0;i<queue.length;i++) {const [x,y]=queue[i];for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
  const nx=x+dx,ny=y+dy,key=ny*cols+nx;if(nx<0||ny<0||nx>=cols||ny>=rows||seen[key]||!clear(nx,ny))continue;
  if([2,4,6].some(d=>isBlocked(m,x*grid+dx*d,y*grid+dy*d,radius)))continue;
  seen[key]=1;queue.push([nx,ny]);
 }}
 return (predicate)=>queue.some(([x,y])=>predicate(x*grid,y*grid));
}
const baseline=JSON.parse(readFileSync(new URL('../docs/wayside-fury-design/areas/baseline-graph.json',import.meta.url),'utf8'));
for(const before of baseline) {
 const current=ALL_WORLDS.find(m=>m.id===before.id);assert.ok(current);
 assert.deepEqual(current.spawn,before.spawn,`${before.id} spawn preserved`);
 if(before.id.startsWith('blast-')) {
  // The design rebuild moves ordinary squads into its authored combat pockets.
  // Preserve enemy identities/counts and validate the new anchors independently.
  const identities = spawns => spawns.map(({x, y, ...identity}) => identity);
  assert.deepEqual(identities(current.spawns),identities(before.spawns),`${before.id} encounter identities preserved`);
  const room=Number(before.id.slice(6));
  if(!current.spawns.some(s=>s.kind==='boss')) {
   const anchors=BLAST_ENCOUNTER_ANCHORS[room];
   assert.equal(current.spawns.length,anchors.length*3);
   for(const [i,[x,y]] of anchors.entries()) for(const spawn of current.spawns.slice(i*3,i*3+3)) {
    assert.ok(Math.hypot(spawn.x-x,spawn.y-y)<=128,`${before.id} squad ${i} stays in its authored pocket`);
    assert.ok(!isBlocked(current,spawn.x,spawn.y,10),`${before.id} squad ${i} is collision safe`);
   }
  } else assert.deepEqual(current.spawns,before.spawns,`${before.id} boss anchors preserved`);
 } else assert.deepEqual(current.spawns,before.spawns,`${before.id} encounters preserved`);
 assert.deepEqual(current.exits.map(e=>Object.fromEntries(Object.entries(e).filter(([key,value])=>!["x","y","w","h"].includes(key)&&value!==undefined))),before.exits,`${before.id} exit identities, rewards/gates and arrivals preserved`);
}
let exits=0,doors=0;
for(const m of ALL_WORLDS.filter(m=>m.organic||interiorDefinition(m.id)||['hub','space-launch'].includes(m.id))) {
 const s=ready();enterCampaignMap(s,m.id);s.solvedInteractions=m.props.filter(p=>p.kind==='seal').map(p=>p.id);
 const world=fieldWorld(s),reach=reachable(world,m.id==='overworld'?10:7);
 for(const e of m.exits) {
  assert.ok(reach((x,y)=>distanceToExit(e,x,y)<25),`${m.id}: exit ${e.id} reachable`);exits++;
  const dest=ALL_WORLDS.find(m=>m.id===e.targetMapId);assert.ok(dest,`${m.id} target`);assert.ok(!isBlocked(dest,e.entryX,e.entryY,7),`${m.id}: arrival ${e.targetMapId}`);
 }
 for(const room of INTERIORS.filter(room=>room.parent===m.id)) {assert.ok(!isBlocked(world,room.x,room.y,7),`${room.id} door clear`);assert.ok(reach((x,y)=>Math.hypot(x-room.x,y-room.y)<25),`${room.id} door reachable`);doors++;}
 for(const spawn of m.spawns)assert.ok(!isBlocked(world,spawn.x,spawn.y,spawn.kind==='boss'?22:9),`${m.id} encounter remains clear`);
 for(const pickup of availablePickups(s))assert.ok(reach((x,y)=>Math.hypot(x-pickup.x,y-pickup.y)<28),`${m.id} existing find ${pickup.id}`);
}
assert.equal(doors,9);
for(const room of INTERIORS) {
 const s=ready();enterCampaignMap(s,room.parent);s.x=room.x;s.y=room.y;
 const receipt=progressReport(s).receipt;interact(s,{id:`${room.id}-door`,name:'Enter',kind:'use',x:s.x,y:s.y});assert.equal(s.mapId,room.id);
 const saved=makeSave(s,null);assert.ok(saved);assert.equal(saved.checkpointMapId,room.id);
 const resumed=restoreSave(saved);assert.equal(resumed.mapId,room.id);assert.ok(!isBlocked(ALL_WORLDS.find(m=>m.id===room.id),resumed.x,resumed.y));
 assert.equal(progressReport(s,receipt).score,0,'interiors award no tickets');
 assert.equal(restoreSave(saved,true).mapId,room.id);
 const door=ALL_WORLDS.find(m=>m.id===room.id).exits[0];s.x=224;s.y=304;interact(s,{id:door.id,name:'Return',kind:'use',x:224,y:304});assert.equal(s.mapId,room.parent);assert.equal(s.x,room.x);assert.equal(s.y,room.y+16);
 for(const version of [1,2,3,4,5]) {const old=ready();old.coop={role:'host',seat:0,remoteHeroes:[],appliedHits:[],protocolVersion:version};assert.equal(enterCampaignMap(old,room.id),false);assert.equal(compatibleMap('dungeon',100+INTERIORS.indexOf(room),room.id,version),false);}
 const host=ready();host.coop={role:'host',seat:0,remoteHeroes:[],appliedHits:[],protocolVersion:COOP_PROTOCOL_VERSION,playerCount:4};assert.ok(enterCampaignMap(host,room.id));assert.ok(compatibleMap(host.scene,host.room,host.mapId,COOP_PROTOCOL_VERSION));
}
const diner=ready();enterCampaignMap(diner,'interior-diner');diner.x=216;diner.y=152;const before=diner.candy;
assert.ok(collectPickup(diner,'pickup-c1-diner'));assert.equal(diner.candy,before+6);assert.equal(collectPickup(diner,'pickup-c1-diner'),false);
assert.ok(authoritativePickupTarget(diner,{scene:diner.scene,room:diner.room,mapId:diner.mapId,x:216,y:152,hero:{hp:10}},'pickup-c1-diner'));
assert.equal(availablePickups(restoreSave(makeSave(diner,null))).some(p=>p.id==='pickup-c1-diner'),false);
const legacy=makeSave(newGame(),null);for(const version of [3,4]) {const migrated=parseSave({...legacy,version});assert.equal(restoreSave(migrated).mapId,'hub');}
assert.equal(parseSave({...legacy,checkpointMapId:'interior-city-cafe'}).checkpointMapId,'hub');
// Exit mat requires a deliberate press; entering/standing cannot bounce out.
const stay=ready();enterCampaignMap(stay,'overworld');stay.x=520;stay.y=405;interact(stay);for(let i=0;i<90;i++)step(stay,{...idleInput(),attack:true},1/60);assert.equal(stay.mapId,'interior-diner');
console.log(`Areas: ${exits} swept-reachable exits, ${doors} doors, preserved encounters/finds, nine return/save/retry loops, protocol 1–5 guards and zero ticket inflation pass.`);
