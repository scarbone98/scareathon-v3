// Whole-match helpers: bot-vs-bot simulation and replay from a play log.

import { botPlay, createBot } from './bot.js';
import { createMatch, stepMatch } from './engine.js';

// Plays a full match with a bot on each side. Returns the result, the play
// log (enough to replay it) and per-card damage totals.
export function simulateMatch({ seed, decks }, { onTick } = {}) {
    const state = createMatch({ seed, decks });
    const bots = [createBot(`${seed}:0`), createBot(`${seed}:1`)];
    const plays = [];
    const damageByCard = [{}, {}];
    const played = [{}, {}];
    const teamOf = new Map(state.towers.map((t) => [t.id, t.team]));
    while (!state.result) {
        const tickPlays = [];
        for (const team of [0, 1]) {
            const play = botPlay(state, team, bots[team]);
            if (play) tickPlays.push(play);
        }
        stepMatch(state, tickPlays);
        for (const e of state.events) {
            if (e.type === 'play') {
                plays.push({ tick: state.tick - 1, team: e.team, card: e.card, x: e.x, z: e.z });
                played[e.team][e.card] = (played[e.team][e.card] ?? 0) + 1;
            } else if (e.type === 'spawn') teamOf.set(e.id, e.team);
            else if (e.type === 'hit') {
                const target = teamOf.get(e.id);
                const team = target === undefined ? null : 1 - target;
                if (team !== null) damageByCard[team][e.source] = (damageByCard[team][e.source] ?? 0) + e.amount;
            }
        }
        onTick?.(state);
    }
    return { result: state.result, plays, state, played, damageByCard };
}

export function replayMatch({ seed, decks, plays }) {
    const state = createMatch({ seed, decks });
    let i = 0;
    while (!state.result) {
        const tickPlays = [];
        while (i < plays.length && plays[i].tick === state.tick) tickPlays.push(plays[i++]);
        stepMatch(state, tickPlays);
    }
    return state;
}
