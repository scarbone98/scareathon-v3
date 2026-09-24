// Card pool for the lane battler. Every card is flat: no levels, so a match
// is decided by the decks and the play, not by grinding.
//
// Units: distances in tiles (the arena is 18 x 32), times in seconds, speed
// in tiles per second, damage per hit. The engine converts to ticks.
//
// Cost should buy power: `npm run balance:royale` prints each card's power
// (sqrt(effective hp x dps)) per elixir and flags cards off the curve. Cheap
// cards may still beat expensive ones they counter (air vs ground-only melee,
// swarms vs slow single-target hitters) - that's the point of the game.
//
// targets: 'ground' (ground units and buildings), 'all' (air too) or
// 'buildings' (walks past units straight to towers and buildings).

import { MONSTERS } from '../monster-bash/roster.js';

function sheet(id) {
    const s = MONSTERS.find((m) => m.id === id).sprite;
    return { url: s.url, frameWidth: s.frameWidth, frameHeight: s.frameHeight, frames: s.frames, height: (s.frameHeight * s.scale) / 64 };
}

export const CARDS = [
    // ---- cheap swarms and cycle ----
    {
        id: 'rat', name: 'Rat Pack', type: 'unit', cost: 2, count: 4,
        hp: 120, damage: 55, hitSpeed: 1.0, range: 0.4, speed: 1.8, targets: 'ground', radius: 0.35, mass: 1,
        sprite: sheet('rat'),
    },
    {
        id: 'imp', name: 'Imp Gang', type: 'unit', cost: 2, count: 3,
        hp: 110, damage: 42, hitSpeed: 1.2, range: 3.5, projectileSpeed: 12, speed: 1.5, targets: 'all', radius: 0.35, mass: 1,
        sprite: sheet('imp'),
    },
    {
        id: 'comet', name: 'Comet', type: 'spell', cost: 2,
        damage: 170, radius: 2.0, towerScale: 0.35, travel: 0.25, stun: 0.5,
        sprite: { url: '/royale/comet.png', frameWidth: 32, frameHeight: 32, frames: 1, height: 1 },
    },
    // ---- 3 elixir ----
    {
        id: 'zombie', name: 'Zombie', type: 'unit', cost: 3,
        hp: 880, damage: 135, hitSpeed: 1.2, range: 0.5, speed: 1.0, targets: 'ground', radius: 0.5, mass: 4,
        sprite: sheet('zombie'),
    },
    {
        id: 'pumpkin', name: 'Pumpkin Pair', type: 'unit', cost: 3, count: 2,
        hp: 380, damage: 90, hitSpeed: 1.1, range: 0.4, speed: 1.2, targets: 'ground', radius: 0.45, mass: 2,
        deathDamage: 90, deathRadius: 1.5,
        sprite: sheet('pumpkin'),
    },
    {
        id: 'ghost', name: 'Ghost', type: 'unit', cost: 3, flying: true,
        hp: 520, damage: 100, hitSpeed: 1.1, range: 0.6, speed: 1.5, targets: 'all', radius: 0.5, mass: 3,
        sprite: sheet('ghost'),
    },
    {
        id: 'skull', name: 'Floating Skull', type: 'unit', cost: 3, flying: true,
        hp: 330, damage: 85, hitSpeed: 1.1, range: 3.5, projectileSpeed: 12, speed: 1.5, targets: 'all', radius: 0.45, mass: 2,
        sprite: sheet('skull'),
    },
    {
        id: 'crow', name: 'Crow Flock', type: 'unit', cost: 3, count: 3, flying: true,
        hp: 140, damage: 60, hitSpeed: 1.0, range: 0.4, speed: 2.0, targets: 'all', radius: 0.35, mass: 1,
        sprite: { url: '/royale/crowFlap.png', frameWidth: 32, frameHeight: 32, frames: 4, height: 1.0, front: true },
    },
    // ---- 4 elixir ----
    {
        id: 'werewolf', name: 'Werewolf', type: 'unit', cost: 4,
        hp: 900, damage: 95, hitSpeed: 0.7, range: 0.5, speed: 1.5, targets: 'ground', radius: 0.55, mass: 5,
        sprite: sheet('werewolf'),
    },
    {
        id: 'scarecrow', name: 'Scarecrow', type: 'unit', cost: 4,
        hp: 600, damage: 120, hitSpeed: 1.1, range: 5.5, projectileSpeed: 13, speed: 1.0, targets: 'all', radius: 0.5, mass: 4,
        sprite: sheet('scarecrow'),
    },
    {
        id: 'candle', name: 'Cursed Candle', type: 'building', cost: 4,
        hp: 1100, lifetime: 30, damage: 95, hitSpeed: 1.0, range: 6, projectileSpeed: 14, targets: 'all', radius: 0.9, mass: 100,
        sprite: sheet('candle'),
    },
    {
        id: 'meteor', name: 'Meteor', type: 'spell', cost: 4,
        damage: 480, radius: 2.5, towerScale: 0.35, travel: 1.0,
        sprite: { url: '/royale/meteor.png', frameWidth: 64, frameHeight: 64, frames: 1, height: 1 },
    },
    // ---- heavies ----
    {
        id: 'ufo', name: 'UFO', type: 'unit', cost: 5, flying: true,
        hp: 950, damage: 115, hitSpeed: 1.5, range: 4.5, projectileSpeed: 10, splash: 1.2, speed: 1.0, targets: 'all', radius: 0.6, mass: 6,
        sprite: sheet('ufo'),
    },
    {
        id: 'shadowbeast', name: 'Shadow Beast', type: 'unit', cost: 5,
        hp: 1500, damage: 165, hitSpeed: 1.5, range: 0.6, splash: 1.5, speed: 1.0, targets: 'ground', radius: 0.7, mass: 8,
        sprite: sheet('shadowbeast'),
    },
    {
        id: 'swampthing', name: 'Swamp Thing', type: 'unit', cost: 6,
        hp: 3300, damage: 190, hitSpeed: 1.5, range: 0.6, speed: 0.75, targets: 'buildings', radius: 0.75, mass: 18,
        sprite: sheet('swampthing'),
    },
];

const byId = new Map(CARDS.map((card) => [card.id, card]));

export function getCard(id) {
    const card = byId.get(id);
    if (!card) throw new Error(`Unknown card: ${id}`);
    return card;
}

export function hasCard(id) {
    return byId.has(id);
}

export const DECK_SIZE = 8;

export function validateDeck(deck) {
    if (!Array.isArray(deck) || deck.length !== DECK_SIZE) return `A deck needs exactly ${DECK_SIZE} cards`;
    if (new Set(deck).size !== deck.length) return 'A deck cannot repeat a card';
    const unknown = deck.find((id) => !hasCard(id));
    if (unknown) return `Unknown card: ${unknown}`;
    return null;
}

// Rough raw strength: sqrt(total effective hp x total dps) across the whole
// card. Lanchester-style, so it rewards both staying alive and killing fast.
// Splash, air targeting and building-only targeting are adjusted because
// they change how much of that strength is usable.
export function cardPower(card) {
    if (card.type === 'spell') return null;
    const count = card.count ?? 1;
    const lifetimeFactor = card.lifetime ? Math.min(1, card.lifetime / 30) : 1;
    let dps = (card.damage / card.hitSpeed) * count;
    if (card.splash) dps *= 1.35;
    if (card.targets === 'all') dps *= 1.1;
    if (card.targets === 'buildings') dps *= 0.8;
    // Range is free damage before melee reaches you.
    if (card.range > 1) dps *= 1 + Math.min(card.range, 6) * 0.06;
    let hp = card.hp * count * lifetimeFactor;
    // Ground melee can't touch flyers.
    if (card.flying) hp *= 1.2;
    // A group loses damage as members fall: on average (n + 1) / 2n of it.
    if (count > 1) dps *= (count + 1) / (2 * count);
    return Math.sqrt(hp * dps);
}
