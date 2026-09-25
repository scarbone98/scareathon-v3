// Checks every Frog Ball stage headlessly: the ball rests at the start and at
// the goal, and the autopilot can roll from one to the other. Prints how often
// it makes it, so a stage edit that breaks the route shows up.
//   npm run check:frog-ball [stage-id]
import { STAGES } from "../src/pages/FrogBall/game/stages.ts";
import { newGame, newPilot, pilotTilt, step } from "../src/pages/FrogBall/game/sim.ts";

const DT = 1 / 60;
const RUNS = 20;
const only = process.argv[2];

// Leaves the ball alone at a point; it should still be there after 3 seconds.
function restsAt(stage, at) {
  const g = newGame({ ...stage, start: at });
  g.status = "play";
  for (let t = 0; t < 3; t += DT) step(g, DT, { x: 0, z: 0 });
  return Math.hypot(g.p.x - at[0], g.p.z - at[2]) < 1 && Math.abs(g.p.y - 0.5 - at[1]) < 0.3;
}

let failed = false;
for (const stage of STAGES) {
  if (only && stage.id !== only) continue;
  const problems = [];
  if (!restsAt(stage, stage.start)) problems.push("ball doesn't rest at the start");
  if (!restsAt(stage, stage.goal.at)) problems.push("ball doesn't rest at the goal");

  let wins = 0;
  let timeSum = 0;
  let flySum = 0;
  const endings = {};
  for (let run = 0; run < RUNS; run++) {
    const jitter = (run / (RUNS - 1) - 0.5) * 0.3;
    const g = newGame(stage);
    const pilot = newPilot(jitter);
    while (g.status === "ready" || g.status === "play") {
      step(g, DT, pilotTilt(g, pilot));
    }
    if (g.status === "goal") {
      wins++;
      timeSum += stage.time - g.timeLeft;
      flySum += g.fliesTaken;
    } else {
      const key = `${g.status} near waypoint ${pilot.i} (${g.p.x.toFixed(1)}, ${g.p.y.toFixed(1)}, ${g.p.z.toFixed(1)})`;
      endings[key] = (endings[key] ?? 0) + 1;
    }
  }
  const totalFlies = stage.flies.reduce((n, f) => n + (f.big ? 10 : 1), 0);
  const line = `${stage.id.padEnd(4)} ${stage.name.padEnd(18)} ${String(wins).padStart(2)}/${RUNS} cleared` +
    (wins ? `  avg ${(timeSum / wins).toFixed(1)}s of ${stage.time}s, ${(flySum / wins).toFixed(1)}/${totalFlies} flies` : "");
  console.log(line);
  for (const [k, n] of Object.entries(endings)) console.log(`       ${n}x ${k}`);
  for (const p of problems) console.log(`       ! ${p}`);
  if (!wins || problems.length) failed = true;
}
process.exit(failed ? 1 : 0);
