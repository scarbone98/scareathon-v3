# CLAUDE.md

## Large media: keep it out of `public/`

Everything in `public/` is copied into every Vercel deployment, and `main` deploys on every push, so big files there multiply into Vercel deployment storage. Large media lives in Supabase Storage instead.

### Arcade attract videos

- Source videos: `media/game-recordings/<Name>.mp4`. These are tracked in git but not deployed.
- Served from the public Supabase Storage bucket `game-recordings`. `src/pages/Arcade/games.tsx` builds the URLs from `VITE_SUPABASE_URL`:
  `videoUrl: \`${RECORDINGS}/<Name>.mp4\``
- Cartridge stills stay local in `public/game-recordings/stills/<Name>.jpg` (small). `stillUrlFor` (`src/pages/ArcadeV2/cartridge.ts`) and `stillFor` (`src/station/board/BoardPapers.tsx`) map a video URL to its local still by file name.

Adding or re-recording a game's video:

1. Put the mp4 in `media/game-recordings/`. Never put it in `public/`.
2. `npm run stills:arcade` writes the still to `public/game-recordings/stills/`. Needs ffmpeg.
3. `npm run upload:recordings` uploads new or changed videos to the bucket. It skips files already there at the same size; pass `-- --force` to re-upload everything. Needs `SUPABASE_SERVICE_ROLE_KEY` in `.env`, which is gitignored.
4. Add `videoUrl: \`${RECORDINGS}/<Name>.mp4\`` to the game in `games.tsx`.

Uploaded videos are cached for a day, so a re-recorded video under the same name can take up to 24h to show everywhere. Rename the file if it has to change right away.

Use the same pattern for any other large media (audio, video, big images): upload it to Supabase Storage and reference it by URL.
