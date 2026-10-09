import assert from 'node:assert/strict';
import { newGame, enterScene, addEnemy } from '../src/pages/WaysideFury/game/sim.ts';
import { getWorld } from '../src/pages/WaysideFury/game/world.ts';
import { minimapAvailable, minimapLayout, resolveMapObjective } from '../src/pages/WaysideFury/game/minimap.ts';
import { overlaps } from '../src/pages/WaysideFury/game/worldBuilder.ts';
const fixture=(s,id)=>{enterScene(s,id==='hub'?'hub':'dungeon',0,id);s.enemies=[];s.dialogue=null;};
const s=newGame();enterScene(s,'overworld');
const nightVisitor=addEnemy(s,'grunt',512,410);nightVisitor.nightAmbient=true;
assert.ok(minimapAvailable(s),'harmless night visitors keep the county map available');
addEnemy(s,'grunt',560,410);assert.ok(!minimapAvailable(s),'hostile encounters still lock the county map');s.enemies=[];
const objective=()=>resolveMapObjective(s,getWorld(s.scene,s.room,s.mapId));
for(const [chapter,receipt,id] of [[1,null,'blast'],[2,'realm-0','forest'],[3,'woods-complete','space'],[4,'space-complete','city'],[5,'city-complete','wayside']]) {
  s.chapter=chapter;if(receipt)s.campaignMilestones.push(receipt);assert.equal(objective().id,id);assert.ok(minimapAvailable(s));
}
enterScene(s,'hub');assert.equal(objective().id,'station');
s.campaignMilestones=[];fixture(s,'woods-layby');assert.equal(objective().id,'woods-ghost');s.campaignMilestones.push('breaker-knuckle');assert.notEqual(objective().id,'woods-ghost');
fixture(s,'space-launch');assert.equal(objective().id,'space-fuel');s.solvedInteractions.push('space-fuel');assert.equal(objective().id,'space-lockers');s.spaceOutfit=true;assert.equal(objective().id,'space-board');
fixture(s,'city-boulevard');assert.equal(objective().id,'city-anchor-0');s.solvedInteractions.push('city-anchor-0');assert.ok(!objective().id.includes('anchor'));
fixture(s,'city-market');assert.equal(objective().name,'Clockroof Walk');s.campaignMilestones.push('city-complete');assert.equal(objective().name,'Blackout Boulevard');s.campaignMilestones=[];
s.coop={role:'guest',worldCampaignMilestones:['woods-complete'],worldSolvedInteractions:['space-fuel']};enterScene(s,'overworld');assert.equal(objective().id,'space');
for(const mapId of ['hub','woods-layby','space-launch','city-boulevard','city-market']) {fixture(s,mapId);assert.ok(minimapAvailable(s),mapId);s.dialogue={speaker:'Test',index:0,lines:['Test']};assert.ok(!minimapAvailable(s));s.dialogue=null;}
fixture(s,'city-boulevard');for(const scene of ['dead','prologue','shift','results','realm']) {s.scene=scene;assert.ok(!minimapAvailable(s),scene);}
for(const id of ['blast-1','moon-m01','city-ticket-hall','woods-pump-house']) {fixture(s,id);assert.ok(!minimapAvailable(s),id);}
for(const [w,h,obstacles] of [[390,844,[{x:0,y:0,w:390,h:64},{x:8,y:74,w:374,h:70},{x:0,y:650,w:390,h:194}]], [844,390,[{x:12,y:12,w:480,h:56},{x:508,y:12,w:324,h:64},{x:0,y:226,w:250,h:164},{x:610,y:210,w:234,h:180}]], [1440,900,[{x:12,y:12,w:480,h:60},{x:1084,y:12,w:340,h:72}]]]) {
  const box=minimapLayout(w,h,obstacles);assert.ok(box.w>=72&&box.w<=112);assert.ok(box.x>=12&&box.y>=12&&box.x+box.w<=w-12&&box.y+box.h<=h-12);assert.ok(obstacles.every(o=>!overlaps(box,o)),`${w}x${h}`);
}
assert.equal(minimapLayout(390,844,[{x:0,y:0,w:390,h:844}]).w,0,'hide the corner map when HUD fills every safe slot');
assert.ok(minimapLayout(1440,900,[],12,78).y>=78,'desktop stays below the HUD row');
console.log('Minimap: chapters 1–5, crew tools, launch checklist, city anchors, co-op receipts, visibility and responsive clearance pass.');
