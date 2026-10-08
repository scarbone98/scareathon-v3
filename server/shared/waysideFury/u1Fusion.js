export const FUSION_DURATION = 12;
export const FUSION_COOLDOWN = 30;
export const FUSION_INTENT = 1.25;
export const FUSION_RANGE = 32;
const heroes = new Set(['you', 'joe', 'matt', 'alex', 'jon']);
const scenes = new Set(['test', 'dungeon', 'realm', 'arena']);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const bounded = (value, max) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max;
const integer = (value, max) => bounded(value, max) && Number.isInteger(value);

export function createFusionWorld() {
    return { nextId: 1, forms: [], cooldowns: {} };
}

// Optional co-op state is explicitly bounded, including participant uniqueness.
// Local consent and resource ledgers never travel inside a world snapshot.
export function cleanFusionWorld(raw) {
    if (!object(raw) || !integer(raw.nextId, 100_000_000) || raw.nextId < 1 || !Array.isArray(raw.forms) || raw.forms.length > 2 || !object(raw.cooldowns)) return null;
    const cooldowns = {};
    for (const [key, value] of Object.entries(raw.cooldowns)) {
        if (!/^[0-3]$/.test(key) || !bounded(value, FUSION_COOLDOWN)) return null;
        cooldowns[key] = value;
    }
    const forms = [], occupied = new Set(), ids = new Set();
    for (const form of raw.forms) {
        if (!object(form) || !integer(form.id, 100_000_000) || form.id < 1 || form.id >= raw.nextId || ids.has(form.id) || !['solo', 'coop'].includes(form.mode)) return null;
        if (!Array.isArray(form.seats) || form.seats.length !== 2 || !form.seats.every(seat => integer(seat, 3))) return null;
        if (!Array.isArray(form.heroes) || form.heroes.length !== 2 || !form.heroes.every(hero => heroes.has(hero))) return null;
        if (!scenes.has(form.scene) || !integer(form.room, 999) || !bounded(form.remaining, FUSION_DURATION) || form.remaining <= 0 || typeof form.specialUsed !== 'boolean') return null;
        if (form.mode === 'solo' && (form.seats[0] !== 0 || form.seats[1] !== 0 || form.heroes[0] === form.heroes[1])) return null;
        if (form.mode === 'coop' && form.seats[0] >= form.seats[1]) return null;
        const seats = [...new Set(form.seats)];
        if (seats.some(seat => occupied.has(seat) || cooldowns[seat] > 0)) return null;
        seats.forEach(seat => occupied.add(seat)); ids.add(form.id);
        forms.push({ id: form.id, mode: form.mode, seats: [...form.seats], heroes: [...form.heroes], scene: form.scene, room: form.room, remaining: form.remaining, specialUsed: form.specialUsed });
    }
    return { nextId: raw.nextId, forms, cooldowns };
}

// Extrapolate a cached host snapshot from its receive time. Reapplying the
// original countdown every render frame would otherwise freeze fusion forever.
export function elapsedFusionWorld(raw, elapsedSeconds) {
    if (typeof elapsedSeconds !== 'number' || !Number.isFinite(elapsedSeconds) || elapsedSeconds < 0) return null;
    const world = cleanFusionWorld(raw);
    if (!world) return null;
    const elapsed = Math.min(elapsedSeconds, 86_400);
    for (const key of Object.keys(world.cooldowns)) world.cooldowns[key] = Math.max(0, world.cooldowns[key] - elapsed);
    const active = [];
    for (const form of world.forms) {
        form.remaining -= elapsed;
        if (form.remaining > 0) active.push(form);
        else for (const seat of new Set(form.seats)) world.cooldowns[seat] = Math.max(world.cooldowns[seat] ?? 0, FUSION_COOLDOWN + form.remaining, 0);
    }
    world.forms = active;
    return world;
}
