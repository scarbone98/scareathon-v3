import { calculateRuleAward } from '../routes/games.js';

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
