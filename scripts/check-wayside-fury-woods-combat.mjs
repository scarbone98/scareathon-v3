import assert from 'node:assert/strict';
import {newGame,createHero,enterCampaignMap,step,idleInput,interact,hostileWithinMeleeReach,activeHero,enterScene,applyCoopHit,applyCoopDamage,reviveCoopHero} from '../src/pages/WaysideFury/game/sim.ts';
import {woodsTargets,woodsInteract} from '../src/pages/WaysideFury/game/chapters/ch2.ts';
import {COOP_PROTOCOL_VERSION} from '../server/shared/waysideFury/campaign.js';
import {fieldWorld} from '../src/pages/WaysideFury/game/fieldAbilities.ts';
import {findWalkRoute} from './check-wayside-fury-collision.mjs';
const timings=[];
for(const players of [1,4]) {
 const s=newGame(7);s.character={level:7,xp:0};for(const id of Object.keys(s.heroes))s.heroes[id]=createHero(id,s.character,s.gear);
 s.party=['you','joe'];s.clearedRooms.push('realm-0');s.bosses.push('blast-watcher');s.campaignMilestones.push('breaker-knuckle','circuit-spark');
 if(players===4)s.coop={role:'host',seat:0,remoteHeroes:[],appliedHits:[],playerCount:4,protocolVersion:COOP_PROTOCOL_VERSION};
 for(const mapId of ['woods-ranger-gate','woods-lantern-walk','woods-pump-house','woods-conveyor-yard','woods-mirror-sawmill','woods-heartwood-engine','woods-lunch-shed']) {
  assert.ok(enterCampaignMap(s,mapId));s.dialogue=null;
  if(mapId==='woods-ranger-gate')woodsInteract(s,'woods-ranger-seal');
  // The bridge puzzle is separately exercised with held Ki by the Woods rule check.
  if(mapId==='woods-pump-house')s.solvedInteractions.push('woods-pump-bridge');
  const guests=players===4?['matt','alex','jon'].map((id,index)=>{const g=newGame(index+20);g.character={level:7,xp:0};for(const hero of Object.keys(g.heroes))g.heroes[hero]=createHero(hero,g.character,g.gear);g.active=id;g.party=[id];g.campaignMilestones=[...s.campaignMilestones];g.clearedRooms=['realm-0'];g.coop={role:'guest',seat:index+1,remoteHeroes:[],appliedHits:[],playerCount:4,protocolVersion:COOP_PROTOCOL_VERSION};enterScene(g,'dungeon',s.room,mapId);return g;}):[];
  const peer=g=>({seat:g.coop.seat,userId:`bot-${g.coop.seat}`,name:g.active,hero:structuredClone(activeHero(g)),x:g.x,y:g.y,faceX:g.faceX,faceY:g.faceY,moving:g.moving,guard:g.guard,attackTimer:g.attackTimer,combo:g.combo,charge:g.charge,dashTimer:g.dashTimer,scene:g.scene,room:g.room,mapId:g.mapId,downed:activeHero(g).hp<=0,interact:g.previousInput.interact});
  let frames=0,routeTarget=null,route=[];
  for(;s.enemies.length&&s.scene!=='dead'&&frames<36000;frames++) {
   for(const g of guests){
    const down=[s,...guests].find(a=>a!==g&&activeHero(a).hp<=0);
    if(down&&activeHero(g).hp>0){const dx=down.x-g.x,dy=down.y-g.y,len=Math.max(1,Math.hypot(dx,dy));step(g,{...idleInput(),x:len<28?0:dx/len,y:len<28?0:dy/len,interact:true,guard:true},1/60);continue;}
    g.enemies=s.enemies;g.solvedInteractions=[...s.solvedInteractions];g.coop.worldSolvedInteractions=[...s.solvedInteractions];
    const mobs=s.enemies.filter(e=>e.hp>0);if(!mobs.length)break;const aim=mobs.reduce((a,b)=>Math.hypot(a.x-g.x,a.y-g.y)<Math.hypot(b.x-g.x,b.y-g.y)?a:b),dx=aim.x-g.x,dy=aim.y-g.y,len=Math.max(1,Math.hypot(dx,dy)),cycle=(frames+g.coop.seat*20)%240,ki=cycle<80,attack=!ki&&frames%20===0&&hostileWithinMeleeReach(g),dash=cycle===110;
    const tell=s.enemies.find(e=>e.kind==='boss'&&e.windup>0&&(g.x-e.x)*e.aimX+(g.y-e.y)*e.aimY>0&&Math.abs((g.x-e.x)*e.aimY-(g.y-e.y)*e.aimX)<32);
    step(g,{...idleInput(),x:tell?-tell.aimY:dx/len,y:tell?tell.aimX:dy/len,ki:ki&&!tell,attack:attack&&!tell,dash:dash||!!tell,guard:!!tell||!ki&&!attack&&!dash},1/60);
    for(const event of g.events)if(event.type==='coop-hit')applyCoopHit(s,{...event,attackId:`guest-${g.coop.seat}:${event.attackId}`},g.coop.seat);
   }
   if(s.coop)s.coop.remoteHeroes=guests.map(peer);
   const boss=s.enemies.find(e=>e.woodsBehavior==='foreman'&&e.phase===2&&!e.shieldBroken);
   const anchors=boss?woodsTargets(s):[];
   const candidates=anchors.length?anchors:s.enemies;
   const target=candidates.reduce((a,b)=>Math.hypot(a.x-s.x,a.y-s.y)<Math.hypot(b.x-s.x,b.y-s.y)?a:b);
   const dist=Math.hypot(target.x-s.x,target.y-s.y),cycle=frames%240;
   if(anchors.length&&dist<30&&target.id.endsWith('-broken')) {interact(s,target);continue;}
   // Approach anchor sockets around their solid housings, like a player would.
   if(anchors.length&&routeTarget!==target.id) {routeTarget=target.id;route=findWalkRoute(fieldWorld(s),s,target);assert.ok(route.length,`${mapId}: ${target.id} route`);}
   while(route.length&&Math.hypot(route[0].x-s.x,route[0].y-s.y)<12)route.shift();
   const waypoint=anchors.length&&dist>=30&&route.length?route[0]:target;
   const dx=waypoint.x-s.x,dy=waypoint.y-s.y,len=Math.max(1,Math.hypot(dx,dy));
   const powering=anchors.length&&target.id.endsWith('-powered')&&dist<30;
   const ki=powering&&!(boss.windup>0||boss.burst>0)||!anchors.length&&cycle<80,attack=!ki&&frames%20===0&&hostileWithinMeleeReach(s),dash=!anchors.length&&cycle===110,swap=cycle===190;
   step(s,{...idleInput(),x:powering?0:dx/len,y:powering?0:dy/len,ki,attack,dash,swap,guard:!ki&&!attack&&!dash&&!anchors.length},1/60);
   for(const event of s.events){const g=guests.find(g=>g.coop.seat===event.seat);if(event.type==='coop-damage'&&g)applyCoopDamage(g,event.damage,event.sourceX,event.sourceY);if(event.type==='coop-revive'&&g)reviveCoopHero(g);}
  }
  const record={players,mapId,seconds:Math.round(frames/60),hp:Math.round(activeHero(s).hp)};timings.push(record);console.log(record);
  assert.notEqual(s.scene,'dead',`${mapId} wipe`);assert.equal(s.enemies.length,0,`${mapId} clear`);
  for(const h of Object.values(s.heroes)){h.hp=h.maxHp;h.ki=h.maxKi;h.stamina=h.maxStamina;}
 }
}
console.log(`Woods combat: ${timings.length} post-Chapter-1 starter-gear encounters clear using movement, guard, dash, combo, Ki, tag and boss assists.`);
