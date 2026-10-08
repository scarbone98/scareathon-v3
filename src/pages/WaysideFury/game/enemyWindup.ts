import type { Enemy } from './sim.ts';

// Presentation only: the final quarter-second of the existing countdown.
// No aim, target position, attack pattern or simulation state is consulted.
export function enemyWindupTell(enemy: Pick<Enemy, 'hp' | 'windup'>): boolean {
  return enemy.hp > 0 && enemy.windup > 0 && enemy.windup <= .25;
}

// Call inside a saved context, around body art only (feet stay anchored).
export function applyEnemyWindup(c: CanvasRenderingContext2D, enemy: Enemy) {
  if (!enemyWindupTell(enemy)) return;
  c.translate(enemy.x, enemy.y);
  c.scale(1.045, .94);
  c.translate(-enemy.x, -enemy.y);
  c.filter = 'brightness(1.18) sepia(0.18)';
}
