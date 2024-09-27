const cache = {};

export function getCache(key) {
    return cache[key] || null;
}

export function setCache(key, data) {
    cache[key] = data;
}