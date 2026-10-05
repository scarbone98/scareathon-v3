import { calculateRuleAward, playTicketsFor, PLAY_TICKETS, PLAY_TICKETS_DAILY_CAP, validateScoreSubmission } from '../routes/games.js';

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
    test('pays the standard tickets for a run that scores', () => {
        expect(playTicketsFor(1, 0)).toBe(PLAY_TICKETS);
        expect(playTicketsFor(48000, 20)).toBe(PLAY_TICKETS);
    });

    test('pays nothing for a run that scores nothing', () => {
        expect(playTicketsFor(0, 0)).toBe(0);
    });

    test('tops up to the daily cap and no further', () => {
        expect(playTicketsFor(500, PLAY_TICKETS_DAILY_CAP - 4)).toBe(4);
        expect(playTicketsFor(500, PLAY_TICKETS_DAILY_CAP)).toBe(0);
        expect(playTicketsFor(500, '150')).toBe(0);
    });
});
