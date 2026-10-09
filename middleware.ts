import { geolocation, next } from '@vercel/functions';

const blockedPage = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Wayside Station</title><body style="margin:0;background:#17120e;color:#f2ead2;font-family:Georgia,serif"><main style="max-width:32rem;margin:15vh auto;padding:24px"><h1>Wayside Station isn't available in your region yet</h1><p>The platform is waiting. Please check back another time.</p><p><a style="color:inherit" href="/privacy">Privacy</a> · <a style="color:inherit" href="/terms">Terms</a></p></main></body></html>`;
export default function middleware(request: Request) {
    const countries = (process.env.GEO_ALLOWED_COUNTRIES || '').split(',').map(code => code.trim().toUpperCase()).filter(code => /^[A-Z]{2}$/.test(code));
    if (!countries.length) return next();
    const url = new URL(request.url);
    const token = process.env.GEO_BYPASS_TOKEN;
    // Process the owner's link before Vercel's / -> /station redirect. Strip the secret.
    if (token && url.searchParams.get('geo_bypass') === token) {
        url.searchParams.delete('geo_bypass');
        if (url.pathname === '/') url.pathname = '/station';
        return new Response(null, { status: 303, headers: { Location: url.toString(), 'Cache-Control': 'no-store', 'Set-Cookie': `ws_geo_bypass=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800` } });
    }
    const cookie = request.headers.get('cookie')?.split(';').find(part => part.trim().startsWith('ws_geo_bypass='))?.trim().slice('ws_geo_bypass='.length);
    if (token && cookie === encodeURIComponent(token)) return next();
    if (/^\/(assets(?:\/|$)|privacy\/?$|terms\/?$|robots\.txt$|favicon(?:[./]|$))/.test(url.pathname)) return next();
    const country = geolocation(request).country;
    if (!country || countries.includes(country.toUpperCase())) return next();
    return new Response(blockedPage, { status: 451, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store' } });
}
