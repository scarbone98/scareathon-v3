// Shared cloud/local JSON boundary for U8. Gameplay and dialogue stay in the
// client module; this catalog contains only the bounded quest/reward contract.
export const HUB_QUEST_RULES = Object.freeze({
    'alex-patrol': { kind: 'hunt', amount: 8, rewards: { candy: 24, chip: 'scanner' } },
    'jon-trails': { kind: 'clear', amount: 3, rewards: { candy: 30, chip: 'iron-guard' } },
    'joe-bbq': { kind: 'fetch', amount: 18, rewards: { candy: 0, cosmetic: 'bbq-apron', cosmeticName: 'BBQ apron' } },
    'marnie-display': { kind: 'fetch', amount: 24, rewards: { candy: 0, cosmetic: 'station-scarf', cosmeticName: 'Station scarf' } },
    'tessa-patrol': { kind: 'hunt', amount: 12, rewards: { candy: 36, chip: 'sprinter' } },
    'ravi-supplies': { kind: 'fetch', amount: 32, rewards: { candy: 0, chip: 'candy-magnet' } },
    'nia-watch': { kind: 'boss', amount: 1, rewards: { candy: 40, chip: 'ki-coil' } },
});
for (const rule of Object.values(HUB_QUEST_RULES)) {
    Object.freeze(rule.rewards);
    Object.freeze(rule);
}
const questIds = Object.keys(HUB_QUEST_RULES);
const record = raw => raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? raw : null;
const count = (raw, max = 1_000_000) => typeof raw === 'number' && Number.isFinite(raw) ? Math.max(0, Math.min(max, Math.floor(raw))) : 0;
const validId = raw => typeof raw === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9:_-]{0,127}$/.test(raw);
const ids = (raw, limit = 128) => [...new Set((Array.isArray(raw) ? raw : []).filter(validId))].slice(0, limit);
const isZone = id => /^(blast|realm)-[0-9]+$/.test(id) || /^(woods|city|moon)-/.test(id);

/** Shape validation, not an authoritative simulation of quest completion. */
export function sanitizeHubQuests(raw) {
    const value = record(raw), entries = [];
    for (const candidate of (Array.isArray(value?.entries) ? value.entries : []).slice(0, questIds.length * 2)) {
        const entry = record(candidate);
        // Object.hasOwn also rejects prototype names such as __proto__.
        if (!entry || typeof entry.id !== 'string' || !Object.hasOwn(HUB_QUEST_RULES, entry.id) || entries.some(e => e.id === entry.id) ||
            (entry.status !== 'active' && entry.status !== 'claimed')) continue;
        const rule = HUB_QUEST_RULES[entry.id], base = record(entry.baseline);
        entries.push({ id: entry.id, status: entry.status,
            progress: entry.status === 'claimed' ? rule.amount : count(entry.progress, rule.amount),
            eventProgress: count(entry.eventProgress, rule.amount),
            baseline: { kills: count(base?.kills), bosses: ids(base?.bosses), rooms: ids(base?.rooms).filter(isZone), hidden: ids(base?.hidden) } });
    }
    const claimed = entries.filter(entry => entry.status === 'claimed');
    const cosmetics = ids(value?.cosmetics).filter(id => claimed.some(entry => HUB_QUEST_RULES[entry.id].rewards.cosmetic === id));
    const pendingChips = [];
    for (const candidate of (Array.isArray(value?.pendingChips) ? value.pendingChips : []).slice(0, questIds.length * 2)) {
        const grant = record(candidate), quest = claimed.find(entry => `u8:${entry.id}` === grant?.source && HUB_QUEST_RULES[entry.id].rewards.chip === grant?.id);
        if (quest && !pendingChips.some(g => g.source === grant.source)) pendingChips.push({ id: HUB_QUEST_RULES[quest.id].rewards.chip, source: `u8:${quest.id}` });
    }
    return { entries, cosmetics, pendingChips, seenEvents: ids(value?.seenEvents, 256) };
}
