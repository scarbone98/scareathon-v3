import rateLimit from '@fastify/rate-limit';

// Route-level IP limits run before JWT verification, including failed auth attempts.
// Limits never use unverified bearer tokens or client-supplied user identifiers.
export async function registerComplianceRateLimits(fastify) {
    fastify.addHook('onRoute', route => {
        const path = route.url;
        let max;
        let timeWindow = '1 minute';
        if (['/user/export', '/user/account'].includes(path)) { max = 10; timeWindow = '1 hour'; }
        else if (path === '/content/reports') { max = 20; timeWindow = '1 hour'; }
        else if (path.startsWith('/user') || path.startsWith('/agent-tokens') || /\/(ticket|chat|dev-ticket)$/.test(path)) max = 120;
        if (max) route.config = { ...route.config, rateLimit: route.config?.rateLimit ?? { max, timeWindow } };
    });
    await fastify.register(rateLimit, {
        global: false,
        hook: 'onRequest',
        keyGenerator: request => request.ip,
    });
}
