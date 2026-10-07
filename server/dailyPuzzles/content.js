// The daily puzzles' answers and clues. This repo is public, so they aren't in it: they
// live in the daily_puzzle_content table (row 'scaredle_answers': the answers in play
// order; row 'cross_bones_themes': [{ name, words: [{ word, clue }] }], a theme a night
// in turn). Their source is the gitignored daily-puzzles/ folder, uploaded with
// npm run upload:daily-puzzles.
//
// A puzzle's answer (or grid) is copied into a player's row the first time they open it,
// so editing the lists later only changes puzzles nobody has started.
import pool from '../db/mockDB.js';
import { buildCrossword } from './crossBonesLayout.js';

const CACHE_MS = 5 * 60 * 1000;
let cached = null;
let cachedAt = 0;

export async function loadContent(db = pool) {
    if (cached && Date.now() - cachedAt < CACHE_MS) return cached;
    const result = await db.query("SELECT key, value FROM daily_puzzle_content WHERE key IN ('scaredle_answers', 'cross_bones_themes')");
    const byKey = Object.fromEntries(result.rows.map((row) => [row.key, row.value]));
    const answers = (byKey.scaredle_answers ?? []).filter((w) => /^[a-z]{5}$/i.test(w));
    const themes = (byKey.cross_bones_themes ?? []).filter((t) => t?.name && Array.isArray(t.words) && t.words.length >= 6);
    if (!answers.length || !themes.length) throw new Error('daily_puzzle_content is missing its answers or themes');
    cached = { answers, themes };
    cachedAt = Date.now();
    return cached;
}

export function clearContentCache() {
    cached = null;
}

export function scaredleAnswerFor(n, content) {
    return content.answers[(n - 1) % content.answers.length].toUpperCase();
}

// Building a grid takes ~50ms, so the last few are kept
const grids = new Map();
export function crossBonesPuzzleFor(n, content) {
    const theme = content.themes[(n - 1) % content.themes.length];
    const key = `${n}:${theme.name}:${theme.words.length}`;
    if (!grids.has(key)) {
        if (grids.size > 40) grids.delete(grids.keys().next().value);
        grids.set(key, buildCrossword(n, theme));
    }
    return grids.get(key);
}
