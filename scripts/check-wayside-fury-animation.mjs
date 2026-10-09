import assert from 'node:assert/strict';
import { ActorAnimator, facingFor } from '../src/pages/WaysideFury/game/animation.ts';
import { revealCount, storyRevealed, PROLOGUE_FADE } from '../src/pages/WaysideFury/game/prologue.ts';
import { newGame, enterScene, advanceStory, requestPrologueSkip, step, idleInput } from '../src/pages/WaysideFury/game/sim.ts';
import { PROLOGUE } from '../src/pages/WaysideFury/game/content.ts';

const animator = new ActorAnimator();
assert.deepEqual([facingFor(1,0),facingFor(-1,0),facingFor(0,1),facingFor(0,-1)], ['right','left','down','up']);
animator.sample('slow',0,0,1/60); animator.sample('fast',0,0,1/60);
const slow = animator.sample('slow',1,0,1/60), fast = animator.sample('fast',2,0,1/60);
assert.equal(fast.phase, slow.phase*2, 'stride follows actual distance');
assert.equal(fast.speed, slow.speed*2);
const stopped = animator.sample('slow',1,0,1/60);
assert.equal(stopped.phase,slow.phase); assert.equal(stopped.speed,0,'blocked movement idles');
assert.equal(animator.sample('slow',900,0,1/60).phase, stopped.phase, 'teleport does not sprint');
assert.equal(animator.sample('fast',2,0,0).phase, fast.phase, 'pause freezes stride');
const state = newGame();
const copy = animator.present(state,1/60); assert.notEqual(copy,state); assert.equal(state.motion,undefined);
enterScene(state,'hub'); assert.equal(animator.present(state,1/60).motion.phase,0,'map resets history');
for (let i=0;i<PROLOGUE.length;i++) {
  const s=newGame(); enterScene(s,'prologue'); s.cutscene=i;
  assert.equal(storyRevealed(s),false); advanceStory(s);
  assert.equal(s.cutscene,i,'first press reveals'); assert.equal(storyRevealed(s),true);
  requestPrologueSkip(s); requestPrologueSkip(s);
  assert.equal(s.prologueExit,0,'skip is idempotent during fade');
  for(let f=0;f<Math.ceil(PROLOGUE_FADE*60)+2;f++)step(s,{...idleInput(),interact:true},1/60);
  assert.equal(s.scene,'overworld',`skip from beat ${i}`);
  assert.equal(s.overlay,null,'held confirm does not enter a stop');
}
assert.equal(revealCount('Hello!',0),0); assert.equal(revealCount('Hello!',10),6);
assert.ok(revealCount('a...b',.7)<revealCount('abcde',.7),'punctuation rests');
const guest=newGame();enterScene(guest,'prologue');guest.coop={role:'guest',seat:1,remoteHeroes:[],appliedHits:[]};
requestPrologueSkip(guest); assert.equal(guest.prologueExit,undefined,'host owns shared transition');
console.log('Animation cadence, pause/teleport handling, all 12 skips, reveal and host authority passed.');
