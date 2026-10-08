import { cleanFusionWorld } from '../shared/waysideFury/u1Fusion.js';

export const MAX_MESSAGE_BYTES = 65_536;
export const MAX_MESSAGES_PER_SECOND = 90;
export const MAX_SEATS = 4;
export const SCENES = new Set(['test', 'overworld', 'hub', 'dungeon', 'realm', 'prologue', 'shift', 'results', 'dead']);
const HERO_IDS = new Set(['you', 'joe', 'matt', 'alex', 'jon']);
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const number = (value, limit = 1e8) => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= limit;
const text = (value, max = 80) => typeof value === 'string' && value.length > 0 && value.length <= max;
const integer = (value, max = 1e8) => Number.isInteger(value) && value >= 0 && value <= max;
const scene = (value) => SCENES.has(value);

// A bounded JSON tree prevents NaN, huge arrays, deep nesting and prototype keys
// from passing through even when a snapshot's optional presentation data grows.
export function isSafeJson(value, depth = 0) {
    if (depth > 9) return false;
    if (value === null || typeof value === 'boolean') return true;
    if (typeof value === 'number') return number(value, 1e12);
    if (typeof value === 'string') return value.length <= 512;
    if (Array.isArray(value)) return value.length <= 512 && value.every((entry) => isSafeJson(entry, depth + 1));
    if (!object(value)) return false;
    const entries = Object.entries(value);
    return entries.length <= 96 && entries.every(([key, entry]) => key.length <= 64 && !['__proto__', 'constructor', 'prototype'].includes(key) && isSafeJson(entry, depth + 1));
}

export function cleanInput(input) {
    if (!object(input) || !number(input.x, 1) || !number(input.y, 1)) return null;
    const cleaned = { x: input.x, y: input.y };
    for (const key of ['attack', 'ki', 'dash', 'guard', 'swap', 'interact']) {
        if (typeof input[key] !== 'boolean') return null;
        cleaned[key] = input[key];
    }
    if (input.fusion !== undefined) {
        if (typeof input.fusion !== 'boolean') return null;
        cleaned.fusion = input.fusion;
    }
    return cleaned;
}

export function cleanHero(remote) {
    if (!object(remote) || !object(remote.hero) || !HERO_IDS.has(remote.hero.id) || !scene(remote.scene) || !integer(remote.room, 999)) return null;
    const hero = { id: remote.hero.id };
    for (const key of ['hp', 'maxHp', 'ki', 'maxKi', 'stamina', 'maxStamina', 'level', 'xp', 'power', 'defense', 'invulnerable']) {
        if (!number(remote.hero[key], 1e6) || remote.hero[key] < 0) return null;
        hero[key] = remote.hero[key];
    }
    if (hero.maxHp < 1 || hero.hp > hero.maxHp || hero.ki > hero.maxKi || hero.stamina > hero.maxStamina) return null;
    const cleaned = { hero, scene: remote.scene, room: remote.room };
    for (const key of ['x', 'y', 'faceX', 'faceY', 'attackTimer', 'combo', 'charge', 'dashTimer']) {
        if (!number(remote[key], key === 'faceX' || key === 'faceY' ? 1 : 1e6)) return null;
        cleaned[key] = remote[key];
    }
    for (const key of ['moving', 'guard']) {
        if (typeof remote[key] !== 'boolean') return null;
        cleaned[key] = remote[key];
    }
    if (remote.downed !== undefined) {
        if (typeof remote.downed !== 'boolean') return null;
        cleaned.downed = remote.downed;
    }
    if (remote.reviveProgress !== undefined) {
        if (!number(remote.reviveProgress, 1) || remote.reviveProgress < 0) return null;
        cleaned.reviveProgress = remote.reviveProgress;
    }
    if (remote.fusionIntent !== undefined) {
        if (!number(remote.fusionIntent, 1.5) || remote.fusionIntent < 0) return null;
        cleaned.fusionIntent = remote.fusionIntent;
    }
    if (remote.fusionSpecial !== undefined) {
        if (!integer(remote.fusionSpecial, 100_000_000)) return null;
        cleaned.fusionSpecial = remote.fusionSpecial;
    }
    return cleaned;
}

export function cleanAppearance(appearance) {
    if (!object(appearance) || !object(appearance.profile) || !Array.isArray(appearance.outfit) || appearance.outfit.length > 24) return null;
    // composeLook resolves colors through manifest.ramps, whose keys are names
    // such as peach, sandy and ink_eye. Peers never provide image paths or CSS.
    const color = (value) => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,48}$/.test(value);
    const profile = {};
    for (const key of ['skin', 'hair', 'eyes']) {
        if (!color(appearance.profile[key])) return null;
        profile[key] = appearance.profile[key];
    }
    const outfit = [];
    for (const entry of appearance.outfit) {
        if (!object(entry) || !text(entry.key, 80) || !/^[a-zA-Z0-9_-]+$/.test(entry.key) || !object(entry.dyes)) return null;
        const dyes = {};
        for (const key of ['dye1', 'dye2']) {
            if (entry.dyes[key] !== undefined) {
                if (!color(entry.dyes[key])) return null;
                dyes[key] = entry.dyes[key];
            }
        }
        outfit.push({ key: entry.key, dyes });
    }
    return { profile, outfit };
}

export function cleanWorld(state) {
    if (!object(state) || !scene(state.scene) || !integer(state.room, 999) || !number(state.time) || !Array.isArray(state.enemies) || !Array.isArray(state.projectiles)) return null;
    if (state.enemies.length > 200 || state.projectiles.length > 300) return null;
    if (!['real', 'eightbit'].includes(state.palette) || !['real', 'eightbit'].includes(state.transitionPalette) || (state.transitionTarget !== null && !scene(state.transitionTarget))) return null;
    if (!integer(state.cutscene, 1000) || !integer(state.chapter, 99) || !integer(state.nextId) || !Number.isInteger(state.rngSeed) || state.rngSeed < -2_147_483_648 || state.rngSeed > 4_294_967_295) return null;
    if (!number(state.sceneTimer) || state.sceneTimer < 0 || !number(state.x) || !number(state.y) || state.time < 0) return null;
    for (const key of ['clearedRooms', 'areas', 'bosses']) {
        if (!Array.isArray(state[key]) || state[key].length > 256 || !state[key].every((value) => text(value, 96))) return null;
    }
    for (const enemy of state.enemies) {
        if (!object(enemy) || !integer(enemy.id) || !['grunt', 'shooter', 'boss'].includes(enemy.kind) || !number(enemy.x) || !number(enemy.y) || !number(enemy.hp) || !number(enemy.maxHp) || enemy.hp < 0 || enemy.maxHp <= 0 || enemy.hp > enemy.maxHp) return null;
        if (!['zombie', 'pumpkin', 'ghost', 'imp', 'shadowbeast'].includes(enemy.sprite) || typeof enemy.miniBoss !== 'boolean' || ![1, 2].includes(enemy.phase)) return null;
        for (const key of ['radius', 'speed', 'cooldown', 'hitTimer', 'kx', 'ky', 'pattern', 'windup', 'actionTimer', 'aimX', 'aimY']) if (!number(enemy[key], 1e6)) return null;
        if (enemy.radius <= 0 || enemy.speed < 0 || enemy.pattern < 0) return null;
    }
    for (const projectile of state.projectiles) {
        if (!object(projectile) || !integer(projectile.id) || !number(projectile.x) || !number(projectile.y) || !number(projectile.vx) || !number(projectile.vy)) return null;
        if (!['hero', 'enemy'].includes(projectile.owner) || typeof projectile.beam !== 'boolean' || !Array.isArray(projectile.hits) || projectile.hits.length > 200 || !projectile.hits.every((id) => integer(id))) return null;
        if (projectile.hero !== undefined && !HERO_IDS.has(projectile.hero)) return null;
        for (const key of ['radius', 'damage', 'ttl']) if (!number(projectile[key], 1e6)) return null;
        if (projectile.radius <= 0 || projectile.damage < 0) return null;
    }
    if (state.fusions !== undefined) {
        const fusions = cleanFusionWorld(state.fusions);
        if (!fusions || fusions.forms.some(form => form.scene !== state.scene || form.room !== state.room)) return null;
        state = { ...state, fusions };
    }
    return state;
}

// Relay only recognized envelopes; source identity is filled by the room manager.
export function cleanRelay(message) {
    if (!object(message) || !isSafeJson(message)) return null;
    let cleaned;
    switch (message.type) {
        case 'hero': {
            const hero = cleanHero(message.hero);
            const input = cleanInput(message.input);
            if (!hero || !input) return null;
            cleaned = { type: 'hero', hero, input };
            if (message.appearance !== undefined) {
                const appearance = cleanAppearance(message.appearance);
                if (!appearance) return null;
                cleaned.appearance = appearance;
            }
            break;
        }
        case 'input': {
            const input = cleanInput(message.input);
            if (!input) return null;
            cleaned = { type: 'input', input };
            break;
        }
        case 'state': {
            const state = cleanWorld(message.state);
            if (!state) return null;
            cleaned = { type: 'state', state };
            break;
        }
        case 'hit':
            if (!integer(message.enemyId) || !number(message.damage, 1e5) || message.damage <= 0 || !number(message.dx, 1) || !number(message.dy, 1) || !number(message.force, 1e5) || message.force < 0 || !text(message.attackId, 96) || !scene(message.scene) || !integer(message.room, 999)) return null;
            cleaned = Object.fromEntries(['type', 'enemyId', 'damage', 'dx', 'dy', 'force', 'attackId', 'scene', 'room'].map((key) => [key, message[key]]));
            break;
        case 'reward': {
            const raw = message.reward;
            if (!object(raw) || typeof raw.id !== 'string' || !/^[A-Za-z0-9:_-]{1,128}$/.test(raw.id) || !['kill', 'checkpoint'].includes(raw.kind) || !integer(raw.xp, 100_000) || !integer(raw.candy, 10_000)) return null;
            const reward = { id: raw.id, kind: raw.kind, xp: raw.xp, candy: raw.candy };
            for (const [key, max] of [['healHp', 1_000_000], ['healKi', 1_000_000], ['power', 10_000], ['ward', 10_000]]) {
                if (raw[key] === undefined) continue;
                if (!integer(raw[key], max)) return null;
                reward[key] = raw[key];
            }
            for (const key of ['rooms', 'areas', 'bosses']) {
                if (raw[key] === undefined) continue;
                if (!Array.isArray(raw[key]) || raw[key].length > 128 || !raw[key].every((entry) => typeof entry === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/.test(entry))) return null;
                reward[key] = [...new Set(raw[key])];
            }
            if (raw.chapter !== undefined) {
                if (!integer(raw.chapter, 99) || raw.chapter < 1) return null;
                reward.chapter = raw.chapter;
            }
            cleaned = { type: 'reward', reward };
            break;
        }
        case 'damage':
            if (!integer(message.targetSeat, MAX_SEATS - 1) || !number(message.damage, 1e5) || message.damage <= 0 || !number(message.sourceX) || !number(message.sourceY)) return null;
            cleaned = { type: 'damage', targetSeat: message.targetSeat, damage: message.damage, sourceX: message.sourceX, sourceY: message.sourceY };
            break;
        case 'revive':
            if (!integer(message.targetSeat, MAX_SEATS - 1)) return null;
            cleaned = { type: 'revive', targetSeat: message.targetSeat };
            if (message.hp !== undefined) {
                if (!number(message.hp, 1e6) || message.hp <= 0) return null;
                cleaned.hp = message.hp;
            }
            break;
        default:
            return null;
    }
    if (message.targetSeat !== undefined) {
        if (!integer(message.targetSeat, MAX_SEATS - 1)) return null;
        cleaned.targetSeat = message.targetSeat;
    }
    for (const key of ['seq', 't']) {
        if (message[key] !== undefined) {
            if (!number(message[key], 1e12) || message[key] < 0) return null;
            cleaned[key] = message[key];
        }
    }
    return cleaned;
}
