import type { HeroId } from './save.js';
export const FUSION_DURATION: 12;
export const FUSION_COOLDOWN: 30;
export const FUSION_INTENT: 1.25;
export const FUSION_RANGE: 32;
export interface FusionForm {
  id: number; mode: 'solo' | 'coop'; seats: [number, number]; heroes: [HeroId, HeroId];
  scene: 'test' | 'dungeon' | 'realm' | 'arena'; room: number; mapId?: string; remaining: number; specialUsed: boolean;
}
export interface FusionWorld { nextId: number; forms: FusionForm[]; cooldowns: Record<number, number> }
export function createFusionWorld(): FusionWorld;
export function cleanFusionWorld(raw: unknown): FusionWorld | null;
export function elapsedFusionWorld(raw: unknown, elapsedSeconds: number): FusionWorld | null;
