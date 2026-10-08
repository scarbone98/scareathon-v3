import assert from 'node:assert/strict';
import { newGame, enterScene, enterCampaignMap, interact, interactTarget, idleInput, step, HERO_IDS, createHero, activeHero, applyCoopHit } from '../src/pages/WaysideFury/game/sim.ts';
import { LAUNCH_WORLD, MOON_WORLDS, moonId } from '../src/pages/WaysideFury/game/chapters/ch3Worlds.ts';
import { SPACE_FILMS, filmDuration, sampleSpaceFilm } from '../src/pages/WaysideFury/game/chapters/ch3Films.ts';
import { startSpaceFilm } from '../src/pages/WaysideFury/game/cinematics.ts';
import { spaceTargets } from '../src/pages/WaysideFury/game/chapters/ch3.ts';
import { brakeBound, tickLunar, lunarWorld, tryBoundLink, advanceBoundLink } from '../src/pages/WaysideFury/game/lunar.ts';
import { lunarDamage, updateLunarEnemy } from '../src/pages/WaysideFury/game/enemies/lunar.ts';
import { getMap, canEnter } from '../src/pages/WaysideFury/game/campaign.ts';
import { isBlocked, OVERWORLD } from '../src/pages/WaysideFury/game/world.ts';
import { applyCoopReward } from '../src/pages/WaysideFury/game/coopRewards.ts';
import { makeSave, restoreSave, progressReport } from '../src/pages/WaysideFury/game/save.ts';
import { compatibleMap, CHAPTER_REWARDS, COOP_PROTOCOL_VERSION } from '../server/shared/waysideFury/campaign.js';
import { cleanWorld, cleanHero } from '../server/wayside-fury/protocol.js';
import { findWalkRoute } from './check-wayside-fury-collision.mjs';
const dt=1/60;
const ticks=(s,n,input={})=>{for(let f=0;f<n;f++)step(s,{...idleInput(),...input},dt);};
const use=(s,id)=>{const t=spaceTargets(s).find(t=>t.id===id);assert.ok(t,id);s.x=t.x;s.y=t.y;interact(s,t);};
function ready(id='you') {const s=newGame();s.party=[id];s.active=id;s.bosses.push('blast-watcher');assert.ok(enterCampaignMap(s,'space-launch'));return s;}
assert.equal(OVERWORLD.width,1920);assert.equal(OVERWORLD.height,960);
assert.equal(MOON_WORLDS.length,9);assert.equal(new Set(MOON_WORLDS.map(w=>w.id)).size,9);
for(const world of [LAUNCH_WORLD,...MOON_WORLDS]) {
 assert.ok(!isBlocked(world,world.spawn.x,world.spawn.y),world.id);
 for(const door of world.exits) {const dest=getMap(door.targetMapId);assert.ok(dest);assert.ok(!isBlocked(dest,door.entryX,door.entryY),`${world.id} -> ${dest.id}`);}
 for(const link of world.boundLinks??[]) for(const pad of [link.from,link.to]) assert.ok(!isBlocked(world,pad.x,pad.y,7),link.id);
 const s=ready();s.campaignMilestones.push('moon-departed');enterScene(s,'dungeon',0,world.id);
 // Ability gates never require a particular living/equipped hero.
 if(s.room===4&&world.id.startsWith('moon')) {use(s,'moon-basalt');use(s,'moon-bridge');}
 const terrain=lunarWorld(s);
 for(const target of spaceTargets(s)) {assert.ok(!isBlocked(terrain,target.x,target.y,7),`${world.id}/${target.id} interaction point`);assert.ok(findWalkRoute(terrain,terrain.spawn,target).length);}
 for(const door of world.exits) assert.ok(findWalkRoute(terrain,terrain.spawn,{x:Math.max(24,Math.min(world.width-24,door.x+door.w/2)),y:Math.max(24,Math.min(world.height-24,door.y+door.h/2))}).length,`${world.id}/${door.id}`);
}
const fresh=newGame();assert.equal(canEnter(fresh,'space'),false);fresh.clearedRooms.push('realm-0');assert.equal(canEnter(fresh,'space'),true);
for(const hero of HERO_IDS) {
 const s=ready(hero),before=progressReport(s).score;use(s,'space-board');assert.equal(s.film,null);
 use(s,'space-fuel');const solves=s.solvedInteractions.length;use(s,'space-fuel');assert.equal(s.solvedInteractions.length,solves);
 use(s,'space-lockers');assert.equal(s.film.id,'space-suitup');ticks(s,61,{guard:true});assert.ok(s.spaceOutfit);assert.equal(s.mapId,'space-launch');
 use(s,'space-board');assert.equal(s.film.id,'space-outbound');const departure=makeSave(s,null);assert.equal(departure.checkpointMapId,'moon-m01');assert.equal(restoreSave(departure).mapId,'moon-m01');
 ticks(s,61,{guard:true});assert.equal(s.mapId,'moon-m01');assert.equal(s.oxygen,100);assert.ok(s.campaignMilestones.includes('comet-bound'));
 use(s,'space-home');ticks(s,61,{guard:true});assert.equal(s.mapId,'space-launch');assert.equal(s.spaceOutfit,false);assert.ok(!s.campaignMilestones.includes('space-complete'));
 assert.equal(progressReport(s).score,before,'space film adds no tickets');
 use(s,'space-lockers');ticks(s,61,{guard:true});use(s,'space-board');assert.equal(s.film.id,'space-revisit');ticks(s,61,{guard:true});
 enterScene(s,'dungeon',2,moonId(2));use(s,'moon-radio');assert.ok(s.solvedInteractions.includes('moon-shack-lift'));
 enterScene(s,'dungeon',4,moonId(4));use(s,'moon-bridge');assert.ok(!s.solvedInteractions.includes('moon-bridge'));use(s,'moon-basalt');use(s,'moon-bridge');assert.ok(s.solvedInteractions.includes('moon-bridge'));
 assert.equal(lunarWorld(s).props.filter(p=>p.kind==='seal').length,0);
 // Boss clear/receipt transaction is covered independently by combat assertions below.
 s.bosses.push('moon-apogee-warden');enterScene(s,'dungeon',8,moonId(8));use(s,'moon-lens');s.dialogue=null;
 const lensSave=makeSave(s,null);assert.ok(lensSave.campaignMilestones.includes('prism-lens'));assert.equal(restoreSave(lensSave).mapId,'moon-m09');
 const candy=s.candy;use(s,'moon-lens');assert.equal(s.candy,candy);s.dialogue=null;enterScene(s,'dungeon',0,moonId(0));use(s,'space-home');
 const returnSave=makeSave(s,null);assert.equal(restoreSave(returnSave).mapId,'space-launch');assert.ok(restoreSave(returnSave).campaignMilestones.includes('space-complete'));
 ticks(s,61,{guard:true});assert.equal(s.chapter,4);assert.ok(s.campaignMilestones.includes('space-complete'));assert.equal(s.spaceOutfit,false);
}
for(const [id,shots] of Object.entries(SPACE_FILMS)) {
 assert.equal(filmDuration(id),id==='space-suitup'?12:id==='space-outbound'?50:id==='space-return'?20:5);
 for(const shot of shots) assert.ok(shot.caption.length>10);
 let start=0;for(const shot of shots) {assert.equal(sampleSpaceFilm(id,start+.01).shot.id,shot.id);start+=shot.duration;}
 const watched=ready(),skipped=ready();startSpaceFilm(watched,id);startSpaceFilm(skipped,id);ticks(watched,Math.ceil(filmDuration(id)/dt)+1);ticks(skipped,61,{guard:true});
 for(const key of ['mapId','chapter','campaignMilestones','completedCinematics','spaceOutfit','candy'])assert.deepEqual(watched[key],skipped[key],`${id} watch/skip ${key}`);
}
const air=ready();air.campaignMilestones.push('moon-departed');enterScene(air,'dungeon',1,moonId(1));air.x=400;air.y=220;const hp=activeHero(air).hp;
 for(let n=0;n<11000;n++)tickLunar(air,dt);assert.equal(air.oxygen,0);assert.equal(activeHero(air).hp,hp);assert.match(air.notice,/Reserve air/);
 air.x=MOON_WORLDS[1].props.find(p=>p.kind==='air').x+12;air.y=MOON_WORLDS[1].props.find(p=>p.kind==='air').y+42;for(let n=0;n<120;n++)tickLunar(air,dt);assert.ok(air.oxygen>99);
 air.oxygen=20;air.dialogue={speaker:'Radio',lines:['hello'],index:0};tickLunar(air,1);assert.equal(air.oxygen,20);air.dialogue=null;air.localPaused=true;tickLunar(air,1);assert.equal(air.oxygen,20);air.localPaused=false;
 const link=MOON_WORLDS[1].boundLinks[0];air.x=link.from.x;air.y=link.from.y;air.faceX=1;air.faceY=0;assert.ok(tryBoundLink(air));for(let n=0;n<24;n++)advanceBoundLink(air,dt);assert.ok(Math.abs(air.x-link.to.x)<.01);
 air.boundTimer=.3;air.dashTimer=.1;ticks(air,1,{guard:true});assert.equal(air.boundTimer,0);assert.equal(air.dashTimer,0);
 const dash=ready();dash.campaignMilestones.push('moon-departed');enterScene(dash,'dungeon',0,moonId(0));dash.x=300;dash.y=250;ticks(dash,1,{dash:true});const inv=activeHero(dash).invulnerable;assert.equal(inv,.23);assert.ok(dash.boundTimer>.23);ticks(dash,15);assert.equal(activeHero(dash).invulnerable,0);assert.ok(dash.boundTimer>0);
// Each behavior produces a distinct deterministic trace, bosses ignore hit-stun loops.
const traces=[];
for(const world of MOON_WORLDS.filter(w=>w.spawns.length)) {
 const s=ready();s.campaignMilestones.push('moon-departed');enterScene(s,'dungeon',0,world.id);
 for(const e of s.enemies) {
  const trace=[];const api={move:(body,dx,dy)=>{body.x+=dx;body.y+=dy;trace.push('move');},shot:()=>trace.push('shot'),hurt:()=>trace.push('hurt'),targets:()=>[{x:e.x+48,y:e.y,hero:activeHero(s),seat:0,guard:false,dashTimer:0}]};
  for(let n=0;n<240;n++) {e.cooldown=Math.max(0,e.cooldown-dt);updateLunarEnemy(s,e,dt,api.targets()[0],api);}
  assert.ok(trace.length,`${e.behavior} acts`);traces.push(e.behavior);
  if(e.kind==='boss') {
    for(let n=0;n<5;n++)lunarDamage(s,e,10,80);assert.ok(e.burst>0,'poise causes break-out burst');
    e.hp=e.maxHp*.49;updateLunarEnemy(s,e,dt,api.targets()[0],api);assert.equal(e.phase,2);
    if(e.behavior==='warden') {e.burst=0;assert.ok(lunarDamage(s,e,100,0)<10);for(let n=0;n<3;n++)s.solvedInteractions.push(`moon-m08-pylon-${n}`);e.burst=0;updateLunarEnemy(s,e,dt,api.targets()[0],api);assert.ok(e.exposed>5.9 && e.exposed<=6);assert.ok(e.shieldBroken);assert.equal(lunarDamage(s,e,100,0),100);}
  }
 }
}
assert.deepEqual([...new Set(traces)].sort(),['echo','inspector','rat','satellite','scout','walker','warden']);
const boss=ready();boss.campaignMilestones.push('moon-departed');boss.coop={role:'host',seat:0,remoteHeroes:[],appliedHits:[],playerCount:4,protocolVersion:COOP_PROTOCOL_VERSION};enterScene(boss,'dungeon',7,moonId(7));const e=boss.enemies.find(e=>e.behavior==='warden');
assert.ok(e.maxHp>e.baseMaxHp*3);const hit={type:'coop-hit',enemyId:e.id,damage:10,dx:1,dy:0,force:100,attackId:'a'};assert.ok(applyCoopHit(boss,hit,1));assert.equal(applyCoopHit(boss,hit,1),false);
const solo=ready();solo.coop={role:'host',seat:0,remoteHeroes:[],appliedHits:[],protocolVersion:2};assert.equal(enterCampaignMap(solo,'space-launch'),false);
assert.equal(compatibleMap('dungeon',0,'moon-m01',1),false);assert.equal(compatibleMap('dungeon',0,'moon-m01',2),false);assert.ok(compatibleMap('dungeon',0,'moon-m01',3));
assert.equal(CHAPTER_REWARDS.reduce((n,r)=>n+r.tickets,0),3550,'only allowlisted Chapter 1 ticket budget');
const filmParty=ready();filmParty.coop={role:'host',seat:0,remoteHeroes:[{filmSkip:false,filmHold:false}],appliedHits:[],playerCount:2};startSpaceFilm(filmParty,'space-outbound');ticks(filmParty,61,{guard:true});assert.ok(filmParty.film);filmParty.coop.remoteHeroes=[];filmParty.coop.playerCount=1;ticks(filmParty,1,{guard:true});assert.equal(filmParty.film,null,'disconnect removes skip vote');
const holding=ready();startSpaceFilm(holding,'space-outbound');ticks(holding,60,{ki:true});assert.equal(holding.film.elapsed,0);
// New fields are validated rather than silently stripped by the relay.
assert.equal(cleanWorld({film:{id:'bad',elapsed:1}}),null);
assert.equal(cleanHero({hero:createHero('you'),scene:'dungeon',room:0,mapId:'moon-m01',x:64,y:192,faceX:1,faceY:0,attackTimer:0,combo:0,charge:0,dashTimer:0,moving:false,guard:false,filmSkip:true,spaceOutfit:true,boundTimer:.2}).filmSkip,true);
// Checkpoint interactions on combat routes preserve the last safe authored rest.
const checkpoint=ready();checkpoint.campaignMilestones.push('moon-departed');enterScene(checkpoint,'dungeon',2,moonId(2));enterScene(checkpoint,'dungeon',4,moonId(4));use(checkpoint,'moon-basalt');assert.equal(makeSave(checkpoint,null).checkpointMapId,'moon-m03');assert.equal(restoreSave(makeSave(checkpoint,null)).mapId,'moon-m03');
const retry=ready();retry.campaignMilestones.push('moon-departed');retry.coop={role:'host',seat:0,remoteHeroes:[],appliedHits:[],worldSolvedInteractions:['moon-m08-pylon-0']};enterScene(retry,'dungeon',7,moonId(7));assert.deepEqual(retry.coop.worldSolvedInteractions,[]);
const brake=ready();brake.campaignMilestones.push('moon-departed');enterScene(brake,'dungeon',1,moonId(1));brake.x=link.from.x;brake.y=link.from.y;brake.faceX=1;brake.faceY=0;assert.ok(tryBoundLink(brake));advanceBoundLink(brake,.2);brakeBound(brake);assert.ok(!isBlocked(MOON_WORLDS[1],brake.x,brake.y));assert.equal(brake.x,link.from.x);
const guest=ready();applyCoopReward(guest,{id:'space-test-checkpoint',kind:'checkpoint',campaignMilestones:['moon-departed'],solvedInteractions:['moon-radio'],completedCinematics:['space-outbound']});const guestSave=makeSave(guest,null);assert.ok(guestSave.solvedInteractions.includes('moon-radio'));assert.ok(guestSave.completedCinematics.includes('space-outbound'));
const oldHome=makeSave(ready(),null,true);const lunarRetry=ready();lunarRetry.character={level:7,xp:0};for(const id of HERO_IDS)lunarRetry.heroes[id]=createHero(id,lunarRetry.character);lunarRetry.campaignMilestones.push('moon-departed');enterScene(lunarRetry,'dungeon',5,moonId(5));const retryData=makeSave(lunarRetry,oldHome);assert.equal(restoreSave(retryData,true).character.level,7);assert.equal(restoreSave(retryData,true).mapId,'moon-m06');
assert.match(sampleSpaceFilm('space-return',18,false).shot.caption,/lunar relay is waiting/);
console.log('Chapter 3: nine-room graph, five heroes, ability gates, watch/skip/reload, reserve air, safe bounds, distinct lunar AI, boss poise/pylons, party scaling, protocol fencing and zero ticket inflation pass.');
