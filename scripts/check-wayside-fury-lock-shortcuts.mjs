import assert from 'node:assert/strict';
import {newGame,enterCampaignMap,interact,step,idleInput} from '../src/pages/WaysideFury/game/sim.ts';
import {HERO_OBSTACLES,clearHeroObstacle} from '../src/pages/WaysideFury/game/locks/obstacles.ts';
import {makeSave,restoreSave,progressReport} from '../src/pages/WaysideFury/game/save.ts';
for(const lens of [false,true]) {
 const s=newGame();s.clearedRooms=['realm-0'];s.campaignMilestones=['woods-complete','moon-departed',...(lens?['prism-lens']:[])];
 assert.ok(enterCampaignMap(s,'moon-m01'));s.enemies=[];
 const g=HERO_OBSTACLES.find(g=>g.id==='locks-moon-nav');s.x=g.x+g.w/2;s.y=g.y+g.h+10;assert.ok(clearHeroObstacle(s,g.id));
 const before=progressReport(s).receipt;s.x=g.rewardAnchor.x;s.y=g.rewardAnchor.y;interact(s);s.dialogue=null;interact(s);
 assert.equal(s.film.id,'space-return');assert.equal(s.checkpointMapId,'space-launch');
 const restored=restoreSave(makeSave(s,null));assert.equal(restored.mapId,'space-launch');assert.equal(restored.spaceOutfit,false);
 assert.equal(restored.campaignMilestones.includes('space-complete'),lens,'save during shortcut reconciles the existing flight checkpoint');
 for(let n=0;n<100&&s.film;n++)step(s,{...idleInput(),guard:true},.05);
 assert.equal(s.film,null);assert.equal(s.mapId,'space-launch');assert.equal(s.spaceOutfit,false);
 assert.equal(s.campaignMilestones.includes('space-complete'),lens,'shortcut never awards lens completion early');
 assert.equal(progressReport(s,before).score,100,'flight creates no extra ticket award');
}
console.log('Gate shortcuts: Moon return film, lens/no-lens progression, mid-flight save reconciliation, Earth suit transition and no duplicate tickets pass.');
