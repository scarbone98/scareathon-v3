import assert from 'node:assert/strict';
import {newGame,createHero,enterCampaignMap,enterScene,step,idleInput,interact,interactTarget,activeHero,hostileWithinMeleeReach,advanceDialogue,toggleParty,applyCoopHit} from '../src/pages/WaysideFury/game/sim.ts';
import {CITY_WORLDS,CITY_MAP_IDS} from '../src/pages/WaysideFury/game/chapters/ch4Worlds.ts';
import {cityTargets,cityInteract} from '../src/pages/WaysideFury/game/chapters/ch4.ts';
import {cityDamage,configureCityEnemy,updateCityEnemy} from '../src/pages/WaysideFury/game/enemies/city.ts';
import {cityLanes} from '../src/pages/WaysideFury/game/bosses/architect.ts';
import {getWorld,isBlocked} from '../src/pages/WaysideFury/game/world.ts';
import {makeSave,restoreSave} from '../src/pages/WaysideFury/game/save.ts';
import {sanitizeSave,ticketDelta,receiptTotalScore} from '../server/shared/waysideFury/save.js';
import {COOP_PROTOCOL_VERSION,compatibleMap} from '../server/shared/waysideFury/campaign.js';
import {cleanWorld,cleanHero,cleanRelay} from '../server/wayside-fury/protocol.js';
import {build} from 'esbuild';
const coopModulePath=`/private/tmp/fury-ch4-coop-${process.pid}.mjs`;
await build({banner:{js:"import {createRequire} from 'node:module';const require=createRequire(import.meta.url);"},entryPoints:['src/pages/WaysideFury/game/coop.ts'],bundle:true,platform:'node',format:'esm',define:{'import.meta.env':JSON.stringify({VITE_SUPABASE_URL:'https://example.supabase.co',VITE_SUPABASE_ANON_KEY:'local-test-placeholder'})},outfile:coopModulePath});
const {FuryCoop}=await import(`file://${coopModulePath}`);
import {applyCoopReward} from '../src/pages/WaysideFury/game/coopRewards.ts';
const {findWalkRoute}=await import('./check-wayside-fury-collision.mjs');
function fixture(level=10) {const s=newGame(4);s.character={level,xp:0};for(const id of Object.keys(s.heroes))s.heroes[id]=createHero(id,s.character,s.gear);s.campaignMilestones=['space-complete'];s.party=['you','joe'];return s;}
for(const w of CITY_WORLDS) {
 assert.equal(isBlocked(w,w.spawn.x,w.spawn.y),false,w.id);
 for(const spawn of w.spawns) assert.equal(isBlocked(w,spawn.x,spawn.y,spawn.kind==='boss'?18:12),false,`${w.id} enemy spawn`);
 for(const door of w.exits) {const to=getWorld('dungeon',0,door.targetMapId);assert.equal(isBlocked(to,door.entryX,door.entryY),false,`${door.id} safe arrival`);assert.ok(findWalkRoute(w,w.spawn,{x:Math.max(16,Math.min(w.width-16,door.x+door.w/2)),y:door.y+door.h/2}).length);}
 const s=fixture();enterScene(s,'dungeon',0,w.id);for(const t of cityTargets(s)) {assert.equal(isBlocked(w,t.x,t.y),false,t.id);assert.ok(findWalkRoute(w,w.spawn,t).length,t.id);}
}
const blocked=fixture();blocked.campaignMilestones=[];assert.equal(enterCampaignMap(blocked,CITY_MAP_IDS[0]),false);
for(const version of [1,2,3,4]) {const s=fixture();s.coop={role:'host',seat:0,remoteHeroes:[],appliedHits:[],protocolVersion:version};assert.equal(enterCampaignMap(s,CITY_MAP_IDS[0]),false);assert.equal(compatibleMap('dungeon',0,CITY_MAP_IDS[0],version),false);}
const gates=fixture();enterCampaignMap(gates,CITY_MAP_IDS[0]);gates.x=620;gates.y=208;assert.equal(interactTarget(gates),null);cityInteract(gates,'city-anchor-0');assert.equal(interactTarget(gates).id,'city-boulevard-next');assert.equal(gates.active,'you');interact(gates);assert.equal(gates.mapId,'city-market');
cityInteract(gates,'city-rest');assert.equal(toggleParty(gates,'joe'),true);assert.equal(toggleParty(gates,'jon'),true);gates.overlay=null;
for(const level of [1,12]) {
 const s=fixture(level);let seconds=0;
 for(const w of CITY_WORLDS) {
  enterScene(s,'dungeon',0,w.id);s.dialogue=null;s.overlay=null;
  let frames=0,route=[],key='';
  for(;s.enemies.length&&s.scene!=='dead'&&frames<24000;frames++) {
   const boss=s.enemies.find(e=>e.kind==='boss'&&e.hp>0);
   const switches=boss&&(boss.exposed??0)<=0?cityTargets(s).filter(t=>t.id==='city-signal-switch'||t.id==='city-pedestal-0'||t.id==='city-pedestal-1'):[];
   const candidates=switches.length?switches:s.enemies.filter(e=>e.hp>0);
   if(!candidates.length) {step(s,idleInput(),1/60);continue;}
   const target=candidates.reduce((a,b)=>Math.hypot(a.x-s.x,a.y-s.y)<Math.hypot(b.x-s.x,b.y-s.y)?a:b);
   if(switches.length&&Math.hypot(target.x-s.x,target.y-s.y)<30) {interact(s,target);route=[];continue;}
   if(!route.length||key!==target.id||frames%60===0) {route=findWalkRoute(w,s,target);key=target.id;}
   while(route.length>1&&Math.hypot(route[0].x-s.x,route[0].y-s.y)<4)route.shift();
   const dest=route[0]??target,dx=dest.x-s.x,dy=dest.y-s.y,len=Math.max(1,Math.hypot(dx,dy)),cycle=frames%240;
   const ki=!switches.length&&cycle<80,attack=!ki&&frames%20===0&&hostileWithinMeleeReach(s),dash=cycle===110;
   step(s,{...idleInput(),x:dx/len,y:dy/len,ki,attack,dash,swap:cycle===190,guard:!ki&&!attack&&!dash&&s.enemies.some(e=>e.windup>0||e.actionTimer>0)},1/60);
  }
  console.log('City combat',level,w.id,Math.round(frames/60),'seconds',Math.round(activeHero(s).hp),'HP');
  assert.notEqual(s.scene,'dead',`${w.id} works at level ${level} with starter gear`);assert.equal(s.enemies.length,0,`${w.id} clears with ordinary controls`);seconds+=frames/60;
 }
 console.log('Chapter 4 combat total',level,Math.round(seconds));
 assert.ok(s.bosses.includes('city-switchmaster'));assert.ok(s.bosses.includes('city-architect'));
 enterScene(s,'dungeon',13,'city-hatching');cityInteract(s,'city-evacuate');assert.ok(s.campaignMilestones.includes('city-complete'));assert.equal(s.chapter,5);while(s.dialogue)advanceDialogue(s);
 const save=makeSave(s,null),clean=sanitizeSave(save);assert.ok(clean.save);assert.equal(clean.save.checkpointMapId,'city-refuge');assert.equal(restoreSave(clean.save).mapId,'city-refuge');assert.equal(restoreSave(clean.save,true).mapId,'city-refuge');
 const receipts={areas:['city'],bosses:s.bosses,rooms:[...CITY_MAP_IDS],level:1};assert.equal(receiptTotalScore(receipts),0,'City has no implicit ticket awards');assert.equal(ticketDelta(save,{...save,lastReported:save.lastReported}),0);
 const again=restoreSave(clean.save);enterScene(again,'dungeon',13,'city-hatching');assert.equal(again.enemies.length,0);const before=JSON.stringify(again.completedCinematics);cityInteract(again,'city-evacuate');assert.equal(JSON.stringify(again.completedCinematics),before);
}
const s=fixture();enterScene(s,'dungeon',0,'city-ticket-hall');const shield=s.enemies.find(e=>e.behavior==='turnstile');shield.aimX=1;shield.aimY=0;assert.ok(cityDamage(shield,100,-1,0,30)<cityDamage(shield,100,1,0,30));
enterScene(s,'dungeon',0,'city-switchmaster');const boss=s.enemies[0];for(let n=0;n<5;n++)cityDamage(boss,10,1,0,55);assert.ok(boss.burst>0);assert.equal(cityLanes(boss).length,2);
// City owns its break-out movement; the generic Chapter 1/Moon burst must not consume it.
const breakout=fixture();enterScene(breakout,'dungeon',0,'city-switchmaster');
const cityBoss=breakout.enemies[0];cityBoss.x=380;cityBoss.y=208;cityBoss.burst=.01;cityBoss.windup=.01;
step(breakout,idleInput(),1/60);
assert.ok(Math.hypot(cityBoss.x-320,cityBoss.y-208)<1,'City break-out returns to the authored open apron');
const snapshot={...s,protocolVersion:COOP_PROTOCOL_VERSION};assert.ok(cleanWorld(snapshot));assert.equal(cleanWorld({...snapshot,protocolVersion:3}),null);
const remote={hero:createHero('jon'),scene:s.scene,room:s.room,mapId:s.mapId,x:64,y:208,faceX:1,faceY:0,attackTimer:0,combo:0,charge:0,dashTimer:0,moving:false,guard:true,guardTimer:.1};assert.equal(cleanHero(remote).guardTimer,.1);assert.equal(cleanHero({...remote,guardTimer:-1}),null);
// Each authored behavior steps and emits its own readable pattern, including a single bank.
for(const behavior of ['cable-rat','neon-imp','turnstile','clockwolf']) {
 const e={...shield,kind:behavior==='neon-imp'?'shooter':'grunt',x:behavior==='cable-rat'?260:340,y:behavior==='cable-rat'?208:168};configureCityEnemy(s,e,behavior);s.enemies=[e];e.cooldown=0;
 const t={x:420,y:208,hero:s.heroes.you,seat:0,guard:false,dashTimer:0};const api={move:(e,dx,dy)=>{e.x+=dx;e.y+=dy;},shot:()=>s.projectiles.push({}),hurt:()=>{},targets:()=>[t],summon:()=>{}};
 for(let n=0;n<150;n++)updateCityEnemy(s,e,1/60,t,api);
 if(behavior==='cable-rat')assert.ok(Math.hypot(e.x-436,e.y-248)<1,'offscreen approach still lands on the marked outlet');
 if(behavior==='neon-imp')assert.ok(s.projectiles.some(p=>p.bounceDistance===55));
}
const host=fixture();host.coop={role:'host',seat:0,remoteHeroes:[],appliedHits:[],protocolVersion:COOP_PROTOCOL_VERSION};enterScene(host,'dungeon',0,'city-switchmaster');
const h=host.enemies[0];host.coop.remoteHeroes=[{...remote,seat:1,mapId:host.mapId,room:host.room,x:316,y:270,faceX:0,faceY:-1}];
const request={type:'coop-hit',enemyId:h.id,damage:1,dx:0,dy:0,force:0,attackId:'relay-fixture',relayId:'city-signal-switch',relayKind:'interact'};
assert.equal(applyCoopHit(host,request,1),true);assert.equal(h.exposed,6);assert.equal(applyCoopHit(host,request,1),false,'guest relay retransmit dedupes');
host.coop.remoteHeroes[0].x=64;assert.equal(applyCoopHit(host,{...request,attackId:'far'},1),false);
// A guest can turn after firing; the recorded ray, rather than current facing, validates the hit.
host.coop.remoteHeroes[0].x=80;host.coop.remoteHeroes[0].y=246;host.coop.remoteHeroes[0].faceX=-1;
const ray={...request,attackId:'ki-relay',relayKind:'ki',relayX:64,relayY:246,dx:1,dy:0};
assert.equal(applyCoopHit(host,ray,1),true);assert.equal(applyCoopHit(host,{...ray,attackId:'off-axis',dy:1,dx:0},1),false);
assert.ok(cleanRelay({...ray,type:'hit',scene:host.scene,room:host.room,mapId:host.mapId}));assert.equal(cleanRelay({...ray,type:'hit',scene:host.scene,room:host.room,mapId:host.mapId,relayX:null}),null);
const messages=[],client=new FuryCoop({onRoom:()=>{},onToast:()=>{},onAvatar:()=>{}});client.room={seat:0,hostSeat:0,players:[{seat:0,userId:'host',connected:true},{seat:1,userId:'guest',connected:true}]};client.socket={readyState:1,send:data=>messages.push(JSON.parse(data))};
enterScene(host,'dungeon',13,'city-hatching');host.enemies=[];host.clearedRooms.push('city-hatching');host.campaignMilestones.push('space-complete');cityInteract(host,'city-evacuate');
client.event(host,{type:'checkpoint',id:'city-complete'});
const guestReward=messages.find(m=>m.type==='reward'&&m.targetSeat===1).reward;assert.ok(guestReward.campaignMilestones.includes('city-complete'));assert.ok(!guestReward.campaignMilestones.includes('space-complete'));assert.deepEqual(guestReward.rooms,[]);
const guest=newGame();applyCoopReward(guest,guestReward);assert.ok(guest.campaignMilestones.includes('city-complete'));assert.ok(guest.solvedInteractions.includes('city-evacuation'));assert.ok(!guest.campaignMilestones.includes('space-complete'));
enterScene(host,'hub');assert.equal(cityInteract(host,'station'),true);assert.ok(host.dialogue.lines.join(' ').includes('Haywire Junction'));
guest.coop={role:'guest',seat:1,remoteHeroes:[],appliedHits:[],protocolVersion:COOP_PROTOCOL_VERSION};enterScene(guest,'hub');guest.x=480;guest.y=224;assert.equal(interactTarget(guest).id,'station');interact(guest);assert.ok(guest.dialogue.lines.join(' ').includes('Haywire Junction'),'guest can read the local finale handoff');
const completed=fixture();completed.clearedRooms=[...CITY_MAP_IDS];completed.bosses=['city-switchmaster','city-architect'];completed.solvedInteractions=['city-anchor-0','city-anchor-2','city-anchor-5','city-evacuation'];completed.campaignMilestones.push('city-complete');completed.checkpointMapId='city-refuge';
for(const version of [1,2,3,4]) {const raw=makeSave(completed,null);raw.version=version;if(version<3){raw.unlockedHeroes=['joe','matt','alex','jon'];raw.active='joe';raw.party=['joe','matt'];}const result=sanitizeSave(raw);assert.ok(result.save,`v${version} migration`);assert.ok(result.save.unlockedHeroes.includes('you'));}
console.log('City graph, ability gates, starter/party scaling combat, v1–v4 saves/retry, no ticket inflation, replay and legacy co-op exclusion pass.');
