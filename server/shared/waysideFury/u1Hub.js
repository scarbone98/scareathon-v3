import { sanitizeHubQuests } from "./u1HubQuests.js";
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const count = value => typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(1_000_000_000, Math.floor(value))) : 0;
const safe = (value, depth = 0) => {
    if (depth > 8) return false;
    if (value === null || typeof value === 'boolean') return true;
    if (typeof value === 'number') return Number.isFinite(value) && Math.abs(value) <= 1_000_000_000;
    if (typeof value === 'string') return value.length <= 128;
    if (Array.isArray(value)) return value.length <= 256 && value.every(entry => safe(entry, depth + 1));
    return record(value) && Object.entries(value).length <= 64 && Object.entries(value).every(([key, entry]) =>
        /^[a-zA-Z0-9_-]{1,64}$/.test(key) && !['__proto__', 'constructor', 'prototype'].includes(key) && safe(entry, depth + 1));
};
// During the parallel build retain bounded sibling branches. The merge adds
// each owner's schema sanitizer at this boundary without losing another save.
export function preserveU1Namespaces(raw) {
    if (!record(raw)) return {};
    return Object.fromEntries(['items', 'world', 'combat'].filter(key => record(raw[key]) && safe(raw[key])).map(key => [key, structuredClone(raw[key])]));
}
export function sanitizeHubSave(raw) {
    const arena = record(raw) && record(raw.arena) ? raw.arena : {};
    const quests = sanitizeHubQuests(record(raw) ? raw.quests : undefined);
    const cosmetic = record(raw) && typeof raw.cosmetic === "string" && quests.cosmetics.includes(raw.cosmetic) ? raw.cosmetic : null;
    return { arena: { soloBest: count(arena.soloBest), coopBest: count(arena.coopBest), runs: count(arena.runs) }, quests, cosmetic, eventSerial: count(record(raw) ? raw.eventSerial : undefined) };
}
