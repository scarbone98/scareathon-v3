export const WORLD_OBSTACLE_IDS = ["world-joe-road", "world-matt-station", "world-alex-yard", "world-jon-orchard", "world-alex-depot", "world-joe-county"];
export function sanitizeWorldSave(raw) {
    return {
        clearedObstacles: [...new Set((Array.isArray(raw?.clearedObstacles) ? raw.clearedObstacles : []).filter(id => WORLD_OBSTACLE_IDS.includes(id)))],
        cycleSeconds: typeof raw?.cycleSeconds === "number" && Number.isFinite(raw.cycleSeconds) && raw.cycleSeconds >= 0 ? raw.cycleSeconds % 480 : 0,
    };
}
