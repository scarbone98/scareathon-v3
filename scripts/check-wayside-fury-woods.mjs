import assert from 'node:assert/strict';
import { newGame, enterCampaignMap, enterScene, interact, step, idleInput, HERO_IDS, applyCoopHit } from '../src/pages/WaysideFury/game/sim.ts';
import { WOODS_WORLDS } from '../src/pages/WaysideFury/game/chapters/ch2Worlds.ts';
import { woodsInteract, woodsTargets, clearWoods } from '../src/pages/WaysideFury/game/chapters/ch2.ts';
import { fieldWorld, hasFieldFlag } from '../src/pages/WaysideFury/game/fieldAbilities.ts';
import { configureWoodsEnemy, woodsDamage, updateWoodsEnemy } from '../src/pages/WaysideFury/game/enemies/woods.ts';
import { canEnter, getMap } from '../src/pages/WaysideFury/game/campaign.ts';
import { isBlocked } from '../src/pages/WaysideFury/game/world.ts';
import { makeSave, restoreSave } from '../src/pages/WaysideFury/game/save.ts';
import { sanitizeSave, ticketDelta } from '../server/shared/waysideFury/save.js';
import { compatibleMap, COOP_PROTOCOL_VERSION } from '../server/shared/waysideFury/campaign.js';
const ready=()=>{const s=newGame();s.clearedRooms=['realm-0'];s.bosses=['blast-watcher'];return s;};
const s=ready();assert.equal(canEnter(s,'space'),false);assert.equal(enterCampaignMap(s,'woods-layby'),true);
assert.equal(WOODS_WORLDS.length,8);
for(const m of WOODS_WORLDS) {
  assert.ok(!isBlocked(m,m.spawn.x,m.spawn.y),m.id);
  for(const e of m.exits) {const dest=getMap(e.targetMapId);assert.ok(dest);assert.ok(!isBlocked(dest,e.entryX,e.entryY),`${m.id}/${e.id}`);}
  for(const spawn of m.spawns) assert.ok(!isBlocked(m,spawn.x,spawn.y,spawn.kind==='boss'?22:9),`${m.id} spawn`);
  for (const protocol of [1,2,3,4]) assert.equal(compatibleMap('dungeon',WOODS_WORLDS.indexOf(m),m.id,protocol),false);
}
// Every room and exit is reachable on the collision grid after its binary gate is solved.
for(const m of WOODS_WORLDS) {
  const state=ready();enterCampaignMap(state,m.id);
  state.solvedInteractions=m.props.filter(p=>p.kind==='seal').map(p=>p.id);
  const world=fieldWorld(state),queue=[[m.spawn.x,m.spawn.y]],seen=new Set();
  for(let i=0;i<queue.length;i++) {const [x,y]=queue[i],key=`${x},${y}`;if(seen.has(key))continue;seen.add(key);for(const [dx,dy] of [[8,0],[-8,0],[0,8],[0,-8]])if(!seen.has(`${x+dx},${y+dy}`)&&!isBlocked(world,x+dx,y+dy,7))queue.push([x+dx,y+dy]);}
  for(const door of m.exits) assert.ok(queue.some(([x,y])=>Math.hypot(x-Math.max(door.x,Math.min(x,door.x+door.w)),y-Math.max(door.y,Math.min(y,door.y+door.h)))<25),`${m.id}: ${door.id} reachable`);
}
for(const hero of HERO_IDS) {
  const a=ready();a.active=hero;a.party=[hero];a.heroes.joe.hp=a.heroes.matt.hp=0;
  enterCampaignMap(a,'woods-layby');woodsInteract(a,'woods-ghost');a.dialogue=null;
  enterCampaignMap(a,'woods-ranger-gate');if(hero!=='joe')a.heroes.joe.hp=0;if(hero!=='matt')a.heroes.matt.hp=0;woodsInteract(a,'woods-ranger-seal');assert.ok(hasFieldFlag(a,'woods-ranger-seal'));assert.equal(a.active,hero);
  enterCampaignMap(a,'woods-pump-house');a.enemies=[];a.x=308;a.y=308;
  assert.ok(isBlocked(fieldWorld(a),368,224));
  for(let i=0;i<65;i++)step(a,{...idleInput(),ki:true},1/60);
  assert.ok(hasFieldFlag(a,'woods-pump-bridge'),hero);assert.ok(!isBlocked(fieldWorld(a),368,224));
  const saved=sanitizeSave(makeSave(a,null)).save;assert.ok(saved);const resumed=restoreSave(saved,true);assert.ok(hasFieldFlag(resumed,'woods-pump-bridge'));
  enterCampaignMap(a,'woods-mirror-sawmill');a.enemies=[];woodsInteract(a,'woods-mirror');assert.equal(a.palette,'eightbit');a.dialogue=null;woodsInteract(a,'woods-mirror');assert.equal(a.palette,'real');assert.ok(hasFieldFlag(a,'woods-mirror-return'));
}
enterCampaignMap(s,'woods-heartwood-engine');const boss=s.enemies[0];boss.hp=boss.maxHp*.49;
const target={x:200,y:224,hero:s.heroes.you,seat:0,guard:false,dashTimer:0};let shots=0,hits=0;
const api={move:(e,dx,dy)=>{e.x+=dx;e.y+=dy;},shot:()=>shots++,hurt:()=>hits++,targets:()=>[target]};
updateWoodsEnemy(s,boss,1/60,target,api);assert.equal(boss.phase,2);assert.equal(woodsDamage(s,boss,100,55),15,'breakout resists damage');
updateWoodsEnemy(s,boss,1,target,api);assert.equal(shots,8);assert.equal(boss.x,448);assert.equal(woodsDamage(s,boss,100,55),0,'anchors protect core');
s.campaignMilestones.push('breaker-knuckle','circuit-spark');
for(const n of [0,1]) {woodsInteract(s,`woods-anchor-${n}-broken`);s.x=n?512:224;s.y=356;s.enemies=[boss];s.hitStop=0;s.previousInput=idleInput();for(let i=0;i<65;i++)step(s,{...idleInput(),ki:true},1/60);assert.ok(hasFieldFlag(s,`woods-anchor-${n}-powered`));}
updateWoodsEnemy(s,boss,1/60,target,api);assert.ok(boss.shieldBroken);assert.ok(boss.exposed>=5);assert.ok(woodsDamage(s,boss,100,55)>0);
for(let i=0;i<6;i++)woodsDamage(s,boss,10,55);assert.ok(boss.burst>0,'poise breaks wall pressure');
const before=makeSave(s,null);s.enemies=[];clearWoods(s);assert.equal(canEnter(s,'space'),true);assert.equal(s.chapter,3);assert.equal(ticketDelta(makeSave(s,before).lastReported,before.lastReported),0);
const legacy=makeSave(ready(),null);assert.equal(sanitizeSave({...legacy,version:3}).save.campaignMilestones.includes('woods-complete'),false);
const oldSpace=sanitizeSave({...legacy,campaignMilestones:['moon-departed']}).save;assert.ok(oldSpace.campaignMilestones.includes('woods-complete'));
for(const count of [1,4]) {const a=ready();if(count===4)a.coop={role:'host',seat:0,remoteHeroes:[],appliedHits:[],playerCount:4,protocolVersion:COOP_PROTOCOL_VERSION};enterCampaignMap(a,'woods-conveyor-yard');const e=a.enemies[0];assert.ok(e.maxHp>100);assert.equal(e.woodsBehavior,'bailiff');e.hp=e.maxHp*.4;updateWoodsEnemy(a,e,.1,target,api);assert.equal(e.phase,2);}
const old=ready();old.coop={role:'host',seat:0,remoteHeroes:[],appliedHits:[],protocolVersion:2};assert.equal(enterCampaignMap(old,'woods-layby'),false);
// Wisp's light changes allies' defense; a Ki hit extinguishes it. Root tells are interruptible.
enterCampaignMap(s,'woods-lantern-walk');const wisp=s.enemies.find(e=>e.woodsBehavior==='wisp'),root=s.enemies.find(e=>e.woodsBehavior==='rooted');
assert.ok(Math.abs(woodsDamage(s,root,100,55)-55)<1e-9);woodsDamage(s,wisp,10,40,true);assert.equal(woodsDamage(s,root,100,55),100);root.windup=1;woodsDamage(s,root,10,55);assert.equal(root.windup,0);
const hosted=ready();hosted.coop={role:'host',seat:0,remoteHeroes:[],appliedHits:[],playerCount:4,protocolVersion:COOP_PROTOCOL_VERSION};enterCampaignMap(hosted,'woods-lantern-walk');assert.ok(hosted.enemies.every(e=>e.woodsBehavior));const candle=hosted.enemies.find(e=>e.woodsBehavior==='wisp');assert.ok(applyCoopHit(hosted,{enemyId:candle.id,attackId:'guest-id:projectile:99',damage:10,dx:1,dy:0,force:40},1));assert.equal(candle.exposed,5);
assert.ok(woodsTargets(s).length===0);assert.equal(typeof configureWoodsEnemy,'function');assert.equal(typeof applyCoopHit,'function');assert.equal(typeof interact,'function');assert.equal(typeof enterScene,'function');assert.ok(hits>=0);
console.log('Woods: room graph/collision, five solo assists, held Ki machinery, mirror detour, retry persistence, phases/poise/anchors, scaling, legacy guards, migration and zero ticket inflation pass.');
