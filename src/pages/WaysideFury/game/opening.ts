import { activeHero, addEnemy, enterScene, type GameState, type HeroId } from './sim.ts';
// Padding keeps the normal gameplay follow/clamp clear of the practice lane.
export const COURSE = { x: 256, y: 240, target: 242 } as const;
export const OPENING_DONE = 'guided-opening-complete';
export const OPENING_SKIPPED = 'guided-opening-skipped';
export const OPENING_STEPS = ['Walk right to the zombie.', 'Defeat the zombie to clear the path.', 'Dash right across the gap.', 'Stand in the ring and block the zombie’s slow swing.', 'Fire Ki right at the imp beyond the fence.', 'Swap to your partner to open the gate.'];
export const OPENING_ACTIONS = ['right', 'attack', 'dash', 'guard', 'ki', 'swap'] as const;
export interface Opening { stage: number; elapsed: number; beat: number; lead: HeroId; original: HeroId; hits: number; lastSwing: number; targetId?: number; returnState?: GameState; vitals: Record<HeroId, { hp: number; ki: number; stamina: number }>; }
export function startOpening(s: GameState, replay = false) {
  if (s.opening || s.coop || !replay && (s.campaignMilestones.includes(OPENING_DONE) || s.campaignMilestones.includes(OPENING_SKIPPED))) return;
  const returnState = replay ? structuredClone({ ...s, opening: undefined, openingChoice: false }) : undefined;
  s.openingChoice = false;
  const vitals = Object.fromEntries(Object.entries(s.heroes).map(([id,h]) => [id,{ hp:h.hp, ki:h.ki, stamina:h.stamina }])) as Opening['vitals'];
  if (!s.campaignMilestones.includes('guided-opening-started')) s.campaignMilestones.push('guided-opening-started');
  enterScene(s, 'test'); s.enemies = []; s.opening = { stage: 0, elapsed: 0, beat: 0, lead: s.active, original: s.active, hits: 0, lastSwing: -1, vitals, returnState };
  s.x = COURSE.x + 55; s.y = COURSE.y + 110; activeHero(s).ki = activeHero(s).maxKi; s.notice = '';
  spawnTarget(s, 100, 'grunt');
  s.events.push({ type: 'checkpoint', id: 'guided-opening-started' });
}
export function finishOpening(s: GameState, skipped = false) {
  const opening = s.opening; if (!opening) return;
  if (opening.returnState) { Object.assign(s, opening.returnState); s.events = []; return; }
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
  let x = s.x - COURSE.x, y = s.y - COURSE.y;
  let done = false;
  if (o.stage <= 2 && x > 112 && x < 143 && s.dashTimer <= 0) { x = 105; s.vx = 0; }
  if (o.stage <= 1) x = Math.min(x, 98);
  // The whole lesson stays in one bounded lane.
  x = Math.max(40, Math.min(294, x));
  y = Math.max(98, Math.min(122, y));
  if (o.stage === 3) x = Math.min(x, 178);
  if (o.stage === 0) done = Math.hypot(x - 90, y - 110) < 16;
  if (o.stage === 1) {
    x = Math.min(x, 98);
    done = !s.enemies.some(e => e.id === o.targetId && e.hp > 0);
  }
  if (o.stage === 2) done = x >= 143;
  if (o.stage === 3) {
    done = o.hits >= 1;
    if (!s.enemies.some(e => e.id === o.targetId && e.hp > 0) && !done) spawnTarget(s, 189, 'grunt');
  }
  if (o.stage === 4) {
    x = Math.min(x, 205);
    done = !s.enemies.some(e => e.id === o.targetId && e.hp > 0);
    if (activeHero(s).ki < 8) activeHero(s).ki = 8;
  }
  if (o.stage === 5) done = s.active !== o.lead;
  s.x = x + COURSE.x; s.y = y + COURSE.y;
  if (done) { o.stage++; o.beat = 0; o.hits = 0; if (o.stage === 3) spawnTarget(s, 189, 'grunt'); if (o.stage === 4) { s.enemies = []; spawnTarget(s, COURSE.target, 'shooter'); } if (o.stage === 5) o.lead = s.active; s.notice = ''; if (o.stage === 6) finishOpening(s); }
}
export function openingInstruction(o: Opening) { return OPENING_STEPS[o.stage]; }
export function drawOpening(c: CanvasRenderingContext2D, s: GameState) {
  const o = s.opening; if (!o) return;
  c.save(); c.translate(COURSE.x, COURSE.y); c.lineWidth = 2;
  // A single lane, with the completed path bright and the next action outlined.
  c.fillStyle = '#172b35'; c.fillRect(32, 70, 264, 66);
  c.strokeStyle = '#b7c7b5'; c.strokeRect(32, 70, 264, 66);
  c.fillStyle = '#6b867c'; c.fillRect(40, 105, 248, 8);
  for (const x of [60, 154, 198, 252, 288]) {
    c.strokeStyle = '#dce7ce'; c.beginPath(); c.moveTo(x-4,105); c.lineTo(x,109); c.lineTo(x-4,113); c.stroke();
  }
  const anchors = [90,100,126,168,COURSE.target,284];
  c.strokeStyle = '#fff2cb'; c.strokeRect(anchors[o.stage]-14,76,28,52);
  c.fillStyle = '#071522'; c.fillRect(112,72,28,62);
  c.strokeStyle = '#dce7ce'; c.setLineDash([4,3]); c.strokeRect(112,72,28,62); c.setLineDash([]);
  c.beginPath(); c.arc(168,110,12,0,Math.PI*2); c.stroke();
  c.strokeStyle = '#b7c7b5'; c.beginPath(); c.moveTo(213,72); c.lineTo(213,134); c.stroke();
  if (o.stage === 5) { c.strokeStyle = '#fff2cb'; c.strokeRect(280,88,8,40); }
  c.restore();
}

function spawnTarget(s: GameState, x: number, kind: 'grunt' | 'shooter') {
  const e = addEnemy(s, kind, COURSE.x + x, COURSE.y + 110); e.hp = e.maxHp = kind === 'shooter' ? 3 : 6; e.speed = 0; e.cooldown = 1.2;
  s.opening!.targetId = e.id;
}
