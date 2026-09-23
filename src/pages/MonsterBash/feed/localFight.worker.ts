/// <reference lib="webworker" />
// Stands in for the Monster Bash server until the live feed exists: it runs
// an endless loop of random matches and streams each one out in real time,
// exactly as the server will (fight data is only released once it happens).

import {
  MONSTERS,
  TICK_RATE,
  estimateWinProbability,
  simulateFight,
  type FightResult,
  type OddsPoint,
} from "../../../../shared/monster-bash/index.js";
import type { FeedMessage } from "../matchStore";

const INTRO_MS = 6000;
const RESULT_MS = 8000;
const CHUNK_MS = 1000;
const ODDS_EVERY_TICKS = TICK_RATE;
const ROLLOUTS = 96;

const post = (message: FeedMessage) => self.postMessage(message);

function randomSeed() {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function pickFighters(): [string, string] {
  const ids = MONSTERS.map((monster) => monster.id);
  const first = ids.splice(Math.floor(Math.random() * ids.length), 1)[0];
  const second = ids[Math.floor(Math.random() * ids.length)];
  return [first, second];
}

function oddsAt(fight: FightResult, index: number): OddsPoint {
  const { t, state } = fight.checkpoints[index];
  const p = estimateWinProbability(state, { rollouts: ROLLOUTS, salt: fight.seed });
  return { t, p: Math.round(p * 1000) / 1000 };
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function runMatch() {
  const seed = randomSeed();
  const fighters = pickFighters();
  const fight = simulateFight(
    { seed, fighters },
    { checkpointEvery: ODDS_EVERY_TICKS }
  );
  const fightStartsAt = Date.now() + INTRO_MS;
  const matchId = `local-${seed.slice(0, 8)}`;

  post({
    type: "match",
    match: { id: matchId, fighters, fightStartsAt },
    odds: [oddsAt(fight, 0)],
  });
  await wait(INTRO_MS);

  let sentFrames = 0;
  let sentEvents = 0;
  let sentOdds = 1;
  while (sentFrames < fight.frames.length) {
    await wait(CHUNK_MS);
    const liveTick = ((Date.now() - fightStartsAt) * TICK_RATE) / 1000;

    const frames = [];
    while (sentFrames < fight.frames.length && fight.frames[sentFrames].t <= liveTick) {
      frames.push(fight.frames[sentFrames++]);
    }
    const events = [];
    while (sentEvents < fight.events.length && fight.events[sentEvents].t <= liveTick) {
      events.push(fight.events[sentEvents++]);
    }
    const odds = [];
    while (sentOdds < fight.checkpoints.length && fight.checkpoints[sentOdds].t <= liveTick) {
      odds.push(oddsAt(fight, sentOdds++));
    }
    if (sentFrames === fight.frames.length) {
      odds.push({ t: fight.durationTicks, p: fight.winner === 0 ? 1 : 0 });
    }

    post({ type: "chunk", chunk: { matchId, frames, events, odds } });
  }

  post({
    type: "result",
    matchId,
    result: { winner: fight.winner, durationTicks: fight.durationTicks },
  });
  await wait(RESULT_MS);
}

async function loop() {
  for (;;) {
    await runMatch();
  }
}

loop();
