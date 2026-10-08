import { chapterRewardScore, mapDefinition } from './campaign.js';
import { cleanFoundItems } from './collectibles.js';
// The browser and server share one bounded, versioned character sheet.
// This is shape validation, not authoritative combat or economy simulation.
export const SAVE_VERSION = 4;
export const MAX_SAVE_BYTES = 65_536;
export const MAX_MILESTONES = 128;
export const MAX_COOP_REWARDS = 256;
export const MAX_LEVEL = 1_000;
export const HERO_IDS = ['you', 'joe', 'matt', 'alex', 'jon'];
const LEGACY_HERO_IDS = ['joe', 'matt'];
export const HERO_STATS = { you: { power: 12, defense: 3 }, joe: { power: 12, defense: 3 },
    matt: { power: 13, defense: 2 }, alex: { power: 12, defense: 3 }, jon: { power: 13, defense: 2 } };
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
function coopRewards(value) {
    // Retain recent reward IDs across device reloads and reconnects. They are
    // receipts only: a room code/UUID may appear in an ID, never an asset URL.
    const ids = (Array.isArray(value) ? value : []).filter(id =>
        typeof id === 'string' && /^[A-Za-z0-9:_-]{1,128}$/.test(id));
    return [...new Set(ids)].slice(-MAX_COOP_REWARDS);
}
function party(value) {
    if (!Array.isArray(value)) return ['you', 'joe'];
    const members = [...new Set(value.filter(isHero))].slice(0, 2);
    return members.length ? members : ['you'];
}
export function mergeReceipts(...receipts) {
    const merged = { areas: [], bosses: [], rooms: [], level: 1 };
    for (const receipt of receipts) {
        if (!isRecord(receipt)) continue;
        merged.areas = milestones([...merged.areas, ...(Array.isArray(receipt.areas) ? receipt.areas : [])]);
        merged.bosses = milestones([...merged.bosses, ...(Array.isArray(receipt.bosses) ? receipt.bosses : [])]);
        merged.rooms = milestones([...merged.rooms, ...(Array.isArray(receipt.rooms) ? receipt.rooms : [])]);
        const found = cleanFoundItems([...(merged.foundItems ?? []), ...(Array.isArray(receipt.foundItems) ? receipt.foundItems : [])]);
        if (found.length) merged.foundItems = found;
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
function cleanHeroes(raw, ids) {
    if (!isRecord(raw)) return null;
    const heroes = {};
    for (const id of ids) {
        const h = cleanHero(raw[id], id);
        if (!h) return null;
        heroes[id] = h;
    }
    return heroes;
}
export function heroStats(id, character, gear = { power: 0, ward: 0 }) {
    const level = integer(character.level, 1, MAX_LEVEL), growth = level - 1;
    return { maxHp: 100 + growth * 20, maxKi: 60 + growth * 10, maxStamina: 80,
        power: integer(HERO_STATS[id].power + growth * 3 + gear.power, 1, 10_000),
        defense: integer(HERO_STATS[id].defense + growth + gear.ward, 0, 10_000) };
}
function cleanCharacter(raw) {
    if (!isRecord(raw) || !finite(raw.level) || !finite(raw.xp)) return null;
    const level = integer(raw.level, 1, MAX_LEVEL);
    return { level, xp: integer(raw.xp, 0, xpForLevel(level) - 1) };
}
const earnedXp = h => (h.level - 1) * 75 + (h.level - 1) * (h.level - 2) * 22.5 + h.xp;
function legacyCharacter(heroes) {
    const best = Object.values(heroes).reduce((a, b) => earnedXp(a) >= earnedXp(b) ? a : b);
    return { level: best.level, xp: best.xp };
}
function syncHeroes(heroes, character, gear) {
    return Object.fromEntries(HERO_IDS.map(id => {
        const stats = heroStats(id, character, gear), old = heroes[id];
        return [id, { id, ...stats, ...character, hp: old ? bound(old.hp, 0, stats.maxHp) : stats.maxHp,
            ki: old ? bound(old.ki, 0, stats.maxKi) : stats.maxKi / 2,
            stamina: old ? bound(old.stamina, 0, stats.maxStamina) : stats.maxStamina, invulnerable: 0 }];
    }));
}
// Main progress and HOME are migrated independently. A HOME retry retains its
// earlier level and gear while keeping the run's milestone/ticket receipt.
function cleanSheet(raw, legacy) {
    const ids = legacy ? LEGACY_HERO_IDS : HERO_IDS;
    if (!isRecord(raw) || !ids.includes(raw.active)) return null;
    const oldHeroes = cleanHeroes(raw.heroes, ids);
    if (!oldHeroes) return null;
    const character = legacy ? legacyCharacter(oldHeroes) : cleanCharacter(raw.character);
    if (!character) return null;
    // Infer the original charm bonuses before replacing unequal legacy levels.
    if (!legacy && (!isRecord(raw.gear) || !finite(raw.gear.power) || !finite(raw.gear.ward))) return null;
    const gear = cleanGear(raw.gear, oldHeroes);
    if (legacy) {
        const inferred = inferGear(oldHeroes);
        gear.power = Math.max(gear.power, inferred.power); gear.ward = Math.max(gear.ward, inferred.ward);
    }
    const heroes = syncHeroes(oldHeroes, character, gear);
    const members = legacy ? ['you', raw.active] : party(raw.party);
    return { heroes, character, gear, party: members, active: legacy ? 'you' : members.includes(raw.active) ? raw.active : members[0] };
}
// Gear stores the actual stat bonus: one Power charm is +2, one Ward is +1.
export function inferGear(heroes) {
    let power = 0, ward = 0;
    for (const id of HERO_IDS) {
        const h = heroes?.[id];
        if (!isRecord(h)) continue;
        const level = integer(h.level, 1, MAX_LEVEL);
        power = Math.max(power, integer(h.power, 0, 10_000) - HERO_STATS[id].power - (level - 1) * 3);
        ward = Math.max(ward, integer(h.defense, 0, 10_000) - HERO_STATS[id].defense - (level - 1));
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
function cleanHome(raw, legacy) {
    if (!isRecord(raw) || !finite(raw.candy) || !finite(raw.chapter)) return null;
    const sheet = cleanSheet(raw, legacy);
    return sheet ? { ...sheet, candy: integer(raw.candy, 0, 1_000_000), chapter: integer(raw.chapter, 1, 99) } : null;
}
export function sanitizeSave(raw) {
    if (!isRecord(raw)) return { error: 'Save must be an object' };
    if (![1, 2, 3, SAVE_VERSION].includes(raw.version)) return { error: 'Unknown save version' };
    try {
        if (new TextEncoder().encode(JSON.stringify(raw)).byteLength > MAX_SAVE_BYTES) return { error: 'Save too large' };
    } catch {
        return { error: 'Save must be serializable' };
    }
    let legacy;
    switch (raw.version) {
        case 1: case 2: legacy = true; break;
        case 3: case 4: legacy = false; break;
        default: return { error: 'Unknown save version' };
    }
    const ids = legacy ? LEGACY_HERO_IDS : HERO_IDS;
    if (!ids.includes(raw.active)) return { error: 'Unknown active hero' };
    if (['chapter', 'candy', 'kills', 'deaths'].some(field => !finite(raw[field]))) return { error: 'Bad progress numbers' };
    if (!Array.isArray(raw.areas) || !Array.isArray(raw.bosses) || !Array.isArray(raw.clearedRooms)) return { error: 'Bad milestones' };
    if (!Array.isArray(raw.unlockedHeroes) || !ids.every(id => raw.unlockedHeroes.includes(id))) return { error: 'Bad unlocked heroes' };
    if (!Object.hasOwn(raw, 'home')) return { error: 'Missing HOME snapshot' };
    const sheet = cleanSheet(raw, legacy), receipt = raw.lastReported;
    if (!sheet) return { error: 'Bad heroes' };
    if (!isRecord(receipt) || !Array.isArray(receipt.areas) || !Array.isArray(receipt.bosses) || !Array.isArray(receipt.rooms) || !finite(receipt.level)) return { error: 'Bad progress receipt' };
    return { save: { version: SAVE_VERSION, chapter: integer(raw.chapter, 1, 99), ...sheet,
        campaignMilestones: milestones([...(raw.version === 4 && Array.isArray(raw.campaignMilestones) ? raw.campaignMilestones : []),
            ...(raw.clearedRooms.includes('realm-0') ? ['realm-0'] : []),
            // Pre-Woods Space saves retain their legitimate onward access.
            ...(raw.version === 4 && raw.campaignMilestones?.some(id => ['moon-departed','moon-arrived','space-complete'].includes(id)) ? ['woods-complete','breaker-knuckle','circuit-spark'] : [])]),
        solvedInteractions: raw.version === 4 ? milestones(raw.solvedInteractions) : [],
        completedCinematics: raw.version === 4 ? milestones(raw.completedCinematics) : [],
        checkpointMapId: raw.version === 4 && mapDefinition(raw.checkpointMapId) &&
            (['hub', 'overworld'].includes(raw.checkpointMapId) || raw.clearedRooms.includes(raw.checkpointMapId) ||
              (raw.checkpointMapId === 'space-launch' && raw.campaignMilestones?.some(id => ['woods-complete','moon-departed','space-complete','space-dev-entry'].includes(id))) ||
              (['woods-layby','woods-pump-house'].includes(raw.checkpointMapId) && raw.clearedRooms.includes('realm-0')) ||
              (['moon-m01','moon-m03','moon-m06','moon-m09'].includes(raw.checkpointMapId) &&
               (raw.campaignMilestones?.includes(`${raw.checkpointMapId}-visited`) || (raw.checkpointMapId === 'moon-m01' && raw.campaignMilestones?.includes('moon-departed'))))) ? raw.checkpointMapId : 'hub',
        candy: integer(raw.candy, 0, 1_000_000), unlockedHeroes: [...HERO_IDS],
        areas: milestones(raw.areas), bosses: milestones(raw.bosses), clearedRooms: milestones(raw.clearedRooms),
        kills: integer(raw.kills, 0, 1_000_000), deaths: integer(raw.deaths, 0, 1_000_000),
        ...(raw.resetAt ? { resetAt: integer(raw.resetAt, 0, Number.MAX_SAFE_INTEGER) } : {}),
        ...(raw.prologuePending === true ? { prologuePending: true } : {}),
        coopRewards: coopRewards(raw.coopRewards),
        foundItems: cleanFoundItems(raw.foundItems), ambientTaxiWrecked: raw.ambientTaxiWrecked === true,
        lastReported: mergeReceipts(receipt), home: cleanHome(raw.home, legacy),
        settings: cleanSettings(raw.settings), savedAt: integer(raw.savedAt, 0, Number.MAX_SAFE_INTEGER) } };
}
// PR1 local and PR2 version-two cloud sheets migrate to the You-led party.
export function migrateSave(raw) {
    return sanitizeSave(raw).save ?? null;
}
// Chapter and exploration dominate normal level differences. Include cumulative
// earned XP, so two saves at the same level compare correctly after an encounter.
export function progressScore(save) {
    const bestXp = earnedXp(save.character);
    return save.chapter * 1_000_000_000_000 + save.areas.length * 1_000_000_000 +
        save.bosses.length * 10_000_000 + save.clearedRooms.length * 100_000 + bestXp;
}

// One policy for local reports and account-save acknowledgements.
export function ticketDelta(now, before) {
  const current = mergeReceipts(now), reported = mergeReceipts(before);
  return Math.min(100000, chapterRewardScore(current, reported) +
    Math.max(0, current.level - reported.level) * 100);
}

// Lifetime total is unbounded by the per-checkpoint submission cap.
export function receiptTotalScore(receipt) {
    const current = mergeReceipts(receipt);
    return chapterRewardScore(current) + (current.level - 1) * 100;
}
