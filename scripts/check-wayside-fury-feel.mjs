import assert from 'node:assert/strict';
import {newGame,enterScene,idleInput,step,addEnemy,applyCoopHit} from '../src/pages/WaysideFury/game/sim.ts';
import {getWorld} from '../src/pages/WaysideFury/game/world.ts';
import {onRoad,roadPoints,networkPaint} from '../src/pages/WaysideFury/game/roadNetwork.ts';
import {chapterGoal} from '../src/pages/WaysideFury/game/pacing.ts';
const s=newGame();enterScene(s,'overworld');const w=getWorld(s.scene,s.room,s.mapId);
let bumps=0;
for(const [x,y] of [[1,0],[0,-1],[-1,0],[0,1],[1,1]])for(let n=0;n<240;n++) {
 step(s,{...idleInput(),x,y,dash:true},1/60);
 assert.ok(onRoad(w,s.x,s.y,-19),'entire cab stays inside asphalt');
 bumps+=s.events.filter(e=>e.type==='curb-bump').length;
}
assert.ok(bumps>0,'curb contact produces feedback');
const road={x:0,y:0,w:200,h:100,direction:'horizontal',curveWidth:60,curve:[{x:0,y:0},{x:100,y:0},{x:100,y:100}],start:'entrance',end:'entrance'};
const points=roadPoints(road);assert.ok(points.length>3);assert.ok(points.some(p=>p.x<100&&p.y>0),'bend is filleted');
const paint=networkPaint({roads:[road],props:[],width:200,height:200});assert.ok(paint.some(p=>p.a.x<100&&p.a.y>0),'lane paint follows bend');
for(const force of [55,120]) {
 const c=newGame();c.enemies=[];c.coop={role:'host',seat:0,remoteHeroes:[],appliedHits:[]};const e=addEnemy(c,'grunt',140,100);
 applyCoopHit(c,{enemyId:e.id,attackId:'feel',damage:4,dx:1,dy:0,force},1);
 assert.ok(c.hitStop>=.04&&c.hitStop<=.08);assert.ok(e.hitTimer>=.16);
 let frozen=0;while(c.hitStop>0&&frozen<10){step(c,idleInput(),1/60);frozen++;}
 assert.ok(frozen/60>=.04&&frozen/60<=.08,'actual fixed-tick freeze stays within 40–80ms');
}
const goal=chapterGoal(newGame());assert.equal(goal.chapter,1);assert.equal(goal.value,0);assert.ok(goal.next.includes('Woods'));
const cleared=newGame();cleared.clearedRooms.push('realm-0');assert.equal(chapterGoal(cleared).chapter,2);
console.log('Feel: taxi footprint/curb feedback, filleted pavement/paint, light/heavy impact and chapter unlocks pass.');

for(const id of ['blast-2','blast-6','blast-8','blast-9']) {
 const zone=newGame();enterScene(zone,'dungeon',0,id);
 const baseline=getWorld(zone.scene,zone.room,zone.mapId).spawns.length;
 assert.ok(zone.enemies.length>baseline&&zone.enemies.length<=8,`${id}: bounded density increase`);
 zone.clearedRooms.push(id);enterScene(zone,'dungeon',0,id);assert.equal(zone.enemies.length,0,'cleared rooms stay cleared');
}

const oldSave=newGame();enterScene(oldSave,'overworld');oldSave.x=500;oldSave.y=450;
step(oldSave,idleInput(),1/60);assert.ok(onRoad(getWorld(oldSave.scene,oldSave.room,oldSave.mapId),oldSave.x,oldSave.y,-19),'old curb-position save recovers');
