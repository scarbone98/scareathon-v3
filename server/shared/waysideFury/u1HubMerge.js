import { sanitizeHubSave } from './u1Hub.js';
import { HUB_QUEST_RULES, sanitizeHubQuests } from './u1HubQuests.js';

const count = raw => typeof raw === 'number' && Number.isFinite(raw) ? Math.max(0, Math.min(1_000_000_000, Math.floor(raw))) : 0;

/** Merge only bounded, monotonic hub progress for one account. The primary
 * campaign sheet supplies the equipped cosmetic; currencies are never replayed.
 */
export function mergeHubSaves(primary, ...others) {
    const saves = [primary, ...others].map(sanitizeHubSave);
    const first = saves[0];
    const quests = saves.map(save => sanitizeHubQuests(save.quests));
    const entries = [];
    for (const [id, rule] of Object.entries(HUB_QUEST_RULES)) {
        const candidates = quests.flatMap(save => save.entries.filter(entry => entry.id === id));
        if (!candidates.length) continue;
        // Keep a coherent baseline from a claimed or most advanced entry;
        // never add independent devices' counters for the same objective.
        const claimed = candidates.find(entry => entry.status === 'claimed');
        const selected = claimed ?? candidates.reduce((best, entry) =>
            entry.progress > best.progress || entry.progress === best.progress && entry.eventProgress > best.eventProgress ? entry : best);
        const progress = Math.max(...candidates.map(entry => entry.progress));
        const eventProgress = Math.max(...candidates.map(entry => entry.eventProgress), rule.kind === 'hunt' ? progress : 0);
        entries.push({ ...selected, status: claimed ? 'claimed' : 'active', progress, eventProgress });
    }
    const mergedQuests = sanitizeHubQuests({ entries,
        cosmetics: [...new Set(quests.flatMap(save => save.cosmetics))],
        pendingChips: [...new Map(quests.flatMap(save => save.pendingChips).map(grant => [grant.source, grant])).values()],
        // Keep primary receipts most recently in the bounded replay window.
        seenEvents: [...new Set([...quests.slice(1), quests[0]].flatMap(save => save.seenEvents).reverse())].reverse().slice(-256),
    });
    return sanitizeHubSave({
        arena: {
            soloBest: Math.max(...saves.map(save => save.arena.soloBest)),
            coopBest: Math.max(...saves.map(save => save.arena.coopBest)),
            runs: Math.max(...saves.map(save => save.arena.runs)),
        },
        quests: mergedQuests,
        cosmetic: first.cosmetic,
        eventSerial: Math.max(...saves.map(save => count(save.eventSerial))),
    });
}
