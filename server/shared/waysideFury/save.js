// The browser and server share one bounded, versioned character sheet.
// This is shape validation, not authoritative combat or economy simulation.
export const SAVE_VERSION = 2;
export const MAX_SAVE_BYTES = 65_536;
export const MAX_MILESTONES = 128;
export const MAX_LEVEL = 1_000;
export const HERO_IDS = ['joe', 'matt'];
const HERO_FIELDS = ['hp', 'maxHp', 'ki', 'maxKi', 'stamina', 'maxStamina', 'level', 'xp', 'power', 'defense', 'invulnerable'];
const isRecord = value => !!value && typeof value === 'object' && !Array.isArray(value);
const finite = value => typeof value === 'number' && Number.isFinite(value);
const bound = (value, min, max, fallback = min) => Math.max(min, Math.min(max, finite(value) ? value : fallback));
const integer = (value, min, max, fallback = min) => Math.floor(bound(value, min, max, fallback));
const xpForLevel = level => 75 + (level - 1) * 45;
const isHero = value => HERO_IDS.includes(value);

function milestones(value) {
    return [...new Set((Array.isArray(value) ? value : []).filter(id =>
        typeof id === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/.test(id)))].slice(0, MAX_MILESTONES);
}
function party(value) {
    if (!Array.isArray(value)) return [...HERO_IDS];
    const members = [...new Set(value.filter(isHero))];
    return members.length ? members : ['joe'];
}
export function mergeReceipts(...receipts) {
    const merged = { areas: [], bosses: [], rooms: [], level: 1 };
    for (const receipt of receipts) {
        if (!isRecord(receipt)) continue;
        merged.areas = milestones([...merged.areas, ...(Array.isArray(receipt.areas) ? receipt.areas : [])]);
        merged.bosses = milestones([...merged.bosses, ...(Array.isArray(receipt.bosses) ? receipt.bosses : [])]);
        merged.rooms = milestones([...merged.rooms, ...(Array.isArray(receipt.rooms) ? receipt.rooms : [])]);
        // Preserve the ticket high-water mark even when a HOME retry lowers stats.
        merged.level = Math.max(merged.level, integer(receipt.level, 1, Number.MAX_SAFE_INTEGER));
    }
    return merged;
}
function cleanHero(raw, id) {
    if (!isRecord(raw) || HERO_FIELDS.some(field => !finite(raw[field]))) return null;
    const level = integer(raw.level, 1, MAX_LEVEL);
    const maxHp = integer(raw.maxHp, 1, 100_000), maxKi = integer(raw.maxKi, 1, 100_000);
    const maxStamina = integer(raw.maxStamina, 1, 100_000);
    return { id, hp: bound(raw.hp, 0, maxHp), maxHp, ki: bound(raw.ki, 0, maxKi), maxKi,
        stamina: bound(raw.stamina, 0, maxStamina), maxStamina, level,
        xp: integer(raw.xp, 0, xpForLevel(level) - 1), power: integer(raw.power, 1, 10_000),
        defense: integer(raw.defense, 0, 10_000), invulnerable: 0 };
}
function cleanHeroes(raw) {
    if (!isRecord(raw)) return null;
    const joe = cleanHero(raw.joe, 'joe'), matt = cleanHero(raw.matt, 'matt');
    return joe && matt ? { joe, matt } : null;
}
// Gear stores the actual stat bonus: one Power charm is +2, one Ward is +1.
export function inferGear(heroes) {
    let power = 0, ward = 0;
    for (const id of HERO_IDS) {
        const h = heroes?.[id];
        if (!isRecord(h)) continue;
        const level = integer(h.level, 1, MAX_LEVEL);
        power = Math.max(power, integer(h.power, 0, 10_000) - (id === 'joe' ? 12 : 13) - (level - 1) * 3);
        ward = Math.max(ward, integer(h.defense, 0, 10_000) - (id === 'joe' ? 3 : 2) - (level - 1));
    }
    return { power: integer(power, 0, 10_000), ward: integer(ward, 0, 10_000) };
}
function cleanGear(raw, heroes) {
    const inferred = inferGear(heroes);
    return { power: integer(raw?.power, 0, 10_000, inferred.power), ward: integer(raw?.ward, 0, 10_000, inferred.ward) };
}
function cleanSettings(raw) {
    return { musicVolume: bound(raw?.musicVolume, 0, 1, 0.6), sfxVolume: bound(raw?.sfxVolume, 0, 1, 0.8),
        controls: { tutorialDismissed: raw?.controls?.tutorialDismissed === true,
            stickSensitivity: bound(raw?.controls?.stickSensitivity, 0.5, 2, 1) } };
}
function cleanHome(raw) {
    if (!isRecord(raw) || !isHero(raw.active) || !finite(raw.candy) || !finite(raw.chapter)) return null;
    const heroes = cleanHeroes(raw.heroes), members = party(raw.party);
    return heroes ? { heroes, active: members.includes(raw.active) ? raw.active : members[0], party: members,
        candy: integer(raw.candy, 0, 1_000_000), chapter: integer(raw.chapter, 1, 99), gear: cleanGear(raw.gear, heroes) } : null;
}
export function sanitizeSave(raw) {
    if (!isRecord(raw)) return { error: 'Save must be an object' };
    if (raw.version !== 1 && raw.version !== SAVE_VERSION) return { error: 'Unknown save version' };
    try {
        if (new TextEncoder().encode(JSON.stringify(raw)).byteLength > MAX_SAVE_BYTES) return { error: 'Save too large' };
    } catch {
        return { error: 'Save must be serializable' };
    }
    if (!isHero(raw.active)) return { error: 'Unknown active hero' };
    if (['chapter', 'candy', 'kills', 'deaths'].some(field => !finite(raw[field]))) return { error: 'Bad progress numbers' };
    if (!Array.isArray(raw.areas) || !Array.isArray(raw.bosses) || !Array.isArray(raw.clearedRooms)) return { error: 'Bad milestones' };
    if (!Array.isArray(raw.unlockedHeroes) || !HERO_IDS.every(id => raw.unlockedHeroes.includes(id))) return { error: 'Bad unlocked heroes' };
    if (!Object.hasOwn(raw, 'home')) return { error: 'Missing HOME snapshot' };
    const heroes = cleanHeroes(raw.heroes), receipt = raw.lastReported;
    if (!heroes) return { error: 'Bad heroes' };
    if (!isRecord(receipt) || !Array.isArray(receipt.areas) || !Array.isArray(receipt.bosses) || !Array.isArray(receipt.rooms) || !finite(receipt.level)) return { error: 'Bad progress receipt' };
    const members = party(raw.party);
    return { save: { version: SAVE_VERSION, chapter: integer(raw.chapter, 1, 99), heroes,
        active: members.includes(raw.active) ? raw.active : members[0], party: members,
        candy: integer(raw.candy, 0, 1_000_000), unlockedHeroes: [...HERO_IDS],
        areas: milestones(raw.areas), bosses: milestones(raw.bosses), clearedRooms: milestones(raw.clearedRooms),
        kills: integer(raw.kills, 0, 1_000_000), deaths: integer(raw.deaths, 0, 1_000_000),
        lastReported: mergeReceipts(receipt), home: cleanHome(raw.home), gear: cleanGear(raw.gear, heroes),
        settings: cleanSettings(raw.settings), savedAt: integer(raw.savedAt, 0, Number.MAX_SAFE_INTEGER) } };
}
// PR1's version-one localStorage sheet is upgraded without resetting progress.
export function migrateSave(raw) {
    return sanitizeSave(raw).save ?? null;
}
// Chapter and exploration dominate normal level differences. Include cumulative
// earned XP, so two saves at the same level compare correctly after an encounter.
export function progressScore(save) {
    const bestXp = Math.max(...HERO_IDS.map(id => {
        const h = save.heroes[id], levels = h.level - 1;
        return levels * 75 + levels * (levels - 1) * 22.5 + h.xp;
    }));
    return save.chapter * 1_000_000_000_000 + save.areas.length * 1_000_000_000 +
        save.bosses.length * 10_000_000 + save.clearedRooms.length * 100_000 + bestXp;
}
