// The Monster Bash roster. Sprites are the original 8 Bit Evil enemy sheets
// in public/sprites; they only have walk cycles, so the arena fakes attacks
// with tweens. Stats are tuned with `npm run balance:monster-bash`.
//
// Units: distances are arena units (the arena is ARENA_WIDTH wide), times are
// engine ticks (TICK_RATE per second). A move's `range` is measured edge to
// edge between the two bodies, so 0 means touching. `poise` is the chance to
// take a normal hit without flinching.

export const MONSTERS = [
    {
        id: 'zombie',
        name: 'Zombie',
        title: 'The Shambling Dead',
        sprite: { url: '/sprites/zombiesprite-1.png', frameWidth: 16, frameHeight: 24, frames: 6, scale: 4 },
        stats: {
            maxHp: 120, walkSpeed: 1.3, width: 44, weight: 1.3, armor: 0.12, evasion: 0,
            blockChance: 0.1, aggression: 0.75, reaction: [8, 16], preferredRange: 6, poise: 0.35, regen: 0.8,
        },
        moves: [
            { id: 'claw', name: 'Rotten Claw', kind: 'strike', range: 26, damage: [9, 13], startup: 9, active: 4, recovery: 12, cooldown: 10, knockback: 10, hitstun: 12, weight: 3 },
            { id: 'bite', name: 'Infectious Bite', kind: 'strike', range: 14, damage: [13, 18], startup: 14, active: 4, recovery: 16, cooldown: 45, knockback: 6, hitstun: 16, weight: 2, effects: { lifesteal: 0.5 } },
            { id: 'lurch', name: 'Lurch', kind: 'dash', range: 8, minRange: 16, damage: [8, 12], startup: 12, active: 16, recovery: 12, cooldown: 70, knockback: 18, hitstun: 14, speed: 5, weight: 1 },
        ],
        special: { id: 'horde', name: 'Grave Horde', kind: 'strike', range: 60, damage: [28, 36], startup: 18, active: 8, recovery: 20, cooldown: 0, knockback: 40, hitstun: 26, weight: 1 },
    },
    {
        id: 'skull',
        name: 'Floating Skull',
        title: 'Grinning Bone Orb',
        sprite: { url: '/sprites/skullsprite.png', frameWidth: 24, frameHeight: 18, frames: 6, scale: 4 },
        stats: {
            maxHp: 84, walkSpeed: 2.2, width: 52, weight: 0.8, armor: 0, evasion: 0.12,
            blockChance: 0.2, aggression: 0.6, reaction: [5, 12], preferredRange: 150, poise: 0, regen: 0,
        },
        moves: [
            { id: 'bone', name: 'Bone Spit', kind: 'projectile', range: 320, minRange: 40, damage: [8, 11], startup: 10, active: 1, recovery: 14, cooldown: 30, knockback: 8, hitstun: 10, speed: 7, weight: 3 },
            { id: 'headbutt', name: 'Skull Bash', kind: 'strike', range: 20, damage: [9, 13], startup: 7, active: 4, recovery: 12, cooldown: 12, knockback: 26, hitstun: 12, weight: 2 },
            { id: 'rattle', name: 'Rattle Rush', kind: 'dash', range: 6, minRange: 16, damage: [10, 14], startup: 10, active: 14, recovery: 14, cooldown: 80, knockback: 30, hitstun: 14, speed: 8, weight: 1 },
        ],
        special: { id: 'barrage', name: 'Bone Barrage', kind: 'projectile', range: 500, damage: [6, 9], startup: 16, active: 24, recovery: 18, cooldown: 0, knockback: 6, hitstun: 10, speed: 8, hits: 4, weight: 1 },
    },
    {
        id: 'werewolf',
        name: 'Werewolf',
        title: 'Moonlit Mauler',
        sprite: { url: '/sprites/werewolfsprite.png', frameWidth: 30, frameHeight: 26, frames: 7, scale: 3.4 },
        stats: {
            maxHp: 96, walkSpeed: 2.8, width: 72, weight: 1.1, armor: 0.04, evasion: 0.06,
            blockChance: 0.15, aggression: 0.85, reaction: [4, 10], preferredRange: 8, poise: 0.15, regen: 0,
        },
        moves: [
            { id: 'swipe', name: 'Claw Swipe', kind: 'strike', range: 24, damage: [5, 8], startup: 6, active: 3, recovery: 9, cooldown: 8, knockback: 8, hitstun: 11, weight: 3 },
            { id: 'flurry', name: 'Feral Flurry', kind: 'strike', range: 22, damage: [3, 5], startup: 8, active: 15, recovery: 14, cooldown: 55, knockback: 4, hitstun: 8, hits: 4, weight: 2 },
            { id: 'pounce', name: 'Pounce', kind: 'dash', range: 8, minRange: 16, damage: [9, 12], startup: 8, active: 14, recovery: 12, cooldown: 60, knockback: 24, hitstun: 16, speed: 9, weight: 2 },
        ],
        special: { id: 'howl', name: 'Blood Moon Frenzy', kind: 'strike', range: 26, damage: [6, 8], startup: 12, active: 30, recovery: 18, cooldown: 0, knockback: 6, hitstun: 10, hits: 5, weight: 1, effects: { lifesteal: 0.4 } },
    },
    {
        id: 'shadowbeast',
        name: 'Shadow Beast',
        title: 'Thing Under the Bed',
        sprite: { url: '/sprites/shadowbeast.png', frameWidth: 32, frameHeight: 32, frames: 6, scale: 3 },
        stats: {
            maxHp: 112, walkSpeed: 1.7, width: 76, weight: 1.4, armor: 0.1, evasion: 0,
            blockChance: 0.25, aggression: 0.6, reaction: [8, 16], preferredRange: 40, poise: 0.35, regen: 0,
        },
        moves: [
            { id: 'maul', name: 'Shadow Maul', kind: 'strike', range: 34, damage: [15, 21], startup: 13, active: 5, recovery: 16, cooldown: 18, knockback: 28, hitstun: 16, weight: 3 },
            { id: 'wave', name: 'Dark Wave', kind: 'projectile', range: 360, minRange: 60, damage: [13, 17], startup: 16, active: 1, recovery: 18, cooldown: 60, knockback: 16, hitstun: 14, speed: 5, weight: 2 },
            { id: 'engulf', name: 'Engulf', kind: 'strike', range: 16, damage: [20, 25], startup: 20, active: 5, recovery: 22, cooldown: 70, knockback: 34, hitstun: 22, weight: 1 },
        ],
        special: { id: 'eclipse', name: 'Total Eclipse', kind: 'strike', range: 120, damage: [36, 45], startup: 24, active: 6, recovery: 24, cooldown: 0, knockback: 50, hitstun: 30, weight: 1 },
    },
    {
        id: 'rat',
        name: 'Plague Rat',
        title: 'Sewer Speedster',
        sprite: { url: '/sprites/rat.png', frameWidth: 16, frameHeight: 16, frames: 6, scale: 4 },
        stats: {
            maxHp: 72, walkSpeed: 3.8, width: 40, weight: 0.6, armor: 0, evasion: 0.22,
            blockChance: 0.05, aggression: 0.9, reaction: [3, 8], preferredRange: 4, poise: 0, regen: 0,
        },
        moves: [
            { id: 'nibble', name: 'Nibble', kind: 'strike', range: 16, damage: [4, 6], startup: 4, active: 3, recovery: 7, cooldown: 4, knockback: 4, hitstun: 9, weight: 4 },
            { id: 'plague', name: 'Plague Bite', kind: 'strike', range: 14, damage: [5, 8], startup: 8, active: 3, recovery: 12, cooldown: 60, knockback: 4, hitstun: 10, weight: 2, effects: { burn: { perSecond: 2.2, seconds: 5 } } },
            { id: 'scurry', name: 'Scurry Strike', kind: 'dash', range: 6, minRange: 16, damage: [6, 9], startup: 5, active: 12, recovery: 8, cooldown: 30, knockback: 10, hitstun: 10, speed: 10, weight: 2 },
        ],
        special: { id: 'swarm', name: 'Rat King Swarm', kind: 'strike', range: 40, damage: [5, 6], startup: 12, active: 36, recovery: 16, cooldown: 0, knockback: 3, hitstun: 8, hits: 8, weight: 1 },
    },
    {
        id: 'pumpkin',
        name: 'Jack',
        title: 'Rolling Gourd',
        sprite: { url: '/sprites/pumpkin.png', frameWidth: 16, frameHeight: 16, frames: 6, scale: 4 },
        stats: {
            maxHp: 104, walkSpeed: 2.4, width: 44, weight: 1.0, armor: 0.08, evasion: 0.05,
            blockChance: 0.2, aggression: 0.7, reaction: [6, 12], preferredRange: 60, poise: 0.15, regen: 0,
        },
        moves: [
            { id: 'seeds', name: 'Seed Spit', kind: 'projectile', range: 300, minRange: 30, damage: [4, 6], startup: 8, active: 1, recovery: 12, cooldown: 24, knockback: 6, hitstun: 10, speed: 8, weight: 3 },
            { id: 'roll', name: 'Gourd Roll', kind: 'dash', range: 6, minRange: 16, damage: [9, 11], startup: 10, active: 18, recovery: 14, cooldown: 50, knockback: 32, hitstun: 16, speed: 9, weight: 2 },
            { id: 'stem', name: 'Stem Whip', kind: 'strike', range: 26, damage: [5, 8], startup: 7, active: 4, recovery: 11, cooldown: 10, knockback: 12, hitstun: 12, weight: 2 },
        ],
        special: { id: 'harvest', name: 'Harvest Inferno', kind: 'projectile', range: 500, damage: [16, 19], startup: 20, active: 1, recovery: 22, cooldown: 0, knockback: 30, hitstun: 24, speed: 6, weight: 1, effects: { burn: { perSecond: 3, seconds: 4 } } },
    },
    {
        id: 'ghost',
        name: 'Ghost',
        title: 'The Restless Sheet',
        sprite: { url: '/sprites/ghost.png', frameWidth: 16, frameHeight: 32, frames: 6, scale: 3.5 },
        stats: {
            maxHp: 72, walkSpeed: 2.5, width: 44, weight: 0.7, armor: 0, evasion: 0.2,
            blockChance: 0.05, aggression: 0.6, reaction: [5, 12], preferredRange: 110, poise: 0, regen: 0.5,
        },
        moves: [
            { id: 'wail', name: 'Wail', kind: 'projectile', range: 320, minRange: 30, damage: [6, 8], startup: 10, active: 1, recovery: 14, cooldown: 26, knockback: 10, hitstun: 12, speed: 6, weight: 3 },
            { id: 'chill', name: 'Chilling Touch', kind: 'strike', range: 18, damage: [7, 9], startup: 7, active: 4, recovery: 12, cooldown: 14, knockback: 14, hitstun: 18, weight: 2 },
            { id: 'phase', name: 'Phase Through', kind: 'dash', range: 6, minRange: 16, damage: [7, 9], startup: 8, active: 14, recovery: 10, cooldown: 60, knockback: 10, hitstun: 14, speed: 9, weight: 1, effects: { lifesteal: 0.5 } },
        ],
        special: { id: 'possess', name: 'Possession', kind: 'strike', range: 70, damage: [19, 23], startup: 16, active: 6, recovery: 18, cooldown: 0, knockback: 20, hitstun: 30, weight: 1, effects: { lifesteal: 0.5 } },
    },
    {
        id: 'swampthing',
        name: 'Swamp Thing',
        title: 'Bog Colossus',
        sprite: { url: '/sprites/swampthing.png', frameWidth: 34, frameHeight: 58, frames: 6, scale: 2.4 },
        stats: {
            maxHp: 148, walkSpeed: 1.1, width: 80, weight: 1.8, armor: 0.15, evasion: 0,
            blockChance: 0.1, aggression: 0.6, reaction: [10, 18], preferredRange: 20, poise: 0.45, regen: 1.2,
        },
        moves: [
            { id: 'slam', name: 'Muck Slam', kind: 'strike', range: 40, damage: [10, 14], startup: 16, active: 5, recovery: 18, cooldown: 20, knockback: 34, hitstun: 18, weight: 3 },
            { id: 'vines', name: 'Grasping Vines', kind: 'strike', range: 90, minRange: 30, damage: [7, 9], startup: 18, active: 6, recovery: 20, cooldown: 50, knockback: -30, hitstun: 20, weight: 2 },
            { id: 'sludge', name: 'Sludge Toss', kind: 'projectile', range: 300, minRange: 90, damage: [6, 9], startup: 16, active: 1, recovery: 18, cooldown: 60, knockback: 8, hitstun: 12, speed: 5, weight: 1 },
        ],
        special: { id: 'quagmire', name: 'Quagmire', kind: 'strike', range: 140, damage: [20, 26], startup: 26, active: 8, recovery: 26, cooldown: 0, knockback: -40, hitstun: 32, weight: 1 },
    },
    {
        id: 'ufo',
        name: 'UFO',
        title: 'Visitor From Beyond',
        sprite: { url: '/sprites/ufo.png', frameWidth: 32, frameHeight: 26, frames: 6, scale: 2.8 },
        stats: {
            maxHp: 80, walkSpeed: 2.6, width: 76, weight: 0.9, armor: 0.05, evasion: 0.1,
            blockChance: 0.15, aggression: 0.65, reaction: [5, 12], preferredRange: 140, poise: 0, regen: 0,
        },
        moves: [
            { id: 'laser', name: 'Ray Gun', kind: 'projectile', range: 320, minRange: 50, damage: [6, 8], startup: 8, active: 1, recovery: 12, cooldown: 28, knockback: 8, hitstun: 10, speed: 9, weight: 3 },
            { id: 'probe', name: 'Probe', kind: 'strike', range: 26, damage: [11, 15], startup: 6, active: 4, recovery: 12, cooldown: 14, knockback: 36, hitstun: 12, weight: 2 },
            { id: 'beam', name: 'Tractor Beam', kind: 'strike', range: 160, minRange: 60, damage: [7, 10], startup: 14, active: 8, recovery: 18, cooldown: 70, knockback: -60, hitstun: 20, weight: 1 },
        ],
        special: { id: 'abduct', name: 'Abduction', kind: 'strike', range: 400, damage: [31, 37], startup: 22, active: 6, recovery: 22, cooldown: 0, knockback: 0, hitstun: 30, weight: 1 },
    },
    {
        id: 'scarecrow',
        name: 'Scarecrow',
        title: 'Keeper of the Field',
        sprite: { url: '/sprites/scarecrow.png', frameWidth: 24, frameHeight: 48, frames: 6, scale: 2.8 },
        stats: {
            maxHp: 106, walkSpeed: 1.9, width: 56, weight: 1.0, armor: 0.05, evasion: 0.05,
            blockChance: 0.25, aggression: 0.65, reaction: [6, 14], preferredRange: 45, poise: 0.15, regen: 0,
        },
        moves: [
            { id: 'scythe', name: 'Scythe Sweep', kind: 'strike', range: 56, damage: [9, 12], startup: 11, active: 5, recovery: 14, cooldown: 12, knockback: 18, hitstun: 14, weight: 3 },
            { id: 'crows', name: 'Murder of Crows', kind: 'projectile', range: 360, minRange: 70, damage: [3, 4], startup: 12, active: 20, recovery: 14, cooldown: 60, knockback: 3, hitstun: 8, speed: 7, hits: 3, weight: 2 },
            { id: 'stab', name: 'Pitchfork Jab', kind: 'strike', range: 36, damage: [7, 9], startup: 6, active: 3, recovery: 10, cooldown: 8, knockback: 10, hitstun: 10, weight: 2 },
        ],
        special: { id: 'reap', name: 'Grim Harvest', kind: 'strike', range: 90, damage: [27, 31], startup: 20, active: 6, recovery: 22, cooldown: 0, knockback: 44, hitstun: 26, weight: 1 },
    },
    {
        id: 'imp',
        name: 'Imp',
        title: 'Hellfire Trickster',
        sprite: { url: '/sprites/imp.png', frameWidth: 16, frameHeight: 16, frames: 4, scale: 4 },
        stats: {
            maxHp: 82, walkSpeed: 3.2, width: 40, weight: 0.7, armor: 0, evasion: 0.18,
            blockChance: 0.1, aggression: 0.8, reaction: [4, 10], preferredRange: 80, poise: 0, regen: 0,
        },
        moves: [
            { id: 'fireball', name: 'Fireball', kind: 'projectile', range: 360, minRange: 30, damage: [3, 4], startup: 8, active: 1, recovery: 12, cooldown: 26, knockback: 8, hitstun: 10, speed: 9, weight: 3, effects: { burn: { perSecond: 1.5, seconds: 3 } } },
            { id: 'jab', name: 'Pitchfork Poke', kind: 'strike', range: 20, damage: [2, 4], startup: 5, active: 3, recovery: 8, cooldown: 6, knockback: 8, hitstun: 9, weight: 3 },
            { id: 'blink', name: 'Blink Strike', kind: 'dash', range: 6, minRange: 16, damage: [4, 6], startup: 6, active: 8, recovery: 10, cooldown: 50, knockback: 16, hitstun: 14, speed: 18, weight: 2 },
        ],
        special: { id: 'brimstone', name: 'Brimstone Burst', kind: 'strike', range: 80, damage: [10, 12], startup: 14, active: 6, recovery: 18, cooldown: 0, knockback: 40, hitstun: 24, weight: 1, effects: { burn: { perSecond: 3, seconds: 4 } } },
    },
    {
        id: 'candle',
        name: 'Candle',
        title: 'Wick of Woe',
        sprite: { url: '/sprites/candle.png', frameWidth: 32, frameHeight: 32, frames: 6, scale: 3 },
        stats: {
            maxHp: 88, walkSpeed: 1.8, width: 56, weight: 0.9, armor: 0.05, evasion: 0.05,
            blockChance: 0.15, aggression: 0.65, reaction: [6, 12], preferredRange: 70, poise: 0.1, regen: 0,
        },
        moves: [
            { id: 'flick', name: 'Flame Flick', kind: 'projectile', range: 260, minRange: 30, damage: [4, 6], startup: 9, active: 1, recovery: 12, cooldown: 20, knockback: 6, hitstun: 10, speed: 7, weight: 3, effects: { burn: { perSecond: 1.5, seconds: 3 } } },
            { id: 'wax', name: 'Hot Wax', kind: 'strike', range: 30, damage: [6, 8], startup: 8, active: 4, recovery: 12, cooldown: 12, knockback: 14, hitstun: 14, weight: 3, effects: { burn: { perSecond: 2, seconds: 3 } } },
            { id: 'flare', name: 'Flare Up', kind: 'strike', range: 60, damage: [8, 11], startup: 14, active: 6, recovery: 16, cooldown: 50, knockback: 26, hitstun: 16, weight: 1 },
        ],
        special: { id: 'inferno', name: 'Wildfire', kind: 'strike', range: 160, damage: [15, 19], startup: 18, active: 8, recovery: 22, cooldown: 0, knockback: 30, hitstun: 24, weight: 1, effects: { burn: { perSecond: 4, seconds: 5 } } },
    },
];

export const MONSTERS_BY_ID = Object.fromEntries(MONSTERS.map((monster) => [monster.id, monster]));

export function getMonster(id) {
    const monster = MONSTERS_BY_ID[id];
    if (!monster) throw new Error(`Unknown monster: ${id}`);
    return monster;
}
