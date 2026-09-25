// Plays Horde Rush headlessly with a few simple bots and prints how far each
// gets, to check the difficulty curve after changing numbers in sim.ts.
//   npm run balance:horde-rush
import { newGame, step, ROAD_HALF } from "../src/pages/HordeRush/game/sim.ts";

const DT = 1 / 60;
const RUNS = 60;

function gateScore(state, gate) {
  const v = Math.floor(gate.value);
  if (gate.kind === "add") return state.army + v;
  if (gate.kind === "mul") return state.army * v;
  // Fire rate is worth about as much as the same share of soldiers.
  return state.army * (1 + v / 100);
}

const bots = {
  // Stays in the middle and takes whatever door it lands in.
  idle: () => {},
  // Picks the better door as it is right now and walks into it.
  greedy: (state) => {
    const ahead = state.gates.filter((g) => !g.used && g.z > state.z).sort((a, b) => a.z - b.z);
    if (ahead.length) {
      const pair = ahead.filter((g) => g.pair === ahead[0].pair);
      const best = pair.reduce((a, b) => (gateScore(state, a) >= gateScore(state, b) ? a : b));
      state.targetX = (best.x0 + best.x1) / 2;
    } else {
      state.targetX = 0;
    }
  },
  // Like greedy, but also chases the nearest monster when no door is close.
  hunter: (state) => {
    const ahead = state.gates.filter((g) => !g.used && g.z > state.z && g.z - state.z < 22).sort((a, b) => a.z - b.z);
    if (ahead.length) {
      const pair = ahead.filter((g) => g.pair === ahead[0].pair);
      const best = pair.reduce((a, b) => (gateScore(state, a) >= gateScore(state, b) ? a : b));
      state.targetX = (best.x0 + best.x1) / 2;
      return;
    }
    const near = state.enemies.filter((e) => e.awake).sort((a, b) => a.z - b.z)[0];
    state.targetX = near ? Math.max(-ROAD_HALF, Math.min(ROAD_HALF, near.x)) : 0;
  },
};

for (const [name, bot] of Object.entries(bots)) {
  const levels = [];
  const times = [];
  const scores = [];
  for (let seed = 1; seed <= RUNS; seed++) {
    const state = newGame(seed * 7919);
    while (!state.over && state.t < 60 * 30) {
      bot(state);
      step(state, DT);
      state.events.length = 0;
    }
    levels.push(state.level);
    times.push(state.t);
    scores.push(state.score);
  }
  const sorted = (xs) => [...xs].sort((a, b) => a - b);
  const pct = (xs, p) => sorted(xs)[Math.floor((xs.length - 1) * p)];
  const hist = {};
  for (const l of levels) hist[l] = (hist[l] || 0) + 1;
  console.log(
    `${name.padEnd(7)} level p10/p50/p90 ${pct(levels, 0.1)}/${pct(levels, 0.5)}/${pct(levels, 0.9)}` +
      `  time p50 ${pct(times, 0.5).toFixed(0)}s  score p50 ${pct(scores, 0.5)}  levels ${JSON.stringify(hist)}`
  );
}
