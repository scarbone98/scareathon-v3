// Builds a night's Cross Bones crossword from its theme: shuffle the theme's words with
// the night's seed, then fit as many as will go into a SIZE x SIZE grid, every word
// crossing another. Many tries; the one with the most words (then the most crossings,
// then the tightest box) wins. The same night and theme always give the same grid.
//
// The themes (answers and clues) aren't in this repo: see content.js.
import { seededRandom, shuffled } from './rules.js';

const SIZE = 11;
const MAX_WORDS = 12;
const TRIES = 120;

class Board {
    cells = new Map();
    placed = [];
    crossings = 0;
    minR = 0;
    maxR = -1;
    minC = 0;
    maxC = -1;

    at(r, c) {
        return this.cells.get(`${r},${c}`);
    }

    // How many existing letters the word would cross there, or -1 if it can't go there
    fit(word, row, col, dir) {
        const dr = dir === 'down' ? 1 : 0;
        const dc = dir === 'across' ? 1 : 0;
        const endR = row + dr * (word.length - 1);
        const endC = col + dc * (word.length - 1);
        if (this.placed.length) {
            if (Math.max(this.maxR, endR) - Math.min(this.minR, row) >= SIZE) return -1;
            if (Math.max(this.maxC, endC) - Math.min(this.minC, col) >= SIZE) return -1;
        }
        // Nothing touching either end
        if (this.at(row - dr, col - dc) || this.at(endR + dr, endC + dc)) return -1;
        let crosses = 0;
        for (let i = 0; i < word.length; i++) {
            const r = row + dr * i;
            const c = col + dc * i;
            const cell = this.at(r, c);
            if (cell) {
                if (cell.ch !== word[i] || cell[dir]) return -1;
                crosses++;
            } else if (this.at(r + dc, c + dr) || this.at(r - dc, c - dr)) {
                // A new letter can't sit beside another word's letter, or it'd spell nonsense
                return -1;
            }
        }
        return crosses;
    }

    put(p, crosses) {
        const dr = p.dir === 'down' ? 1 : 0;
        const dc = p.dir === 'across' ? 1 : 0;
        for (let i = 0; i < p.word.length; i++) {
            const r = p.row + dr * i;
            const c = p.col + dc * i;
            const cell = this.at(r, c) ?? { ch: p.word[i], across: false, down: false };
            cell[p.dir] = true;
            this.cells.set(`${r},${c}`, cell);
        }
        const endR = p.row + dr * (p.word.length - 1);
        const endC = p.col + dc * (p.word.length - 1);
        if (!this.placed.length) [this.minR, this.maxR, this.minC, this.maxC] = [p.row, endR, p.col, endC];
        this.minR = Math.min(this.minR, p.row);
        this.maxR = Math.max(this.maxR, endR);
        this.minC = Math.min(this.minC, p.col);
        this.maxC = Math.max(this.maxC, endC);
        this.placed.push(p);
        this.crossings += crosses;
    }

    area() {
        return (this.maxR - this.minR + 1) * (this.maxC - this.minC + 1);
    }
}

function attempt(words, rand) {
    const board = new Board();
    // Long words first make a sturdier spine; a little shuffle in the order keeps tries different
    const order = words.slice().sort((a, b) => b.word.length - a.word.length + (rand() - 0.5) * 3);
    const [first, ...rest] = order;
    board.put({ ...first, row: 0, col: 0, dir: rand() < 0.5 ? 'across' : 'down' }, 0);
    let pending = rest;
    // Keep going round while words still find a home
    for (let pass = 0; pass < 3 && pending.length && board.placed.length < MAX_WORDS; pass++) {
        const missed = [];
        for (const w of pending) {
            if (board.placed.length >= MAX_WORDS) break;
            let best = null;
            for (const [key, cell] of board.cells) {
                const [r, c] = key.split(',').map(Number);
                for (let i = 0; i < w.word.length; i++) {
                    if (w.word[i] !== cell.ch) continue;
                    for (const dir of ['across', 'down']) {
                        const row = dir === 'down' ? r - i : r;
                        const col = dir === 'across' ? c - i : c;
                        const crosses = board.fit(w.word, row, col, dir);
                        if (crosses < 1) continue;
                        const score = crosses * 10 + rand() * 6;
                        if (!best || score > best.score) best = { p: { ...w, row, col, dir }, crosses, score };
                    }
                }
            }
            if (best) board.put(best.p, best.crosses);
            else missed.push(w);
        }
        pending = missed;
    }
    return board;
}

function better(a, b) {
    if (a.placed.length !== b.placed.length) return a.placed.length > b.placed.length;
    if (a.crossings !== b.crossings) return a.crossings > b.crossings;
    return a.area() < b.area();
}

// theme: { name, words: [{ word, clue }] }. Returns the full puzzle, answers included:
// { theme, rows, cols, cells (row-major letters, '#' for a block), entries }
export function buildCrossword(n, theme) {
    const words = theme.words
        .map(({ word, clue }) => ({ word: String(word).toUpperCase(), clue: String(clue) }))
        .filter(({ word }) => /^[A-Z]{3,11}$/.test(word));
    const rand = seededRandom(n * 7919 + 13);
    let best = null;
    for (let t = 0; t < TRIES; t++) {
        const board = attempt(shuffled(words, rand).slice(0, 16), rand);
        if (!best || better(board, best)) best = board;
    }
    const rows = best.maxR - best.minR + 1;
    const cols = best.maxC - best.minC + 1;
    const cells = Array(rows * cols).fill('#');
    for (const [key, cell] of best.cells) {
        const [r, c] = key.split(',').map(Number);
        cells[(r - best.minR) * cols + (c - best.minC)] = cell.ch;
    }
    // Numbers go in reading order on every square that starts a word
    const starts = best.placed.map((p) => ({ ...p, row: p.row - best.minR, col: p.col - best.minC }));
    const numAt = new Map();
    let next = 1;
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (starts.some((p) => p.row === r && p.col === c)) numAt.set(r * cols + c, next++);
        }
    }
    const entries = starts
        .map(({ word, clue, row, col, dir }) => ({ num: numAt.get(row * cols + col), dir, row, col, length: word.length, clue }))
        .sort((a, b) => (a.dir === b.dir ? a.num - b.num : a.dir === 'across' ? -1 : 1));
    return { theme: theme.name, rows, cols, cells: cells.join(''), entries };
}
