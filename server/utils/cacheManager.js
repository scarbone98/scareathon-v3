const DEFAULT_MAX_ENTRIES = 500;
const cache = new Map();

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

export function setCache(key, data, ttl = null) {
    cache.delete(key);
    cache.set(key, {
        data,
        expiresAt: ttl ? Date.now() + ttl : null
    });
    pruneOldest();
}
