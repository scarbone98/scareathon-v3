import Fastify from 'fastify';
import { CAPSULE_ODDS, CAPSULE_PRICE, pickCapsule } from '../capsule/machine.js';
import { PullRefusedError } from '../capsule/repository.js';
import { createRng, random } from '../shared/monster-bash/rng.js';
import capsuleRoutes from '../routes/capsule.js';
import { isPublicRoute } from '../utils/authRoutes.js';

const seeded = (seed) => {
    const rng = createRng(seed);
    return () => random(rng);
};

// A row as avatar_items holds it.
const item = (id, rarity, category = 'head') => ({
    id, item_key: `item_${id}`, name: `Item ${id}`, category, parts: [], asset_path: `/avatar-px/items/item_${id}/icon.png`,
    dyes: {}, hides: [], occupies: [], stack_order: 0, rarity, base_price: 60, release_status: 'released', is_tradeable: true, is_sellable: true,
});

const STOCK = [
    ...Array.from({ length: 10 }, (_, i) => item(i + 1, 'common', i % 2 ? 'head' : 'held')),
    ...Array.from({ length: 6 }, (_, i) => item(i + 20, 'uncommon')),
    ...Array.from({ length: 4 }, (_, i) => item(i + 40, 'rare', 'held')),
    item(60, 'epic'),
    item(70, 'legendary', 'held'),
];

describe('capsule odds', () => {
    test('add up to 100 and get slimmer with rarity', () => {
        const odds = Object.values(CAPSULE_ODDS);
        expect(odds.reduce((sum, value) => sum + value, 0)).toBeCloseTo(100);
        expect(odds).toEqual([...odds].sort((a, b) => b - a));
        expect(CAPSULE_ODDS.common).toBeGreaterThanOrEqual(60);
    });

    test('capsules come out mostly common, at about the odds on the glass', () => {
        const rng = seeded('odds');
        const pulls = 40000;
        const seen = Object.fromEntries(Object.keys(CAPSULE_ODDS).map((rarity) => [rarity, 0]));
        for (let i = 0; i < pulls; i++) seen[pickCapsule(STOCK, rng).rarity] += 1;
        for (const [rarity, share] of Object.entries(CAPSULE_ODDS)) {
            expect((seen[rarity] / pulls) * 100).toBeCloseTo(share, 0);
        }
    });

    test('every item of a rarity has the same chance', () => {
        const rng = seeded('even');
        const commons = STOCK.filter((entry) => entry.rarity === 'common');
        const seen = new Map(commons.map((entry) => [entry.id, 0]));
        for (let i = 0; i < 20000; i++) {
            const { id } = pickCapsule(commons, rng);
            seen.set(id, seen.get(id) + 1);
        }
        for (const count of seen.values()) expect(count / 20000).toBeCloseTo(1 / commons.length, 1);
    });

    test('a rarity the machine has none of gives its share to the rest', () => {
        const rng = seeded('gaps');
        const onlyRare = STOCK.filter((entry) => entry.rarity === 'rare');
        for (let i = 0; i < 50; i++) expect(pickCapsule(onlyRare, rng).rarity).toBe('rare');
        expect(pickCapsule([], rng)).toBeNull();
        expect(pickCapsule([{ id: 1, rarity: 'mythic' }], rng)).toBeNull();
    });
});

// A wallet and a locker in memory, refusing what pull_capsule refuses.
function fakeRepo(balance, stock = STOCK) {
    const repo = {
        balance,
        owned: [],
        async listStock() {
            return stock;
        },
        async pull({ userId, itemId, price }) {
            if (price > repo.balance) throw new PullRefusedError('insufficient_funds');
            repo.balance -= price;
            repo.owned.push({ userId, itemId });
            return { itemInstanceId: repo.owned.length, balance: repo.balance };
        },
    };
    return repo;
}

describe('capsule routes', () => {
    let app;
    let repo;

    const start = async (balance, stock) => {
        repo = fakeRepo(balance, stock);
        app = Fastify();
        app.addHook('onRequest', async (request) => {
            request.user = { sub: 'player-1' };
        });
        await app.register(capsuleRoutes, { prefix: '/capsule', repo, rng: seeded('routes') });
        await app.ready();
    };

    afterEach(async () => {
        await app?.close();
    });

    test('the glass shows the price, the odds and what is inside', async () => {
        await start(0);
        const body = (await app.inject({ method: 'GET', url: '/capsule/machine' })).json();
        expect(body.data).toEqual({ price: CAPSULE_PRICE, odds: CAPSULE_ODDS, stock: { common: 10, uncommon: 6, rare: 4, epic: 1, legendary: 1 } });
        expect(isPublicRoute('GET', '/capsule/machine')).toBe(true);
        expect(isPublicRoute('POST', '/capsule/pull')).toBe(false);
    });

    test('a turn takes the price and gives exactly one hat or held thing', async () => {
        await start(200);
        const response = await app.inject({ method: 'POST', url: '/capsule/pull' });
        expect(response.statusCode).toBe(201);
        const { item: won, itemInstanceId, coinBalance, price } = response.json().data;
        expect(price).toBe(CAPSULE_PRICE);
        expect(coinBalance).toBe(200 - CAPSULE_PRICE);
        expect(repo.balance).toBe(200 - CAPSULE_PRICE);
        expect(repo.owned).toEqual([{ userId: 'player-1', itemId: won.id }]);
        expect(itemInstanceId).toBe(1);
        expect(['head', 'held']).toContain(won.category);
        expect(won).toMatchObject({ itemKey: `item_${won.id}`, icon: expect.stringContaining('/avatar-px/'), rarity: expect.any(String) });
    });

    test('no tickets, no capsule', async () => {
        await start(CAPSULE_PRICE - 1);
        const response = await app.inject({ method: 'POST', url: '/capsule/pull' });
        expect(response.statusCode).toBe(409);
        expect(response.json().error).toBe('insufficient_funds');
        expect(repo.balance).toBe(CAPSULE_PRICE - 1);
        expect(repo.owned).toEqual([]);
    });

    test('an empty machine takes nothing', async () => {
        await start(500, []);
        const response = await app.inject({ method: 'POST', url: '/capsule/pull' });
        expect(response.statusCode).toBe(409);
        expect(response.json().error).toBe('machine_empty');
        expect(repo.balance).toBe(500);
    });
});
