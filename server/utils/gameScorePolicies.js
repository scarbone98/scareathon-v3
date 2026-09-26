// What a saved score may look like for each arcade game: /games/submitScore
// rejects anything else, and generated weekly challenges only set targets
// inside these limits.
export const GAME_SCORE_POLICIES = new Map([
    ['8 Bit Evil Returns', {
        score: { min: 0, max: 86400, integer: true },
    }],
    ['Hemlock\'s Tower', {
        score: { min: 0, max: 10000000, integer: true },
    }],
    ['Tlaloc’s Curse', {
        score: { min: 0, max: 10000000, integer: true },
    }],
    ['Ooidash', {
        score: { min: 0, max: 10000000, integer: true },
    }],
    ['Salmon Run 2', {
        score: { min: 0, max: 10000000, integer: true },
    }],
    // Score is the number of microgames won in one run.
    ['WirtWare', {
        score: { min: 0, max: 10000, integer: true },
    }],
    // Levels never end and points scale with the level, so the cap is higher
    ['Horde Rush', {
        score: { min: 0, max: 1000000000, integer: true },
    }],
    ['Frog Ball', {
        score: { min: 0, max: 10000000, integer: true },
    }],
    ['8 Bit Evil', {
        score: { min: 0, max: 10000000, integer: true },
    }],
]);
