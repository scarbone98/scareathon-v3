import type { HeroId } from "./save.js";
export type TrainingTier = 0 | 1 | 2 | 3;
export interface CombatProgress { training: Record<HeroId, TrainingTier> }
export function defaultCombatProgress(): CombatProgress;
export function sanitizeCombatSave(raw: unknown): CombatProgress;
export function mergeCombatProgress(...progress: unknown[]): CombatProgress;
