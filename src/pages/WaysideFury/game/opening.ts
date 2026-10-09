import { activeHero, damageHero, enterScene, type GameState, type HeroId } from './sim.ts';
export const OPENING_DONE = 'guided-opening-complete';
export const OPENING_SKIPPED = 'guided-opening-skipped';
export const OPENING_STEPS = ['Walk right to the crate.', 'Strike the crate to clear the path.', 'Dash right across the gap.', 'Stand in the ring and block the flashing post.', 'Fire Ki right at the switch beyond the fence.', 'Swap to your partner to open the gate.'];
export const OPENING_ACTIONS = ['right', 'attack', 'dash', 'guard', 'ki', 'swap'] as const;
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
  // The whole lesson stays in one bounded lane.
  s.x = Math.max(40, Math.min(294, s.x));
  s.y = Math.max(98, Math.min(122, s.y));
  if (o.stage === 3) s.x = Math.min(s.x, 178);
  if (o.stage === 0) done = Math.hypot(s.x - 90, s.y - 110) < 16;
  if (o.stage === 1) {
    s.x = Math.min(s.x, 98);
    const swing = s.effects.find(e => e.kind === 'slash' && e.id !== o.lastSwing);
    if (swing && Math.hypot(s.x - 100, s.y - 110) < 24 && s.faceX > .5) {
      o.lastSwing = swing.id;
      done = true;
    }
  }
  if (o.stage === 2) done = s.x >= 143;
  if (o.stage === 3) {
    const onMark = Math.hypot(s.x - 168, s.y - 110) < 20;
    if (o.beat >= 2) { if (onMark && s.guard) o.hits++; done = o.hits >= 1; if (onMark && activeHero(s).hp > 1) damageHero(s, Math.min(activeHero(s).hp - 1, s.guard ? 1 : 8), 189, 110); o.beat = 0; if (!onMark || !s.guard) s.notice = ''; }
  }
  if (o.stage === 4) {
    s.x = Math.min(s.x, 205);
    done = s.projectiles.some(p => p.owner === 'hero' && p.x >= 267 && p.x <= 289 && Math.abs(p.y - 110) < 15);
    if (activeHero(s).ki < 8) activeHero(s).ki = 8;
  }
  if (o.stage === 5) done = s.active !== o.lead;
  if (done) { o.stage++; o.beat = 0; o.hits = 0; if (o.stage === 5) o.lead = s.active; s.notice = ''; if (o.stage === 6) finishOpening(s); }
}
export function openingInstruction(o: Opening) { return OPENING_STEPS[o.stage]; }
export function drawOpening(c: CanvasRenderingContext2D, s: GameState) {
  const o = s.opening; if (!o) return;
  c.save(); c.lineWidth = 2;
  // A single lane, with the completed path bright and the next action outlined.
  c.fillStyle = '#172b35'; c.fillRect(32, 70, 264, 66);
  c.strokeStyle = '#b7c7b5'; c.strokeRect(32, 70, 264, 66);
  c.fillStyle = '#6b867c'; c.fillRect(40, 105, 248, 8);
  for (const x of [60, 154, 198, 252, 288]) {
    c.strokeStyle = '#dce7ce'; c.beginPath(); c.moveTo(x-4,105); c.lineTo(x,109); c.lineTo(x-4,113); c.stroke();
  }
  const anchors = [90,100,126,168,278,284];
  c.strokeStyle = '#fff2cb'; c.strokeRect(anchors[o.stage]-14,76,28,52);
  if (o.stage <= 1) {
    c.fillStyle = '#b78045'; c.fillRect(94,101,12,18); c.strokeStyle = '#fff2cb'; c.strokeRect(94,101,12,18);
    c.beginPath(); c.moveTo(94,101); c.lineTo(106,119); c.moveTo(106,101); c.lineTo(94,119); c.stroke();
  }
  c.fillStyle = '#071522'; c.fillRect(112,72,28,62);
  c.strokeStyle = '#dce7ce'; c.setLineDash([4,3]); c.strokeRect(112,72,28,62); c.setLineDash([]);
  c.beginPath(); c.arc(168,110,12,0,Math.PI*2); c.stroke();
  const flashing = o.stage === 3 && o.beat > 1.2;
  c.fillStyle = flashing ? '#fff2cb' : '#78889a'; c.fillRect(185,86,8,18);
  if (flashing) { c.font = 'bold 12px sans-serif'; c.textAlign = 'center'; c.fillText('!',189,81); }
  c.strokeStyle = '#b7c7b5'; c.beginPath(); c.moveTo(213,72); c.lineTo(213,134); c.stroke();
  c.fillStyle = o.stage >= 5 ? '#afd990' : '#78889a'; c.fillRect(271,101,14,18);
  if (o.stage === 5) { c.strokeStyle = '#fff2cb'; c.strokeRect(280,88,8,40); }
  c.restore();
}
