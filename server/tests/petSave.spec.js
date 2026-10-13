import { MAX_SAVE_BYTES, readPetSave, writePetSave } from '../routes/petSave.js';

// A stand-in for the table: one save to a keeper and game, the newer one standing
function fakeDb() {
    const saves = new Map();
    const query = async (sql, params = []) => {
        const text = sql.replace(/\s+/g, ' ').trim();
        const key = `${params[0]}|${params[1]}`;
        if (text.startsWith('SELECT save')) return { rows: saves.has(key) ? [{ save: saves.get(key).save }] : [] };
        if (text.startsWith('INSERT INTO public.pet_saves')) {
            const held = saves.get(key);
            if (held && held.at > params[3]) return { rows: [] };
            saves.set(key, { save: JSON.parse(params[2]), at: params[3] });
            return { rows: [{ saved_at: params[3] }] };
        }
        throw new Error(`unexpected statement: ${text}`);
    };
    return { saves, query };
}

describe('a creature\'s save on its keeper\'s account', () => {
    test('what is kept is what is handed back, to that keeper only', async () => {
        const db = fakeDb();
        expect(await readPetSave('a', 'cryptlins', db)).toBeNull();
        expect(await writePetSave('a', 'cryptlins', { time: 100, residents: [{ name: 'Mog' }] }, db)).toEqual({ status: 'kept' });
        expect((await readPetSave('a', 'cryptlins', db)).residents[0].name).toBe('Mog');
        expect(await readPetSave('b', 'cryptlins', db)).toBeNull();
    });

    test('a save older than the one held is turned away', async () => {
        const db = fakeDb();
        await writePetSave('a', 'cryptlins', { time: 200, floor: 2 }, db);
        expect(await writePetSave('a', 'cryptlins', { time: 150, floor: 1 }, db)).toEqual({ status: 'stale' });
        expect((await readPetSave('a', 'cryptlins', db)).floor).toBe(2);
        expect(await writePetSave('a', 'cryptlins', { time: 250, floor: 3 }, db)).toEqual({ status: 'kept' });
    });

    test('nonsense, another game and a save too big are not kept', async () => {
        const db = fakeDb();
        expect(await writePetSave('a', 'cryptlins', null, db)).toEqual({ status: 'bad' });
        expect(await writePetSave('a', 'cryptlins', [1], db)).toEqual({ status: 'bad' });
        expect(await writePetSave('a', 'cryptlins', { floor: 1 }, db)).toEqual({ status: 'bad' });
        expect(await writePetSave('a', 'chess', { time: 5 }, db)).toEqual({ status: 'bad' });
        expect(await writePetSave('a', 'cryptlins', { time: 5, junk: 'x'.repeat(MAX_SAVE_BYTES) }, db)).toEqual({ status: 'bad' });
        expect(db.saves.size).toBe(0);
    });
});
