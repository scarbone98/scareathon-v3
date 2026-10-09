import { COOP_PROTOCOL_VERSION, compatibleMap } from '../shared/waysideFury/campaign.js';
import { HIDDEN_PICKUPS } from '../shared/waysideFury/collectibles.js';
const PICKUP_IDS = new Set(HIDDEN_PICKUPS.map(item => item.id));
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
    return cleaned;
}

export function cleanHero(remote) {
    if (!object(remote) || !object(remote.hero) || !HERO_IDS.has(remote.hero.id) || !scene(remote.scene) || !integer(remote.room, 999)) return null;
    if (!compatibleMap(remote.scene, remote.room, remote.mapId, COOP_PROTOCOL_VERSION)) return null;
    const hero = { id: remote.hero.id };
    for (const key of ['hp', 'maxHp', 'ki', 'maxKi', 'stamina', 'maxStamina', 'level', 'xp', 'power', 'defense', 'invulnerable']) {
        if (!number(remote.hero[key], 1e6) || remote.hero[key] < 0) return null;
        hero[key] = remote.hero[key];
    }
    if (hero.maxHp < 1 || hero.hp > hero.maxHp || hero.ki > hero.maxKi || hero.stamina > hero.maxStamina) return null;
    const cleaned = { hero, scene: remote.scene, room: remote.room, ...(remote.mapId !== undefined ? { mapId: remote.mapId } : {}) };
    for (const key of ['x', 'y', 'faceX', 'faceY', 'attackTimer', 'combo', 'charge', 'dashTimer']) {
        if (!number(remote[key], key === 'faceX' || key === 'faceY' ? 1 : 1e6)) return null;
        cleaned[key] = remote[key];
    }
    for (const key of ['filmSkip', 'filmHold', 'spaceOutfit']) {
        if (remote[key] !== undefined) {if (typeof remote[key] !== 'boolean') return null;cleaned[key] = remote[key];}
    }
    if(remote.guardTimer !== undefined) {if(!number(remote.guardTimer,1e6)||remote.guardTimer<0) return null;cleaned.guardTimer=remote.guardTimer;}
    if (remote.meleeCharge !== undefined) { if (!number(remote.meleeCharge, 1.2) || remote.meleeCharge < 0) return null; cleaned.meleeCharge = remote.meleeCharge; }
    if (remote.boundTimer !== undefined) { if (!number(remote.boundTimer, .4) || remote.boundTimer < 0) return null; cleaned.boundTimer=remote.boundTimer; }
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
    if (remote.chipDamageMultiplier !== undefined) {
        if (![1, 0.88].includes(remote.chipDamageMultiplier)) return null;
        cleaned.chipDamageMultiplier = remote.chipDamageMultiplier;
    }
    if (remote.secondWindReady !== undefined) {
        if (typeof remote.secondWindReady !== 'boolean') return null;
        cleaned.secondWindReady = remote.secondWindReady;
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
    if (!compatibleMap(state.scene, state.room, state.mapId, state.protocolVersion ?? 1)) return null;
    if (state.protocolVersion !== undefined && ![1,2,3,4,5,COOP_PROTOCOL_VERSION].includes(state.protocolVersion)) return null;
    if (state.enemies.length > 200 || state.projectiles.length > 300) return null;
    if (!['real', 'eightbit'].includes(state.palette) || !['real', 'eightbit'].includes(state.transitionPalette) || (state.transitionTarget !== null && !scene(state.transitionTarget))) return null;
    if (!integer(state.cutscene, 1000) || !integer(state.chapter, 99) || !integer(state.nextId) || !Number.isInteger(state.rngSeed) || state.rngSeed < -2_147_483_648 || state.rngSeed > 4_294_967_295) return null;
    if (!number(state.sceneTimer) || state.sceneTimer < 0 || !number(state.x) || !number(state.y) || state.time < 0) return null;
    if (state.ambientTaxiWrecked !== undefined && typeof state.ambientTaxiWrecked !== 'boolean') return null;
    if (state.ambientTaxiGag !== undefined && (!number(state.ambientTaxiGag, 4) || state.ambientTaxiGag < -1)) return null;
    for (const key of ['clearedRooms', 'areas', 'bosses']) {
        if (!Array.isArray(state[key]) || state[key].length > 256 || !state[key].every((value) => text(value, 96))) return null;
    }
    for (const key of ['campaignMilestones', 'solvedInteractions', 'completedCinematics']) {
        if (state[key] !== undefined && (!Array.isArray(state[key]) || state[key].length > 128 ||
            !state[key].every(id => typeof id === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/.test(id)))) return null;
    }
    if (state.difficulty !== undefined && !['normal','hard'].includes(state.difficulty)) return null;
    if (state.combatLevel !== undefined && (!integer(state.combatLevel, 1000) || state.combatLevel < 1)) return null;
    if (state.spaceOutfit !== undefined && typeof state.spaceOutfit !== 'boolean') return null;
    if (state.film !== undefined && state.film !== null && (!object(state.film) ||
        !['space-suitup','space-outbound','space-return','space-revisit'].includes(state.film.id) ||
        !number(state.film.elapsed, 62) || state.film.elapsed < 0)) return null;
    for (const enemy of state.enemies) {
        if (!object(enemy) || !integer(enemy.id) || !['grunt', 'shooter', 'boss'].includes(enemy.kind) || !number(enemy.x) || !number(enemy.y) || !number(enemy.hp) || !number(enemy.maxHp) || enemy.hp < 0 || enemy.maxHp <= 0 || enemy.hp > enemy.maxHp) return null;
        if (!['zombie', 'pumpkin', 'ghost', 'imp', 'shadowbeast'].includes(enemy.sprite) || typeof enemy.miniBoss !== 'boolean' || ![1, 2].includes(enemy.phase)) return null;
        for (const key of ['radius', 'speed', 'cooldown', 'hitTimer', 'kx', 'ky', 'pattern', 'windup', 'actionTimer', 'aimX', 'aimY']) if (!number(enemy[key], 1e6)) return null;
        if (enemy.archetype !== undefined && !['charger','kiter','shield','swarm','ambusher'].includes(enemy.archetype)) return null;
        if (enemy.combatLevel !== undefined && (!integer(enemy.combatLevel, 1000) || enemy.combatLevel < 1)) return null;
        if (enemy.baseMaxHp !== undefined && (!number(enemy.baseMaxHp, 1e6) || enemy.baseMaxHp <= 0)) return null;
        if (enemy.woodsBehavior !== undefined && !['rooted','lantern','wisp','bailiff','foreman'].includes(enemy.woodsBehavior)) return null;
        for (const key of ['tellX','tellY']) if (enemy[key] !== undefined && !number(enemy[key], 1e6)) return null;
        if (enemy.behavior !== undefined && !['rat','walker','scout','echo','satellite','inspector','warden','cable-rat','neon-imp','turnstile','clockwolf','switchmaster','architect'].includes(enemy.behavior)) return null;
        for (const key of ['poise','burst','exposed','escapeIframes']) if (enemy[key] !== undefined && (!number(enemy[key], 100) || enemy[key] < 0)) return null;
        if (enemy.shieldBroken !== undefined && typeof enemy.shieldBroken !== 'boolean') return null;
        if (enemy.radius <= 0 || enemy.speed < 0 || enemy.pattern < 0) return null;
    }
    for (const projectile of state.projectiles) {
        if (!object(projectile) || !integer(projectile.id) || !number(projectile.x) || !number(projectile.y) || !number(projectile.vx) || !number(projectile.vy)) return null;
        if (!['hero', 'enemy'].includes(projectile.owner) || typeof projectile.beam !== 'boolean' || !Array.isArray(projectile.hits) || projectile.hits.length > 200 || !projectile.hits.every((id) => integer(id))) return null;
        if (projectile.hero !== undefined && !HERO_IDS.has(projectile.hero)) return null;
        if(projectile.signal !== undefined && typeof projectile.signal !== 'boolean') return null;
        for(const key of ['bounceDistance','bounceVx','bounceVy']) if(projectile[key] !== undefined && !number(projectile[key],1e6)) return null;
        for (const key of ['radius', 'damage', 'ttl']) if (!number(projectile[key], 1e6)) return null;
        if (projectile.radius <= 0 || projectile.damage < 0) return null;
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
            if (!compatibleMap(message.scene, message.room, message.mapId, COOP_PROTOCOL_VERSION)) return null;
            if(message.relayId !== undefined && (!['city-anchor-0','city-anchor-2','city-anchor-5','city-signal-switch','city-pedestal-0','city-pedestal-1','city-pedestal-2'].includes(message.relayId)||!['ki','interact'].includes(message.relayKind)||!message.mapId?.startsWith('city-'))) return null;
            if(message.relayKind==='ki'&&(!number(message.relayX)||!number(message.relayY))) return null;
            cleaned = Object.fromEntries(['type', 'enemyId', 'damage', 'dx', 'dy', 'force', 'attackId', 'scene', 'room', ...(message.relayId ? ['relayId','relayKind',...(message.relayKind==='ki'?['relayX','relayY']:[])] : [])].map((key) => [key, message[key]]));
            break;
        case 'pickup':
            if (!PICKUP_IDS.has(message.id) || !scene(message.scene) || !integer(message.room, 999)) return null;
            if (!compatibleMap(message.scene, message.room, message.mapId, COOP_PROTOCOL_VERSION)) return null;
            cleaned = { type: 'pickup', id: message.id, scene: message.scene, room: message.room };
            break;
        case 'reward': {
            const raw = message.reward;
            if (!object(raw) || typeof raw.id !== 'string' || !/^[A-Za-z0-9:_-]{1,128}$/.test(raw.id) || !['kill', 'checkpoint', 'pickup'].includes(raw.kind) || !integer(raw.xp, 100_000) || !integer(raw.candy, 10_000)) return null;
            const reward = { id: raw.id, kind: raw.kind, xp: raw.xp, candy: raw.candy };
            if (raw.xpLevel !== undefined) { if (!integer(raw.xpLevel, 1000) || raw.xpLevel < 1) return null; reward.xpLevel = raw.xpLevel; }
            if (raw.kind === 'pickup') {
                if (!PICKUP_IDS.has(raw.pickupId) || raw.xp !== 0 || raw.candy !== 0) return null;
                reward.pickupId = raw.pickupId;
            }
            for (const [key, max] of [['healHp', 1_000_000], ['healKi', 1_000_000], ['power', 10_000], ['ward', 10_000]]) {
                if (raw[key] === undefined) continue;
                if (!integer(raw[key], max)) return null;
                reward[key] = raw[key];
            }
            for (const key of ['rooms', 'areas', 'bosses', 'campaignMilestones', 'solvedInteractions', 'completedCinematics']) {
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
    if (message.mapId !== undefined && ['hit', 'pickup'].includes(message.type)) cleaned.mapId = message.mapId;
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
