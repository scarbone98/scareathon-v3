import { activeHero, damageHero, enterScene, type GameState, type HeroId } from './sim.ts';
export const OPENING_DONE = 'guided-opening-complete';
export const OPENING_SKIPPED = 'guided-opening-skipped';
export const OPENING_STEPS = ['Move to the marked crate.', 'Tap Attack three times at the crate to practice your combo.', 'Face right and dash across the gap. Walking will not cross it.', 'Stand on the shield mark. Hold Guard when the training post flashes !', 'Face right. Tap and release Ki to hit the far switch across the fence.', 'Swap to your partner to open the two-person gate.'];
export interface Opening { stage: number; elapsed: number; beat: number; lead: HeroId; original: HeroId; hits: number; lastSwing: number; vitals: Record<HeroId, { hp: number; ki: number; stamina: number }>; }
export function startOpening(s: GameState) {
  if (s.coop || s.campaignMilestones.includes(OPENING_DONE) || s.campaignMilestones.includes(OPENING_SKIPPED)) return;
  const vitals = Object.fromEntries(Object.entries(s.heroes).map(([id,h]) => [id,{ hp:h.hp, ki:h.ki, stamina:h.stamina }])) as Opening['vitals'];
  if (!s.campaignMilestones.includes('guided-opening-started')) s.campaignMilestones.push('guided-opening-started');
  enterScene(s, 'test'); s.enemies = []; s.opening = { stage: 0, elapsed: 0, beat: 0, lead: s.active, original: s.active, hits: 0, lastSwing: -1, vitals };
  s.x = 55; s.y = 110; activeHero(s).ki = activeHero(s).maxKi; s.notice = '';
  s.events.push({ type: 'checkpoint', id: 'guided-opening-started' });
}
export function finishOpening(s: GameState, skipped = false) {
  const opening = s.opening; if (!opening) return;
  for (const [id,h] of Object.entries(s.heroes)) Object.assign(h, opening.vitals[id as HeroId]);
  s.active = opening.original; s.opening = undefined;
  const milestone = skipped ? OPENING_SKIPPED : OPENING_DONE;
  if (!s.campaignMilestones.includes(milestone)) s.campaignMilestones.push(milestone);
  enterScene(s, 'overworld'); s.checkpointMapId = 'overworld';
  s.events.push({ type: 'checkpoint', id: milestone });
}
// Runs after the real movement/combat simulation: completion needs the physical
// result of a dash, melee swing, guard timing or projectile, not a button tap.
export function tickOpening(s: GameState, dt: number) {
  const o = s.opening; if (!o) return;
  o.elapsed += dt; o.beat += dt;
  let done = false;
  if (o.stage <= 2 && s.x > 112 && s.x < 143 && s.dashTimer <= 0) { s.x = 105; s.vx = 0; }
  if (o.stage <= 1) s.x = Math.min(s.x, 98);
  if (o.stage <= 2) s.y = Math.max(94, Math.min(126, s.y));
  if (o.stage === 0) done = Math.hypot(s.x - 90, s.y - 110) < 16;
  if (o.stage === 1) {
    s.x = Math.min(s.x, 98);
    const swing = s.effects.find(e => e.kind === 'slash' && e.id !== o.lastSwing);
    if (swing && Math.hypot(s.x - 100, s.y - 110) < 24 && s.faceX > .5) {
      o.lastSwing = swing.id;
      if (o.hits < 3) o.hits++;
      else done = swing.size >= 48;
    }
  }
  if (o.stage === 2) done = s.x >= 143;
  if (o.stage === 3) {
    const onMark = Math.hypot(s.x - 168, s.y - 110) < 20;
    if (o.beat >= 3) { if (onMark && s.guard) o.hits++; done = o.hits >= 3; if (onMark && activeHero(s).hp > 1) damageHero(s, Math.min(activeHero(s).hp - 1, s.guard ? 1 : 8), 189, 110); o.beat = 0; if (!onMark || !s.guard) s.notice = 'The post swings after ! — stand on the shield mark and hold Guard.'; }
  }
  if (o.stage === 4) {
    s.x = Math.min(s.x, 205);
    done = s.projectiles.some(p => p.owner === 'hero' && p.x >= 267 && p.x <= 289 && Math.abs(p.y - 110) < 15);
    if (activeHero(s).ki < 8) activeHero(s).ki = 8;
  }
  if (o.stage === 5) done = s.active !== o.lead;
  if (done) { o.stage++; o.beat = 0; o.hits = 0; if (o.stage === 5) o.lead = s.active; s.notice = ''; if (o.stage === 6) finishOpening(s); }
}
export function openingInstruction(o: Opening) {
  if (o.stage === 1) return o.hits < 3 ? `${OPENING_STEPS[1]} (${o.hits}/3)` : 'Now hold Attack for a second, then release to break the reinforced crate.';
  if (o.stage === 3) return `${OPENING_STEPS[3]} (${o.hits}/3 blocks)`;
  return OPENING_STEPS[o.stage];
}
export function drawOpening(c: CanvasRenderingContext2D, s: GameState) {
  const o = s.opening; if (!o) return;
  c.save(); c.lineWidth = 2; c.font = 'bold 9px sans-serif'; c.textAlign = 'center';
  c.fillStyle = '#102334'; c.fillRect(112, 48, 28, 120);
  c.strokeStyle = '#fff2cb'; c.setLineDash([4, 3]); c.strokeRect(112, 48, 28, 120); c.setLineDash([]);
  c.fillStyle = '#fff2cb'; c.fillText('DASH →', 126, 84);
  if (o.stage <= 1) { c.fillStyle = '#b78045'; c.fillRect(94, 101, 12, 18); c.strokeStyle = '#fff'; c.strokeRect(94,101,12,18); c.beginPath(); c.moveTo(94,101);c.lineTo(106,119);c.moveTo(106,101);c.lineTo(94,119);c.stroke(); }
  c.strokeStyle = '#fff'; c.beginPath(); c.arc(168,110,16,0,Math.PI*2); c.stroke(); c.fillStyle = '#fff'; c.fillText('◇',168,113);
  c.fillStyle = o.stage === 3 && o.beat > 1.8 ? '#fff2cb' : '#78889a'; c.fillRect(185,86,8,18); c.fillText(o.beat > 1.8 ? '!' : 'POST',189,80);
  c.strokeStyle = '#fff'; c.beginPath(); c.moveTo(213,48);c.lineTo(213,168);c.stroke(); c.fillText('KI →',238,84);
  c.strokeRect(268,100,20,20); c.fillText('⊙',278,114); c.fillText('⇄ GATE',278,143);
  c.restore();
}
