// Plays Horde Rush headlessly with a few simple bots and prints how far each
// gets, to check the difficulty curve after changing numbers in sim.ts.
//   npm run balance:horde-rush
import { newGame, step, ROAD_HALF } from "../src/pages/HordeRush/game/sim.ts";

const DT = 1 / 60;
const RUNS = 60;
const MAX_LEVEL = 40;

function gateScore(state, gate) {
  const v = Math.floor(gate.value);
  if (gate.kind === "add") return state.army + v;
  if (gate.kind === "mul") return state.army * v;
  // Fire rate is worth about as much as the same share of soldiers.
  return state.army * (1 + v / 100);
}

function bestGateX(state, within) {
  const ahead = state.gates.filter((g) => !g.used && g.z > state.z && g.z - state.z < within).sort((a, b) => a.z - b.z);
  if (!ahead.length) return null;
  const pair = ahead.filter((g) => g.pair === ahead[0].pair);
  const best = pair.reduce((a, b) => (gateScore(state, a) >= gateScore(state, b) ? a : b));
  return (best.x0 + best.x1) / 2;
}

const bots = {
  // Stays in the middle and takes whatever door it lands in.
  idle: () => {},
  // Picks the better door as it is right now and walks into it.
  greedy: (state) => {
    state.targetX = bestGateX(state, Infinity) ?? 0;
  },
  // Like greedy, but also chases the nearest monster when no door is close.
  hunter: (state) => {
    const x = bestGateX(state, 22);
    if (x !== null) {
      state.targetX = x;
      return;
    }
    const near = state.enemies.filter((e) => e.awake).sort((a, b) => a.z - b.z)[0];
    state.targetX = near ? Math.max(-ROAD_HALF, Math.min(ROAD_HALF, near.x)) : 0;
  },
};

function play(bot, seed, options) {
  const state = newGame(seed, options);
  const armyAtLevel = [];
  let level = 0;
  while (!state.over && state.level <= MAX_LEVEL) {
    if (state.level !== level) {
      level = state.level;
      armyAtLevel.push(state.army);
    }
    bot(state);
    step(state, DT);
    state.events.length = 0;
  }
  return { state, armyAtLevel };
}

const sorted = (xs) => [...xs].sort((a, b) => a - b);
const pct = (xs, p) => sorted(xs)[Math.floor((xs.length - 1) * p)];

console.log("Where runs end (level reached, 60 seeds each):");
for (const [name, bot] of Object.entries(bots)) {
  const levels = [];
  const times = [];
  const armies = [];
  for (let seed = 1; seed <= RUNS; seed++) {
    const { state, armyAtLevel } = play(bot, seed * 7919);
    levels.push(state.level);
    times.push(state.t);
    armies.push(Math.max(...armyAtLevel));
  }
  const hist = {};
  for (const l of levels) hist[l] = (hist[l] || 0) + 1;
  console.log(
    `  ${name.padEnd(7)} level p10/p50/p90 ${pct(levels, 0.1)}/${pct(levels, 0.5)}/${pct(levels, 0.9)}` +
      `  run p50 ${(pct(times, 0.5) / 60).toFixed(1)} min  biggest army p50 ${pct(armies, 0.5)}`
  );
  console.log(`          ${Object.entries(hist).map(([l, n]) => `L${l}:${n}`).join(" ")}`);
}

// Since each level is built for the army you bring, a level's difficulty
// is just the chance of clearing it; a run's length is the product of
// those chances. They should fall off gently, not hit a wall.
console.log("\nChance to clear each level (started with 80 heroes, 40 seeds):");
const LEVELS = [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30];
console.log(`  level   ${LEVELS.map((l) => String(l).padStart(4)).join("")}`);
for (const name of ["greedy", "hunter"]) {
  const row = LEVELS.map((level) => {
    let cleared = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const state = newGame(seed * 104729, { level, army: 80 });
      while (!state.over && state.level === level) {
        bots[name](state);
        step(state, DT);
        state.events.length = 0;
      }
      if (!state.over) cleared++;
    }
    return `${Math.round((cleared / 40) * 100)}%`.padStart(4);
  });
  console.log(`  ${name.padEnd(7)} ${row.join("")}`);
}

// Every level is built for the army you bring, so the same seed should
// play out the same whether you arrive with 800 heroes or 800,000.
// (Below 80 heroes the squad gets narrower, so both start well above that.)
console.log("\nScale check (hunter from level 4, same seeds, 800 vs 800,000 heroes):");
let same = 0;
const diffs = [];
for (let seed = 1; seed <= 20; seed++) {
  const small = play(bots.hunter, seed, { level: 4, army: 800 }).state.level;
  const big = play(bots.hunter, seed, { level: 4, army: 800_000 }).state.level;
  if (small === big) same++;
  diffs.push(big - small);
}
console.log(`  same final level in ${same}/20 runs, differences ${JSON.stringify(diffs)}`);
