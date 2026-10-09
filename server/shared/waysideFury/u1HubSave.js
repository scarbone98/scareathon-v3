import { sanitizeHubQuests } from './u1HubQuests.js';
import { ARENA_MAX_SCORE } from './u1Arena.js';
const count = (value, max) => Number.isFinite(value) ? Math.max(0, Math.min(max, Math.floor(value))) : 0;
/** Additive version-four migration: missing hub data never invalidates a story save. */
export function sanitizeHubState(raw) {
    const quests = sanitizeHubQuests(raw?.quests);
    return {
        quests,
        cosmetic: quests.cosmetics.includes(raw?.cosmetic) ? raw.cosmetic : null,
        questSerial: count(raw?.questSerial, 1_000_000_000),
        arena: { soloBest: count(raw?.arena?.soloBest, ARENA_MAX_SCORE), coopBest: count(raw?.arena?.coopBest, ARENA_MAX_SCORE), runs: count(raw?.arena?.runs, 1_000_000) },
        radar: { owned: raw?.radar?.owned === true, enabled: raw?.radar?.owned === true && raw?.radar?.enabled === true },
    };
}
