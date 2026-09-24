import {
    BRIDGE_X,
    BRIDGE_HALF_WIDTH,
    CARDS,
    DOUBLE_ELIXIR_TICK,
    ELIXIR_MAX,
    MATCH_TICKS,
    OVERTIME_TICKS,
    RIVER_HALF,
    START_ELIXIR,
    cardPower,
    createMatch,
    hashState,
    replayMatch,
    simulateMatch,
    spawnCard,
    stepMatch,
    validateDeck,
    validatePlay,
} from '../shared/royale/index.js';

const ids = CARDS.map((card) => card.id);
const deckA = ids.slice(0, 8);
const deckB = ids.slice(7, 15);

function newMatch(seed = 'test') {
    return createMatch({ seed, decks: [deckA, deckB] });
}

function stepN(state, n) {
    for (let i = 0; i < n; i++) stepMatch(state);
}

describe('royale cards', () => {
    test('ids are unique and every card has a sprite and a cost', () => {
        expect(new Set(ids).size).toBe(ids.length);
        for (const card of CARDS) {
            expect(card.sprite.url).toMatch(/\.png$/);
            expect(card.cost).toBeGreaterThanOrEqual(1);
        }
    });

    test('pricier cost tiers are stronger on average', () => {
        const byCost = {};
        for (const card of CARDS) {
            if (card.type === 'spell') continue;
            (byCost[card.cost] ??= []).push(cardPower(card));
        }
        const tiers = Object.keys(byCost)
            .map(Number)
            .sort((a, b) => a - b)
            .map((cost) => byCost[cost].reduce((a, b) => a + b, 0) / byCost[cost].length);
        for (let i = 1; i < tiers.length; i++) expect(tiers[i]).toBeGreaterThan(tiers[i - 1]);
    });

    test('decks must be 8 distinct known cards', () => {
        expect(validateDeck(deckA)).toBeNull();
        expect(validateDeck(deckA.slice(0, 7))).toMatch(/exactly/);
        expect(validateDeck([...deckA.slice(0, 7), deckA[0]])).toMatch(/repeat/);
        expect(validateDeck([...deckA.slice(0, 7), 'nope'])).toMatch(/Unknown/);
    });
});

describe('royale engine', () => {
    test('the same seed and plays replay to the same state', () => {
        const run = simulateMatch({ seed: 'replay', decks: [deckA, deckB] });
        const replayed = replayMatch({ seed: 'replay', decks: [deckA, deckB], plays: run.plays });
        expect(run.plays.length).toBeGreaterThan(10);
        expect(replayed.result).toEqual(run.result);
        expect(hashState(replayed)).toBe(hashState(run.state));
    });

    test('elixir starts at 5, caps at 10 and doubles late', () => {
        const state = newMatch();
        expect(state.players[0].elixir).toBe(START_ELIXIR);
        stepN(state, 20 * 60);
        expect(state.players[0].elixir).toBe(ELIXIR_MAX);

        const late = newMatch();
        late.tick = DOUBLE_ELIXIR_TICK;
        late.players[0].elixir = 0;
        stepN(late, 28);
        expect(late.players[0].elixir).toBeCloseTo(1, 5);
    });

    test('plays are checked for hand, elixir and position', () => {
        const state = newMatch();
        const inHand = state.players[0].hand.find((id) => CARDS.find((c) => c.id === id).type !== 'spell');
        const notInHand = state.players[0].queue[0];
        expect(validatePlay(state, { team: 0, card: inHand, x: 0, z: 6 })).toBeNull();
        expect(validatePlay(state, { team: 0, card: notInHand, x: 0, z: 6 })).toBe('not-in-hand');
        expect(validatePlay(state, { team: 0, card: inHand, x: 0, z: -6 })).toBe('bad-position');
        expect(validatePlay(state, { team: 0, card: inHand, x: 0, z: 0 })).toBe('bad-position');
        expect(validatePlay(state, { team: 0, card: inHand, x: 0, z: 13.8 })).toBe('bad-position');
        state.players[0].elixir = 0;
        expect(validatePlay(state, { team: 0, card: inHand, x: 0, z: 6 })).toBe('not-enough-elixir');
    });

    test('a played card goes to the back of the queue and the hand refills', () => {
        const state = newMatch();
        state.players[0].elixir = 10;
        const player = state.players[0];
        const card = player.hand.find((id) => CARDS.find((c) => c.id === id).type !== 'spell');
        const next = player.queue[0];
        stepMatch(state, [{ team: 0, card, x: 2, z: 6 }]);
        expect(player.hand).not.toContain(card);
        expect(player.hand).toContain(next);
        expect(player.queue[player.queue.length - 1]).toBe(card);
        expect(state.units.length).toBeGreaterThan(0);
    });

    test('ground units only cross the river on a bridge', () => {
        simulateMatch(
            { seed: 'river', decks: [deckA, deckB] },
            {
                onTick: (state) => {
                    for (const u of state.units) {
                        if (u.flying || Math.abs(u.z) >= RIVER_HALF) continue;
                        expect(Math.abs(Math.abs(u.x) - BRIDGE_X)).toBeLessThanOrEqual(BRIDGE_HALF_WIDTH + 1e-9);
                    }
                },
            }
        );
    });

    test('losing a princess tower wakes the king and opens that lane pocket', () => {
        const state = newMatch();
        const princess = state.towers.find((t) => t.team === 1 && t.tower === 'princess' && t.x < 0);
        const king = state.towers.find((t) => t.team === 1 && t.tower === 'king');
        const unit = state.players[0].hand.find((id) => CARDS.find((c) => c.id === id).type !== 'spell');
        expect(king.active).toBe(false);
        expect(validatePlay(state, { team: 0, card: unit, x: -5, z: -4 })).toBe('bad-position');
        princess.hp = 0;
        stepMatch(state);
        expect(princess.destroyed).toBe(true);
        expect(state.players[0].crowns).toBe(1);
        expect(king.active).toBe(true);
        expect(validatePlay(state, { team: 0, card: unit, x: -5, z: -4 })).toBeNull();
        expect(validatePlay(state, { team: 0, card: unit, x: 5, z: -4 })).toBe('bad-position');
    });

    test('destroying the king ends the match with three crowns', () => {
        const state = newMatch();
        state.towers.find((t) => t.team === 0 && t.tower === 'king').hp = 0;
        stepMatch(state);
        expect(state.result).toMatchObject({ winner: 1, reason: 'king' });
        expect(state.players[1].crowns).toBe(3);
        expect(state.towers.filter((t) => t.team === 0).every((t) => t.destroyed)).toBe(true);
    });

    test('a tie at full time goes to overtime and ends by the tiebreak', () => {
        const state = newMatch();
        stepN(state, MATCH_TICKS);
        expect(state.phase).toBe('overtime');
        state.towers.find((t) => t.team === 1 && t.tower === 'princess').hp -= 100;
        stepN(state, OVERTIME_TICKS);
        expect(state.result).toMatchObject({ winner: 0, reason: 'tiebreak' });
    });

    test('a spell damages enemies in its radius and chips towers for less', () => {
        const state = newMatch();
        const [enemy] = spawnCard(state, 1, 'zombie', 0, -6);
        enemy.deploy = 0;
        const tower = state.towers.find((t) => t.team === 1 && t.tower === 'king');
        state.players[0].hand[0] = 'meteor';
        state.players[0].elixir = 10;
        stepMatch(state, [{ team: 0, card: 'meteor', x: 0, z: -6 }]);
        stepN(state, 25);
        const meteor = CARDS.find((c) => c.id === 'meteor');
        expect(enemy.hp).toBeLessThanOrEqual(enemy.maxHp - meteor.damage + 1e-9);
        const towerHit = state.towers.find((t) => t.id === tower.id);
        expect(towerHit.hp).toBe(towerHit.maxHp); // out of range at z = -13.8

        const chip = newMatch();
        const king = chip.towers.find((t) => t.team === 1 && t.tower === 'king');
        chip.players[0].hand[0] = 'meteor';
        chip.players[0].elixir = 10;
        stepMatch(chip, [{ team: 0, card: 'meteor', x: king.x, z: king.z }]);
        stepN(chip, 25);
        expect(king.maxHp - king.hp).toBeCloseTo(meteor.damage * meteor.towerScale, 5);
    });
});
