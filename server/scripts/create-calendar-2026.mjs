import { readFileSync } from 'node:fs';
import calendarSheet from '../db/google-sheets.js';

const sheetTitle = 'Calendar-2026';
const columns = ['day', 'title', 'theme', 'releaseYear', 'lowResUrl', 'notes'];
const lines = readFileSync(new URL('../../calendar-2026.csv', import.meta.url), 'utf8').trim().split(/\r?\n/);
if (lines.shift() !== columns.join(',')) throw new Error('Unexpected calendar CSV headers');

const movies = lines.map(line => {
    const values = line.split(',');
    if (values.length !== columns.length) throw new Error(`Unexpected CSV row: ${line}`);
    return Object.fromEntries(columns.map((column, index) => [column, values[index]]));
});
if (movies.length !== 31 || movies.some((movie, index) => Number(movie.day) !== index + 1 || !movie.title)) {
    throw new Error('Calendar must have one titled movie for each October day');
}

const doc = await calendarSheet();
if (!doc) throw new Error('Could not open Google spreadsheet');
if (doc.sheetsByTitle[sheetTitle]) throw new Error(`${sheetTitle} already exists; refusing to overwrite it`);

const previousSheet = doc.sheetsByTitle.Calendar;
const previousRows = await previousSheet.getRows({ limit: 31 });
const normalize = title => title?.toLowerCase().replace(/[^a-z0-9]/g, '');
const previousTitles = new Set(previousRows.map(row => normalize(row.get('title'))));
const repeats = movies.filter(movie => previousTitles.has(normalize(movie.title)));
if (repeats.length) throw new Error(`2025 repeats: ${repeats.map(movie => movie.title).join(', ')}`);

if (!process.env.TMDB_API_TOKEN) throw new Error('TMDB_API_TOKEN is required for movie posters');
for (const movie of movies) {
    const params = new URLSearchParams({
        query: movie.title,
        year: movie.releaseYear,
        include_adult: 'false',
        language: 'en-US',
        page: '1'
    });
    const response = await fetch(`https://api.themoviedb.org/3/search/movie?${params}`, {
        headers: { Authorization: `Bearer ${process.env.TMDB_API_TOKEN}` }
    });
    if (!response.ok) throw new Error(`TMDB lookup failed for ${movie.title}: ${response.status}`);
    const result = (await response.json()).results?.[0];
    if (!result || !result.release_date?.startsWith(movie.releaseYear) || !result.poster_path) {
        throw new Error(`No matching TMDB poster for ${movie.title} (${movie.releaseYear})`);
    }
    movie.lowResUrl = `https://image.tmdb.org/t/p/w342${result.poster_path}`;
    console.log(`${movie.day}: ${movie.title} → ${result.title} (${result.release_date})`);
}

if (!process.argv.includes('--create')) {
    console.log('Preflight passed. Run with --create to add the tab and rows.');
    process.exit(0);
}

const sheet = await doc.addSheet({ title: sheetTitle, headerValues: columns, gridProperties: { rowCount: 40, columnCount: columns.length } });
await sheet.addRows(movies);
const written = await sheet.getRows();
if (written.length !== 31) throw new Error(`Created ${sheetTitle}, but only ${written.length} rows were read back`);
console.log(`Created ${sheetTitle} with ${written.length} movies.`);
