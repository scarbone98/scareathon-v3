// Scare Capitalist's saved progress: cash, ventures, managers, upgrades, séances and
// Phantom Investors. The game plays on the client, so the server only checks a save is
// well-formed and adds up before storing it. Shared by the game and the server.

export const SAVE_VERSION = 1;
export const VENTURE_COUNT = 10;
// Bigger than any real save (330 upgrade ids is ~4 KB), small enough to refuse junk.
export const MAX_SAVE_BYTES = 20_000;
// Must match economy.ts: investors earned in all = 150 x cbrt(lifetime / 1e13)
const INVESTOR_SCALE = 150;
const INVESTOR_UNIT = 1e13;
const MAX_OWNED = 1_000_000;
const UPGRADE_ID = /^[a-z]+-\d{1,2}$/;
const SEANCE_ID = /^s\d{1,2}$/;

const isMoney = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const isInt = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;

function cleanIds(list, pattern, max) {
    if (!Array.isArray(list) || list.length > max) return null;
    if (!list.every((id) => typeof id === 'string' && pattern.test(id))) return null;
    return [...new Set(list)];
}

// Returns { save } with only the known fields, or { error }. `now` caps savedAt so a
// clock set forward can't bank offline earnings that haven't happened yet.
export function sanitizeSave(raw, now = Date.now()) {
    if (!raw || typeof raw !== 'object') return { error: 'Save must be an object' };
    if (raw.v !== SAVE_VERSION) return { error: 'Unknown save version' };
    for (const key of ['cash', 'runEarned', 'lifetime', 'investors', 'investorsClaimed']) {
        if (!isMoney(raw[key])) return { error: `Bad ${key}` };
    }
    if (raw.runEarned > raw.lifetime * (1 + 1e-9)) return { error: 'Bad runEarned' };
    // Investors only come from lifetime earnings, and spending them only lowers the count held
    const earnable = Math.floor(INVESTOR_SCALE * Math.cbrt(raw.lifetime / INVESTOR_UNIT));
    if (raw.investorsClaimed > earnable + 1) return { error: 'Bad investorsClaimed' };
    if (raw.investors > raw.investorsClaimed) return { error: 'Bad investors' };

    if (!Array.isArray(raw.ventures) || raw.ventures.length !== VENTURE_COUNT) return { error: 'Bad ventures' };
    const ventures = [];
    for (const v of raw.ventures) {
        if (!v || typeof v !== 'object') return { error: 'Bad venture' };
        if (!isInt(v.owned, 0, MAX_OWNED)) return { error: 'Bad owned' };
        if (typeof v.progress !== 'number' || !Number.isFinite(v.progress) || v.progress < 0 || v.progress > 1e6) return { error: 'Bad progress' };
        if (typeof v.running !== 'boolean' || typeof v.managed !== 'boolean') return { error: 'Bad venture flags' };
        ventures.push({ owned: v.owned, progress: v.progress, running: v.running, managed: v.managed });
    }
    const upgrades = cleanIds(raw.upgrades, UPGRADE_ID, 400);
    if (!upgrades) return { error: 'Bad upgrades' };
    const seances = cleanIds(raw.seances, SEANCE_ID, 50);
    if (!seances) return { error: 'Bad seances' };
    if (!isInt(raw.savedAt, 0, Number.MAX_SAFE_INTEGER) || !isInt(raw.runStartedAt, 0, Number.MAX_SAFE_INTEGER)) return { error: 'Bad times' };
    if (!isInt(raw.resets, 0, 1_000_000)) return { error: 'Bad resets' };

    return {
        save: {
            v: SAVE_VERSION,
            cash: raw.cash,
            runEarned: raw.runEarned,
            lifetime: raw.lifetime,
            investors: raw.investors,
            investorsClaimed: raw.investorsClaimed,
            ventures,
            upgrades,
            seances,
            savedAt: Math.min(raw.savedAt, now),
            runStartedAt: Math.min(raw.runStartedAt, now),
            resets: raw.resets,
        },
    };
}
