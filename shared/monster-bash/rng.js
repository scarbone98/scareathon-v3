// Seeded randomness for the fight engine. The generator state is a plain
// object so a whole fight state can be cloned and resumed (live odds do this).

export function hashSeed(input) {
    const str = String(input);
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
        h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
        h = (h << 13) | (h >>> 19);
    }
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^ (h >>> 16)) >>> 0;
}

export function createRng(seed) {
    return { s: hashSeed(seed) };
}

// mulberry32
export function random(rng) {
    let t = (rng.s = (rng.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function randomInt(rng, min, max) {
    return min + Math.floor(random(rng) * (max - min + 1));
}

export function randomBetween(rng, min, max) {
    return min + random(rng) * (max - min);
}

export function chance(rng, probability) {
    return random(rng) < probability;
}

export function pickWeighted(rng, items, getWeight) {
    let total = 0;
    for (const item of items) total += getWeight(item);
    let roll = random(rng) * total;
    for (const item of items) {
        roll -= getWeight(item);
        if (roll < 0) return item;
    }
    return items[items.length - 1];
}
