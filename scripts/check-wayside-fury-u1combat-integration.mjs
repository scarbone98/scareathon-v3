import assert from 'node:assert/strict';
import { newGame, enterScene, idleInput, step, addEnemy, createHero } from '../src/pages/WaysideFury/game/sim.ts';
import { requestFusion, tickFusion, localFusion } from '../src/pages/WaysideFury/game/u1/combat/fusion.ts';
import { makeSave, restoreSave, progressReport, makeNewGameSave } from '../src/pages/WaysideFury/game/save.ts';
import { mergeSaves } from '../src/pages/WaysideFury/game/cloud.ts';
import { cleanHero, cleanWorld } from '../server/wayside-fury/protocol.js';
import { cleanFusionWorld } from '../server/shared/waysideFury/u1Fusion.js';
const frame = (s, input = {}) => step(s, { ...idleInput(), ...input }, 1 / 60);
const full = s => { for (const h of Object.values(s.heroes)) h.ki = h.maxKi; };
const peer = (s, mapId = s.mapId) => ({seat:1, userId:'peer', name:'Peer', hero:structuredClone(s.heroes.joe), x:s.x+10,y:s.y,faceX:1,faceY:0,moving:false,guard:false,attackTimer:0,combo:0,charge:0,dashTimer:0,scene:s.scene,room:s.room,mapId,fusionIntent:1.25,fusionSpecial:0});
{
 const s=newGame();full(s);s.coop={role:'host',seat:0,remoteHeroes:[peer(s,'city-gate')],appliedHits:[]};
 requestFusion(s);tickFusion(s,.01);assert.equal(localFusion(s),undefined,'same room number in another map cannot fuse');
 s.coop.remoteHeroes[0].mapId=s.mapId;tickFusion(s,.01);assert.ok(localFusion(s));
 s.mapId='city-gate';tickFusion(s,.01);assert.equal(localFusion(s),undefined,'map changes end fusion');
 const packet=peer(newGame());assert.ok(cleanHero(packet));packet.fusionIntent=99;assert.equal(cleanHero(packet),null);
 packet.fusionIntent=1;packet.fusionSpecial=-1;assert.equal(cleanHero(packet),null);
}
{
 const s=newGame();full(s);requestFusion(s);const world=structuredClone(s.fusion.world);
 assert.deepEqual(cleanFusionWorld(world),world);world.forms[0].mapId='../bad';assert.equal(cleanFusionWorld(world),null);
 const packet={...s,protocolVersion:6,projectiles:[],fusions:s.fusion.world,worldCycleSeconds:300,nightEncounterWindow:'night:2'};assert.ok(cleanWorld(packet),'co-op accepts fusion and world-clock state together');packet.fusions={nextId:0};assert.equal(cleanWorld(packet),null);
}
{
 const s=newGame();enterScene(s,'hub');const old=makeSave(s);delete old.u1;
 assert.equal(restoreSave(old).u1.combat.training.you,0,'old saves start untrained');
 s.worldCycleSeconds=300;s.u1.combat.training.you=3;const trained=makeSave(s);
 assert.equal(trained.worldCycleSeconds,300);assert.equal(restoreSave(trained).worldCycleSeconds,300);
 assert.equal(restoreSave(trained,true).worldCycleSeconds,300,'HOME retry preserves clock alongside combat progress');const stale={...old,savedAt:trained.savedAt+100};
 assert.equal(mergeSaves(trained,stale).u1.combat.training.you,3,'stale cloud save cannot erase tiers');
 assert.equal(restoreSave(trained,true).u1.combat.training.you,3,'HOME retry retains earned tiers');
 const reset=makeNewGameSave(trained);assert.equal(mergeSaves(trained,reset).u1.combat.training.you,0,'new story clears training');
 assert.equal(progressReport(s,trained.lastReported).score,progressReport(restoreSave(old),old.lastReported).score,'tiers do not inflate rewards');
}
// Production volleys must respect scaled HP and the existing boss poise path.
for(const level of [1,15,50]) for(const trained of [false,true]) {
 const s=newGame();s.character={level,xp:0};for(const id of Object.keys(s.heroes))s.heroes[id]=createHero(id,s.character);
 s.enemies=[];s.x=100;s.y=100;s.faceX=1;s.faceY=0;
 const target=addEnemy(s,'grunt',125,100);target.speed=0;target.cooldown=100;
 if(trained)s.u1.combat.training.you=3;else{full(s);assert.ok(requestFusion(s));}
 full(s);frame(s,{ki:true});frame(s);for(let n=0;n<12;n++)frame(s);
 assert.ok(target.hp>0&&target.hp<target.maxHp,`level ${level} ${trained?'mastered signature':'fusion'} hurts but never one-shots a fresh enemy`);
 assert.ok(target.combatLevel>=level,'encounter scales to the party');
}
{
 const s=newGame();s.enemies=[];s.x=100;s.y=100;s.faceX=1;s.faceY=0;const boss=addEnemy(s,'boss',125,100);boss.speed=0;boss.cooldown=100;
 full(s);requestFusion(s);frame(s,{ki:true});frame(s);for(let n=0;n<12;n++)frame(s);
 assert.ok(boss.hp>0);assert.ok(boss.poise>0,'fusion damage enters existing boss poise rules');
}
{
 const {startTraining,TRAINING_BOARD}=await import('../src/pages/WaysideFury/game/u1/combat/training.ts');
 const s=newGame();enterScene(s,'hub');s.coop={role:'host',seat:0,remoteHeroes:[],appliedHits:[]};
 s.x=TRAINING_BOARD.x;s.y=TRAINING_BOARD.y;assert.ok(startTraining(s));
 s.projectiles.push({id:99,x:320,y:400,vx:100,vy:0,owner:'hero',hero:'you',damage:10,radius:4,ttl:3,beam:false,hits:[]});
 const before=s.training.elapsed;s.localPaused=true;for(let n=0;n<120;n++)frame(s);
 assert.equal(s.training.elapsed,before,'local co-op pause freezes the personal course');
 assert.equal(s.projectiles[0].x,320,'personal practice shots freeze with the course');
 assert.ok(s.time>0,'shared simulation clock continues');
}

{
 const s=newGame();s.enemies=[];full(s);s.coop={role:'host',seat:0,remoteHeroes:[peer(s)],appliedHits:[],playerCount:2};
 assert.ok(requestFusion(s));s.heroes.you.hp=1;s.coop.remoteHeroes[0].hero.hp=1;
 for(const target of [s,s.coop.remoteHeroes[0]])s.projectiles.push({id:s.nextId++,x:target.x,y:target.y,vx:0,vy:0,owner:'enemy',damage:9999,radius:4,ttl:1,beam:false,hits:[]});
 frame(s);assert.equal(s.scene,'dead');assert.equal(s.fusion.world.forms.length,0,'same-tick co-op wipe ends fusion before publishing the dead world');
 assert.ok(cleanWorld({...s,protocolVersion:6,projectiles:[],fusions:s.fusion.world}),'terminal snapshot remains relayable');
}
console.log('U1 combat integration: map identity, bounded packets, additive saves, no reward inflation, scaled HP and boss poise pass.');
