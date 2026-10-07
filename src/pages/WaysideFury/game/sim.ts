// Pure fixed-step game rules. World coordinates are pixels at 320 x 180.
export const WIDTH = 320;
export const HEIGHT = 180;
export type HeroId = "joe" | "matt";
export interface Input {
  x: number; y: number; attack: boolean; ki: boolean; dash: boolean;
  guard: boolean; swap: boolean; interact: boolean;
}
export const idleInput = (): Input => ({ x: 0, y: 0, attack: false, ki: false, dash: false, guard: false, swap: false, interact: false });
export interface GameState {
  x: number; y: number; faceX: number; faceY: number; moving: boolean;
  active: HeroId; time: number;
}
export function newGame(): GameState {
  return { x: 100, y: 110, faceX: 1, faceY: 0, moving: false, active: "joe", time: 0 };
}
export function step(s: GameState, input: Input, dt: number): void {
  s.time += dt;
  const length = Math.hypot(input.x, input.y);
  s.moving = length > 0.1;
  if (s.moving) {
    s.faceX = input.x / Math.max(1, length);
    s.faceY = input.y / Math.max(1, length);
    s.x = Math.max(18, Math.min(WIDTH - 18, s.x + s.faceX * 65 * dt));
    s.y = Math.max(48, Math.min(HEIGHT - 18, s.y + s.faceY * 65 * dt));
  }
}
