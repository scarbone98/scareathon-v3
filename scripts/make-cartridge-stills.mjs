// Pull one frame from each arcade attract video into a small JPEG for the
// /arcade-v2 cartridge labels: public/game-recordings/stills/<name>.jpg.
// Phones (iOS Safari especially) won't load a video that isn't playing, so
// the labels can't rely on grabbing a frame from the video in the browser.
//
// Run after adding or re-recording a game: npm run stills:arcade
// Needs ffmpeg and ffprobe on the PATH. Skips stills that are newer than
// their video; pass --force to redo them all.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";

const recordings = new URL("../public/game-recordings/", import.meta.url).pathname;
const stills = join(recordings, "stills");
const force = process.argv.includes("--force");
mkdirSync(stills, { recursive: true });

for (const file of readdirSync(recordings).filter((name) => name.endsWith(".mp4")).sort()) {
  const video = join(recordings, file);
  const still = join(stills, `${basename(file, ".mp4")}.jpg`);
  if (!force && existsSync(still) && statSync(still).mtimeMs >= statSync(video).mtimeMs) {
    console.log(`up to date  ${file}`);
    continue;
  }
  const duration = Number(
    execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", video]).toString()
  ) || 4;
  // Same moment the browser fallback grabs: 2s in, or a quarter of a short clip
  const at = Math.min(2, duration * 0.25);
  execFileSync("ffmpeg", [
    "-v", "error", "-y",
    "-ss", String(at), "-i", video,
    "-frames:v", "1",
    // Twice the label's picture window (276px wide) so it stays sharp up close
    "-vf", "scale=552:-2",
    "-q:v", "4",
    still,
  ]);
  console.log(`wrote       ${basename(still)} (${Math.round(statSync(still).size / 1024)} KB)`);
}
