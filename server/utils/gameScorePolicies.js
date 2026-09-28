// What a saved score may look like for each arcade game: /games/submitScore
// rejects anything else, and generated weekly challenges only set targets
// inside these limits.
//
// pace: the most a run can plausibly earn, as `burst` points up front plus
// `perSecond` for every second since its run ticket was issued. The clock starts
// when the game opens (or the last score was saved), so it always covers the
// whole run. Limits are generous guesses from real scores and the game code;
// raise one if an honest score gets rejected (the server logs each rejection).
// Games without a pace only need a ticket.
export const GAME_SCORE_POLICIES = new Map([
    // Score is seconds survived.
    ['8 Bit Evil Returns', {
        score: { min: 0, max: 86400, integer: true, pace: { perSecond: 1, burst: 60 } },
    }],
    ['Hemlock\'s Tower', {
        score: { min: 0, max: 10000000, integer: true, pace: { perSecond: 20, burst: 200 } },
    }],
    ['Tlaloc’s Curse', {
        score: { min: 0, max: 10000000, integer: true, pace: { perSecond: 2000, burst: 20000 } },
    }],
    ['Ooidash', {
        score: { min: 0, max: 10000000, integer: true, pace: { perSecond: 100, burst: 500 } },
    }],
    ['Salmon Run 2', {
        score: { min: 0, max: 10000000, integer: true, pace: { perSecond: 1000, burst: 10000 } },
    }],
    // Score is the number of microgames won in one run.
    ['WirtWare', {
        score: { min: 0, max: 10000, integer: true, pace: { perSecond: 1, burst: 5 } },
    }],
    // Levels never end and points scale with the level, so the cap is higher.
    // Points per second grow with the level too, so no pace.
    ['Horde Rush', {
        score: { min: 0, max: 1000000000, integer: true },
    }],
    // Time and fly bonuses per stage cleared, doubled for fast clears.
    ['Frog Ball', {
        score: { min: 0, max: 10000000, integer: true, pace: { perSecond: 2000, burst: 20000 } },
    }],
    // Candy plus floor and kill bonuses; floors never end, so leave room.
    // It's a progress score built up over many sessions, so no pace.
    ['Mystery Crypt', {
        score: { min: 0, max: 10000000, integer: true },
    }],
    // Trick points plus candy and a time bonus at the finish.
    ['Ghost Ridge', {
        score: { min: 0, max: 10000000, integer: true, pace: { perSecond: 5000, burst: 30000 } },
    }],
    // Every point earned over the run, spent or not.
    ['Muertos', {
        score: { min: 0, max: 10000000, integer: true, pace: { perSecond: 200, burst: 2000 } },
    }],
    ['8 Bit Evil', {
        score: { min: 0, max: 10000000, integer: true, pace: { perSecond: 100, burst: 1000 } },
    }],
]);
