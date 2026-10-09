import { jest } from '@jest/globals';
import { readFile } from 'node:fs/promises';
import { SourceTextModule, SyntheticModule, createContext } from 'node:vm';
import ts from 'typescript';

const geolocation = jest.fn();
const next = jest.fn(() => new Response(null, { headers: { 'x-middleware-next': '1' } }));
let middleware;
let env;
beforeAll(async () => {
    const source = await readFile(new URL('../../middleware.ts', import.meta.url), 'utf8');
    const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
    const context = createContext({ process, Response, URL });
    const functions = new SyntheticModule(['geolocation', 'next'], function () { this.setExport('geolocation', geolocation); this.setExport('next', next); }, { context });
    const module = new SourceTextModule(code, { context });
    await module.link(() => functions); await module.evaluate(); middleware = module.namespace.default;
});
beforeEach(() => {
    env = { countries: process.env.GEO_ALLOWED_COUNTRIES, token: process.env.GEO_BYPASS_TOKEN };
    delete process.env.GEO_ALLOWED_COUNTRIES; delete process.env.GEO_BYPASS_TOKEN;
    geolocation.mockReset(); next.mockClear(); geolocation.mockReturnValue({ country: 'GB' });
});
afterEach(() => {
    for (const [key, value] of [['GEO_ALLOWED_COUNTRIES', env.countries], ['GEO_BYPASS_TOKEN', env.token]]) if (value === undefined) delete process.env[key]; else process.env[key] = value;
});
const request = (path = '/station', headers) => new Request(`https://waysidestation.com${path}`, { headers });
test('Vite routing middleware is dormant until configured', () => {
    expect(middleware(request()).headers.get('x-middleware-next')).toBe('1'); expect(geolocation).not.toHaveBeenCalled();
});
test('returns a small 451 region page; unknown locations and allowed countries pass', async () => {
    process.env.GEO_ALLOWED_COUNTRIES = 'US, ca';
    let response = middleware(request());
    expect(response.status).toBe(451); expect(await response.text()).toContain("isn't available in your region yet");
    expect(response.headers.get('cache-control')).toContain('no-store');
    for (const country of ['US', 'CA', undefined]) { geolocation.mockReturnValue({ country }); expect(middleware(request()).headers.get('x-middleware-next')).toBe('1'); }
});
test('owner link sets a secure cookie before redirect, strips the token; valid cookie bypasses', () => {
    process.env.GEO_ALLOWED_COUNTRIES = 'US'; process.env.GEO_BYPASS_TOKEN = 'private token';
    const response = middleware(request('/?geo_bypass=private%20token'));
    expect(response.status).toBe(303); expect(response.headers.get('location')).toBe('https://waysidestation.com/station');
    expect(response.headers.get('set-cookie')).toContain('HttpOnly; Secure; SameSite=Lax');
    expect(middleware(request('/station', { cookie: 'ws_geo_bypass=private%20token' })).headers.get('x-middleware-next')).toBe('1');
    expect(middleware(request('/station', { cookie: 'ws_geo_bypass=wrong' })).status).toBe(451);
});
test('assets, legal papers, robots and favicons are exempt; lookalike paths are not', () => {
    process.env.GEO_ALLOWED_COUNTRIES = 'US';
    for (const path of ['/assets/main.js', '/privacy', '/terms', '/robots.txt', '/favicon.ico']) expect(middleware(request(path)).headers.get('x-middleware-next')).toBe('1');
    for (const path of ['/assets-other', '/terms-extra', '/station']) expect(middleware(request(path)).status).toBe(451);
});
