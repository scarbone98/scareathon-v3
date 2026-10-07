import Fastify from 'fastify';
import {
    POKER_HANDS,
    RACE_FIELD,
    RACE_HOUSE_EDGE,
    ROULETTE_BETS,
    ROULETTE_WHEEL,
    dealerHolds,
    drawCards,
    evaluateHand,
    makeRaceCard,
    parseHolds,
    parseRouletteBets,
    pokerOutcome,
    pokerPayout,
    raceOdds,
    racePayout,
    rouletteColor,
    runRace,
    settleRoulette,
    slotResult,
    slotReturnToPlayer,
    spinReels,
} from '../shared/casino/index.js';
import { createRng, random } from '../shared/monster-bash/rng.js';
import { RACE_GAME, RaceLoop } from '../casino/raceLoop.js';
import { RoundRefusedError } from '../casino/repository.js';
import { isPublicRoute } from '../utils/authRoutes.js';
import casinoRoutes, { parseRaceBet, parseStake } from '../routes/casino.js';

const seeded = (seed) => {
    const rng = createRng(seed);
    return () => random(rng);
};

describe('slots', () => {
    test('pays three of a kind, then a pair on the first two reels, else nothing', () => {
        expect(slotResult(['ghost', 'ghost', 'ghost'])).toEqual({ line: 'three', multiplier: 30 });
        expect(slotResult(['ghost', 'ghost', 'rat'])).toEqual({ line: 'pair', multiplier: 5 });
        expect(slotResult(['rat', 'ghost', 'ghost'])).toEqual({ line: null, multiplier: 0 });
    });

    test('keeps a house edge without being stingy', () => {
        const back = slotReturnToPlayer();
        expect(back).toBeGreaterThan(0.9);
        expect(back).toBeLessThan(0.98);
    });

    test('spins three known symbols', () => {
        const reels = spinReels(seeded('slots'));
        expect(reels).toHaveLength(3);
        expect(() => slotResult(reels)).not.toThrow();
    });
});

describe('roulette', () => {
    const limits = { minBet: 1, maxBet: 100 };

    test('colours the wheel: one green, eighteen red, eighteen black', () => {
        const colors = ROULETTE_WHEEL.map(rouletteColor);
        expect(colors.filter((color) => color === 'green')).toHaveLength(1);
        expect(colors.filter((color) => color === 'red')).toHaveLength(18);
        expect(colors.filter((color) => color === 'black')).toHaveLength(18);
        expect([...ROULETTE_WHEEL].sort((a, b) => a - b)).toEqual(Array.from({ length: 37 }, (_, n) => n));
    });

    test('every kind of bet gives the house the same small edge', () => {
        for (const kind of Object.values(ROULETTE_BETS)) {
            const wins = ROULETTE_WHEEL.filter((number) => kind.wins(number, 1)).length;
            expect((wins * (kind.pays + 1)) / ROULETTE_WHEEL.length).toBeCloseTo(36 / 37);
        }
    });

    test('merges chips on the same spot', () => {
        expect(parseRouletteBets([
            { type: 'red', amount: 5 },
            { type: 'straight', value: 17, amount: 2 },
            { type: 'red', amount: 5 },
        ], limits)).toEqual([
            { type: 'red', value: null, amount: 10 },
            { type: 'straight', value: 17, amount: 2 },
        ]);
    });

    test.each([
        [[]],
        [null],
        [[{ type: 'purple', amount: 5 }]],
        [[{ type: 'constructor', amount: 5 }]],
        [[{ type: 'straight', value: 37, amount: 5 }]],
        [[{ type: 'straight', amount: 5 }]],
        [[{ type: 'dozen', value: 3, amount: 5 }]],
        [[{ type: 'red', amount: 0 }]],
        [[{ type: 'red', amount: 2.5 }]],
        [[{ type: 'red', amount: '5' }]],
        [[{ type: 'red', amount: 60 }, { type: 'black', amount: 41 }]],
    ])('rejects %j', (bets) => {
        expect(parseRouletteBets(bets, limits)).toBeNull();
    });

    test('pays winners their stake back plus the odds', () => {
        const bets = parseRouletteBets([
            { type: 'straight', value: 17, amount: 2 },
            { type: 'black', amount: 10 },
            { type: 'red', amount: 10 },
            { type: 'dozen', value: 1, amount: 3 },
            { type: 'column', value: 1, amount: 3 },
            { type: 'even', amount: 4 },
        ], limits);
        // 17: black, odd, second dozen, second column.
        const result = settleRoulette(bets, 17);
        expect(result.bets.map((bet) => bet.payout)).toEqual([72, 20, 0, 9, 9, 0]);
        expect(result.payout).toBe(110);
        // Zero beats every outside bet.
        expect(settleRoulette(bets, 0).payout).toBe(0);
    });
});

describe('racing', () => {
    test('deals six different monsters whose chances add up to one', () => {
        const card = makeRaceCard(seeded('card'));
        expect(card).toHaveLength(RACE_FIELD);
        expect(new Set(card.map((runner) => runner.monster)).size).toBe(RACE_FIELD);
        expect(card.reduce((sum, runner) => sum + runner.chance, 0)).toBeCloseTo(1);
    });

    test('never pays more than the chance is worth', () => {
        const rng = seeded('odds');
        for (let i = 0; i < 500; i++) {
            for (const runner of makeRaceCard(rng)) {
                const back = runner.chance * (racePayout(100, runner.odds) / 100);
                expect(back).toBeLessThanOrEqual(1 - RACE_HOUSE_EDGE + 1e-9);
                expect(back).toBeGreaterThan(0.8);
            }
        }
        expect(raceOdds(0.25)).toBe(3.6);
        expect(racePayout(10, 3.6)).toBe(36);
    });

    test('finishes every lane once, in the order of their times', () => {
        const rng = seeded('race');
        const card = makeRaceCard(rng);
        const race = runRace(card, rng);
        expect([...race.order].sort()).toEqual([0, 1, 2, 3, 4, 5]);
        expect(race.winner).toBe(race.order[0]);
        const times = race.order.map((lane) => race.times[lane]);
        expect(times).toEqual([...times].sort((a, b) => a - b));
    });

    test('monsters win about as often as their chance says', () => {
        const rng = seeded('fair');
        const card = makeRaceCard(rng);
        const wins = card.map(() => 0);
        const races = 20000;
        for (let i = 0; i < races; i++) wins[runRace(card, rng).winner] += 1;
        card.forEach((runner, lane) => expect(wins[lane] / races).toBeCloseTo(runner.chance, 1));
    });
});

describe('picture poker', () => {
    const hand = (text) => text.split(' ');

    test('names every kind of hand', () => {
        expect(evaluateHand(hand('candle rat pumpkin ghost skull')).id).toBe('junk');
        expect(evaluateHand(hand('candle candle pumpkin ghost skull')).id).toBe('pair');
        expect(evaluateHand(hand('candle candle ghost ghost skull')).id).toBe('two_pair');
        expect(evaluateHand(hand('candle candle candle ghost skull')).id).toBe('three');
        expect(evaluateHand(hand('candle candle candle ghost ghost')).id).toBe('full_house');
        expect(evaluateHand(hand('candle candle candle candle skull')).id).toBe('four');
        expect(evaluateHand(hand('skull skull skull skull skull')).id).toBe('five');
        expect(POKER_HANDS.map((entry) => entry.id)).toEqual(['junk', 'pair', 'two_pair', 'three', 'full_house', 'four', 'five']);
    });

    test('the player needs the better kind of hand; the dealer takes equal ones', () => {
        const pair = hand('candle candle pumpkin ghost skull');
        const betterPair = hand('werewolf werewolf pumpkin ghost skull');
        const four = hand('rat rat rat rat skull');
        expect(pokerOutcome(four, pair)).toBe('win');
        expect(pokerOutcome(pair, four)).toBe('lose');
        expect(pokerOutcome(betterPair, pair)).toBe('lose');
        expect(pokerPayout(10, four, pair)).toBe(30);
        expect(pokerPayout(10, pair, four)).toBe(0);
        expect(pokerPayout(10, pair, hand('candle rat pumpkin ghost skull'))).toBe(20);
    });

    test('the dealer keeps matching cards and swaps the rest', () => {
        const cards = hand('ghost rat ghost skull rat');
        expect(dealerHolds(cards)).toEqual([true, true, true, false, true]);
        const drawn = drawCards(cards, dealerHolds(cards), seeded('draw'));
        expect(drawn.filter((_, i) => i !== 3)).toEqual(['ghost', 'rat', 'ghost', 'rat']);
    });

    test('only takes five yes-or-no holds', () => {
        expect(parseHolds([true, false, true, false, false])).toEqual([true, false, true, false, false]);
        expect(parseHolds([true, false])).toBeNull();
        expect(parseHolds([1, 0, 1, 0, 0])).toBeNull();
        expect(parseHolds('ttttt')).toBeNull();
    });
});

describe('bet parsing', () => {
    test('stakes are whole tickets within the limits', () => {
        expect(parseStake(1, 100)).toBe(1);
        expect(parseStake(100, 100)).toBe(100);
        for (const bad of [0, 101, 2.5, '10', null, undefined, NaN, -5]) expect(parseStake(bad, 100)).toBeNull();
    });

    test('a race bet names the race, a lane and a stake', () => {
        expect(parseRaceBet({ raceId: 'abc', lane: 5, amount: 10 }, 100)).toEqual({ raceId: 'abc', lane: 5, amount: 10 });
        expect(parseRaceBet({ raceId: 'abc', lane: 6, amount: 10 }, 100)).toBeNull();
        expect(parseRaceBet({ raceId: 7, lane: 1, amount: 10 }, 100)).toBeNull();
        expect(parseRaceBet({ raceId: 'abc', lane: 1, amount: 0 }, 100)).toBeNull();
        expect(parseRaceBet(null, 100)).toBeNull();
    });
});

// Wallets and rounds in memory, refusing what the SQL functions refuse.
function fakeRepo(balance = 100) {
    const key = (userId, game) => userId + ':' + game;
    const repo = {
        balances: new Map(),
        rounds: [],
        open: new Map(),
        nextId: 1,
        balanceOf: (userId) => repo.balances.get(userId) ?? balance,
        move(userId, amount) {
            repo.balances.set(userId, repo.balanceOf(userId) + amount);
            return repo.balanceOf(userId);
        },
        async getBalance(userId) {
            return repo.balanceOf(userId);
        },
        async playRound({ userId, game, stake, payout, state }) {
            if (stake > repo.balanceOf(userId)) throw new RoundRefusedError('insufficient_funds');
            repo.rounds.push({ game, stake, payout, state });
            return { roundId: String(repo.nextId++), balance: repo.move(userId, payout - stake) };
        },
        async openRound({ userId, game, stake, state }) {
            if (repo.open.has(key(userId, game))) throw new RoundRefusedError('round_in_progress');
            if (stake > repo.balanceOf(userId)) throw new RoundRefusedError('insufficient_funds');
            const round = { id: String(repo.nextId++), userId, game, stake, state };
            repo.open.set(key(userId, game), round);
            return { roundId: round.id, balance: repo.move(userId, -stake) };
        },
        async settleRound({ userId, roundId, payout, state }) {
            const round = [...repo.open.values()].find((entry) => entry.id === roundId && entry.userId === userId);
            if (!round) throw new RoundRefusedError('round_not_open');
            repo.open.delete(key(userId, round.game));
            repo.rounds.push({ ...round, payout, state });
            return { roundId, balance: repo.move(userId, payout) };
        },
        async findOpenRound(userId, game) {
            return repo.open.get(key(userId, game)) ?? null;
        },
        async findOpenRounds(game) {
            return [...repo.open.values()].filter((round) => round.game === game);
        },
        async pruneOlderThan() {
            return 0;
        },
    };
    return repo;
}

const quietLog = { info() {}, warn() {}, error() {}, child: () => quietLog };

function fakeHub() {
    const hub = { sent: [], broadcast: (message) => hub.sent.push(message), ofType: (type) => hub.sent.filter((message) => message.type === type) };
    return hub;
}

describe('live races', () => {
    let clock;
    let repo;
    let hub;
    let loop;

    beforeEach(() => {
        clock = 1_000_000;
        repo = fakeRepo(100);
        hub = fakeHub();
        // Not started: the tests take each step by hand instead of waiting on timers.
        loop = new RaceLoop({ repo, hub, log: quietLog, rng: seeded('live'), now: () => clock });
    });

    test('announces a race with odds, never the chances behind them', () => {
        loop.openRace();
        const [{ race, now }] = hub.ofType('race');
        expect(now).toBe(clock);
        expect(race.bettingClosesAt).toBe(clock + 30_000);
        expect(race.runners).toHaveLength(RACE_FIELD);
        expect(race.runners[0]).toEqual({ monster: expect.any(String), odds: expect.any(Number) });
        expect(race.start).toBeNull();
    });

    test('takes one bet each while betting is open, and counts them for the crowd', async () => {
        loop.openRace();
        const raceId = loop.current.id;
        const placed = await loop.placeBet({ userId: 'ann', raceId, lane: 2, amount: 10 });
        expect(placed).toEqual({ bet: { raceId, lane: 2, amount: 10, odds: loop.current.runners[2].odds }, balance: 90 });
        expect(loop.betFor('ann')).toEqual(placed.bet);
        expect(loop.betFor('bob')).toBeNull();
        await loop.placeBet({ userId: 'bob', raceId, lane: 2, amount: 5 });
        expect(hub.ofType('bets').at(-1).counts).toEqual([0, 0, 2, 0, 0, 0]);

        await expect(loop.placeBet({ userId: 'ann', raceId, lane: 1, amount: 10 })).rejects.toMatchObject({ code: 'already_bet' });
        await expect(loop.placeBet({ userId: 'cat', raceId: 'some-old-race', lane: 1, amount: 10 })).rejects.toMatchObject({ code: 'betting_closed' });
        await expect(loop.placeBet({ userId: 'dan', raceId, lane: 1, amount: 500 })).rejects.toMatchObject({ code: 'insufficient_funds' });
        // A refused bet doesn't hold the player's place.
        expect(loop.betFor('dan')).toBeNull();
        expect(repo.balanceOf('ann')).toBe(90);
    });

    test('closes betting on time and when the race is off', async () => {
        loop.openRace();
        const raceId = loop.current.id;
        clock += 30_000;
        await expect(loop.placeBet({ userId: 'ann', raceId, lane: 0, amount: 10 })).rejects.toMatchObject({ code: 'betting_closed' });
        loop.closeRace();
        await expect(loop.placeBet({ userId: 'ann', raceId, lane: 0, amount: 10 })).rejects.toMatchObject({ code: 'betting_closed' });
        expect(repo.balanceOf('ann')).toBe(100);
    });

    test('runs the race when betting closes and pays the winners once it has been shown', async () => {
        loop.openRace();
        const raceId = loop.current.id;
        const runners = loop.current.runners;
        for (let lane = 0; lane < RACE_FIELD; lane++) await loop.placeBet({ userId: 'player-' + lane, raceId, lane, amount: 10 });

        clock += 30_000;
        loop.closeRace();
        const [start] = hub.ofType('start');
        expect(start).toMatchObject({ id: raceId, startedAt: clock, winner: start.order[0] });
        // Nobody is paid while the race is still being shown.
        expect(repo.open.size).toBe(RACE_FIELD);

        await loop.finishRace();
        expect(hub.ofType('finished')).toEqual([{ type: 'finished', id: raceId }]);
        expect(repo.open.size).toBe(0);
        for (let lane = 0; lane < RACE_FIELD; lane++) {
            const won = lane === start.winner;
            expect(repo.balanceOf('player-' + lane)).toBe(won ? 90 + racePayout(10, runners[lane].odds) : 90);
        }
        // A viewer arriving now sees the finished race.
        expect(loop.welcomeMessages()[0].race).toMatchObject({ id: raceId, settled: true, start: { winner: start.winner } });

        loop.openRace();
        expect(loop.current.id).not.toBe(raceId);
        expect(loop.betFor('player-0')).toBeNull();
    });

    test('refunds bets a crash left unpaid', async () => {
        loop.openRace();
        await loop.placeBet({ userId: 'ann', raceId: loop.current.id, lane: 0, amount: 40 });
        expect(repo.balanceOf('ann')).toBe(60);

        // The server restarts mid-race: a new loop knows nothing of the old race.
        const restarted = new RaceLoop({ repo, hub: fakeHub(), log: quietLog, rng: seeded('again'), now: () => clock });
        await restarted.refundOpenBets();
        expect(repo.balanceOf('ann')).toBe(100);
        expect(await repo.findOpenRounds(RACE_GAME)).toEqual([]);
        restarted.openRace();
        await expect(restarted.placeBet({ userId: 'ann', raceId: restarted.current.id, lane: 0, amount: 10 })).resolves.toMatchObject({ balance: 90 });
    });

    test('the feed is open to guests', () => {
        expect(isPublicRoute('GET', '/casino/racing/ws')).toBe(true);
        expect(isPublicRoute('POST', '/casino/racing/bet')).toBe(false);
        expect(isPublicRoute('GET', '/casino/me')).toBe(false);
    });
});

describe('casino routes', () => {
    let app;
    let repo;
    let races;

    const start = async (balance, seed = 'routes') => {
        repo = fakeRepo(balance);
        app = Fastify();
        app.addHook('onRequest', async (request) => {
            request.user = { sub: 'player-1' };
        });
        races = new RaceLoop({ repo, hub: fakeHub(), log: quietLog, rng: seeded(seed) });
        await app.register(casinoRoutes, { prefix: '/casino', repo, rng: seeded(seed), races, startRaces: false });
        await app.ready();
    };
    const post = (url, payload) => app.inject({ method: 'POST', url, payload });

    afterEach(async () => {
        await app?.close();
    });

    test('reports the balance and limits', async () => {
        await start(250);
        const response = await app.inject({ method: 'GET', url: '/casino/me' });
        expect(response.json()).toEqual({ balance: 250, limits: { minBet: 1, maxBet: 100 } });
    });

    test('a slots spin moves exactly stake and payout', async () => {
        await start(100);
        const response = await post('/casino/slots/spin', { amount: 10 });
        const body = response.json();
        expect(response.statusCode).toBe(200);
        expect(body.payout).toBe(10 * slotResult(body.reels).multiplier);
        expect(body.balance).toBe(100 - 10 + body.payout);
        expect(repo.rounds).toEqual([{ game: 'slots', stake: 10, payout: body.payout, state: { reels: body.reels } }]);
    });

    test('refuses malformed bets and bets the player cannot cover', async () => {
        await start(5);
        expect((await post('/casino/slots/spin', { amount: 1000 })).statusCode).toBe(400);
        expect((await post('/casino/slots/spin', {})).statusCode).toBe(400);
        const broke = await post('/casino/slots/spin', { amount: 10 });
        expect(broke.statusCode).toBe(409);
        expect(broke.json().error).toBe('insufficient_funds');
        expect(repo.balanceOf('player-1')).toBe(5);
    });

    test('a roulette spin pays each bet by the number that came up', async () => {
        await start(100);
        const response = await post('/casino/roulette/spin', { bets: [{ type: 'red', amount: 10 }, { type: 'black', amount: 10 }] });
        const body = response.json();
        expect(body.stake).toBe(20);
        expect(body.color).toBe(rouletteColor(body.number));
        // Red and black together: one pays unless it's zero.
        expect(body.payout).toBe(body.number === 0 ? 0 : 20);
        expect(body.balance).toBe(100 - 20 + body.payout);
        expect((await post('/casino/roulette/spin', { bets: [{ type: 'red', amount: 101 }] })).statusCode).toBe(400);
    });

    test('a race bet is taken now and paid when the race is over', async () => {
        await start(100);
        races.openRace();
        const raceId = races.current.id;
        expect((await app.inject({ method: 'GET', url: '/casino/racing/bet' })).json()).toEqual({ bet: null });

        const response = await post('/casino/racing/bet', { raceId, lane: 2, amount: 10 });
        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({ bet: { raceId, lane: 2, amount: 10, odds: races.current.runners[2].odds }, balance: 90 });
        expect((await app.inject({ method: 'GET', url: '/casino/racing/bet' })).json().bet).toEqual(response.json().bet);

        const twice = await post('/casino/racing/bet', { raceId, lane: 3, amount: 10 });
        expect(twice.statusCode).toBe(409);
        expect(twice.json().error).toBe('already_bet');
        expect((await post('/casino/racing/bet', { raceId, lane: 9, amount: 10 })).statusCode).toBe(400);

        races.closeRace();
        await races.finishRace();
        const won = races.current.start.winner === 2;
        expect((await app.inject({ method: 'GET', url: '/casino/me' })).json().balance).toBe(won ? 90 + racePayout(10, races.current.runners[2].odds) : 90);
    });

    test('picture poker takes the bet on the deal and pays on the draw', async () => {
        await start(100);
        expect((await app.inject({ method: 'GET', url: '/casino/poker' })).json()).toEqual({ round: null });

        const deal = (await post('/casino/poker/deal', { amount: 10 })).json();
        expect(deal.balance).toBe(90);
        expect(deal.round.cards).toHaveLength(5);
        // The dealer's cards stay on the server until the draw.
        expect(JSON.stringify(deal)).not.toContain('dealer');
        expect((await app.inject({ method: 'GET', url: '/casino/poker' })).json().round).toEqual(deal.round);

        const second = await post('/casino/poker/deal', { amount: 10 });
        expect(second.statusCode).toBe(409);
        expect(second.json().error).toBe('round_in_progress');

        const holds = [true, true, false, false, false];
        const draw = (await post('/casino/poker/draw', { holds })).json();
        expect(draw.cards.slice(0, 2)).toEqual(deal.round.cards.slice(0, 2));
        expect(draw.outcome).toBe(pokerOutcome(draw.cards, draw.dealer.cards));
        expect(draw.payout).toBe(pokerPayout(10, draw.cards, draw.dealer.cards));
        expect(draw.balance).toBe(90 + draw.payout);
        draw.dealer.holds.forEach((kept, i) => kept && expect(draw.dealer.cards[i]).toBe(draw.dealer.dealt[i]));

        // The hand is over: drawing again pays nothing more.
        const again = await post('/casino/poker/draw', { holds });
        expect(again.statusCode).toBe(409);
        expect(repo.balanceOf('player-1')).toBe(draw.balance);
    });
});
