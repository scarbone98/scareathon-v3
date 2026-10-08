// Post-Chapter-1 level-7 fixture, starter gear; combat uses ordinary controls.
import assert from 'node:assert/strict';
import {newGame,createHero,enterScene,step,idleInput,interact,hostileWithinMeleeReach,activeHero} from '../src/pages/WaysideFury/game/sim.ts';
import {moonId} from '../src/pages/WaysideFury/game/chapters/ch3Worlds.ts';
import {spaceTargets} from '../src/pages/WaysideFury/game/chapters/ch3.ts';
import {lunarWorld} from '../src/pages/WaysideFury/game/lunar.ts';
import {findWalkRoute} from './check-wayside-fury-collision.mjs';
const s=newGame(7);s.character={level:7,xp:0};for(const id of Object.keys(s.heroes))s.heroes[id]=createHero(id,s.character,s.gear);s.party=['you','joe'];s.campaignMilestones.push('moon-departed');
for(const room of [1,3,4,5,6,7]) {
 enterScene(s,'dungeon',room,moonId(room));
 if(room===4) {for(const id of ['moon-basalt','moon-bridge']) {const t=spaceTargets(s).find(t=>t.id===id);s.x=t.x;s.y=t.y;interact(s,t);}s.x=64;s.y=192;}
 let frames=0,route=[],key='';
 for(;s.enemies.length&&s.scene!=='dead'&&frames<36000;frames++) {
  const w=lunarWorld(s),warden=s.enemies.find(e=>e.behavior==='warden'&&e.phase===2&&!e.shieldBroken);
  const pylons=warden?spaceTargets(s).filter(t=>t.id.startsWith('moon-m08-pylon-')):[];
  const target=(pylons.length?pylons:s.enemies).reduce((a,b)=>Math.hypot(a.x-s.x,a.y-s.y)<Math.hypot(b.x-s.x,b.y-s.y)?a:b);
  if(pylons.length&&Math.hypot(target.x-s.x,target.y-s.y)<32) {interact(s,target);route=[];continue;}
  if(!route.length||key!==target.id||frames%30===0) {route=findWalkRoute(w,s,target);key=target.id;}
  while(route.length>1&&Math.hypot(route[0].x-s.x,route[0].y-s.y)<3)route.shift();
  const dest=route[0]??target,dx=dest.x-s.x,dy=dest.y-s.y,length=Math.max(1,Math.hypot(dx,dy)),cycle=frames%240;
  const ki=!pylons.length&&cycle<80,attack=!ki&&frames%20===0&&hostileWithinMeleeReach(s),dash=cycle===110,swap=cycle===190;
  step(s,{...idleInput(),x:dx/length,y:dy/length,ki,attack,dash,swap,guard:!ki&&!attack&&!dash},1/60);
 }
 console.log(room,Math.round(frames/60),s.scene,s.enemies.map(e=>[e.behavior,Math.round(e.hp)]),'hp',Math.round(activeHero(s).hp));
 assert.notEqual(s.scene,'dead');assert.equal(s.enemies.length,0);
}
