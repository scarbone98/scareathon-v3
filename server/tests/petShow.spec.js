import { jest } from '@jest/globals';

jest.unstable_mockModule('../routes/inbox.js', () => ({ createConversationWithMessage: jest.fn(async () => ({})) }));
const { createConversationWithMessage } = await import('../routes/inbox.js');
const { SHOW_PRIZES, enterShow, judgePastShows, showJudgedAt, showState, showWeek } = await import('../routes/petShow.js');

// A stand-in for the database: the show's two tables, wallets and the pet items, answering
// the statements the show makes
function fakeDb(usernames = {}) {
    const state = { entries: [], results: new Map(), coins: new Map(), items: new Map(), ledger: [], stamp: 0 };
    const named = (rows) => rows.map((row) => ({ ...row, username: usernames[row.user_id] ?? row.user_id }));
    const ranked = (week) => named(state.entries.filter((e) => e.week === week && e.score > 0).sort((a, b) => b.score - a.score || a.updated_at - b.updated_at));
    const query = async (sql, params = []) => {
        const text = sql.replace(/\s+/g, ' ').trim();
        if (/^(BEGIN|COMMIT|ROLLBACK)/.test(text) || text.includes('ensure_user_wallet')) return { rows: [] };
        if (text.startsWith('INSERT INTO public.pet_show_entries')) {
            const [week, user_id, pet_name, pet_kind, score] = params;
            state.entries = state.entries.filter((e) => !(e.week === week && e.user_id === user_id));
            state.entries.push({ week, user_id, pet_name, pet_kind, score, updated_at: (state.stamp += 1) });
            return { rows: [] };
        }
        if (text.startsWith('SELECT DISTINCT e.week')) {
            const weeks = [...new Set(state.entries.map((e) => e.week))].filter((week) => week < params[0] && !state.results.has(week)).sort();
            return { rows: weeks.map((week) => ({ week })) };
        }
        if (text.startsWith('INSERT INTO public.pet_show_results')) {
            if (state.results.has(params[0])) return { rows: [] };
            state.results.set(params[0], []);
            return { rows: [{ week: params[0] }] };
        }
        if (text.startsWith('SELECT e.user_id, e.pet_name')) return { rows: ranked(params[0]).slice(0, text.includes('LIMIT 3') ? 3 : 5) };
        if (text.startsWith('UPDATE user_wallets')) {
            state.coins.set(params[0], (state.coins.get(params[0]) || 0) + params[1]);
            return { rows: [{ coin_balance: state.coins.get(params[0]) }] };
        }
        if (text.startsWith('INSERT INTO currency_transactions')) {
            state.ledger.push({ user: params[0], amount: params[1], week: params[3] });
            return { rows: [] };
        }
        if (text.startsWith('INSERT INTO public.user_pet_items')) {
            const key = `${params[0]}|${params[1]}`;
            const have = state.items.get(key) || 0;
            state.items.set(key, have === 0 ? 1 : params[2] ? Math.max(have, 1) : have + 1);
            return { rows: [] };
        }
        if (text.startsWith('UPDATE public.pet_show_results')) {
            state.results.set(params[0], JSON.parse(params[1]));
            return { rows: [] };
        }
        if (text.startsWith('SELECT pet_name, pet_kind, score')) return { rows: state.entries.filter((e) => e.week === params[0] && e.user_id === params[1]) };
        if (text.startsWith('SELECT week, winners')) {
            const weeks = [...state.results.keys()].filter((week) => week < params[0]).sort();
            const week = weeks[weeks.length - 1];
            return { rows: week ? [{ week, winners: state.results.get(week) }] : [] };
        }
        throw new Error(`unexpected statement: ${text}`);
    };
    return { state, query };
}

const wednesday = new Date('2026-10-14T12:00:00Z');
const saturday = new Date('2026-10-17T12:00:00Z');

describe('the best kept cryptlin show', () => {
    test('a show is judged on Friday at six in the evening, UTC', () => {
        expect(showJudgedAt(wednesday).toISOString()).toBe('2026-10-16T18:00:00.000Z');
        expect(showWeek(new Date('2026-10-16T17:59:00Z'))).toBe('2026-10-16');
        expect(showWeek(new Date('2026-10-16T18:00:00Z'))).toBe('2026-10-23');
    });

    test('a keeper has one entry a week, the latest said; nonsense is turned away', async () => {
        const db = fakeDb();
        expect(await enterShow('a', { name: 'Mog', kind: 'frogman', score: 40 }, db, wednesday)).toEqual({ status: 'entered' });
        await enterShow('a', { name: 'Mog', kind: 'frogman', score: 72.4 }, db, wednesday);
        expect(db.state.entries).toHaveLength(1);
        expect(db.state.entries[0].score).toBe(72);
        expect(await enterShow('a', { name: 'Mog', kind: 'frogman', score: 140 }, db, wednesday)).toEqual({ status: 'bad' });
        expect(await enterShow('a', { name: '', kind: 'frogman', score: 50 }, db, wednesday)).toEqual({ status: 'bad' });
        expect(await enterShow('a', { name: 'Mog', kind: 'frogman', score: 'lots' }, db, wednesday)).toEqual({ status: 'bad' });
    });

    test('once Friday has passed the best three are paid, once, and first place gets the cup', async () => {
        const db = fakeDb();
        await enterShow('a', { name: 'Mog', kind: 'frogman', score: 60 }, db, wednesday);
        await enterShow('b', { name: 'Pip', kind: 'gnome', score: 91 }, db, wednesday);
        await enterShow('c', { name: 'Ash', kind: 'yeti', score: 75 }, db, wednesday);
        await enterShow('d', { name: 'Dot', kind: 'gremlin', score: 12 }, db, wednesday);
        await enterShow('e', { name: 'Nil', kind: 'gremlin', score: 0 }, db, wednesday);
        expect(await judgePastShows(db, wednesday)).toEqual([]);

        const judged = await judgePastShows(db, saturday);
        expect(judged[0].winners.map((winner) => winner.petName)).toEqual(['Pip', 'Ash', 'Mog']);
        expect(db.state.coins.get('b')).toBe(SHOW_PRIZES[0].tickets);
        expect(db.state.coins.get('c')).toBe(SHOW_PRIZES[1].tickets);
        expect(db.state.coins.get('a')).toBe(SHOW_PRIZES[2].tickets);
        expect(db.state.coins.has('d')).toBe(false);
        expect(db.state.items.get('b|cryptlins:rosette1')).toBe(1);
        expect(db.state.items.get('b|cryptlins:trophy')).toBe(1);
        expect(db.state.items.get('c|cryptlins:rosette2')).toBe(1);
        expect(db.state.items.has('c|cryptlins:trophy')).toBe(false);
        expect(createConversationWithMessage).toHaveBeenCalledTimes(3);

        expect(await judgePastShows(db, saturday)).toEqual([]);
        expect(db.state.coins.get('b')).toBe(SHOW_PRIZES[0].tickets);
    });

    test('a tie goes to whoever was entered first, and a second win is another rosette but the one cup', async () => {
        const db = fakeDb();
        await enterShow('a', { name: 'Mog', kind: 'frogman', score: 80 }, db, wednesday);
        await enterShow('b', { name: 'Pip', kind: 'gnome', score: 80 }, db, wednesday);
        await judgePastShows(db, saturday);
        await enterShow('a', { name: 'Mog', kind: 'frogman', score: 80 }, db, saturday);
        await judgePastShows(db, new Date('2026-10-24T12:00:00Z'));
        expect(db.state.items.get('a|cryptlins:rosette1')).toBe(2);
        expect(db.state.items.get('a|cryptlins:trophy')).toBe(1);
    });

    test('the notice names who is ahead and last time\'s winners, and gives no scores away', async () => {
        const db = fakeDb({ a: 'Ada', b: 'Bo' });
        await enterShow('a', { name: 'Mog', kind: 'frogman', score: 60 }, db, wednesday);
        await enterShow('b', { name: 'Pip', kind: 'gnome', score: 91 }, db, wednesday);
        await judgePastShows(db, saturday);
        await enterShow('a', { name: 'Mog', kind: 'frogman', score: 66 }, db, saturday);
        const notice = await showState('a', db, saturday);
        expect(notice.week).toBe('2026-10-23');
        expect(notice.ahead).toEqual([{ petName: 'Mog', petKind: 'frogman', keeper: 'Ada', yours: true }]);
        expect(notice.mine).toEqual({ petName: 'Mog', petKind: 'frogman' });
        expect(notice.last.winners.map((winner) => `${winner.place} ${winner.petName} ${winner.keeper}`)).toEqual(['1 Pip Bo', '2 Mog Ada']);
        expect(JSON.stringify(notice)).not.toMatch(/score/);
    });
});
