// Deterministic engine for the lane battler.
//
// A match is a plain JSON state advanced one tick at a time by stepMatch().
// The only inputs are card plays ({ team, card, x, z }), so two clients and
// the server that feed the same plays on the same ticks stay in lockstep, and
// a match can be replayed from its seed, decks and play log.
//
// Lockstep across browsers means the sim must compute bit-identical floats
// everywhere: only + - * / and Math.sqrt (all IEEE-exact) are allowed here.
// No Math.sin/cos/hypot/pow, no Date, no Math.random.
//
// Coordinates: x across (-9..9), z along (-16..16). Team 0 lives at +z (the
// bottom of the screen), team 1 at -z. The river runs along z = 0.

import { createRng, random } from '../monster-bash/rng.js';
import { DECK_SIZE, getCard, validateDeck } from './cards.js';

// Bump whenever a change would make an old play log replay differently.
export const ENGINE_VERSION = 1;
export const TICK_RATE = 20;

export const HALF_WIDTH = 9;
export const HALF_LENGTH = 16;
export const RIVER_HALF = 1.1;
export const BRIDGE_X = 5.5;
export const BRIDGE_HALF_WIDTH = 1.0;

export const HAND_SIZE = 4;
export const ELIXIR_MAX = 10;
export const START_ELIXIR = 5;
export const ELIXIR_SECONDS = 2.8;
export const DEPLOY_TICKS = 1 * TICK_RATE;
export const MATCH_TICKS = 180 * TICK_RATE;
export const DOUBLE_ELIXIR_TICK = 120 * TICK_RATE;
export const OVERTIME_TICKS = 60 * TICK_RATE;
export const SIGHT_RANGE = 5.5;
// A share of each hit's cycle spent winding up before the damage lands. A
// target that leaves range (or a stun) during the windup cancels the hit.
const WINDUP_SHARE = 0.4;
// Units in a group deploy in a fixed formation (team 0's view; mirrored in z
// for team 1). Literal offsets keep the sim free of trig.
const FORMATIONS = {
    1: [[0, 0]],
    2: [[-0.45, 0], [0.45, 0]],
    3: [[0, -0.5], [-0.5, 0.35], [0.5, 0.35]],
    4: [[-0.45, -0.45], [0.45, -0.45], [-0.45, 0.45], [0.45, 0.45]],
};

export const TOWERS = {
    princess: { hp: 1600, damage: 50, hitSpeed: 0.8, range: 7.5, radius: 1.5, projectileSpeed: 14, z: 10.5 },
    king: { hp: 2600, damage: 70, hitSpeed: 1.0, range: 7.0, radius: 2.0, projectileSpeed: 14, z: 13.8 },
};

export function homeSign(team) {
    return team === 0 ? 1 : -1;
}

function dist(ax, az, bx, bz) {
    const dx = bx - ax;
    const dz = bz - az;
    return Math.sqrt(dx * dx + dz * dz);
}

function edgeDist(a, b) {
    return dist(a.x, a.z, b.x, b.z) - a.radius - b.radius;
}

// ---------- setup ----------

function shuffled(list, rng) {
    const out = [...list];
    for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(random(rng) * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
}

function createTower(state, team, kind, x) {
    const spec = TOWERS[kind];
    return {
        id: state.nextId++,
        kind: 'tower',
        tower: kind,
        team,
        x,
        z: homeSign(team) * spec.z,
        radius: spec.radius,
        hp: spec.hp,
        maxHp: spec.hp,
        flying: false,
        building: true,
        active: kind === 'princess',
        destroyed: false,
        cooldown: 0,
        targetId: null,
    };
}

// options.towers = false builds an empty arena (used by balance duels).
export function createMatch({ seed, decks }, options = {}) {
    for (const deck of decks) {
        const error = validateDeck(deck);
        if (error) throw new Error(error);
    }
    const rng = createRng(seed);
    const state = {
        version: ENGINE_VERSION,
        seed: String(seed),
        tick: 0,
        phase: 'regular',
        result: null,
        nextId: 1,
        players: decks.map((deck) => {
            const order = shuffled(deck, rng);
            return {
                deck: [...deck],
                elixir: START_ELIXIR,
                hand: order.slice(0, HAND_SIZE),
                queue: order.slice(HAND_SIZE, DECK_SIZE),
                crowns: 0,
            };
        }),
        towers: [],
        units: [],
        projectiles: [],
        spells: [],
        events: [],
    };
    if (options.towers !== false) {
        for (const team of [0, 1]) {
            state.towers.push(createTower(state, team, 'princess', -BRIDGE_X));
            state.towers.push(createTower(state, team, 'princess', BRIDGE_X));
            state.towers.push(createTower(state, team, 'king', 0));
        }
    }
    return state;
}

// ---------- playing cards ----------

export function canDeployAt(state, team, x, z) {
    if (Math.abs(x) > HALF_WIDTH - 0.5) return false;
    const s = homeSign(team);
    const depth = z * s; // > 0 on your own side
    let ok = depth >= RIVER_HALF + 0.5 && depth <= HALF_LENGTH - 0.5;
    if (!ok && depth <= -(RIVER_HALF + 0.5) && depth >= -7.5) {
        // Knocking out a princess tower opens that lane's pocket.
        const lane = x < 0 ? -1 : 1;
        ok = state.towers.some((t) => t.team !== team && t.tower === 'princess' && t.destroyed && t.x * lane > 0);
    }
    if (!ok) return false;
    for (const t of state.towers) {
        if (!t.destroyed && dist(x, z, t.x, t.z) < t.radius + 0.3) return false;
    }
    return true;
}

export function validatePlay(state, play) {
    if (state.result) return 'match-over';
    if (play.team !== 0 && play.team !== 1) return 'bad-team';
    if (!Number.isFinite(play.x) || !Number.isFinite(play.z)) return 'bad-position';
    const player = state.players[play.team];
    if (!player.hand.includes(play.card)) return 'not-in-hand';
    const card = getCard(play.card);
    if (player.elixir < card.cost) return 'not-enough-elixir';
    if (card.type === 'spell') {
        if (Math.abs(play.x) > HALF_WIDTH || Math.abs(play.z) > HALF_LENGTH) return 'bad-position';
    } else if (!canDeployAt(state, play.team, play.x, play.z)) {
        return 'bad-position';
    }
    return null;
}

function playCard(state, play) {
    const player = state.players[play.team];
    const card = getCard(play.card);
    player.elixir -= card.cost;
    const slot = player.hand.indexOf(play.card);
    player.hand[slot] = player.queue.shift();
    player.queue.push(play.card);
    state.events.push({ type: 'play', team: play.team, card: card.id, x: play.x, z: play.z });

    if (card.type === 'spell') {
        state.spells.push({
            id: state.nextId++,
            team: play.team,
            card: card.id,
            x: play.x,
            z: play.z,
            ticks: Math.max(1, Math.round(card.travel * TICK_RATE)),
        });
        return;
    }
    spawnCard(state, play.team, card.id, play.x, play.z);
}

// Puts a unit card's units on the field without paying for it. Plays go
// through playCard; tests and balance duels call this directly.
export function spawnCard(state, team, cardId, px, pz) {
    const card = getCard(cardId);
    const s = homeSign(team);
    const formation = FORMATIONS[card.count ?? 1];
    const spawned = [];
    for (const [ox, oz] of formation) {
        const x = Math.max(-HALF_WIDTH + 0.4, Math.min(HALF_WIDTH - 0.4, px + ox));
        const unit = {
            id: state.nextId++,
            kind: 'unit',
            card: card.id,
            team,
            x,
            z: pz + oz * s,
            radius: card.radius,
            hp: card.hp,
            maxHp: card.hp,
            flying: !!card.flying,
            building: card.type === 'building',
            deploy: DEPLOY_TICKS,
            cooldown: 0,
            windup: -1,
            stun: 0,
            targetId: null,
            facing: x < 0 ? 1 : -1,
            moving: false,
        };
        state.units.push(unit);
        spawned.push(unit);
        state.events.push({ type: 'spawn', id: unit.id, card: card.id, team });
    }
    return spawned;
}

// ---------- combat helpers ----------

function isActive(e) {
    return e.hp > 0 && !e.destroyed && !(e.deploy > 0);
}

function canHit(targets, e) {
    if (targets === 'buildings') return e.building;
    if (e.flying) return targets === 'all';
    return true;
}

function damage(state, e, amount, source) {
    if (e.hp <= 0 || e.destroyed) return;
    e.hp -= amount;
    state.events.push({ type: 'hit', id: e.id, amount, source });
    if (e.kind === 'tower' && e.tower === 'king' && !e.active) wakeKing(state, e.team);
}

function wakeKing(state, team) {
    const king = state.towers.find((t) => t.team === team && t.tower === 'king');
    if (king && !king.active && !king.destroyed) {
        king.active = true;
        state.events.push({ type: 'king-awake', team });
    }
}

// Area damage to enemies of `team` around (x, z). towerScale scales damage
// to crown towers (spells chip towers for less).
function splash(state, team, x, z, radius, amount, targets, source, towerScale = 1, stunTicks = 0) {
    for (const e of enemies(state, team)) {
        if (!canHit(targets, e)) continue;
        if (dist(x, z, e.x, e.z) > radius + e.radius) continue;
        damage(state, e, e.kind === 'tower' ? amount * towerScale : amount, source);
        if (stunTicks && e.kind === 'unit') {
            e.stun = Math.max(e.stun, stunTicks);
            e.windup = -1;
        }
    }
}

function enemies(state, team) {
    const out = [];
    for (const u of state.units) if (u.team !== team && isActive(u)) out.push(u);
    for (const t of state.towers) if (t.team !== team && isActive(t)) out.push(t);
    return out;
}

function findById(state, id) {
    if (id === null) return null;
    for (const u of state.units) if (u.id === id) return u;
    for (const t of state.towers) if (t.id === id) return t;
    return null;
}

function acquireTarget(state, unit, card) {
    let best = null;
    let bestD = Infinity;
    let fallback = null;
    let fallbackD = Infinity;
    for (const e of enemies(state, unit.team)) {
        if (!canHit(card.targets, e)) continue;
        const d = edgeDist(unit, e);
        const sight = card.targets === 'buildings' ? Infinity : Math.max(SIGHT_RANGE, card.range + 1);
        if (d <= sight && d < bestD) {
            best = e;
            bestD = d;
        }
        // Head for the nearest building; with none left (an empty duel
        // arena), the nearest enemy of any kind.
        const fd = e.building ? d : d + 1000;
        if (fd < fallbackD) {
            fallback = e;
            fallbackD = fd;
        }
    }
    return best ?? fallback;
}

// Next point to walk to on the way to `dest`. Ground units cross the river
// on the bridges; flyers go straight.
export function waypoint(unit, dest) {
    if (unit.flying) return dest;
    const destSide = dest.z >= 0 ? 1 : -1;
    const side = unit.z >= 0 ? 1 : -1;
    const bridgeX = unit.x < 0 ? -BRIDGE_X : BRIDGE_X;
    const onBridgeLane = Math.abs(unit.x - bridgeX) < BRIDGE_HALF_WIDTH + 0.1;
    if (Math.abs(unit.z) < RIVER_HALF + 0.6 && onBridgeLane) {
        if (side !== destSide || Math.abs(unit.z) < RIVER_HALF) return { x: bridgeX, z: destSide * (RIVER_HALF + 0.8) };
        return dest;
    }
    if (side !== destSide) return { x: bridgeX, z: side * (RIVER_HALF + 0.4) };
    return dest;
}

function moveToward(unit, point, step) {
    const dx = point.x - unit.x;
    const dz = point.z - unit.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < 1e-6) return;
    const k = Math.min(step, d) / d;
    unit.x += dx * k;
    unit.z += dz * k;
    if (dx > 0.05 * d) unit.facing = 1;
    else if (dx < -0.05 * d) unit.facing = -1;
    unit.moving = true;
}

function fire(state, source, target, card, team) {
    state.projectiles.push({
        id: state.nextId++,
        team,
        source: source.card ?? source.tower,
        sourceId: source.id,
        targetId: target.id,
        x: source.x,
        z: source.z,
        tx: target.x,
        tz: target.z,
        speed: card.projectileSpeed / TICK_RATE,
        damage: card.damage,
        splash: card.splash ?? 0,
        targets: card.targets,
    });
}

// ---------- per-tick updates ----------

function updateUnit(state, unit) {
    const card = getCard(unit.card);
    unit.moving = false;
    if (unit.deploy > 0) {
        unit.deploy -= 1;
        if (unit.deploy === 0) state.events.push({ type: 'ready', id: unit.id });
        return;
    }
    if (unit.hp <= 0) return;
    if (card.lifetime) unit.hp -= card.hp / (card.lifetime * TICK_RATE);
    if (unit.stun > 0) {
        unit.stun -= 1;
        return;
    }
    if (unit.cooldown > 0) unit.cooldown -= 1;

    let target = findById(state, unit.targetId);
    if (!target || !isActive(target) || !canHit(card.targets, target)) target = null;
    const locked = target && (unit.windup >= 0 || edgeDist(unit, target) <= card.range);
    if (!locked) {
        target = acquireTarget(state, unit, card);
        unit.targetId = target ? target.id : null;
    }
    if (!target) {
        unit.windup = -1;
        return;
    }

    if (edgeDist(unit, target) <= card.range) {
        if (target.x > unit.x + 0.05) unit.facing = 1;
        else if (target.x < unit.x - 0.05) unit.facing = -1;
        const hitTicks = Math.round(card.hitSpeed * TICK_RATE);
        const windupTicks = Math.max(1, Math.round(hitTicks * WINDUP_SHARE));
        if (unit.windup < 0 && unit.cooldown <= 0) {
            unit.windup = windupTicks;
            state.events.push({ type: 'windup', id: unit.id, targetId: target.id });
        }
        if (unit.windup >= 0) {
            unit.windup -= 1;
            if (unit.windup < 0) {
                unit.cooldown = hitTicks - windupTicks;
                state.events.push({ type: 'attack', id: unit.id, targetId: target.id });
                if (card.projectileSpeed) fire(state, unit, target, card, unit.team);
                else if (card.splash) splash(state, unit.team, target.x, target.z, card.splash, card.damage, card.targets, card.id);
                else damage(state, target, card.damage, card.id);
            }
        }
        return;
    }
    unit.windup = -1;
    if (card.type === 'building') return;
    moveToward(unit, waypoint(unit, target), card.speed / TICK_RATE);
}

function updateTower(state, tower) {
    if (!tower.active || !isActive(tower)) return;
    const spec = TOWERS[tower.tower];
    if (tower.cooldown > 0) tower.cooldown -= 1;
    let target = findById(state, tower.targetId);
    if (!target || !isActive(target) || edgeDist(tower, target) > spec.range) {
        target = null;
        let bestD = spec.range;
        for (const u of state.units) {
            if (u.team === tower.team || !isActive(u)) continue;
            const d = edgeDist(tower, u);
            if (d <= bestD) {
                bestD = d;
                target = u;
            }
        }
        tower.targetId = target ? target.id : null;
    }
    if (!target || tower.cooldown > 0) return;
    tower.cooldown = Math.round(spec.hitSpeed * TICK_RATE);
    state.events.push({ type: 'attack', id: tower.id, targetId: target.id });
    fire(state, tower, target, { ...spec, targets: 'all' }, tower.team);
}

function updateProjectiles(state) {
    const alive = [];
    for (const p of state.projectiles) {
        const target = findById(state, p.targetId);
        if (target && isActive(target)) {
            p.tx = target.x;
            p.tz = target.z;
        }
        const d = dist(p.x, p.z, p.tx, p.tz);
        if (d > p.speed) {
            p.x += ((p.tx - p.x) / d) * p.speed;
            p.z += ((p.tz - p.z) / d) * p.speed;
            alive.push(p);
            continue;
        }
        p.x = p.tx;
        p.z = p.tz;
        state.events.push({ type: 'impact', id: p.id, x: p.x, z: p.z });
        if (p.splash) splash(state, p.team, p.x, p.z, p.splash, p.damage, p.targets, p.source);
        else if (target && isActive(target)) damage(state, target, p.damage, p.source);
    }
    state.projectiles = alive;
}

function updateSpells(state) {
    const pending = [];
    for (const spell of state.spells) {
        spell.ticks -= 1;
        if (spell.ticks > 0) {
            pending.push(spell);
            continue;
        }
        const card = getCard(spell.card);
        state.events.push({ type: 'spell', id: spell.id, card: card.id, team: spell.team, x: spell.x, z: spell.z });
        const stunTicks = card.stun ? Math.round(card.stun * TICK_RATE) : 0;
        splash(state, spell.team, spell.x, spell.z, card.radius, card.damage, 'all', card.id, card.towerScale, stunTicks);
    }
    state.spells = pending;
}

// Push overlapping units apart (heavier units move less), keep ground units
// out of towers, buildings and the river.
function separate(state) {
    const live = state.units.filter((u) => u.hp > 0 && u.deploy === 0);
    for (let i = 0; i < live.length; i++) {
        const a = live[i];
        const ma = getCard(a.card).mass;
        for (let j = i + 1; j < live.length; j++) {
            const b = live[j];
            if (a.flying !== b.flying) continue;
            const dx = b.x - a.x;
            const dz = b.z - a.z;
            const min = (a.radius + b.radius) * 0.9;
            const d2 = dx * dx + dz * dz;
            if (d2 >= min * min) continue;
            const mb = getCard(b.card).mass;
            const d = Math.sqrt(d2);
            // Stacked exactly: split along x so it's still deterministic.
            const nx = d > 1e-6 ? dx / d : 1;
            const nz = d > 1e-6 ? dz / d : 0;
            const overlap = min - d;
            const wa = a.building ? 0 : b.building ? 1 : mb / (ma + mb);
            const wb = b.building ? 0 : a.building ? 1 : ma / (ma + mb);
            a.x -= nx * overlap * wa;
            a.z -= nz * overlap * wa;
            b.x += nx * overlap * wb;
            b.z += nz * overlap * wb;
        }
    }
    for (const u of live) {
        if (u.building) continue;
        if (!u.flying) {
            for (const t of state.towers) {
                if (t.destroyed) continue;
                const dx = u.x - t.x;
                const dz = u.z - t.z;
                const min = u.radius + t.radius;
                const d = Math.sqrt(dx * dx + dz * dz);
                if (d < min && d > 1e-6) {
                    u.x += (dx / d) * (min - d);
                    u.z += (dz / d) * (min - d);
                }
            }
        }
        u.x = Math.max(-HALF_WIDTH + 0.4, Math.min(HALF_WIDTH - 0.4, u.x));
        u.z = Math.max(-HALF_LENGTH + 0.4, Math.min(HALF_LENGTH - 0.4, u.z));
        if (!u.flying && Math.abs(u.z) < RIVER_HALF + 0.5) {
            const bridgeX = u.x < 0 ? -BRIDGE_X : BRIDGE_X;
            if (Math.abs(u.z) < RIVER_HALF + 0.1 && Math.abs(u.x - bridgeX) > BRIDGE_HALF_WIDTH) {
                u.z = (u.z >= 0 ? 1 : -1) * (RIVER_HALF + 0.1);
            } else if (Math.abs(u.z) < RIVER_HALF + 0.1) {
                u.x = Math.max(bridgeX - BRIDGE_HALF_WIDTH, Math.min(bridgeX + BRIDGE_HALF_WIDTH, u.x));
            }
        }
    }
}

function resolveDeaths(state) {
    const alive = [];
    for (const u of state.units) {
        if (u.hp > 0) {
            alive.push(u);
            continue;
        }
        const card = getCard(u.card);
        state.events.push({ type: 'death', id: u.id, card: u.card, team: u.team, x: u.x, z: u.z });
        if (card.deathDamage) splash(state, u.team, u.x, u.z, card.deathRadius, card.deathDamage, 'ground', card.id);
    }
    state.units = alive;
    for (const t of state.towers) {
        if (t.destroyed || t.hp > 0) continue;
        t.destroyed = true;
        t.hp = 0;
        const winner = 1 - t.team;
        state.events.push({ type: 'tower-down', id: t.id, team: t.team, tower: t.tower });
        if (t.tower === 'king') {
            state.players[winner].crowns = 3;
            for (const other of state.towers) {
                if (other.team === t.team && !other.destroyed) {
                    other.destroyed = true;
                    other.hp = 0;
                }
            }
            endMatch(state, winner, 'king');
        } else {
            state.players[winner].crowns += 1;
            wakeKing(state, t.team);
        }
    }
}

function endMatch(state, winner, reason) {
    if (state.result) return;
    state.result = { winner, reason, tick: state.tick };
    state.phase = 'ended';
    state.events.push({ type: 'end', winner, reason });
}

function checkClock(state) {
    if (state.result) return;
    const [a, b] = state.players.map((p) => p.crowns);
    if (state.tick === MATCH_TICKS) {
        if (a !== b) endMatch(state, a > b ? 0 : 1, 'time');
        else {
            state.phase = 'overtime';
            state.events.push({ type: 'overtime' });
        }
    } else if (state.phase === 'overtime') {
        if (a !== b) endMatch(state, a > b ? 0 : 1, 'overtime');
        else if (state.tick >= MATCH_TICKS + OVERTIME_TICKS) {
            // Tiebreak: whoever's weakest standing tower is lower loses.
            const weakest = [0, 1].map((team) =>
                Math.min(...state.towers.filter((t) => t.team === team && !t.destroyed).map((t) => t.hp))
            );
            if (weakest[0] === weakest[1]) endMatch(state, null, 'draw');
            else endMatch(state, weakest[0] > weakest[1] ? 0 : 1, 'tiebreak');
        }
    }
}

export function elixirRate(state) {
    const perTick = 1 / (ELIXIR_SECONDS * TICK_RATE);
    return state.tick >= DOUBLE_ELIXIR_TICK ? perTick * 2 : perTick;
}

// Advance one tick. `plays` are the card plays scheduled for this tick; bad
// ones are dropped with a 'rejected' event. Returns the state (mutated).
export function stepMatch(state, plays = []) {
    if (state.result) return state;
    state.events = [];
    for (const play of plays) {
        const error = validatePlay(state, play);
        if (error) state.events.push({ type: 'rejected', team: play.team, card: play.card, reason: error });
        else playCard(state, play);
    }
    const rate = elixirRate(state);
    for (const p of state.players) p.elixir = Math.min(ELIXIR_MAX, p.elixir + rate);

    updateSpells(state);
    for (const unit of state.units) updateUnit(state, unit);
    separate(state);
    for (const tower of state.towers) updateTower(state, tower);
    updateProjectiles(state);
    resolveDeaths(state);
    state.tick += 1;
    checkClock(state);
    return state;
}

export function isMatchOver(state) {
    return state.result !== null;
}

// Cheap fingerprint of everything that matters, for desync checks.
export function hashState(state) {
    let h = 2166136261;
    const mix = (n) => {
        h ^= Math.round(n * 1000) | 0;
        h = Math.imul(h, 16777619);
    };
    mix(state.tick);
    for (const p of state.players) {
        mix(p.elixir);
        mix(p.crowns);
    }
    for (const t of state.towers) mix(t.hp);
    for (const u of state.units) {
        mix(u.id);
        mix(u.x);
        mix(u.z);
        mix(u.hp);
    }
    for (const p of state.projectiles) {
        mix(p.x);
        mix(p.z);
    }
    return h >>> 0;
}
