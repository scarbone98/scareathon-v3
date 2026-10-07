// Monster racing: six monsters off the Monster Bash roster run a sprint. Each
// has a chance of winning; the odds on the card are that chance with the
// house's cut taken off, so a 1 in 4 monster pays a little under 4x.

import { MONSTERS } from '../monster-bash/roster.js';

export const RACE_FIELD = 6;
// The share of every ticket bet the house keeps on average.
export const RACE_HOUSE_EDGE = 0.08;
export const RACE_MIN_ODDS = 1.1;
// How long the winner takes, and how far apart the rest come in (seconds).
const WINNER_SECONDS = [7.5, 9];
const GAP_SECONDS = [0.12, 0.7];

function shuffled(items, rng) {
    const list = [...items];
    for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
}

// What a 1 ticket bet gets back if a monster with this chance wins.
export function raceOdds(chance) {
    const fair = (1 - RACE_HOUSE_EDGE) / chance;
    return Math.max(RACE_MIN_ODDS, Math.floor(fair * 10) / 10);
}

export function racePayout(stake, odds) {
    return Math.floor(stake * odds + 1e-9);
}

// A fresh field: who's running, how likely each is to win, and what they pay.
export function makeRaceCard(rng) {
    const field = shuffled(MONSTERS, rng).slice(0, RACE_FIELD);
    // Squaring spreads the field into a favourite or two and some long shots.
    const form = field.map(() => 1 + rng() ** 2 * 8);
    const total = form.reduce((sum, value) => sum + value, 0);
    return field.map((monster, lane) => {
        const chance = form[lane] / total;
        return { monster: monster.id, chance, odds: raceOdds(chance) };
    });
}

// Runs the race. `order` lists lanes first to last; `times` is each lane's
// finishing time in seconds, for the client to animate.
export function runRace(card, rng) {
    const remaining = card.map((runner, lane) => ({ lane, chance: runner.chance }));
    const order = [];
    while (remaining.length > 0) {
        const total = remaining.reduce((sum, runner) => sum + runner.chance, 0);
        let roll = rng() * total;
        let pick = remaining.length - 1;
        for (let i = 0; i < remaining.length; i++) {
            roll -= remaining[i].chance;
            if (roll < 0) {
                pick = i;
                break;
            }
        }
        order.push(remaining.splice(pick, 1)[0].lane);
    }

    const times = new Array(card.length).fill(0);
    let clock = WINNER_SECONDS[0] + rng() * (WINNER_SECONDS[1] - WINNER_SECONDS[0]);
    for (const lane of order) {
        times[lane] = Math.round(clock * 1000) / 1000;
        clock += GAP_SECONDS[0] + rng() * (GAP_SECONDS[1] - GAP_SECONDS[0]);
    }
    return { order, winner: order[0], times };
}
