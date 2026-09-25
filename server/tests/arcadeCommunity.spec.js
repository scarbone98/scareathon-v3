import {
    EXAMPLE_MANIFEST,
    normalizeGameName,
    scorePolicyFromManifest,
    slugifyGameName,
    validateManifest,
} from '../arcadeCommunity/gameSpec.js';
import {
    checkGameUrl,
    checksPassed,
    fetchGamePage,
    frameAncestorsAllowsArcade,
    isOwnHost,
    isPrivateAddress,
} from '../arcadeCommunity/urlCheck.js';
import {
    hashArcadeToken,
    isArcadeToken,
    mintArcadeToken,
    mintDeviceCode,
    mintUserCode,
    normalizeUserCode,
} from '../arcadeCommunity/tokens.js';
import { isArcadeTokenRoute, isPublicRoute } from '../utils/authRoutes.js';
import { validateScoreSubmission } from '../routes/games.js';

describe('validateManifest', () => {
    test('accepts the example manifest from the spec', () => {
        const result = validateManifest(EXAMPLE_MANIFEST);
        expect(result.ok).toBe(true);
        expect(result.manifest.score).toEqual({ format: 'points', max: 1000000, integer: true });
    });

    test('fills in defaults and trims', () => {
        const result = validateManifest({
            name: '  Bat Dash ',
            url: 'https://example.github.io/bat/',
            tagline: ' Flap. ',
            color: '#AABBCC',
        });
        expect(result).toMatchObject({
            ok: true,
            manifest: { name: 'Bat Dash', tagline: 'Flap.', color: '#aabbcc', aspectRatio: '16:9', mobile: false },
        });
        expect(result.manifest.score).toBeUndefined();
    });

    test('lists every problem at once', () => {
        const result = validateManifest({
            name: 'x',
            url: 'http://example.com',
            color: 'red',
            aspectRatio: '10:1',
            score: { format: 'lives', max: -1 },
        });
        expect(result.ok).toBe(false);
        expect(result.errors.join('\n')).toMatch(/name/);
        expect(result.errors.join('\n')).toMatch(/https/);
        expect(result.errors.join('\n')).toMatch(/tagline/);
        expect(result.errors.join('\n')).toMatch(/color/);
        expect(result.errors.join('\n')).toMatch(/aspectRatio/);
        expect(result.errors.join('\n')).toMatch(/score.format/);
        expect(result.errors.join('\n')).toMatch(/score.max/);
    });

    test('caps time scores at a day and forces whole seconds', () => {
        const base = { ...EXAMPLE_MANIFEST };
        expect(validateManifest({ ...base, score: { format: 'time', max: 100000 } }).ok).toBe(false);
        expect(validateManifest({ ...base, score: { format: 'time', max: 3600, integer: false } }).manifest.score)
            .toEqual({ format: 'time', max: 3600, integer: true });
    });

    test('rejects URLs with credentials', () => {
        expect(validateManifest({ ...EXAMPLE_MANIFEST, url: 'https://a:b@example.com/' }).ok).toBe(false);
    });
});

describe('game names', () => {
    test('normalise like the arcade page does', () => {
        expect(normalizeGameName('Tlaloc’s Curse')).toBe(normalizeGameName("tlalocs curse"));
        expect(normalizeGameName('Bats & Bones')).toBe('batsandbones');
    });

    test('slugify for links', () => {
        expect(slugifyGameName("Hemlock's Tower!")).toBe('hemlocks-tower');
    });

    test('score policy comes from the manifest', () => {
        expect(scorePolicyFromManifest({ score: { format: 'points', max: 50, integer: true } }))
            .toEqual({ min: 0, max: 50, integer: true });
        expect(scorePolicyFromManifest({})).toBeNull();
    });
});

describe('url safety', () => {
    test.each([
        ['127.0.0.1', true], ['10.1.2.3', true], ['192.168.0.10', true], ['169.254.169.254', true],
        ['172.20.0.1', true], ['100.64.0.1', true], ['::1', true], ['fd00::1', true],
        ['::ffff:10.0.0.1', true], ['8.8.8.8', false], ['185.199.108.153', false],
        ['2606:50c0:8000::153', false], ['not-an-ip', true],
    ])('isPrivateAddress(%s) is %s', (address, expected) => {
        expect(isPrivateAddress(address)).toBe(expected);
    });

    test('refuses the arcade\'s own sites', () => {
        expect(isOwnHost('www.scareathon.rip')).toBe(true);
        expect(isOwnHost('scareathon.rip.')).toBe(true);
        expect(isOwnHost('scareathon-v3.vercel.app')).toBe(true);
        expect(isOwnHost('notscareathon.rip')).toBe(false);
        expect(isOwnHost('sclondon.github.io')).toBe(false);
    });

    test('reads CSP frame-ancestors', () => {
        expect(frameAncestorsAllowsArcade('')).toBe(true);
        expect(frameAncestorsAllowsArcade("default-src 'self'")).toBe(true);
        expect(frameAncestorsAllowsArcade("frame-ancestors 'self'")).toBe(false);
        expect(frameAncestorsAllowsArcade("frame-ancestors 'self' https://www.scareathon.rip")).toBe(true);
        expect(frameAncestorsAllowsArcade('frame-ancestors *')).toBe(true);
    });
});

function fakeFetcher(pages) {
    return async (url) => {
        const page = pages[url];
        if (!page) throw new Error(`unexpected fetch ${url}`);
        return page;
    };
}

const GOOD_PAGE = {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
    body: '<meta name="viewport" content="width=device-width"><script>ScareathonArcade.gameOver(1)</script>',
};

describe('checkGameUrl', () => {
    test('passes a frameable HTML page', async () => {
        const checks = await checkGameUrl('https://me.github.io/game/', {
            fetcher: fakeFetcher({ 'https://me.github.io/game/': GOOD_PAGE }),
        });
        expect(checksPassed(checks)).toBe(true);
        expect(checks.every((entry) => entry.ok)).toBe(true);
    });

    test('warns, without blocking, when the score hookup is not in the HTML', async () => {
        const checks = await checkGameUrl('https://me.github.io/game/', {
            fetcher: fakeFetcher({ 'https://me.github.io/game/': { ...GOOD_PAGE, body: '<html></html>' } }),
        });
        expect(checksPassed(checks)).toBe(true);
        expect(checks.find((entry) => entry.id === 'sdk')).toMatchObject({ ok: false, level: 'warning' });
    });

    test('blocks pages that refuse to be framed', async () => {
        const checks = await checkGameUrl('https://me.github.io/game/', {
            fetcher: fakeFetcher({
                'https://me.github.io/game/': { ...GOOD_PAGE, headers: { ...GOOD_PAGE.headers, 'x-frame-options': 'SAMEORIGIN' } },
            }),
        });
        expect(checksPassed(checks)).toBe(false);
    });

    test('blocks IP hosts and the arcade itself without fetching', async () => {
        const fetcher = async () => { throw new Error('should not fetch'); };
        expect(checksPassed(await checkGameUrl('https://127.0.0.1/', { fetcher }))).toBe(false);
        expect(checksPassed(await checkGameUrl('https://www.scareathon.rip/x', { fetcher }))).toBe(false);
    });

    test('follows same-site redirects but not cross-site ones', async () => {
        const fetcher = fakeFetcher({
            'https://me.github.io/game': { status: 301, headers: { location: '/game/' } },
            'https://me.github.io/game/': GOOD_PAGE,
            'https://me.github.io/away': { status: 302, headers: { location: 'https://evil.example/' } },
        });
        expect((await fetchGamePage('https://me.github.io/game', fetcher)).url).toBe('https://me.github.io/game/');
        const checks = await checkGameUrl('https://me.github.io/away', { fetcher });
        expect(checks.find((entry) => entry.id === 'redirect')).toMatchObject({ ok: false });
    });

    test('reports a page that does not load', async () => {
        const checks = await checkGameUrl('https://me.github.io/404', {
            fetcher: fakeFetcher({ 'https://me.github.io/404': { status: 404, headers: {}, body: '' } }),
        });
        expect(checksPassed(checks)).toBe(false);
    });
});

describe('arcade tokens', () => {
    test('are minted with a prefix and stored hashed', () => {
        const { token, tokenHash, tokenPrefix } = mintArcadeToken();
        expect(isArcadeToken(token)).toBe(true);
        expect(token.length).toBeGreaterThan(40);
        expect(tokenHash).toBe(hashArcadeToken(token));
        expect(tokenHash).not.toContain(token);
        expect(token.startsWith(tokenPrefix)).toBe(true);
    });

    test('only work on the submission routes', () => {
        expect(isArcadeTokenRoute('POST', '/arcade/games')).toBe(true);
        expect(isArcadeTokenRoute('POST', '/arcade/games/validate')).toBe(true);
        expect(isArcadeTokenRoute('GET', '/arcade/games/mine?x=1')).toBe(true);
        expect(isArcadeTokenRoute('GET', '/arcade/me')).toBe(true);
        expect(isArcadeTokenRoute('POST', '/arcade/games/bat-dash/unpublish')).toBe(false);
        expect(isArcadeTokenRoute('DELETE', '/arcade/tokens/current')).toBe(true);
        expect(isArcadeTokenRoute('DELETE', '/arcade/tokens/7')).toBe(false);
        expect(isArcadeTokenRoute('GET', '/arcade/tokens')).toBe(false);
        expect(isArcadeTokenRoute('POST', '/arcade/device/ABCD-2345/approve')).toBe(false);
        expect(isArcadeTokenRoute('POST', '/arcade/versions/3/approve')).toBe(false);
        expect(isArcadeTokenRoute('POST', '/games/submitScore')).toBe(false);
        expect(isArcadeTokenRoute('GET', '/user/wallet')).toBe(false);
    });

    test('the spec and published list are public', () => {
        expect(isPublicRoute('GET', '/arcade/spec')).toBe(true);
        expect(isPublicRoute('GET', '/arcade/community')).toBe(true);
        expect(isPublicRoute('POST', '/arcade/games')).toBe(false);
    });

    test('an AI can start and poll a sign-in without credentials, but not approve one', () => {
        expect(isPublicRoute('POST', '/arcade/device/start')).toBe(true);
        expect(isPublicRoute('POST', '/arcade/device/poll')).toBe(true);
        expect(isPublicRoute('POST', '/arcade/device/ABCD-2345/approve')).toBe(false);
        expect(isPublicRoute('GET', '/arcade/device/ABCD-2345')).toBe(false);
    });
});

describe('device sign-in codes', () => {
    test('user codes are short, readable and normalise from what people type', () => {
        const code = mintUserCode();
        expect(code).toMatch(/^[B-DF-HJ-NP-TV-XZ2-9]{4}-[B-DF-HJ-NP-TV-XZ2-9]{4}$/);
        expect(normalizeUserCode(code.toLowerCase().replace('-', ' '))).toBe(code);
        expect(normalizeUserCode('abc')).toBeNull();
    });

    test('the device code is a secret stored only as a hash', () => {
        const { deviceCode, deviceCodeHash } = mintDeviceCode();
        expect(deviceCode.length).toBeGreaterThan(40);
        expect(deviceCodeHash).toBe(hashArcadeToken(deviceCode));
    });
});

describe('community game scores', () => {
    test('use the live version\'s score rule', () => {
        const policy = { min: 0, max: 500, integer: true };
        expect(validateScoreSubmission({ game: 'Bat Dash', metricName: 'score', metricValue: 400 }, policy))
            .toEqual({ ok: true });
        expect(validateScoreSubmission({ game: 'Bat Dash', metricName: 'score', metricValue: 501 }, policy))
            .toMatchObject({ ok: false });
    });

    test('are refused when the game has no live leaderboard', () => {
        expect(validateScoreSubmission({ game: 'Bat Dash', metricName: 'score', metricValue: 1 }, null))
            .toMatchObject({ ok: false, error: 'Unsupported game metric' });
    });

    test('cannot loosen a house game\'s rule', () => {
        expect(validateScoreSubmission(
            { game: 'WirtWare', metricName: 'score', metricValue: 50000 },
            { min: 0, max: 1e9, integer: true }
        )).toMatchObject({ ok: false });
    });
});
