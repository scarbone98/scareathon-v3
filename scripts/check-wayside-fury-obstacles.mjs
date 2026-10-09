// Adapted from Update 1 U3's obstacle regression suite: actual geometry and saves.
import assert from 'node:assert/strict';
import {newGame,enterCampaignMap,interact,step,idleInput,exitCoop} from '../src/pages/WaysideFury/game/sim.ts';
import {getWorld,isBlocked,distanceToExit} from '../src/pages/WaysideFury/game/world.ts';
import {makeSave,restoreSave,parseSave,progressReport} from '../src/pages/WaysideFury/game/save.ts';
import {HERO_OBSTACLES,obstaclesForState,obstacleBlocks,isObstacleCleared,requirementMet,clearHeroObstacle,lockedGateAnchors,markSeenGates} from '../src/pages/WaysideFury/game/locks/obstacles.ts';
const ready=()=>{const s=newGame();s.clearedRooms=['realm-0'];s.campaignMilestones=['woods-complete','space-complete','moon-departed'];return s;};
function atGate(g) {const s=ready();assert.ok(enterCampaignMap(s,g.worldId));s.enemies=[];s.x=g.x+g.w/2;s.y=g.y+g.h+(s.scene==='overworld'?10:7)+3;s.faceX=0;s.faceY=-1;s.transitionCooldown=10;return s;}
function fulfill(s,g) {if(g.requirement.kind==='level')s.character.level=g.requirement.level;else if(g.requirement.kind==='hero')s.unlockedHeroes.push(g.hero);else s.campaignMilestones.push(g.requirement.milestone);}
// Flood actual maps at body radius; segment samples prevent thin-wall tunneling.
function reach(s, pocket) {
 const world=getWorld(s.scene,s.room,s.mapId),radius=s.scene==='overworld'?10:7,grid=8,cols=Math.floor(world.width/grid)+1,rows=Math.floor(world.height/grid)+1;
 const seen=new Uint8Array(cols*rows),occupancy=new Int8Array(cols*rows),queue=[];occupancy.fill(-1);
 const blocked=(x,y)=>pocket && (x<pocket.walls[0].x-20||x>pocket.walls[0].x+92||y<pocket.walls[0].y-20||y>pocket.y+pocket.h+24) || isBlocked(world,x,y,radius)||obstacleBlocks(s,x,y,radius);
 const free=(x,y)=>{const k=y*cols+x;if(occupancy[k]<0)occupancy[k]=blocked(x*grid,y*grid)?0:1;return occupancy[k]===1;};
 const sx=Math.round(s.x/grid),sy=Math.round(s.y/grid);assert.ok(free(sx,sy),`${world.id}: approach/spawn free`);queue.push([sx,sy]);seen[sy*cols+sx]=1;
 for(let n=0;n<queue.length;n++){const [x,y]=queue[n];for(const [dx,dy]of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,ny=y+dy,k=ny*cols+nx;
  if(nx<0||ny<0||nx>=cols||ny>=rows||seen[k]||!free(nx,ny)||[2,4,6].some(d=>blocked(x*grid+dx*d,y*grid+dy*d)))continue;
  seen[k]=1;queue.push([nx,ny]);
 }}return predicate=>queue.some(([x,y])=>predicate(x*grid,y*grid));
}
assert.ok(HERO_OBSTACLES.every(g=>g.requirement.kind!=='level'),'authored gates teach abilities rather than checking level numbers');
assert.equal(new Set(HERO_OBSTACLES.map(g=>g.id)).size,HERO_OBSTACLES.length);
for(const g of HERO_OBSTACLES){
 const s=atGate(g);s.campaignMilestones=[];s.unlockedHeroes=['you'];s.character.level=1;
 assert.equal(requirementMet(s,g),false,`${g.id}: unmet requirement`);
 assert.equal(clearHeroObstacle(s,g.id),false);assert.equal(isObstacleCleared(s,g.id),false);
 assert.ok(obstacleBlocks(s,g.x+g.w/2,g.y+g.h/2));
 markSeenGates(s);assert.ok(lockedGateAnchors(s).some(a=>a.id===g.id));
 const local={...s,x:s.x,y:s.y};const canReach=reach(local, g);assert.equal(canReach((x,y)=>Math.hypot(x-g.rewardAnchor.x,y-g.rewardAnchor.y)<20),false,`${g.id}: closed pocket cannot be bypassed`);
 fulfill(s,g);assert.ok(requirementMet(s,g));s.unlockedHeroes=['you','joe','matt','alex','jon'];s.active='you';s.party=['you'];if(g.hero!=='you')s.heroes[g.hero].hp=0;
 const receipt=progressReport(s).receipt;
 assert.ok(clearHeroObstacle(s,g.id),`${g.id}: crew-wide permission works with benched/downed hero`);assert.equal(clearHeroObstacle(s,g.id),false);
 assert.equal(lockedGateAnchors(s).some(a=>a.id===g.id),false);
 assert.equal(progressReport(s,receipt).score,0,'clear is not a ticket award');
 assert.ok(reach(s,g)((x,y)=>Math.hypot(x-g.rewardAnchor.x,y-g.rewardAnchor.y)<20),`${g.id}: opened pocket reachable`);
 const saved=makeSave(s,null,true);assert.ok(saved);assert.ok(isObstacleCleared(restoreSave(saved),g.id));assert.ok(isObstacleCleared(restoreSave(saved,true),g.id));
 s.effects=[];s.x=g.rewardAnchor.x;s.y=g.rewardAnchor.y;const candy=s.candy;interact(s);
 assert.equal(s.candy,candy+12);assert.equal(progressReport(s,receipt).score,100,'allowlisted first-clear cache');
 s.dialogue=null;interact(s);if(g.worldId.startsWith('moon-'))assert.equal(s.film?.id,'space-return','Moon shortcut preserves return film');else assert.equal(s.mapId,'hub','cache provides return shortcut');assert.equal(s.candy,candy+12);
 assert.equal(progressReport(s,progressReport(s).receipt).score,0,'no replay ticket inflation');
 const old={...saved,version:3};assert.deepEqual(parseSave(old).solvedInteractions,[],'explicit v3 migration starts with closed gates');
 const noField={...saved};delete noField.solvedInteractions;assert.deepEqual(parseSave(noField).solvedInteractions,[],'older v4 without receipts is additive');
 const far=atGate(g);fulfill(far,g);far.x+=100;assert.equal(clearHeroObstacle(far,g.id),false,'remote inspection cannot clear');
}
for(const worldId of new Set(HERO_OBSTACLES.map(g=>g.worldId))){
 const s=ready();enterCampaignMap(s,worldId);const world=getWorld(s.scene,s.room,s.mapId);s.x=world.spawn.x;s.y=world.spawn.y;
 const reachable=reach(s);
 for(const exit of world.exits)assert.ok(reachable((x,y)=>distanceToExit(exit,x,y)<25),`${worldId}/${exit.id}: all optional gates closed, story exit reachable`);
 for(const spawn of world.spawns)assert.ok(reachable((x,y)=>Math.hypot(x-spawn.x,y-spawn.y)<24),`${worldId}: encounter reachable`);
}
const g=HERO_OBSTACLES[0],movement=atGate(g);for(let n=0;n<60;n++)step(movement,{...idleInput(),y:-1},1/60);assert.ok(movement.y>=g.y+g.h+10-.1,'live movement collides with gate');
movement.campaignMilestones.push('circuit-spark');assert.ok(clearHeroObstacle(movement,g.id));for(let n=0;n<30;n++)step(movement,{...idleInput(),y:-1},1/60);assert.ok(movement.y<g.y,'live movement crosses cleared gate');
const guest=atGate(g);guest.character.level=8;guest.coop={role:'guest',seat:1,protocolVersion:7,remoteHeroes:[],appliedHits:[],worldSolvedInteractions:[g.id]};guest.x=g.rewardAnchor.x;guest.y=g.rewardAnchor.y;
assert.equal(clearHeroObstacle(guest,g.id),false,'guest cannot mutate geometry');exitCoop(guest);assert.equal(isObstacleCleared(guest,g.id),false);assert.equal(obstacleBlocks(guest,guest.x,guest.y,10),false,'borrowed pocket exit remains safe');assert.ok(guest.y>g.y+g.h);
const legacy=atGate(g);legacy.coop={role:'host',seat:0,protocolVersion:6,remoteHeroes:[],appliedHits:[]};assert.deepEqual(obstaclesForState(legacy),[],'older clients retain matching geometry');
const unknown=ready();unknown.clearedRooms.push('locks-cache-invented');assert.equal(progressReport(unknown,{...progressReport(unknown).receipt,rooms:['realm-0']}).score,0,'unknown reward IDs pay nothing');
console.log(`Obstacles: ${HERO_OBSTACLES.length} pockets; requirements, collision, clear persistence, migrations, first-clear rewards, closed-gate critical paths and legacy co-op pass.`);
