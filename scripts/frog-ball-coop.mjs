// Plays Frog Ball's co-op stages headlessly the way the real game runs them:
// two clients, each simulating only its own ball, seeing the partner's ball
// through a network feed (30 updates a second, delayed by the given one-way
// latency) and chaining to where it guesses the partner is now.
//
// Checks that every co-op stage can be cleared at realistic latencies and
// that the chain stays stable (no runaway stretching) when both players pull
// against each other.
//   npm run check:frog-ball-coop
import { COOP_STAGES } from "../src/pages/FrogBall/game/stages.ts";
import { CHAIN_LENGTH, newGame, newPilot, pilotTilt, step } from "../src/pages/FrogBall/game/sim.ts";

const DT = 1 / 60;
const SEND_EVERY = 2; // frames: 30 updates a second
const LATENCIES = [0, 50, 100, 200]; // one-way, ms
const RUNS = 10;

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

// Two clients over a delayed link. drive(seat, game, frame) returns the tilt.
function play(stage, latencyMs, drive, maxSeconds = stage.time + 5) {
  const games = [newGame(stage, 0), newGame(stage, 1)];
  const inbox = [[], []]; // snapshots in flight to each seat: { arrive, p, v, sentAt }
  const last = [null, null]; // latest snapshot each seat has of its partner
  let maxStretch = 0;
  let frame = 0;
  let outcome = null;
  for (; frame < maxSeconds * 60 && !outcome; frame++) {
    const now = frame * DT;
    for (const seat of [0, 1]) {
      const g = games[seat];
      while (inbox[seat].length && inbox[seat][0].arrive <= now) last[seat] = inbox[seat].shift();
      let tether;
      if (last[seat]) {
        const age = now - last[seat].sentAt;
        const s = last[seat];
        tether = { at: { x: s.p.x + s.v.x * age, y: s.p.y + s.v.y * age, z: s.p.z + s.v.z * age }, vel: { ...s.v } };
      }
      step(g, DT, drive(seat, g, frame), tether);
      g.events.length = 0;
      if (frame % SEND_EVERY === 0) inbox[1 - seat].push({ arrive: now + latencyMs / 1000, p: { ...g.p }, v: { ...g.v }, sentAt: now });
    }
    maxStretch = Math.max(maxStretch, dist(games[0].p, games[1].p) - CHAIN_LENGTH);
    const [a, b] = games;
    if (a.status === "fallout" || b.status === "fallout") outcome = "fallout";
    else if (a.status === "timeover" || b.status === "timeover") outcome = "timeover";
    else if (a.status === "goal" || b.status === "goal") outcome = "goal";
    if ([a.p, a.v, b.p, b.v].some((v) => !Number.isFinite(v.x + v.y + v.z))) outcome = "blew up";
  }
  return { outcome: outcome ?? "stuck", maxStretch, seconds: frame * DT };
}

let failed = false;

console.log("Clearing each stage with two autopilots (clears out of runs, by one-way latency)");
console.log(`${"".padEnd(24)}${LATENCIES.map((l) => `${l}ms`.padStart(9)).join("")}   worst stretch`);
for (const stage of COOP_STAGES) {
  const row = [];
  let worst = 0;
  for (const latency of LATENCIES) {
    let wins = 0;
    for (let run = 0; run < RUNS; run++) {
      const jitter = (run / (RUNS - 1) - 0.5) * 0.3;
      const pilots = [newPilot(jitter, -1.4), newPilot(jitter, 1.4)];
      const r = play(stage, latency, (seat, g) => pilotTilt(g, pilots[seat]));
      if (r.outcome === "goal") wins++;
      if (r.outcome === "blew up") failed = true;
      worst = Math.max(worst, r.maxStretch);
    }
    row.push(`${wins}/${RUNS}`.padStart(9));
    if (latency <= 100 && wins === 0) failed = true;
  }
  console.log(`${stage.id} ${stage.name.padEnd(19)}${row.join("")}   ${worst.toFixed(2)}`);
}

// Tug of war: on flat ground, both players tilt hard away from each other for
// 3 seconds, then let go. The chain should hold them near its length and
// settle, not stretch further and further or start to oscillate.
console.log("\nTug of war on flat ground (players pull apart for 3s, then let go)");
const flat = COOP_STAGES[0];
for (const latency of LATENCIES) {
  const r = play(
    flat,
    latency,
    (seat, g, frame) => {
      const t = frame * DT;
      if (g.status !== "play" || t > 1.6 + 3) return { x: 0, z: 0 };
      return { x: seat === 0 ? -1 : 1, z: 0 };
    },
    7
  );
  const ok = r.maxStretch < 1.3;
  if (!ok) failed = true;
  console.log(`  ${String(latency).padStart(3)}ms: max stretch ${r.maxStretch.toFixed(2)} ${ok ? "" : "(too far)"}`);
}

// One player does nothing and gets dragged along by the chain. Not a pass or
// fail check (some stages need both players), just a feel for the chain.
console.log("\nOne player drives, the other lets go (clears out of runs at 100ms)");
for (const stage of COOP_STAGES) {
  let wins = 0;
  let worst = 0;
  for (let run = 0; run < RUNS; run++) {
    const pilot = newPilot((run / (RUNS - 1) - 0.5) * 0.3, -1.4);
    const r = play(stage, 100, (seat, g) => (seat === 0 ? pilotTilt(g, pilot) : { x: 0, z: 0 }));
    if (r.outcome === "blew up") failed = true;
    if (r.outcome === "goal") wins++;
    worst = Math.max(worst, r.maxStretch);
  }
  console.log(`  ${stage.id} ${stage.name.padEnd(18)} ${wins}/${RUNS}   worst stretch ${worst.toFixed(2)}`);
}

process.exit(failed ? 1 : 0);
