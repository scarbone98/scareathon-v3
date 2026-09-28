import { calculateRuleAward, checkRunPace, validateScoreSubmission } from '../routes/games.js';

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
});

describe('checkRunPace', () => {
    test('allows scores the time played could earn', () => {
        // 8 Bit Evil Returns scores seconds survived: 60 up front plus 1 a second
        expect(checkRunPace({
            game: '8 Bit Evil Returns',
            metricName: 'score',
            metricValue: 360,
            elapsedSeconds: 300,
        })).toBe(true);
    });

    test('rejects scores too high for the time played', () => {
        expect(checkRunPace({
            game: '8 Bit Evil Returns',
            metricName: 'score',
            metricValue: 86400,
            elapsedSeconds: 5,
        })).toBe(false);
    });

    test('lets games without a pace through', () => {
        expect(checkRunPace({
            game: 'Mystery Crypt',
            metricName: 'score',
            metricValue: 10000000,
            elapsedSeconds: 1,
        })).toBe(true);
    });
});
