// Plays Mystery Crypt's campaign headlessly with the attract-mode bot, saving
// between stages like a player would, and prints how many tries each stage
// takes and how levelled the team is by then. For checking the difficulty
// curve after changing numbers in data.ts or sim.ts.
//   npm run balance:mystery-crypt
import { HEROES, ITEMS, MONSTERS, MOVES } from "../src/pages/MysteryCrypt/game/data.ts";
import { act, autoAction, newGame, report } from "../src/pages/MysteryCrypt/game/sim.ts";
import { applyReport, newSave, sanitizeSave, startingRoster } from "../src/pages/MysteryCrypt/game/save.ts";
import { HERO_IDS, ITEM_IDS, MONSTER_IDS, MOVE_IDS } from "../server/shared/mysteryCrypt/save.js";

// The server's lists of ids must match the game's.
const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
for (const [name, ids, table] of [["heroes", HERO_IDS, HEROES], ["monsters", MONSTER_IDS, MONSTERS], ["moves", MOVE_IDS, MOVES], ["items", ITEM_IDS, ITEMS]]) {
  if (!same(ids, Object.keys(table))) throw new Error(`server/shared/mysteryCrypt/save.js ${name} don't match data.ts`);
}

const PLAYERS = 12;
const MAX_ATTEMPTS = 60;
const STAGES = 10;

function playStage(save, seed) {
  const s = newGame({ stage: save.cleared, roster: startingRoster(save), bag: save.bag, seed });
  let stuck = 0;
  while (!s.over && s.turn < 6000) {
    const acted = act(s, autoAction(s));
    stuck = acted ? 0 : stuck + 1;
    if (stuck > 3) act(s, { type: "wait" });
    s.events.length = 0;
  }
  return report(s);
}

// Before each try: bring the strongest monsters, and buy a heart or two.
function prepare(save) {
  save.team = [...save.monsters].sort((a, b) => b.level - a.level).slice(0, 3).map((m) => m.uid);
  while (save.bag.length < 4 && save.candy >= ITEMS.heart.price) {
    save.candy -= ITEMS.heart.price;
    save.bag.push("heart");
  }
}

for (const hero of Object.keys(HEROES)) {
  const tries = Array.from({ length: STAGES }, () => []);
  const levels = Array.from({ length: STAGES }, () => []);
  for (let p = 0; p < PLAYERS; p++) {
    let save = { ...newSave(), hero };
    let seed = 1000 + p * 997;
    for (let stage = 0; stage < STAGES; stage++) {
      let attempts = 0;
      while (save.cleared === stage && attempts < MAX_ATTEMPTS) {
        prepare(save);
        save = applyReport(save, playStage(save, seed++));
        attempts++;
        const checked = sanitizeSave(save);
        if (checked.error) throw new Error(`Invalid save: ${checked.error}`);
      }
      if (save.cleared === stage) break;
      tries[stage].push(attempts);
      levels[stage].push(save.heroes[hero].level);
    }
  }
  console.log(`\n${hero}`);
  tries.forEach((t, i) => {
    if (!t.length) return;
    const avg = (l) => (l.reduce((a, b) => a + b, 0) / l.length).toFixed(1);
    console.log(`  stage ${i + 1}: cleared by ${t.length}/${PLAYERS}, tries avg ${avg(t)} max ${Math.max(...t)}, hero level ${avg(levels[i])}`);
  });
}
