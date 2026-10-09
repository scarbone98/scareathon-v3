import { mkdir, stat, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createWriteStream } from 'node:fs';
import { timingSafeEqual } from 'node:crypto';
import maxmind from 'maxmind';
import { x } from 'tar';
import { allowedCountries } from './features.js';

const WEEK = 7 * 24 * 60 * 60_000;
export function hasGeoBypass(value, env = process.env) {
    const token = env.GEO_BYPASS_TOKEN;
    return typeof value === 'string' && Boolean(token) && Buffer.byteLength(value) === Buffer.byteLength(token)
        && timingSafeEqual(Buffer.from(value), Buffer.from(token));
}
export function createGeoHook({ env = process.env, lookup = () => null, ready = () => false } = {}) {
    return async (request, reply) => {
        const countries = allowedCountries(env);
        const path = request.url.split('?')[0];
        if (!countries.length || request.method === 'OPTIONS' || ['/health', '/healthz', '/user/export', '/user/account', '/config/features'].includes(path)) return;
        if (hasGeoBypass(request.headers['x-ws-geo-bypass'], env)) return;
        if (!ready()) return;
        try {
            const country = lookup(request.ip)?.country?.iso_code;
            if (country && !countries.includes(country.toUpperCase())) {
                return reply.code(451).header('Cache-Control', 'no-store').send({ error: "Wayside Station isn't available in your region yet", code: 'region_unavailable' });
            }
        } catch {
            request.log.warn('GeoLite2 lookup failed; allowing request');
        }
    };
}

// Keep the last usable reader on refresh failures. Missing/invalid databases fail open.
export async function startGeoDatabase(log, { env = process.env, open = maxmind.open, download = fetch } = {}) {
    let reader = null;
    let timer;
    if (!allowedCountries(env).length) return { ready: () => false, lookup: () => null, close: () => {} };
    const directory = env.GEO_DATABASE_CACHE_DIR || join(process.cwd(), '.cache', 'geolite2');
    const database = join(directory, 'GeoLite2-Country.mmdb');
    const refresh = async () => {
        try {
            await mkdir(directory, { recursive: true });
            try { reader = await open(database); } catch { /* download below */ }
            const info = await stat(database).catch(() => null);
            if (info && Date.now() - info.mtimeMs < WEEK && reader) return;
            if (!env.MAXMIND_LICENSE_KEY) {
                if (!reader) log.warn('GeoLite2 unavailable: set MAXMIND_LICENSE_KEY; geo-block fails open');
                return;
            }
            const url = new URL('https://download.maxmind.com/app/geoip_download');
            url.searchParams.set('edition_id', 'GeoLite2-Country');
            url.searchParams.set('suffix', 'tar.gz');
            // With an account id MaxMind uses HTTP Basic; older accounts accept the license query.
            const headers = {};
            if (env.MAXMIND_ACCOUNT_ID) headers.Authorization = `Basic ${Buffer.from(`${env.MAXMIND_ACCOUNT_ID}:${env.MAXMIND_LICENSE_KEY}`).toString('base64')}`;
            else url.searchParams.set('license_key', env.MAXMIND_LICENSE_KEY);
            const response = await download(url, { headers, signal: AbortSignal.timeout(30_000) });
            if (!response.ok || !response.body) throw new Error('Download failed');
            const staging = join(directory, 'refresh');
            await mkdir(staging, { recursive: true });
            const archive = join(staging, 'country.tar.gz');
            try {
                await pipeline(Readable.fromWeb(response.body), createWriteStream(archive));
                await x({ file: archive, cwd: staging, strip: 1, filter: path => /^[^/]+\/GeoLite2-Country\.mmdb$/.test(path) });
                const next = await open(join(staging, 'GeoLite2-Country.mmdb'));
                await rename(join(staging, 'GeoLite2-Country.mmdb'), database);
                reader = next;
            } finally { await rm(staging, { recursive: true, force: true }); }
        } catch {
            // Never log an exception carrying a license key or Authorization header.
            log.warn('GeoLite2 load/refresh failed; using cached database or failing open');
        }
    };
    await refresh();
    // Check daily: refresh at one week, and retry unavailable downloads without a redeploy.
    timer = setInterval(() => void refresh(), 24 * 60 * 60_000);
    timer.unref();
    return { ready: () => reader !== null, lookup: ip => reader?.get(ip) ?? null, close: () => clearInterval(timer) };
}
