// CPU player. Reads the match state and returns a card play (or null) each
// tick. It only ever talks to the engine through plays, like a human, so the
// server can run it as a fallback opponent. Its randomness is its own seeded
// generator, so a bot game still replays exactly from its play log.

import { createRng, random, randomInt } from '../monster-bash/rng.js';
import { CARDS, cardPower, getCard } from './cards.js';
import { BRIDGE_X, HALF_LENGTH, HALF_WIDTH, RIVER_HALF, canDeployAt, homeSign } from './engine.js';

const TANKS = new Set(CARDS.filter((c) => c.type === 'unit' && c.hp * (c.count ?? 1) >= 1400).map((c) => c.id));

export function createBot(seed, { reaction = [8, 20] } = {}) {
    return { rng: createRng(`bot:${seed}`), reaction, wait: randomInt(createRng(`bot-wait:${seed}`), 10, 30) };
}

function clampToZone(state, team, x, z) {
    const s = homeSign(team);
    x = Math.max(-HALF_WIDTH + 0.6, Math.min(HALF_WIDTH - 0.6, x));
    let depth = Math.max(RIVER_HALF + 0.6, Math.min(HALF_LENGTH - 0.6, z * s));
    for (let i = 0; i < 12; i++) {
        if (canDeployAt(state, team, x, depth * s)) return { x, z: depth * s };
        depth = depth < HALF_LENGTH - 2 ? depth + 1 : RIVER_HALF + 0.6 + i * 0.5;
        if (i === 6) x *= 0.5;
    }
    return null;
}

function canHitCard(card, unit) {
    if (card.targets === 'buildings') return false;
    return !unit.flying || card.targets === 'all';
}

function clusterAround(foes, x, z, radius) {
    return foes.filter((u) => {
        const dx = u.x - x;
        const dz = u.z - z;
        return dx * dx + dz * dz <= radius * radius;
    });
}

function spellValue(card, cluster) {
    let value = 0;
    for (const u of cluster) value += Math.min(card.damage, u.hp) / u.maxHp * getCard(u.card).cost / (getCard(u.card).count ?? 1);
    return value;
}

function defend(state, team, bot, me, foes, threats) {
    const s = homeSign(team);
    // The deepest threat is the most urgent.
    const threat = threats.reduce((a, b) => (b.z * s > a.z * s ? b : a));
    const threatCard = getCard(threat.card);
    const cluster = clusterAround(foes, threat.x, threat.z, 2.5);
    const urgent = threat.z * s > 5;

    let best = null;
    for (const id of me.hand) {
        const card = getCard(id);
        let score;
        if (card.type === 'spell') {
            const value = spellValue(card, clusterAround(foes, threat.x, threat.z, card.radius));
            score = value >= card.cost * 0.9 ? 1.2 + value / card.cost : 0;
        } else if (card.type === 'building') {
            score = threatCard.targets === 'buildings' ? 1.5 : canHitCard(card, threat) ? 0.7 : 0;
        } else {
            if (!canHitCard(card, threat)) continue;
            score = cardPower(card) / card.cost / 100;
            if (cluster.length >= 3 && card.splash) score += 0.6;
            if (threat.flying && card.targets === 'all') score += 0.3;
            if (TANKS.has(threat.card) && (card.count ?? 1) >= 3) score += 0.4;
        }
        score += random(bot.rng) * 0.3;
        if (score > 0 && (!best || score > best.score)) best = { card, score };
    }
    if (!best) return null;
    if (best.card.cost > me.elixir) return null; // save up for the right answer
    const card = best.card;
    if (card.type === 'spell') {
        const lead = getCard(threat.card).speed * card.travel * s * 0.8;
        return { team, card: card.id, x: threat.x, z: threat.z + lead };
    }
    let spot;
    if (card.type === 'building') spot = clampToZone(state, team, threat.x * 0.3, s * 4.5);
    else if (card.range > 2) spot = clampToZone(state, team, threat.x * 0.6, threat.z + s * (card.range - 0.5));
    else spot = clampToZone(state, team, threat.x, threat.z + s * (urgent ? 1.2 : 2.5));
    return spot ? { team, card: card.id, ...spot } : null;
}

function attack(state, team, bot, me, foes) {
    const s = homeSign(team);
    const enemyTowers = state.towers.filter((t) => t.team !== team && !t.destroyed);

    // Finish a tower or punish a big clump with a spell.
    for (const id of me.hand) {
        const card = getCard(id);
        if (card.type !== 'spell' || card.cost > me.elixir) continue;
        const weak = enemyTowers.find((t) => t.hp <= card.damage * card.towerScale);
        if (weak) return { team, card: card.id, x: weak.x, z: weak.z };
        for (const u of foes) {
            const value = spellValue(card, clusterAround(foes, u.x, u.z, card.radius));
            if (value >= card.cost * 1.3) return { team, card: card.id, x: u.x, z: u.z };
        }
    }

    const mine = state.units.filter((u) => u.team === team && u.hp > 0 && !u.building);
    const pushing = mine.filter((u) => u.z * s < 3);
    const princesses = enemyTowers.filter((t) => t.tower === 'princess');
    let lane = random(bot.rng) < 0.5 ? -1 : 1;
    if (pushing.length) lane = pushing[0].x < 0 ? -1 : 1;
    else if (princesses.length === 2 && Math.abs(princesses[0].hp - princesses[1].hp) > 150) {
        lane = princesses[0].hp < princesses[1].hp ? Math.sign(princesses[0].x) : Math.sign(princesses[1].x);
    } else if (princesses.length === 1) lane = Math.sign(princesses[0].x);

    const units = me.hand.map(getCard).filter((c) => c.type === 'unit' && c.cost <= me.elixir);
    if (!units.length) return null;

    if (pushing.length) {
        // Support the push: ranged and air behind the front unit.
        const front = pushing.reduce((a, b) => (b.z * s < a.z * s ? b : a));
        const support = units.find((c) => !TANKS.has(c.id) && (c.range > 2 || c.flying)) ?? units.find((c) => !TANKS.has(c.id));
        if (!support || me.elixir < support.cost + 1) return null;
        const spot = clampToZone(state, team, front.x, front.z + s * 3);
        return spot ? { team, card: support.id, ...spot } : null;
    }

    if (me.elixir < 8.5 && !(me.elixir >= 6.5 && random(bot.rng) < 0.25)) return null;
    const tank = units.find((c) => TANKS.has(c.id));
    const card = tank ?? units[randomInt(bot.rng, 0, units.length - 1)];
    const atBack = tank && random(bot.rng) < 0.5;
    const spot = atBack
        ? clampToZone(state, team, lane * 3, s * (HALF_LENGTH - 1.5))
        : clampToZone(state, team, lane * BRIDGE_X + (random(bot.rng) - 0.5) * 1.5, s * (RIVER_HALF + 1.5 + random(bot.rng) * 3));
    return spot ? { team, card: card.id, ...spot } : null;
}

export function botPlay(state, team, bot) {
    if (state.result) return null;
    if (bot.wait > 0) {
        bot.wait -= 1;
        return null;
    }
    bot.wait = randomInt(bot.rng, bot.reaction[0], bot.reaction[1]);
    const s = homeSign(team);
    const me = state.players[team];
    const foes = state.units.filter((u) => u.team !== team && u.hp > 0);
    const threats = foes.filter((u) => u.z * s > -2 && !u.building);
    if (threats.length) {
        const play = defend(state, team, bot, me, foes, threats);
        if (play) return play;
    }
    return attack(state, team, bot, me, foes);
}
