// Plays Mystery Crypt headlessly with the attract-mode bot and prints how deep
// each hero gets and how many monsters join, to check the difficulty curve
// after changing numbers in sim.ts.
//   npm run balance:mystery-crypt
import { act, autoAction, HEROES, newGame, party, resolveRecruit } from "../src/pages/MysteryCrypt/game/sim.ts";

const RUNS = 40;
const MAX_TURNS = 20000;

function play(hero, seed) {
  const s = newGame({ hero, seed });
  let stuck = 0;
  while (!s.over && s.turn < MAX_TURNS) {
    if (s.prompt) {
      // Swap out the weakest teammate if the newcomer is stronger.
      const weakest = party(s).filter((u) => u.id !== s.leaderId).sort((a, b) => a.maxHp - b.maxHp)[0];
      resolveRecruit(s, weakest && weakest.maxHp < s.prompt.unit.maxHp ? weakest.id : null);
    }
    const acted = act(s, autoAction(s));
    stuck = acted ? 0 : stuck + 1;
    if (stuck > 5) act(s, { type: "wait" });
    s.events.length = 0;
  }
  return s;
}

const pct = (list, p) => list[Math.min(list.length - 1, Math.floor(list.length * p))];
for (const hero of Object.keys(HEROES)) {
  const runs = Array.from({ length: RUNS }, (_, i) => play(hero, 1000 + i));
  const floors = runs.map((s) => s.floor).sort((a, b) => a - b);
  const recruits = runs.map((s) => s.recruited);
  const turns = runs.map((s) => s.turn).sort((a, b) => a - b);
  const avg = (l) => (l.reduce((a, b) => a + b, 0) / l.length).toFixed(1);
  console.log(
    `${hero.padEnd(5)} floor p10 ${pct(floors, 0.1)}  median ${pct(floors, 0.5)}  p90 ${pct(floors, 0.9)}  max ${floors.at(-1)}` +
      `  | recruits avg ${avg(recruits)}  | turns median ${pct(turns, 0.5)}  | timed out ${runs.filter((s) => !s.over).length}`
  );
}
