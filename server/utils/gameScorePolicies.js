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
    // Score is the battles won (skulls) in one run: a run ends at 10 wins.
    ['Super Autoween', {
        score: { min: 0, max: 10, integer: true },
    }],
    // Levels never end and points scale with the level, so the cap is higher
    ['Horde Rush', {
        score: { min: 0, max: 1000000000, integer: true },
    }],
    ['Frog Ball', {
        score: { min: 0, max: 10000000, integer: true },
    }],
    // Candy plus floor and kill bonuses; floors never end, so leave room.
    ['Mystery Crypt', {
        score: { min: 0, max: 10000000, integer: true },
    }],
    // Trick points plus candy and a time bonus at the finish.
    ['Ghost Ridge', {
        score: { min: 0, max: 10000000, integer: true },
    }],
    // Every point earned over the run, spent or not.
    ['Muertos', {
        score: { min: 0, max: 10000000, integer: true },
    }],
    // One night's tally: four rounds of up to 100, doubled on Halloween night.
    ['31 Nights', {
        score: { min: 0, max: 800, integer: true },
    }],
    ['8 Bit Evil', {
        score: { min: 0, max: 10000000, integer: true },
    }],
]);
