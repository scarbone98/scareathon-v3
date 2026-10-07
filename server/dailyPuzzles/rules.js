// The daily puzzles' rules, kept apart from the routes so they can be tested on their own:
// which day's puzzle it is, Scaredle's marks, Cross Bones' fill checks, scores and tickets.
//
// A puzzle day runs midnight to midnight US Eastern (the same day the arcade's ticket
// counts use), the same for everyone; puzzle #1 is 2026-10-07. The answers never leave
// the server: the page sends guesses and letters, and gets back marks.
import { GUESSES } from '../shared/dailyPuzzles/guesses.js';

export const PUZZLE_TIME_ZONE = 'America/New_York';
export const FIRST_PUZZLE_DATE = '2026-10-07';
export const GAMES = ['scaredle', 'cross-bones'];
// Leaderboards and the games table know them by these names
export const GAME_NAMES = { scaredle: 'Scaredle', 'cross-bones': 'Cross Bones' };

// Solved on its own day, or caught up on later from the archive
export const SAME_DAY_TICKETS = 100;
export const LATE_TICKETS = 10;

export const SCAREDLE_LENGTH = 5;
export const SCAREDLE_TRIES = 6;

export const CHECK_PENALTY = 25;
export const REVEAL_PENALTY = 40;

const DAY_MS = 86_400_000;
const dateFormat = new Intl.DateTimeFormat('en-CA', { timeZone: PUZZLE_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });
const timeFormat = new Intl.DateTimeFormat('en-US', { timeZone: PUZZLE_TIME_ZONE, hourCycle: 'h23', hour: '2-digit', minute: '2-digit', second: '2-digit' });

export function puzzleNumberAt(at = new Date()) {
    const today = Date.parse(`${dateFormat.format(at)}T00:00:00Z`);
    return Math.round((today - Date.parse(`${FIRST_PUZZLE_DATE}T00:00:00Z`)) / DAY_MS) + 1;
}

// The calendar date (YYYY-MM-DD) puzzle n belongs to
export function puzzleDate(n) {
    return new Date(Date.parse(`${FIRST_PUZZLE_DATE}T00:00:00Z`) + (n - 1) * DAY_MS).toISOString().slice(0, 10);
}

// Until the next puzzle (an hour out either way on the nights the clocks change)
export function msUntilNextPuzzle(at = new Date()) {
    const [h, m, s] = timeFormat.format(at).split(':').map(Number);
    return DAY_MS - ((h * 60 + m) * 60 + s) * 1000 - at.getMilliseconds();
}

// mulberry32: small, fast, and the same everywhere for the same seed
export function seededRandom(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export function shuffled(items, rand) {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
}

// --- Scaredle -------------------------------------------------------------------------

let guessable = null;
export function isGuessable(word) {
    if (!guessable) {
        guessable = new Set();
        for (let i = 0; i < GUESSES.length; i += SCAREDLE_LENGTH) guessable.add(GUESSES.slice(i, i + SCAREDLE_LENGTH));
    }
    return typeof word === 'string' && guessable.has(word.toLowerCase());
}

// Two passes, so a letter guessed twice is only marked as often as the answer has it
export function markGuess(guess, answer) {
    const g = guess.toUpperCase();
    const a = answer.toUpperCase();
    const out = Array(SCAREDLE_LENGTH).fill('absent');
    const left = {};
    for (let i = 0; i < SCAREDLE_LENGTH; i++) {
        if (g[i] === a[i]) out[i] = 'correct';
        else left[a[i]] = (left[a[i]] ?? 0) + 1;
    }
    for (let i = 0; i < SCAREDLE_LENGTH; i++) {
        if (out[i] !== 'correct' && left[g[i]] > 0) {
            out[i] = 'present';
            left[g[i]]--;
        }
    }
    return out;
}

// 600 for a first-guess win down to 100 for a sixth
export function scaredleScore(tries) {
    return (SCAREDLE_TRIES + 1 - tries) * 100;
}

// --- Cross Bones ----------------------------------------------------------------------

// The grid as the page sees it: '#' for a block and '.' for a square to fill, no letters
export function publicCrossword(puzzle) {
    return {
        theme: puzzle.theme,
        rows: puzzle.rows,
        cols: puzzle.cols,
        mask: puzzle.cells.replace(/[A-Z]/g, '.'),
        entries: puzzle.entries,
    };
}

export function openCells(puzzle) {
    return puzzle.cells.replace(/#/g, '').length;
}

// What a player has filled in, made safe: one A-Z or ' ' a square, '#' on the blocks,
// and revealed squares kept to their answers
export function cleanFill(fill, puzzle, revealed = []) {
    const text = typeof fill === 'string' ? fill.toUpperCase() : '';
    const out = [];
    for (let i = 0; i < puzzle.cells.length; i++) {
        if (puzzle.cells[i] === '#') out.push('#');
        else if (revealed.includes(i)) out.push(puzzle.cells[i]);
        else out.push(/^[A-Z]$/.test(text[i] ?? '') ? text[i] : ' ');
    }
    return out.join('');
}

export function emptyFill(puzzle) {
    return puzzle.cells.replace(/[A-Z]/g, ' ');
}

// Squares filled in with the wrong letter
export function wrongCells(fill, puzzle) {
    const wrong = [];
    for (let i = 0; i < puzzle.cells.length; i++) {
        if (puzzle.cells[i] !== '#' && fill[i] !== ' ' && fill[i] !== puzzle.cells[i]) wrong.push(i);
    }
    return wrong;
}

export function isFull(fill) {
    return !fill.includes(' ');
}

export function isSolved(fill, puzzle) {
    return fill === puzzle.cells;
}

// 1000, less a point every 2 seconds and the help taken, never under 50
export function crossBonesScore(seconds, checks, reveals) {
    return Math.max(50, 1000 - Math.floor(seconds / 2) - checks * CHECK_PENALTY - reveals * REVEAL_PENALTY);
}

// --- Tickets --------------------------------------------------------------------------

// A solve pays SAME_DAY_TICKETS on the puzzle's own day and LATE_TICKETS after. A loss pays
// nothing, and nor does a crossword more than half revealed (it'd be free tickets).
export function ticketsFor({ won, sameDay, revealed = 0, open = 0 }) {
    if (!won) return 0;
    if (open && revealed * 2 > open) return 0;
    return sameDay ? SAME_DAY_TICKETS : LATE_TICKETS;
}
