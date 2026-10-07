// Rooms are ephemeral, and hosting presence is derived from their live hosts.
const hosts = new Map();
const listeners = new Set();

export function listHosting() {
    return [...hosts.values()].map((host) => ({ ...host, hosting: { ...host.hosting } }));
}

export function subscribeHosting(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function updateHosting(code, host) {
    if (host) hosts.set(code, host);
    else hosts.delete(code);
    const snapshot = listHosting();
    for (const listener of listeners) listener(snapshot);
}
