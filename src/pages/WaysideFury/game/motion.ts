import type { GameState } from './sim.ts';

interface Position { x: number; y: number }
export interface MotionSnapshot extends Position {
  scene: GameState['scene'];
  room: number;
  active: GameState['active'];
  time: number;
  enemies: Map<number, Position>;
  projectiles: Map<number, Position>;
}

export function captureMotion(state: GameState): MotionSnapshot {
  return {
    scene: state.scene, room: state.room, active: state.active,
    x: state.x, y: state.y, time: state.time,
    enemies: new Map(state.enemies.map(actor => [actor.id, { x: actor.x, y: actor.y }])),
    projectiles: new Map(state.projectiles.map(actor => [actor.id, { x: actor.x, y: actor.y }])),
  };
}

// Interpolation is a disposable presentation copy. Never feed it back into
// simulation, saves or events. New actors and scene/party changes appear directly.
export function interpolateMotion(previous: MotionSnapshot | null, state: GameState, alpha: number): GameState {
  if (!previous || previous.scene !== state.scene || previous.room !== state.room || previous.active !== state.active) return state;
  alpha = Math.max(0, Math.min(1, alpha));
  const position = (from: Position | undefined, to: Position) => from
    ? { x: from.x + (to.x - from.x) * alpha, y: from.y + (to.y - from.y) * alpha }
    : { x: to.x, y: to.y };
  return {
    ...state, ...position(previous, state), time: previous.time + (state.time - previous.time) * alpha,
    enemies: state.enemies.map(actor => ({ ...actor, ...position(previous.enemies.get(actor.id), actor) })),
    projectiles: state.projectiles.map(actor => ({ ...actor, ...position(previous.projectiles.get(actor.id), actor) })),
  };
}
