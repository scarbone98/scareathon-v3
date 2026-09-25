// The visitor's real IP address, for rate limits and play stats.
//
// Railway's edge proxy sits in front of the server and adds the address it
// saw to X-Forwarded-For. Fastify's trustProxy (TRUST_PROXY_HOPS, default 1)
// takes the entry our own proxy added, so a client can't pick its address by
// sending its own X-Forwarded-For. If what we end up with is a private
// address (our proxy's, or local development), we don't know the visitor,
// so callers skip per-IP limits instead of lumping every visitor together.
import crypto from 'node:crypto';
import net from 'node:net';

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

export function trustProxyHops(env = process.env) {
    const hops = Number.parseInt(env.TRUST_PROXY_HOPS ?? '1', 10);
    return Number.isInteger(hops) && hops >= 0 ? hops : 1;
}

function normalizeIp(ip) {
    if (typeof ip !== 'string') return null;
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
    return mapped ? mapped[1] : ip;
}

// A public address we trust as the visitor's, or null if we can't tell
export function getClientIp(request) {
    const ip = normalizeIp(request.ip);
    return ip && net.isIP(ip) && !isPrivateAddress(ip) ? ip : null;
}

// A pseudonymous id for the visitor's network, for play stats: a hash of
// the IP salted with a secret and the month, so raw addresses are never
// stored and the ids can't be linked across months.
export function hashClientIp(ip, secret, now = new Date()) {
    if (!ip) return null;
    const month = now.toISOString().slice(0, 7);
    return crypto.createHmac('sha256', secret).update(`${month}|${ip}`).digest('hex').slice(0, 32);
}
