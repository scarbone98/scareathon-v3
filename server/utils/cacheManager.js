const cache = {};

export function getCache(key) {
    const cached = cache[key];

    if (!cached) {
        return null;
    }

    // Check if cache entry has expired
    if (cached.expiresAt && Date.now() > cached.expiresAt) {
        delete cache[key];
        return null;
    }

    return cached.data;
}

export function setCache(key, data, ttl = null) {
    cache[key] = {
        data,
        expiresAt: ttl ? Date.now() + ttl : null
    };
}