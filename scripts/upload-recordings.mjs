// Upload the arcade attract videos in media/game-recordings/ to the public
// Supabase Storage bucket "game-recordings", where the arcade plays them from.
// They live outside public/ so they aren't copied into every Vercel deployment.
//
// Run after adding or re-recording a game: npm run upload:recordings
// Needs SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY in the
// environment. Skips videos already in the bucket at the same size; pass --force
// to upload them all again.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const BUCKET = "game-recordings";
const recordings = new URL("../media/game-recordings/", import.meta.url).pathname;
const force = process.argv.includes("--force");

const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").replace(/\/+$/, "");
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const headers = { apikey: key, Authorization: `Bearer ${key}` };

async function storage(path, init = {}) {
  const response = await fetch(`${url}/storage/v1/${path}`, { ...init, headers: { ...headers, ...init.headers } });
  if (!response.ok) throw new Error(`${init.method || "GET"} ${path}: ${response.status} ${await response.text()}`);
  return response.json();
}

// The bucket is public so the videos load with a plain URL, capped at mp4s
const buckets = await storage("bucket");
if (!buckets.some((bucket) => bucket.id === BUCKET)) {
  await storage("bucket", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true, allowed_mime_types: ["video/mp4"], file_size_limit: 50 * 1024 * 1024 }),
  });
  console.log(`created bucket ${BUCKET}`);
}

const existing = new Map(
  (await storage(`object/list/${BUCKET}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prefix: "", limit: 1000 }),
  })).map((object) => [object.name, object.metadata?.size])
);

for (const file of readdirSync(recordings).filter((name) => name.endsWith(".mp4")).sort()) {
  const size = statSync(join(recordings, file)).size;
  if (!force && existing.get(file) === size) {
    console.log(`up to date  ${file}`);
    continue;
  }
  await storage(`object/${BUCKET}/${encodeURIComponent(file)}`, {
    method: "POST",
    // A day's caching: a re-recorded video under the same name shows up by tomorrow
    headers: { "Content-Type": "video/mp4", "Cache-Control": "max-age=86400", "x-upsert": "true" },
    body: readFileSync(join(recordings, file)),
  });
  console.log(`uploaded    ${file} (${Math.round(size / 1024)} KB)`);
}
