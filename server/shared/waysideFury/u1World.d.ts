export interface WorldSave { clearedObstacles: string[]; cycleSeconds: number }
export const WORLD_OBSTACLE_IDS: readonly string[];
export function sanitizeWorldSave(raw: unknown): WorldSave;
export function mergeWorldSaves(local: unknown, remote: unknown, winner?: unknown): WorldSave;
