// Avatar v2 helpers shared by the user and marketplace routes. The rules
// (builds, categories, allowed colours) are generated from avatar-art/ by
// `npm run art:avatar` into avatarRules.json.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const rulesFile = path.join(path.dirname(fileURLToPath(import.meta.url)), 'avatarRules.json');
export const avatarRules = JSON.parse(fs.readFileSync(rulesFile, 'utf8'));

const MAX_OUTFIT_ITEMS = 40;

// Columns every v2 item query selects, so rows serialize the same everywhere.
export const avatarItemColumns = `
    ai.id,
    ai.item_key,
    ai.name,
    ai.category,
    ai.parts,
    ai.asset_path,
    ai.dyes,
    ai.hides,
    ai.occupies,
    ai.stack_order,
    ai.rarity,
    ai.base_price,
    ai.release_status,
    ai.is_tradeable,
    ai.is_sellable
`;

export function serializeAvatarItemV2(row) {
    return {
        id: row.id,
        itemKey: row.item_key,
        name: row.name,
        category: row.category,
        parts: row.parts || [],
        icon: row.asset_path,
        dyes: row.dyes || {},
        hides: row.hides || [],
        occupies: row.occupies || [],
        order: row.stack_order || 0,
        rarity: row.rarity,
        basePrice: row.base_price,
        releaseStatus: row.release_status,
        isTradeable: row.is_tradeable,
        isSellable: row.is_sellable,
    };
}

export function serializeProfile(row) {
    return {
        build: row?.build || avatarRules.builds[0],
        buildChosen: Boolean(row?.build_chosen),
        skin: row?.skin || avatarRules.skinTones[0],
        hair: row?.hair || avatarRules.hairColors[0],
        eyes: row?.eyes || avatarRules.eyeColors[0],
        // When the look was last saved; a composite older than this is stale.
        savedAt: row?.updated_at ? new Date(row.updated_at).toISOString() : null,
    };
}

// Checks the shape of a save request before touching the database.
// Returns { profile, entries } or { error }.
export function parseOutfitRequest(body, rules = avatarRules) {
    const profile = body?.profile;
    const outfit = body?.outfit;
    if (!profile || typeof profile !== 'object' || !Array.isArray(outfit)) {
        return { error: 'profile and outfit are required' };
    }
    if (!rules.builds.includes(profile.build)) return { error: 'Unknown body build' };
    if (!rules.skinTones.includes(profile.skin)) return { error: 'Unknown skin tone' };
    if (!rules.hairColors.includes(profile.hair)) return { error: 'Unknown hair colour' };
    if (!rules.eyeColors.includes(profile.eyes)) return { error: 'Unknown eye colour' };
    if (outfit.length > MAX_OUTFIT_ITEMS) return { error: 'Too many items in the outfit' };

    const entries = [];
    const seen = new Set();
    for (const entry of outfit) {
        const itemInstanceId = Number(entry?.itemInstanceId);
        if (!Number.isInteger(itemInstanceId) || itemInstanceId <= 0 || seen.has(itemInstanceId)) {
            return { error: 'Each outfit item needs a unique itemInstanceId' };
        }
        seen.add(itemInstanceId);

        const dyes = entry?.dyes ?? {};
        if (!dyes || typeof dyes !== 'object' || Array.isArray(dyes)) return { error: 'dyes must be an object' };
        for (const [channel, ramp] of Object.entries(dyes)) {
            if (!rules.dyeChannels.includes(channel)) return { error: `Unknown dye channel "${channel}"` };
            if (!rules.dyeColors.includes(ramp)) return { error: `Unknown dye colour "${ramp}"` };
        }
        entries.push({ itemInstanceId, dyes });
    }

    return {
        profile: { build: profile.build, skin: profile.skin, hair: profile.hair, eyes: profile.eyes },
        entries,
    };
}

// Checks the outfit against the items the user actually owns.
// `ownedById` maps itemInstanceId -> item row (with category, occupies, dyes).
export function validateOutfitItems(entries, ownedById, rules = avatarRules) {
    const worn = {};
    let bodies = 0;
    for (const { itemInstanceId, dyes } of entries) {
        const item = ownedById.get(itemInstanceId);
        if (!item) return 'One or more items are not in your inventory';

        for (const channel of Object.keys(dyes)) {
            if (!(channel in (item.dyes || {}))) return `${item.name} can't be dyed that way`;
        }

        for (const category of [item.category, ...(item.occupies || [])]) {
            worn[category] = (worn[category] || 0) + 1;
            const limit = rules.categories[category] ?? 1;
            if (worn[category] > limit) {
                return limit === 1
                    ? `Only one ${category.replace(/_/g, ' ')} item can be worn at a time`
                    : `Only ${limit} ${category.replace(/_/g, ' ')} items can be worn at a time`;
            }
        }
        if (item.category === 'body') bodies += 1;
    }
    if (bodies !== 1) return 'An outfit needs exactly one body';
    return null;
}
