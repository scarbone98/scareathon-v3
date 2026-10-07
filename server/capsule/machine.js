// The capsule machine on the platform: a turn of the crank costs tickets and
// drops one hat or held thing from the shop, picked at random. Mostly common
// ones; the rarer the item, the slimmer the chance.

export const CAPSULE_PRICE = 75;
export const CAPSULE_CATEGORIES = ['head', 'held'];
// Nothing dearer than this in the shop goes in the machine (the Trophy, at 999,999, is for buying).
export const CAPSULE_MAX_SHOP_PRICE = 5000;

// How likely each rarity is, out of 100.
export const CAPSULE_ODDS = {
    common: 70,
    uncommon: 20,
    rare: 7,
    epic: 2.5,
    legendary: 0.5,
};

// Picks a capsule's item: first a rarity by the odds (among the rarities the
// machine actually has), then any item of that rarity. `items` each have a
// `rarity`; returns one of them, or null if the machine is empty.
export function pickCapsule(items, rng) {
    const byRarity = new Map();
    for (const item of items) {
        if (!(item.rarity in CAPSULE_ODDS)) continue;
        if (!byRarity.has(item.rarity)) byRarity.set(item.rarity, []);
        byRarity.get(item.rarity).push(item);
    }
    if (byRarity.size === 0) return null;
    const stocked = [...byRarity.keys()];
    const total = stocked.reduce((sum, rarity) => sum + CAPSULE_ODDS[rarity], 0);
    let roll = rng() * total;
    let chosen = stocked[stocked.length - 1];
    for (const rarity of stocked) {
        roll -= CAPSULE_ODDS[rarity];
        if (roll < 0) {
            chosen = rarity;
            break;
        }
    }
    const pool = byRarity.get(chosen);
    return pool[Math.floor(rng() * pool.length)];
}
