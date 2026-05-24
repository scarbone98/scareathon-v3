const DEFAULT_MAX_ENTRIES = 500;
const cache = new Map();
const refreshes = new Map();
const cacheVersions = new Map();

function getMaxEntries() {
    const parsed = Number.parseInt(process.env.CACHE_MAX_ENTRIES || '', 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_ENTRIES;
}

function pruneOldest() {
    const maxEntries = getMaxEntries();

    while (cache.size > maxEntries) {
        const oldestKey = cache.keys().next().value;
        if (oldestKey === undefined) break;
        cache.delete(oldestKey);
    }
}

function getCacheVersion(key) {
    return cacheVersions.get(key) || 0;
}

function bumpCacheVersion(key) {
    cacheVersions.set(key, getCacheVersion(key) + 1);
}

export function getCache(key) {
    const cached = cache.get(key);

    if (!cached) {
        return null;
    }

    if (cached.expiresAt && Date.now() > cached.expiresAt) {
        return null;
    }

    cache.delete(key);
    cache.set(key, cached);

    return cached.data;
}

export function getStaleCache(key) {
    const cached = cache.get(key);
    return cached ? cached.data : null;
}

function getCacheEntry(key) {
    const cached = cache.get(key);

    if (!cached) {
        return { status: 'miss', data: null };
    }

    cache.delete(key);
    cache.set(key, cached);

    if (cached.expiresAt && Date.now() > cached.expiresAt) {
        return { status: 'stale', data: cached.data };
    }

    return { status: 'fresh', data: cached.data };
}

export function setCache(key, data, ttl = null) {
    cache.delete(key);
    cache.set(key, {
        data,
        expiresAt: ttl ? Date.now() + ttl : null
    });
    pruneOldest();
}

function refreshCache(key, refresh, ttl, { onError } = {}) {
    const existingRefresh = refreshes.get(key);
    if (existingRefresh) {
        return existingRefresh;
    }

    const refreshVersion = getCacheVersion(key);
    const refreshPromise = Promise.resolve()
        .then(refresh)
        .then((data) => {
            if (getCacheVersion(key) === refreshVersion) {
                setCache(key, data, ttl);
            }
            return data;
        })
        .catch((error) => {
            if (onError) {
                onError(error);
            }
            throw error;
        })
        .finally(() => {
            refreshes.delete(key);
        });

    refreshes.set(key, refreshPromise);
    return refreshPromise;
}

export async function getOrRefreshCache(key, refresh, ttl = null, options = {}) {
    const cached = getCacheEntry(key);

    if (cached.status === 'fresh') {
        return cached.data;
    }

    if (cached.status === 'stale') {
        refreshCache(key, refresh, ttl, options).catch(() => {});
        return cached.data;
    }

    return refreshCache(key, refresh, ttl, options);
}

export function deleteCache(key) {
    cache.delete(key);
    refreshes.delete(key);
    bumpCacheVersion(key);
}

export function deleteCachePrefix(prefix) {
    for (const key of cache.keys()) {
        if (typeof key === 'string' && key.startsWith(prefix)) {
            cache.delete(key);
            bumpCacheVersion(key);
        }
    }

    for (const key of refreshes.keys()) {
        if (typeof key === 'string' && key.startsWith(prefix)) {
            refreshes.delete(key);
            bumpCacheVersion(key);
        }
    }
}
