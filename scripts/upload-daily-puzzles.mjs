// Upload the daily puzzles' answers and clues from the gitignored daily-puzzles/ folder to
// the daily_puzzle_content table, where the server reads them (server/dailyPuzzles/content.js).
// They're kept out of the repo because it's public.
//
//   daily-puzzles/scaredle-answers.json    ["ghost", "witch", ...]   one a day, in order
//   daily-puzzles/cross-bones-themes.json  [{ name, words: [{ word, clue }] }]   one a night, in turn
//
// Add Scaredle answers at the end only (puzzles already played keep theirs either way).
// Run: npm run upload:daily-puzzles. Needs SUPABASE_URL (or VITE_SUPABASE_URL) and
// SUPABASE_SERVICE_ROLE_KEY in .env. The server picks the change up within 5 minutes.
import { readFileSync } from "node:fs";
import { GUESSES } from "../server/shared/dailyPuzzles/guesses.js";

const dir = new URL("../daily-puzzles/", import.meta.url);
const answers = JSON.parse(readFileSync(new URL("scaredle-answers.json", dir), "utf8"));
const themes = JSON.parse(readFileSync(new URL("cross-bones-themes.json", dir), "utf8"));

const guessable = new Set(GUESSES.match(/.{5}/g));
const bad = answers.filter((w) => !/^[a-z]{5}$/.test(w) || !guessable.has(w));
if (bad.length) throw new Error(`Answers that aren't guessable five-letter words (add them to guesses.js): ${bad.join(", ")}`);
for (const theme of themes) {
  const off = theme.words.filter(({ word, clue }) => !/^[A-Z]{3,11}$/.test(word) || !clue);
  if (off.length) throw new Error(`${theme.name}: ${off.map((w) => w.word).join(", ")} need to be 3-11 capital letters with a clue`);
}

const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").replace(/\/+$/, "");
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const response = await fetch(`${url}/rest/v1/daily_puzzle_content?on_conflict=key`, {
  method: "POST",
  headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates" },
  body: JSON.stringify([
    { key: "scaredle_answers", value: answers, updated_at: new Date().toISOString() },
    { key: "cross_bones_themes", value: themes, updated_at: new Date().toISOString() },
  ]),
});
if (!response.ok) throw new Error(`Upload failed: ${response.status} ${await response.text()}`);
console.log(`uploaded ${answers.length} Scaredle answers and ${themes.length} Cross Bones themes`);
