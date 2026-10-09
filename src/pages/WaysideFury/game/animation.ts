import type { GameState } from './sim.ts';
import { roadsideBirds } from './dressing.ts';

export interface ActorMotion {
  phase: number; speed: number; facing: 'down' | 'up' | 'left' | 'right';
}
export const idleMotion = (facing: ActorMotion['facing'] = 'down'): ActorMotion => ({ phase: 0, speed: 0, facing });
export function facingFor(x: number, y: number): ActorMotion['facing'] {
  return Math.abs(x) > Math.abs(y) ? x < 0 ? 'left' : 'right' : y < 0 ? 'up' : 'down';
}

// Presentation only: integrate distance, not wall-clock time. Walls stop feet,
// analog movement slows them, and teleports/scene changes never create a stride.
export class ActorAnimator {
  private actors = new Map<string, { x: number; y: number; motion: ActorMotion }>();
  private map = '';
  reset() { this.actors.clear(); this.map = ''; }
  sample(key: string, x: number, y: number, dt: number, fx = 0, fy = 1): ActorMotion {
    const previous = this.actors.get(key);
    const dx = previous ? x - previous.x : 0, dy = previous ? y - previous.y : 0;
    const distance = Math.hypot(dx, dy);
    const travel = dt > 0 && distance < Math.max(24, dt * 600) ? distance : 0;
    const motion: ActorMotion = {
      phase: ((previous?.motion.phase ?? 0) + travel / 24 * Math.PI * 2) % (Math.PI * 2),
      speed: dt > 0 ? travel / dt : previous?.motion.speed ?? 0,
      facing: travel > .01 ? facingFor(dx, dy) : previous?.motion.facing ?? facingFor(fx, fy),
    };
    this.actors.set(key, { x, y, motion });
    return motion;
  }
  present(s: GameState, dt: number): GameState {
    const map = `${s.scene}:${s.mapId}:${s.room}:${s.active}`;
    if (map !== this.map) { this.reset(); this.map = map; }
    const birds = s.scene === 'overworld' ? roadsideBirds(s) : [];
    const live = new Set(['local', ...s.enemies.map(e => `enemy-${e.id}`), ...(s.coop?.remoteHeroes ?? []).map(p => `peer-${p.seat}`), ...birds.map((_, i) => `bird-${i}`)]);
    for (const key of this.actors.keys()) if (!live.has(key)) this.actors.delete(key);
    return { ...s, motion: this.sample('local', s.x, s.y, dt, s.faceX, s.faceY),
      ambientBirds: birds.map((bird, i) => {
        const motion = this.sample(`bird-${i}`, bird.x, bird.y, dt);
        return { ...bird, wing: motion.speed > 1 ? Math.sin(motion.phase * 2) * 3 : bird.wing };
      }),
      enemies: s.enemies.map(e => ({ ...e, motion: this.sample(`enemy-${e.id}`, e.x, e.y, dt, e.aimX, e.aimY) })),
      coop: s.coop ? { ...s.coop, remoteHeroes: s.coop.remoteHeroes.map(p => ({ ...p, motion: this.sample(`peer-${p.seat}`, p.x, p.y, dt, p.faceX, p.faceY) })) } : undefined,
    };
  }
}

// Apply after drawing the contact shadow and before the combat windup. This
// leaves hitboxes, telegraphs, health bars and interaction positions untouched.
export function creatureMotion(c: CanvasRenderingContext2D, motion: ActorMotion | undefined, time: number, x = 0, y = 0, floating = false) {
  const p = motion ?? idleMotion();
  const moving = p.speed > 1, wave = Math.sin(moving ? p.phase : time * 2.4);
  c.translate(x, y);
  c.translate(0, floating ? -wave * 1.6 : moving ? -Math.abs(wave) * 1.5 : -wave * .3);
  c.scale(1 + wave * .025, 1 - wave * .025);
  c.translate(-x, -y);
}
