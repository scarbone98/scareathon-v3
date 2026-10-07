// What a saved score may look like for each arcade game: /games/submitScore
// rejects anything else, and generated weekly challenges only set targets
// inside these limits.
//
// tickets: how a run's score turns into play tickets. A score at or below `from`
// (what dying straight away scores) pays nothing; it climbs at a steady rate, reaching
// PLAY_TICKETS at `full`, about a strong run (roughly the 75th percentile of saved
// scores), and keeps climbing past it up to the per-run cap.
export const GAME_SCORE_POLICIES = new Map([
    ['8 Bit Evil Returns', {
        score: { min: 0, max: 86400, integer: true },
        tickets: { from: 30, full: 2000 },
    }],
    ['Hemlock\'s Tower', {
        score: { min: 0, max: 10000000, integer: true },
        tickets: { from: 0, full: 200 },
    }],
    ['Tlaloc’s Curse', {
        score: { min: 0, max: 10000000, integer: true },
        tickets: { from: 5000, full: 300000 },
    }],
    // Dying on the first obstacle scores 5 or 6.
    ['Ooidash', {
        score: { min: 0, max: 10000000, integer: true },
        tickets: { from: 10, full: 200 },
    }],
    ['Salmon Run 2', {
        score: { min: 0, max: 10000000, integer: true },
        tickets: { from: 2000, full: 50000 },
    }],
    // Score is the number of microgames won in one run.
    ['WirtWare', {
        score: { min: 0, max: 10000, integer: true },
        tickets: { from: 0, full: 12 },
    }],
    // Score is one night's best banked candy among the player's kids; a strong night is
    // ~190, an 8-minute night ~250 (game repo docs/BALANCE.md), so 2000 leaves headroom
    ['Trick or Treat Rush', {
        score: { min: 0, max: 2000, integer: true },
        tickets: { from: 20, full: 190 },
    }],
    // Score is one night's candy (stash + haul) at midnight; big nights reach a few thousand
    ['Trick or Treat .io', {
        score: { min: 0, max: 100000, integer: true },
        tickets: { from: 50, full: 1500 },
    }],
    // Score is the battles won (skulls) in one run: a run ends at 10 wins.
    ['Super Autoween', {
        score: { min: 0, max: 10, integer: true },
        tickets: { from: 0, full: 6 },
    }],
    // Levels never end and points scale with the level, so the cap is higher
    ['Horde Rush', {
        score: { min: 0, max: 1000000000, integer: true },
        tickets: { from: 300, full: 50000 },
    }],
    // Even a quick loss scores around 11000.
    ['Frog Ball', {
        score: { min: 0, max: 10000000, integer: true },
        tickets: { from: 11000, full: 50000 },
    }],
    // Candy plus floor and kill bonuses; floors never end, so leave room.
    // Each floor cleared is worth 100000.
    ['Mystery Crypt', {
        score: { min: 0, max: 10000000, integer: true },
        tickets: { from: 2000, full: 300000 },
    }],
    // Trick points plus candy and a time bonus at the finish.
    ['Ghost Ridge', {
        score: { min: 0, max: 10000000, integer: true },
        tickets: { from: 500, full: 5000 },
    }],
    // Every point earned over the run, spent or not.
    ['Muertos', {
        score: { min: 0, max: 10000000, integer: true },
        tickets: { from: 100, full: 3000 },
    }],
    // Phantom Investors earned over every run: 150 x cube root of (lifetime earnings / 10^13),
    // posted at a haunt that adds at least 10% to them. The first haunt brings ~100, the
    // balance bot has 5,000 after about 9 hours and ~10^8 after a month; the game caps what
    // it sends at 10^15.
    ['Scare Capitalist', {
        score: { min: 0, max: 1000000000000000, integer: true },
        tickets: { from: 50, full: 5000 },
    }],
    // One night's tally: four rounds of up to 100, doubled on Halloween night.
    ['31 Nights', {
        score: { min: 0, max: 800, integer: true },
        tickets: { from: 20, full: 300 },
    }],
    // A single-player run's last round cleared (Medium win 60, Hard 80, Impoppable 100;
    // freeplay keeps counting). The game caps what it sends at 200.
    ['Boo Pop TD', {
        score: { min: 0, max: 200, integer: true },
        tickets: { from: 5, full: 60 },
    }],
    // One ride's report total (Dr. Marsh's case points). The cap is the best report the
    // grading allows: Hollow Acres, 5 species at (2000 size + best pose) x2 dead centre,
    // +1000 for a never-on-film pose, +600 for five of a kind, plus its 2000-point Omen.
    ['Cryptid Snap', {
        score: { min: 0, max: 43800, integer: true },
        tickets: { from: 500, full: 15000 },
    }],
    // Player 1's points over one Grand Prix: four races, 15 points for a win.
    ['Kart-o\'-Lantern', {
        score: { min: 0, max: 60, integer: true },
        tickets: { from: 8, full: 45 },
    }],
    // One Classic run (the Trick or Treat Trail), cleared or given up: per fight won,
    // 1000 x the stop + 300 a KO + up to 2400 for speed - 3 a point of damage taken,
    // x2.5 on the hardest difficulty. Seven flawless fights there with every foe stock
    // taken (18 KOs) is the most a run can score.
    ['Graveyard Smash 3D', {
        score: { min: 0, max: 125500, integer: true },
        tickets: { from: 1000, full: 25000 },
    }],
    // The crew's coins in one Endless Night run, which ends when the third order runs out.
    // Orders come faster every minute, so a run is bounded in practice; 200,000 is far past
    // the best bot crews (about 1,300 in the gentlest kitchen).
    ['Overbrewed', {
        score: { min: 0, max: 200000, integer: true },
        tickets: { from: 50, full: 1000 },
    }],
    // An Endless Crypt run's last floor score: the heroes' coins (carried floor to floor),
    // 10 a kill and 200 a haunt on that floor, 500 a floor below the first, less 300 a death.
    // Floors get harder down to a cap, so a run is long but bounded; bot parties reach floor
    // 19-24 with 17,000-28,000, and 500,000 is about 400 floors.
    ['Ghauntlet', {
        score: { min: 0, max: 500000, integer: true },
        tickets: { from: 300, full: 15000 },
    }],
    // A finished Paper Route's total: the points banked in each yard cleared, five yards at
    // most (a yard is a few thousand; no multipliers), so 100,000 is far past a perfect route.
    ['Lawn Order', {
        score: { min: 0, max: 100000, integer: true },
        tickets: { from: 500, full: 12000 },
    }],
    ['8 Bit Evil', {
        score: { min: 0, max: 10000000, integer: true },
        tickets: { from: 30, full: 1500 },
    }],
]);
