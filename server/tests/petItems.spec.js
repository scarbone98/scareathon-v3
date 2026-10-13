import { PET_ITEMS, buyPetItem, petItemState, returnPetItem, usePetItem } from '../routes/petItems.js';

// A stand-in for the database: one wallet and the pet items table, answering the handful of
// statements the route makes
function fakeDb(coins) {
    const state = { coins, items: new Map(), placed: new Map(), ledger: [] };
    const query = async (sql, params = []) => {
        const text = sql.replace(/\s+/g, ' ').trim();
        if (/^(BEGIN|COMMIT|ROLLBACK)/.test(text) || text.includes('ensure_user_wallet')) return { rows: [] };
        if (text.startsWith('SELECT coin_balance')) return { rows: [{ coin_balance: state.coins }] };
        if (text.startsWith('SELECT quantity FROM public.user_pet_items')) return { rows: state.items.has(params[1]) ? [{ quantity: state.items.get(params[1]) }] : [] };
        if (text.startsWith('SELECT item_key, quantity')) return { rows: [...state.items].filter(([, quantity]) => quantity > 0).map(([item_key, quantity]) => ({ item_key, quantity })) };
        if (text.startsWith('INSERT INTO public.user_pet_items')) {
            state.items.set(params[1], (state.items.get(params[1]) || 0) + params[2]);
            return { rows: [] };
        }
        if (text.startsWith('UPDATE user_wallets')) {
            state.coins -= params[1];
            return { rows: [{ coin_balance: state.coins }] };
        }
        if (text.startsWith('INSERT INTO currency_transactions')) {
            state.ledger.push({ amount: params[1], source: params[3] });
            return { rows: [] };
        }
        if (text.startsWith('UPDATE public.user_pet_items SET quantity = quantity - 1')) {
            const have = state.items.get(params[1]) || 0;
            if (have <= 0) return { rows: [] };
            state.items.set(params[1], have - 1);
            state.placed.set(params[1], (state.placed.get(params[1]) || 0) + 1);
            return { rows: [{ quantity: have - 1 }] };
        }
        if (text.startsWith('UPDATE public.user_pet_items SET quantity = quantity + 1')) {
            const out = state.placed.get(params[1]) || 0;
            if (out <= 0) return { rows: [] };
            state.placed.set(params[1], out - 1);
            state.items.set(params[1], (state.items.get(params[1]) || 0) + 1);
            return { rows: [{ quantity: state.items.get(params[1]) }] };
        }
        throw new Error(`unexpected statement: ${text}`);
    };
    return { state, query };
}

const food = PET_ITEMS.find((item) => item.game === 'cryptlins' && !item.keeps && item.pack > 1);
const kept = PET_ITEMS.find((item) => item.game === 'cryptlins' && item.keeps);

describe('pet supplies', () => {
    test('every item has a key of its own, a name and a price', () => {
        expect(new Set(PET_ITEMS.map((item) => item.key)).size).toBe(PET_ITEMS.length);
        for (const item of PET_ITEMS) {
            expect(item.key).toBe(`${item.game}:${item.id}`);
            expect(item.name).toBeTruthy();
            expect(item.price).toBeGreaterThan(0);
        }
    });

    test('food comes several to a purchase, can be bought again, and is used up one at a time', async () => {
        const db = fakeDb(1000);
        expect(await buyPetItem(db, 'u', food.key)).toEqual({ status: 'bought' });
        expect(await buyPetItem(db, 'u', food.key)).toEqual({ status: 'bought' });
        expect(db.state.coins).toBe(1000 - 2 * food.price);
        expect((await petItemState('u', db)).owned[food.key]).toBe(2 * food.pack);
        expect(await usePetItem('u', food.key, db)).toEqual({ status: 'used' });
        expect((await petItemState('u', db)).owned[food.key]).toBe(2 * food.pack - 1);
        expect(db.state.ledger).toEqual([{ amount: -food.price, source: food.key }, { amount: -food.price, source: food.key }]);
    });

    test('a thing that is kept is bought once, shows as kept, and is never used up', async () => {
        const db = fakeDb(1000);
        expect(await buyPetItem(db, 'u', kept.key)).toEqual({ status: 'bought' });
        expect(await buyPetItem(db, 'u', kept.key)).toEqual({ status: 'owned' });
        expect(db.state.coins).toBe(1000 - kept.price);
        expect(await usePetItem('u', kept.key, db)).toEqual({ status: 'kept' });
        expect((await petItemState('u', db)).owned[kept.key]).toBe(-1);
    });

    test('nothing is bought without the tickets for it, or that is not on the shelf', async () => {
        const db = fakeDb(food.price - 1);
        expect(await buyPetItem(db, 'u', food.key)).toEqual({ status: 'short' });
        expect(await buyPetItem(db, 'u', 'cryptlins:nothing')).toEqual({ status: 'missing' });
        expect(db.state.coins).toBe(food.price - 1);
        expect((await petItemState('u', db)).owned).toEqual({});
    });

    test('what was put in can be taken back out, and nothing else can', async () => {
        const db = fakeDb(1000);
        await buyPetItem(db, 'u', food.key);
        expect(await returnPetItem('u', food.key, db)).toEqual({ status: 'none' });
        await usePetItem('u', food.key, db);
        expect(await returnPetItem('u', food.key, db)).toEqual({ status: 'returned' });
        expect(await returnPetItem('u', food.key, db)).toEqual({ status: 'none' });
        expect((await petItemState('u', db)).owned[food.key]).toBe(food.pack);
        expect(await returnPetItem('u', kept.key, db)).toEqual({ status: 'kept' });
    });

    test('using what you have none of changes nothing', async () => {
        const db = fakeDb(0);
        expect(await usePetItem('u', food.key, db)).toEqual({ status: 'none' });
        expect(await usePetItem('u', 'aquarium:nothing', db)).toEqual({ status: 'missing' });
    });
});
