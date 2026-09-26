// Mystery Crypt's saved progress: your heroes' levels, the monsters you've
// collected, your team, candy and how far you've got. The game plays on the
// client, so the server only checks a save is well-formed and in bounds
// before storing it. Shared by the game and the server.

export const SAVE_VERSION = 1;

export const HERO_IDS = ['joe', 'matt', 'alex', 'jon'];
export const MONSTER_IDS = [
    'rat', 'imp', 'pumpkin', 'skull', 'zombie', 'candle',
    'ghost', 'scarecrow', 'werewolf', 'ufo', 'shadowbeast', 'swampthing',
];
export const MOVE_IDS = [
    'fireball', 'lightning', 'boomerang', 'claw', 'crossbow',
    'cursedsword', 'acid', 'batswarm', 'wisp', 'holycross', 'heartbeat',
];
export const ITEM_IDS = ['heart', 'candycorn', 'lamp', 'elixir'];

export const MAX_MONSTERS = 120;
export const MAX_TEAM = 3;
export const MAX_BAG = 10;
export const MAX_LEVEL = 100;
export const MAX_MOVES = 4;
const MAX_STAGE = 500;
const MAX_CANDY = 100_000_000;
// Bigger than any real save, small enough to refuse junk.
export const MAX_SAVE_BYTES = 40_000;

const isInt = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;

function cleanMoves(moves) {
    if (!Array.isArray(moves) || moves.length > MAX_MOVES) return null;
    if (!moves.every((m) => MOVE_IDS.includes(m))) return null;
    if (new Set(moves).size !== moves.length) return null;
    return [...moves];
}

function cleanUnit(unit) {
    if (!unit || typeof unit !== 'object') return null;
    if (!isInt(unit.level, 1, MAX_LEVEL) || !isInt(unit.xp, 0, 10_000_000)) return null;
    const moves = cleanMoves(unit.moves);
    if (!moves) return null;
    return { level: unit.level, xp: unit.xp, moves };
}

// Returns { save } with only the known fields, or { error }.
export function sanitizeSave(raw) {
    if (!raw || typeof raw !== 'object') return { error: 'Save must be an object' };
    if (raw.version !== SAVE_VERSION) return { error: 'Unknown save version' };
    if (!HERO_IDS.includes(raw.hero)) return { error: 'Unknown hero' };

    const heroes = {};
    for (const id of HERO_IDS) {
        const hero = cleanUnit(raw.heroes?.[id]);
        if (!hero) return { error: `Bad hero ${id}` };
        heroes[id] = hero;
    }

    if (!Array.isArray(raw.monsters) || raw.monsters.length > MAX_MONSTERS) return { error: 'Bad monsters' };
    const monsters = [];
    const uids = new Set();
    for (const m of raw.monsters) {
        const unit = cleanUnit(m);
        if (!unit || !MONSTER_IDS.includes(m.kind) || !isInt(m.uid, 1, 1_000_000_000) || uids.has(m.uid)) {
            return { error: 'Bad monster' };
        }
        uids.add(m.uid);
        monsters.push({ uid: m.uid, kind: m.kind, ...unit });
    }

    if (!Array.isArray(raw.team) || raw.team.length > MAX_TEAM || !raw.team.every((uid) => uids.has(uid)) || new Set(raw.team).size !== raw.team.length) {
        return { error: 'Bad team' };
    }
    if (!isInt(raw.nextUid, 1, 1_000_000_000) || [...uids].some((uid) => uid >= raw.nextUid)) return { error: 'Bad nextUid' };
    if (!isInt(raw.candy, 0, MAX_CANDY)) return { error: 'Bad candy' };
    if (!Array.isArray(raw.bag) || raw.bag.length > MAX_BAG || !raw.bag.every((i) => ITEM_IDS.includes(i))) return { error: 'Bad bag' };
    if (!isInt(raw.cleared, 0, MAX_STAGE)) return { error: 'Bad cleared' };
    if (!Array.isArray(raw.best) || raw.best.length > MAX_STAGE + 1 || !raw.best.every((f) => isInt(f, 0, 100))) return { error: 'Bad best' };
    if (!isInt(raw.submitted, 0, 1_000_000_000)) return { error: 'Bad submitted' };

    return {
        save: {
            version: SAVE_VERSION,
            hero: raw.hero,
            heroes,
            monsters,
            team: [...raw.team],
            nextUid: raw.nextUid,
            candy: raw.candy,
            bag: [...raw.bag],
            cleared: raw.cleared,
            best: [...raw.best],
            submitted: raw.submitted,
        },
    };
}

// What the leaderboard ranks: stages cleared, then how far into the next
// one you've got, then (as a tiebreak) how many monsters you've collected.
export function progressScore(save) {
    const frontier = save.best[save.cleared] ?? 0;
    return save.cleared * 100_000 + frontier * 1_000 + Math.min(999, save.monsters.length);
}
