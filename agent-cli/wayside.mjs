#!/usr/bin/env node
// wayside: the Scareathon from a terminal, for you or an AI agent acting for you.
// It signs in with an agent key (Settings, at the register by the pigeonholes, "Agent keys"),
// which can only read the calendar and the Scareboard and mark the nights you've watched.
// No dependencies: Node 18+.

import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

const API = (process.env.WAYSIDE_API_URL || 'https://scareathon-v3-production.up.railway.app').replace(/\/$/, '');
const CONFIG = join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'wayside', 'key');

const HELP = `wayside: Scareathon for agents and terminals

Usage: wayside <command> [args] [--json]

  login <key>        Save an agent key (or set WAYSIDE_KEY). Make one in Settings > Agent keys.
  logout             Forget the saved key
  whoami             Whose key this is
  tonight            Tonight's movie (alias: today, now)
  movie <day>        One night's movie, with details
  calendar           All of October
  status             Your season: nights watched and points (alias: me)
  watch [day]        Mark a night watched (default tonight; only nights that have come)
  unwatch <day>      Unmark a night
  standings [year]   The Scareboard (alias: scoreboard)

  --json             Print the API's JSON, for agents and scripts

Days are October nights, 1 to 31, on US Eastern time like the calendar.`;

class CliError extends Error {}

async function loadKey() {
    if (process.env.WAYSIDE_KEY) return process.env.WAYSIDE_KEY.trim();
    try {
        return (await readFile(CONFIG, 'utf8')).trim();
    } catch {
        return null;
    }
}

async function api(method, path) {
    const key = await loadKey();
    if (!key) throw new CliError('No agent key. Make one in Settings > Agent keys, then run: wayside login <key>');
    let response;
    try {
        response = await fetch(`${API}${path}`, { method, headers: { Authorization: `Bearer ${key}` } });
    } catch (error) {
        throw new CliError(`Could not reach ${API} (${error.message})`);
    }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new CliError(body.error || `${method} ${path} failed (${response.status})`);
    return body.data;
}

// Today in New York, and which October night it is (null outside October)
function easternToday(date = new Date()) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York', year: 'numeric', month: 'numeric', day: 'numeric'
    }).formatToParts(date).map(part => [part.type, Number(part.value)]));
    return { year: parts.year, month: parts.month, day: parts.day, night: parts.month === 10 ? parts.day : null };
}

function parseDay(value) {
    const day = Number(value);
    if (!Number.isInteger(day) || day < 1 || day > 31) throw new CliError(`"${value}" isn't a night of October (1 to 31)`);
    return day;
}

const tonightOrFail = () => {
    const { night, month } = easternToday();
    if (!night) throw new CliError(month < 10 ? 'The Scareathon starts October 1.' : 'The Scareathon is over for this year. Pass a day.');
    return night;
};

const describeMovie = m => [
    `Night ${m.day}: ${m.title}${m.releaseYear ? ` (${m.releaseYear})` : ''}`,
    m.theme && `Theme: ${m.theme}`,
    m.notes && m.notes,
    m.overview && `\n${m.overview}`,
].filter(Boolean).join('\n');

const commands = {
    async login([key]) {
        if (!key || !key.startsWith('wsa_')) throw new CliError('Usage: wayside login wsa_...  (an agent key from Settings)');
        await mkdir(dirname(CONFIG), { recursive: true });
        await writeFile(CONFIG, `${key}\n`, { mode: 0o600 });
        const me = await api('GET', '/agent/whoami');
        return { data: me, text: `Saved. This key acts as ${me.username ?? 'you'} ("${me.key}").` };
    },
    async logout() {
        await rm(CONFIG, { force: true });
        return { data: { loggedOut: true }, text: 'Forgot the saved key. (Revoke it in Settings to turn it off for good.)' };
    },
    async whoami() {
        const me = await api('GET', '/agent/whoami');
        return { data: me, text: `${me.username ?? '(no name yet)'}, using the key "${me.key}"` };
    },
    async tonight() {
        const night = tonightOrFail();
        const [movie, me] = await Promise.all([api('GET', `/calendar/${night}`), api('GET', '/scareathon/me')]);
        const watched = me.watchedDays.includes(night);
        return { data: { ...movie, watched }, text: `${describeMovie(movie)}\n\n${watched ? 'You marked it watched.' : 'Not marked watched yet: wayside watch'}` };
    },
    async movie([day]) {
        if (!day) throw new CliError('Usage: wayside movie <day>');
        const movie = await api('GET', `/calendar/${parseDay(day)}`);
        return { data: movie, text: describeMovie(movie) };
    },
    async calendar() {
        const days = (await api('GET', '/calendar')).filter(Boolean);
        const { night } = easternToday();
        return {
            data: days,
            text: days.map(d => `${String(d.day).padStart(2)}${d.day === night ? '*' : ' '} ${d.title}${d.releaseYear ? ` (${d.releaseYear})` : ''}  [${d.theme}]`).join('\n'),
        };
    },
    async status() {
        const me = await api('GET', '/scareathon/me');
        const p = me.points;
        return {
            data: me,
            text: `Season ${me.season}: ${p.total} points (${p.movies} movies, ${p.weekly} weekly, ${p.bonus} bonus)\n` +
                `Watched: ${me.watchedDays.length ? me.watchedDays.join(', ') : 'none yet'}`,
        };
    },
    async watch([day]) {
        const night = day ? parseDay(day) : tonightOrFail();
        const me = await api('PUT', `/scareathon/watches/${night}`);
        return { data: me, text: `Marked night ${night} watched. ${me.points.total} points this season.` };
    },
    async unwatch([day]) {
        if (!day) throw new CliError('Usage: wayside unwatch <day>');
        const night = parseDay(day);
        const me = await api('DELETE', `/scareathon/watches/${night}`);
        return { data: me, text: `Unmarked night ${night}. ${me.points.total} points this season.` };
    },
    async standings([year]) {
        if (year && !/^\d{4}$/.test(year)) throw new CliError('Usage: wayside standings [year]');
        const board = await api('GET', year ? `/leaderboard?year=${year}` : '/leaderboard');
        const players = Array.isArray(board) ? board : [];
        const text = players.length
            ? players.map((u, i) => `${String(u.rank ?? i + 1).padStart(3)}. ${u.name}  ${u.total} pts`).join('\n')
            : 'No standings yet.';
        return { data: board, text };
    },
};
Object.assign(commands, { today: commands.tonight, now: commands.tonight, me: commands.status, scoreboard: commands.standings });

async function main() {
    const argv = process.argv.slice(2);
    const json = argv.includes('--json');
    const [name, ...args] = argv.filter(arg => arg !== '--json');
    if (!name || name === 'help' || name === '--help' || name === '-h') {
        console.log(HELP);
        return;
    }
    const command = commands[name];
    if (!command) throw new CliError(`Unknown command "${name}". Run: wayside help`);
    try {
        const { data, text } = await command(args);
        console.log(json ? JSON.stringify({ ok: true, data }, null, 2) : text);
    } catch (error) {
        if (json && error instanceof CliError) {
            console.log(JSON.stringify({ ok: false, error: error.message }));
            process.exitCode = 1;
            return;
        }
        throw error;
    }
}

main().catch(error => {
    console.error(error instanceof CliError ? `wayside: ${error.message}` : error);
    process.exitCode = 1;
});
