// Adds the Christmathon-2026 tab (the December 1 to 25 calendar) to the Google sheet from
// christmathon-2026.csv, with each film's TMDB poster. Without --create it only checks the list.
import { readFileSync } from 'node:fs';
import calendarSheet from '../db/google-sheets.js';

const sheetTitle = 'Christmathon-2026';
const columns = ['day', 'title', 'theme', 'releaseYear', 'lowResUrl', 'notes'];
const lines = readFileSync(new URL('../../christmathon-2026.csv', import.meta.url), 'utf8').trim().split(/\r?\n/);
if (lines.shift() !== columns.join(',')) throw new Error('Unexpected calendar CSV headers');

const movies = lines.map(line => {
    const values = line.split(',');
    if (values.length !== columns.length) throw new Error(`Unexpected CSV row: ${line}`);
    return Object.fromEntries(columns.map((column, index) => [column, values[index]]));
});
if (movies.length !== 25 || movies.some((movie, index) => Number(movie.day) !== index + 1 || !movie.title)) {
    throw new Error('Calendar must have one titled movie for each night from December 1 to 25');
}

const doc = await calendarSheet();
if (!doc) throw new Error('Could not open Google spreadsheet');
if (doc.sheetsByTitle[sheetTitle]) throw new Error(`${sheetTitle} already exists; refusing to overwrite it`);

// (Without a TMDB key the posters are left blank: the server looks each one up when the site asks)
if (!process.env.TMDB_API_TOKEN) console.log('No TMDB_API_TOKEN: posters left to the server.');
for (const movie of process.env.TMDB_API_TOKEN ? movies : []) {
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
if (written.length !== 25) throw new Error(`Created ${sheetTitle}, but only ${written.length} rows were read back`);
console.log(`Created ${sheetTitle} with ${written.length} movies.`);
