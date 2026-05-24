import { deleteCache, getOrRefreshCache } from '../utils/cacheManager.js';

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('cacheManager', () => {
    test('dedupes concurrent refreshes on cold cache misses', async () => {
        const key = `cache-test-cold-dedupe-${Date.now()}`;
        let calls = 0;
        let resolveRefresh;
        const refresh = () => new Promise((resolve) => {
            calls++;
            resolveRefresh = () => resolve({ value: calls });
        });

        const first = getOrRefreshCache(key, refresh, 1000);
        const second = getOrRefreshCache(key, refresh, 1000);

        await wait(0);
        expect(calls).toBe(1);

        resolveRefresh();

        await expect(Promise.all([first, second])).resolves.toEqual([
            { value: 1 },
            { value: 1 },
        ]);
    });

    test('returns stale data immediately while refreshing in the background', async () => {
        const key = `cache-test-swr-${Date.now()}`;
        let calls = 0;

        await expect(getOrRefreshCache(key, async () => ({ value: ++calls }), 1))
            .resolves.toEqual({ value: 1 });

        await wait(5);

        let resolveRefresh;
        const staleData = await getOrRefreshCache(key, () => new Promise((resolve) => {
            resolveRefresh = () => resolve({ value: ++calls });
        }), 1000);

        expect(staleData).toEqual({ value: 1 });
        expect(calls).toBe(1);

        resolveRefresh();
        await wait(0);

        await expect(getOrRefreshCache(key, async () => ({ value: 99 }), 1000))
            .resolves.toEqual({ value: 2 });
    });

    test('dedupes concurrent background refreshes for stale cache hits', async () => {
        const key = `cache-test-stale-dedupe-${Date.now()}`;
        let calls = 0;

        await getOrRefreshCache(key, async () => ({ value: ++calls }), 1);
        await wait(5);

        let resolveRefresh;
        const refresh = () => new Promise((resolve) => {
            calls++;
            resolveRefresh = () => resolve({ value: calls });
        });

        const first = await getOrRefreshCache(key, refresh, 1000);
        const second = await getOrRefreshCache(key, refresh, 1000);

        expect(first).toEqual({ value: 1 });
        expect(second).toEqual({ value: 1 });
        expect(calls).toBe(2);

        resolveRefresh();
        await wait(0);

        await expect(getOrRefreshCache(key, async () => ({ value: 99 }), 1000))
            .resolves.toEqual({ value: 2 });
    });

    test('does not repopulate invalidated cache entries from old refreshes', async () => {
        const key = `cache-test-invalidate-${Date.now()}`;

        await getOrRefreshCache(key, async () => ({ value: 'initial' }), 1);
        await wait(5);

        let resolveOldRefresh;
        await getOrRefreshCache(key, () => new Promise((resolve) => {
            resolveOldRefresh = () => resolve({ value: 'old-refresh' });
        }), 1000);

        deleteCache(key);
        resolveOldRefresh();
        await wait(0);

        await expect(getOrRefreshCache(key, async () => ({ value: 'fresh' }), 1000))
            .resolves.toEqual({ value: 'fresh' });
    });
});
