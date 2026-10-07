import { calculateRuleAward, playTicketsFor, PLAY_TICKETS, PLAY_TICKETS_DAILY_BACKSTOP, PLAY_TICKETS_FULL_UNTIL, PLAY_TICKETS_RUN_CAP, PLAY_TICKETS_TAPER_STEP, validateScoreSubmission } from '../routes/games.js';
import { GAME_SCORE_POLICIES } from '../utils/gameScorePolicies.js';

describe('calculateRuleAward', () => {
    test('returns fixed awards when the metric clears the threshold', () => {
        const award = calculateRuleAward({
            reward_type: 'fixed',
            fixed_amount: 25,
            multiplier: null,
            min_metric_value: 100,
            max_reward: null,
        }, 120);

        expect(award).toBe(25);
    });

    test('returns zero when the metric misses the threshold', () => {
        const award = calculateRuleAward({
            reward_type: 'fixed',
            fixed_amount: 25,
            multiplier: null,
            min_metric_value: 100,
            max_reward: null,
        }, 80);

        expect(award).toBe(0);
    });

    test('floors multiplier awards and applies caps', () => {
        const award = calculateRuleAward({
            reward_type: 'multiplier',
            fixed_amount: null,
            multiplier: '0.15',
            min_metric_value: null,
            max_reward: 30,
        }, 250);

        expect(award).toBe(30);
    });
});

describe('validateScoreSubmission', () => {
    test('allows a supported current arcade score', () => {
        expect(validateScoreSubmission({
            game: 'Tlaloc’s Curse',
            metricName: 'score',
            metricValue: 2500,
        })).toEqual({ ok: true });
    });

    test('rejects unsupported game metrics', () => {
        expect(validateScoreSubmission({
            game: 'Tlaloc’s Curse',
            metricName: 'coins',
            metricValue: 2500,
        })).toMatchObject({
            ok: false,
            statusCode: 400,
        });
    });

    test('rejects non-integer and out-of-range scores', () => {
        expect(validateScoreSubmission({
            game: 'Ooidash',
            metricName: 'score',
            metricValue: 10.5,
        })).toMatchObject({
            ok: false,
            error: 'Metric value must be an integer',
        });

        expect(validateScoreSubmission({
            game: 'Ooidash',
            metricName: 'score',
            metricValue: 10000001,
        })).toMatchObject({
            ok: false,
            error: 'Metric value is outside the allowed range',
        });
    });

    test('allows Horde Rush scores past the usual cap, up to its own', () => {
        expect(validateScoreSubmission({
            game: 'Horde Rush',
            metricName: 'score',
            metricValue: 250000000,
        })).toEqual({ ok: true });

        expect(validateScoreSubmission({
            game: 'Horde Rush',
            metricName: 'score',
            metricValue: 1000000001,
        })).toMatchObject({
            ok: false,
            error: 'Metric value is outside the allowed range',
        });
    });

    test('accepts Wayside Fury integer progress up to its checkpoint cap', () => {
        for (const metricValue of [0, 100, 1000, 100000]) {
            expect(validateScoreSubmission({ game: 'Wayside Fury', metricName: 'score', metricValue })).toEqual({ ok: true });
        }
        for (const metricValue of [-1, 100001, 100.5]) {
            expect(validateScoreSubmission({ game: 'Wayside Fury', metricName: 'score', metricValue })).toMatchObject({ ok: false });
        }
    });

    test('accepts Frog Ball scores', () => {
        expect(validateScoreSubmission({
            game: 'Frog Ball',
            metricName: 'score',
            metricValue: 84250,
        })).toEqual({ ok: true });
    });

    test('accepts Mystery Crypt scores', () => {
        expect(validateScoreSubmission({
            game: 'Mystery Crypt',
            metricName: 'score',
            metricValue: 6420,
        })).toEqual({ ok: true });
    });

    test('accepts Ghost Ridge scores', () => {
        expect(validateScoreSubmission({
            game: 'Ghost Ridge',
            metricName: 'score',
            metricValue: 31250,
        })).toEqual({ ok: true });
    });

    test('accepts Scary Capitalist scores', () => {
        expect(validateScoreSubmission({
            game: 'Scary Capitalist',
            metricName: 'score',
            metricValue: 52872549,
        })).toEqual({ ok: true });
    });

    test('accepts Muertos scores', () => {
        expect(validateScoreSubmission({
            game: 'Muertos',
            metricName: 'score',
            metricValue: 48210,
        })).toEqual({ ok: true });
    });

    test('accepts 31 Nights scores up to a doubled Halloween night', () => {
        expect(validateScoreSubmission({
            game: '31 Nights',
            metricName: 'score',
            metricValue: 800,
        })).toEqual({ ok: true });
        expect(validateScoreSubmission({
            game: '31 Nights',
            metricName: 'score',
            metricValue: 801,
        }).ok).toBe(false);
    });

    test('accepts Super Autoween runs from 0 to 10 wins', () => {
        expect(validateScoreSubmission({
            game: 'Super Autoween',
            metricName: 'score',
            metricValue: 10,
        })).toEqual({ ok: true });
        expect(validateScoreSubmission({
            game: 'Super Autoween',
            metricName: 'score',
            metricValue: 11,
        }).ok).toBe(false);
        expect(validateScoreSubmission({
            game: 'Super Autoween',
            metricName: 'score',
            metricValue: 2.5,
        }).ok).toBe(false);
    });

    test('accepts Boo Pop TD runs up to the round cap', () => {
        expect(validateScoreSubmission({
            game: 'Boo Pop TD',
            metricName: 'score',
            metricValue: 60,
        })).toEqual({ ok: true });
        expect(validateScoreSubmission({
            game: 'Boo Pop TD',
            metricName: 'score',
            metricValue: 200,
        })).toEqual({ ok: true });
        expect(validateScoreSubmission({
            game: 'Boo Pop TD',
            metricName: 'score',
            metricValue: 201,
        }).ok).toBe(false);
        expect(validateScoreSubmission({
            game: 'Boo Pop TD',
            metricName: 'score',
            metricValue: 36.5,
        }).ok).toBe(false);
    });

    test('accepts Trick or Treat Rush nights up to the cap', () => {
        expect(validateScoreSubmission({
            game: 'Trick or Treat Rush',
            metricName: 'score',
            metricValue: 186,
        })).toEqual({ ok: true });
        expect(validateScoreSubmission({
            game: 'Trick or Treat Rush',
            metricName: 'score',
            metricValue: 2001,
        }).ok).toBe(false);
        expect(validateScoreSubmission({
            game: 'Trick or Treat Rush',
            metricName: 'score',
            metricValue: 40.5,
        }).ok).toBe(false);
    });

    test('accepts Trick or Treat .io nights up to the cap', () => {
        expect(validateScoreSubmission({
            game: 'Trick or Treat .io',
            metricName: 'score',
            metricValue: 2350,
        })).toEqual({ ok: true });
        expect(validateScoreSubmission({
            game: 'Trick or Treat .io',
            metricName: 'score',
            metricValue: 100001,
        }).ok).toBe(false);
        expect(validateScoreSubmission({
            game: 'Trick or Treat .io',
            metricName: 'score',
            metricValue: 12.5,
        }).ok).toBe(false);
    });

    test('accepts Graveyard Smash 3D Classic runs up to a flawless hardest trail', () => {
        expect(validateScoreSubmission({
            game: 'Graveyard Smash 3D',
            metricName: 'score',
            metricValue: 8240,
        })).toEqual({ ok: true });
        expect(validateScoreSubmission({
            game: 'Graveyard Smash 3D',
            metricName: 'score',
            metricValue: 125500,
        })).toEqual({ ok: true });
        expect(validateScoreSubmission({
            game: 'Graveyard Smash 3D',
            metricName: 'score',
            metricValue: 125501,
        }).ok).toBe(false);
        expect(validateScoreSubmission({
            game: 'Graveyard Smash 3D',
            metricName: 'score',
            metricValue: 4120.5,
        }).ok).toBe(false);
    });

    test('accepts Overbrewed Endless Night coins up to 200,000', () => {
        expect(validateScoreSubmission({
            game: 'Overbrewed',
            metricName: 'score',
            metricValue: 1279,
        })).toEqual({ ok: true });
        expect(validateScoreSubmission({
            game: 'Overbrewed',
            metricName: 'score',
            metricValue: 200000,
        })).toEqual({ ok: true });
        expect(validateScoreSubmission({
            game: 'Overbrewed',
            metricName: 'score',
            metricValue: 200001,
        }).ok).toBe(false);
        expect(validateScoreSubmission({
            game: 'Overbrewed',
            metricName: 'score',
            metricValue: 640.5,
        }).ok).toBe(false);
    });

    test('accepts Ghauntlet Endless Crypt scores up to 500,000', () => {
        expect(validateScoreSubmission({
            game: 'Ghauntlet',
            metricName: 'score',
            metricValue: 27815,
        })).toEqual({ ok: true });
        expect(validateScoreSubmission({
            game: 'Ghauntlet',
            metricName: 'score',
            metricValue: 0,
        })).toEqual({ ok: true });
        expect(validateScoreSubmission({
            game: 'Ghauntlet',
            metricName: 'score',
            metricValue: 500000,
        })).toEqual({ ok: true });
        expect(validateScoreSubmission({
            game: 'Ghauntlet',
            metricName: 'score',
            metricValue: 500001,
        }).ok).toBe(false);
        expect(validateScoreSubmission({
            game: 'Ghauntlet',
            metricName: 'score',
            metricValue: 2090.5,
        }).ok).toBe(false);
    });

    test('accepts Lawn Order Paper Route totals up to 100,000', () => {
        expect(validateScoreSubmission({
            game: 'Lawn Order',
            metricName: 'score',
            metricValue: 7765,
        })).toEqual({ ok: true });
        expect(validateScoreSubmission({
            game: 'Lawn Order',
            metricName: 'score',
            metricValue: 0,
        })).toEqual({ ok: true });
        expect(validateScoreSubmission({
            game: 'Lawn Order',
            metricName: 'score',
            metricValue: 100000,
        })).toEqual({ ok: true });
        expect(validateScoreSubmission({
            game: 'Lawn Order',
            metricName: 'score',
            metricValue: 100001,
        }).ok).toBe(false);
        expect(validateScoreSubmission({
            game: 'Lawn Order',
            metricName: 'score',
            metricValue: 1234.5,
        }).ok).toBe(false);
    });

    test('accepts Kart-o\'-Lantern Grand Prix points up to four wins', () => {
        expect(validateScoreSubmission({
            game: 'Kart-o\'-Lantern',
            metricName: 'score',
            metricValue: 29,
        })).toEqual({ ok: true });
        expect(validateScoreSubmission({
            game: 'Kart-o\'-Lantern',
            metricName: 'score',
            metricValue: 60,
        })).toEqual({ ok: true });
        expect(validateScoreSubmission({
            game: 'Kart-o\'-Lantern',
            metricName: 'score',
            metricValue: 61,
        }).ok).toBe(false);
        expect(validateScoreSubmission({
            game: 'Kart-o\'-Lantern',
            metricName: 'score',
            metricValue: 12.5,
        }).ok).toBe(false);
    });

    test('accepts Cryptid Snap reports up to the best possible ride', () => {
        expect(validateScoreSubmission({
            game: 'Cryptid Snap',
            metricName: 'score',
            metricValue: 7802,
        })).toEqual({ ok: true });
        expect(validateScoreSubmission({
            game: 'Cryptid Snap',
            metricName: 'score',
            metricValue: 43800,
        })).toEqual({ ok: true });
        expect(validateScoreSubmission({
            game: 'Cryptid Snap',
            metricName: 'score',
            metricValue: 43801,
        }).ok).toBe(false);
    });
});

describe('playTicketsFor', () => {
    test('pays nothing for dying straight away', () => {
        expect(playTicketsFor('Ooidash', 'score', 6, 0)).toBe(0);
        expect(playTicketsFor('Ooidash', 'score', 0, 0)).toBe(0);
        expect(playTicketsFor('Tlaloc’s Curse', 'score', 1000, 0)).toBe(0);
    });

    test('Wayside Fury pays ten tickets for a new area, one for a new level, and none without progress', () => {
        expect(GAME_SCORE_POLICIES.get('Wayside Fury')).toEqual({
            score: { min: 0, max: 100000, integer: true },
            tickets: { from: 0, full: 1000 },
        });
        expect(playTicketsFor('Wayside Fury', 'score', 1000, 0)).toBe(10);
        expect(playTicketsFor('Wayside Fury', 'score', 100, 0)).toBe(1);
        expect(playTicketsFor('Wayside Fury', 'score', 0, 0)).toBe(0);
    });

    test('scales with the score, on past a strong run', () => {
        expect(playTicketsFor('Ooidash', 'score', 105, 0)).toBe(5);
        expect(playTicketsFor('Ooidash', 'score', 200, 0)).toBe(PLAY_TICKETS);
        expect(playTicketsFor('Ooidash', 'score', 390, 0)).toBe(2 * PLAY_TICKETS);
        expect(playTicketsFor('Ooidash', 'score', 580, 20)).toBe(3 * PLAY_TICKETS);
    });

    test('pays no more than the per-run cap', () => {
        expect(playTicketsFor('Ooidash', 'score', 2749, 0)).toBe(PLAY_TICKETS_RUN_CAP);
        expect(playTicketsFor('Ooidash', 'score', 10000000, 0)).toBe(PLAY_TICKETS_RUN_CAP);
    });

    test('pays nothing for a game or metric without a ticket scale', () => {
        expect(playTicketsFor('Pong', 'score', 500, 0)).toBe(0);
        expect(playTicketsFor('Ooidash', 'coins', 500, 0)).toBe(0);
    });

    test('pays in full up to a day\'s worth, the run that reaches it included', () => {
        expect(playTicketsFor('Ooidash', 'score', 200, PLAY_TICKETS_FULL_UNTIL - 4)).toBe(PLAY_TICKETS);
    });

    test('past a day\'s worth pays less and less, but never nothing', () => {
        expect(playTicketsFor('Ooidash', 'score', 200, PLAY_TICKETS_FULL_UNTIL)).toBe(5);
        expect(playTicketsFor('Ooidash', 'score', 200, String(PLAY_TICKETS_FULL_UNTIL))).toBe(5);
        expect(playTicketsFor('Ooidash', 'score', 200, PLAY_TICKETS_FULL_UNTIL + PLAY_TICKETS_TAPER_STEP - 1)).toBe(5);
        expect(playTicketsFor('Ooidash', 'score', 200, PLAY_TICKETS_FULL_UNTIL + PLAY_TICKETS_TAPER_STEP)).toBe(3);
        expect(playTicketsFor('Ooidash', 'score', 200, PLAY_TICKETS_FULL_UNTIL + PLAY_TICKETS_TAPER_STEP * 2)).toBe(2);
        expect(playTicketsFor('Ooidash', 'score', 200, PLAY_TICKETS_FULL_UNTIL + PLAY_TICKETS_TAPER_STEP * 3)).toBe(1);
        expect(playTicketsFor('Ooidash', 'score', 200, PLAY_TICKETS_FULL_UNTIL + PLAY_TICKETS_TAPER_STEP * 10)).toBe(1);
        expect(playTicketsFor('Ooidash', 'score', 200, PLAY_TICKETS_DAILY_BACKSTOP - 1)).toBe(1);
    });

    test('past a day\'s worth a run that earned less pays a share of that, and one that earned nothing still pays nothing', () => {
        expect(playTicketsFor('Ooidash', 'score', 105, PLAY_TICKETS_FULL_UNTIL)).toBe(3);
        expect(playTicketsFor('Ooidash', 'score', 105, PLAY_TICKETS_FULL_UNTIL + PLAY_TICKETS_TAPER_STEP * 5)).toBe(1);
        expect(playTicketsFor('Ooidash', 'score', 6, PLAY_TICKETS_FULL_UNTIL)).toBe(0);
    });

    test('past a day\'s worth a bigger run is cut by the same share', () => {
        expect(playTicketsFor('Ooidash', 'score', 10000000, PLAY_TICKETS_FULL_UNTIL)).toBe(PLAY_TICKETS_RUN_CAP / 2);
        expect(playTicketsFor('Ooidash', 'score', 390, PLAY_TICKETS_FULL_UNTIL + PLAY_TICKETS_TAPER_STEP)).toBe(5);
    });

    test('stops at the backstop only a script could reach', () => {
        expect(playTicketsFor('Ooidash', 'score', 500, PLAY_TICKETS_DAILY_BACKSTOP)).toBe(0);
        expect(playTicketsFor('Ooidash', 'score', 500, PLAY_TICKETS_DAILY_BACKSTOP + 500)).toBe(0);
    });

    test('every scored game has a ticket scale', () => {
        for (const [game, policy] of GAME_SCORE_POLICIES) {
            expect(policy.tickets).toBeDefined();
            expect(policy.tickets.full).toBeGreaterThan(policy.tickets.from);
            expect(playTicketsFor(game, 'score', policy.tickets.full, 0)).toBe(PLAY_TICKETS);
        }
    });
});
