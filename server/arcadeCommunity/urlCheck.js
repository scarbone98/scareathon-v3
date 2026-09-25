// The automated checks run on a submitted game's URL: it loads, it's HTML, and
// it lets the arcade frame it.
//
// The URL comes from a player, so the fetch must not be usable to reach
// anything private: https only, and every address the host resolves to is
// checked at connect time (the lookup hook below), which also covers DNS
// that changes between a check and the request.
import dns from 'node:dns';
import https from 'node:https';
import net from 'node:net';

const TIMEOUT_MS = 10_000;
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 3;

// The arcade's own sites can't be submitted: a game served from our origin
// would get our origin inside the sandbox.
const OWN_HOST_SUFFIXES = ['scareathon.rip', 'scareathon-v3.vercel.app'];

const privateRanges = new net.BlockList();
for (const [address, prefix] of [
    ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
    ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
    ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24],
    ['224.0.0.0', 4], ['240.0.0.0', 4],
]) {
    privateRanges.addSubnet(address, prefix, 'ipv4');
}
for (const [address, prefix] of [
    ['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8],
    ['64:ff9b::', 96], ['2001:db8::', 32],
]) {
    privateRanges.addSubnet(address, prefix, 'ipv6');
}

export function isPrivateAddress(address) {
    const family = net.isIP(address);
    if (family === 4) return privateRanges.check(address, 'ipv4');
    if (family === 6) {
        // IPv4-mapped (::ffff:10.0.0.1) is judged as the IPv4 address
        const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
        if (mapped) return privateRanges.check(mapped[1], 'ipv4');
        return privateRanges.check(address, 'ipv6');
    }
    return true;
}

export function isOwnHost(hostname) {
    const host = hostname.toLowerCase().replace(/\.$/, '');
    return OWN_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}

// dns.lookup, but refuses to hand the socket a private address
function safeLookup(hostname, options, callback) {
    dns.lookup(hostname, { ...options, all: true }, (error, addresses) => {
        if (error) return callback(error);
        const blocked = addresses.find((entry) => isPrivateAddress(entry.address));
        if (blocked || addresses.length === 0) {
            const refused = new Error(`${hostname} resolves to a private address`);
            refused.code = 'EPRIVATEADDRESS';
            return callback(refused);
        }
        if (options?.all) return callback(null, addresses);
        return callback(null, addresses[0].address, addresses[0].family);
    });
}

function fetchOnce(url) {
    return new Promise((resolve, reject) => {
        const request = https.get(url, {
            lookup: safeLookup,
            timeout: TIMEOUT_MS,
            headers: {
                'User-Agent': 'ScareathonArcadeChecker/1.0 (+https://www.scareathon.rip/arcade)',
                Accept: 'text/html,*/*;q=0.5',
            },
        }, (response) => {
            const chunks = [];
            let size = 0;
            response.on('data', (chunk) => {
                size += chunk.length;
                if (size > MAX_BODY_BYTES) {
                    response.destroy();
                    return;
                }
                chunks.push(chunk);
            });
            response.on('close', () => {
                resolve({
                    status: response.statusCode,
                    headers: response.headers,
                    body: Buffer.concat(chunks).toString('utf8'),
                });
            });
            response.on('error', reject);
        });
        request.on('timeout', () => request.destroy(new Error(`no answer within ${TIMEOUT_MS / 1000}s`)));
        request.on('error', reject);
    });
}

// Follows same-site redirects only
export async function fetchGamePage(startUrl, fetcher = fetchOnce) {
    let url = new URL(startUrl);
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
        const response = await fetcher(url.href);
        const location = response.headers?.location;
        if (response.status >= 300 && response.status < 400 && location) {
            const next = new URL(location, url);
            if (next.origin !== url.origin) {
                return { ...response, url: url.href, redirectedTo: next.href };
            }
            url = next;
            continue;
        }
        return { ...response, url: url.href };
    }
    throw new Error(`more than ${MAX_REDIRECTS} redirects`);
}

function headerValue(headers, name) {
    const value = headers?.[name];
    return Array.isArray(value) ? value.join(', ') : value || '';
}

// Whether the CSP frame-ancestors (if any) lets www.scareathon.rip frame it
export function frameAncestorsAllowsArcade(csp) {
    const directive = csp
        .split(/[;,]/)
        .map((part) => part.trim())
        .find((part) => part.toLowerCase().startsWith('frame-ancestors'));
    if (!directive) return true;
    const sources = directive.split(/\s+/).slice(1).map((source) => source.toLowerCase());
    return sources.some((source) =>
        source === '*' ||
        source === 'https:' ||
        source === 'https://www.scareathon.rip' ||
        source === 'https://*.scareathon.rip'
    );
}

function check(id, label, ok, detail, level = 'error') {
    return { id, label, ok, level, ...(detail ? { detail } : {}) };
}

// Runs every check; a check with level 'error' that isn't ok blocks the submit.
export async function checkGameUrl(rawUrl, { fetcher } = {}) {
    const checks = [];
    let url;
    try {
        url = new URL(rawUrl);
    } catch {
        return [check('url', 'URL is valid', false, 'Not a URL')];
    }

    const hostOk = url.protocol === 'https:' && !isOwnHost(url.hostname) && !net.isIP(url.hostname.replace(/^\[|\]$/g, ''));
    checks.push(check('host', 'Hosted on its own https site', hostOk,
        hostOk ? undefined : 'Use an https URL with a domain name, not an IP address or a scareathon.rip address'));
    if (!hostOk) return checks;

    let page;
    try {
        page = await fetchGamePage(url.href, fetcher);
    } catch (error) {
        checks.push(check('reachable', 'Page loads', false, error.code === 'EPRIVATEADDRESS'
            ? 'The host points at a private network address'
            : `Couldn't load it: ${error.message}`));
        return checks;
    }

    if (page.redirectedTo) {
        checks.push(check('redirect', 'No redirect to another site', false,
            `It redirects to ${page.redirectedTo}; submit that URL instead`));
        return checks;
    }

    checks.push(check('reachable', 'Page loads', page.status === 200,
        page.status === 200 ? undefined : `Answered HTTP ${page.status}`));
    if (page.status !== 200) return checks;

    const contentType = headerValue(page.headers, 'content-type').toLowerCase();
    const isHtml = contentType.includes('text/html');
    checks.push(check('html', 'Serves an HTML page', isHtml,
        isHtml ? undefined : `Content-Type is "${contentType || 'missing'}"`));

    const frameOptions = headerValue(page.headers, 'x-frame-options').trim().toLowerCase();
    const csp = headerValue(page.headers, 'content-security-policy');
    const frameable = (frameOptions !== 'deny' && frameOptions !== 'sameorigin') && frameAncestorsAllowsArcade(csp);
    checks.push(check('frameable', 'Allows the arcade to show it in an iframe', frameable,
        frameable ? undefined : 'Remove X-Frame-Options, or allow https://www.scareathon.rip in CSP frame-ancestors'));

    // Warnings: worth a look, but big engine builds keep this in their JS bundles
    const body = page.body || '';
    const mentionsArcade = /ScareathonArcade|arcade-sdk\.js|PLAYER_DIED/.test(body);
    checks.push(check('sdk', 'Page includes the arcade score hookup', mentionsArcade,
        mentionsArcade ? undefined : "Didn't see ScareathonArcade / PLAYER_DIED in the HTML. Fine if it's in a script file; otherwise scores won't reach the leaderboard.",
        'warning'));
    const hasViewport = /<meta[^>]+name=["']?viewport/i.test(body);
    checks.push(check('viewport', 'Has a mobile viewport tag', hasViewport,
        hasViewport ? undefined : 'Add <meta name="viewport" content="width=device-width, initial-scale=1"> for phones',
        'warning'));

    return checks;
}

export function checksPassed(checks) {
    return checks.every((entry) => entry.ok || entry.level !== 'error');
}
