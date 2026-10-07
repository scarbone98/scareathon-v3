# Wayside Station: context for working on it

Wayside Station is the new front end of the site: one 3D, Inscryption-style train platform at `/station`,
live at **waysidestation.com**. It replaces the classic Scareathon pages (still served at scareathon.rip from
the same build) and will become the only UI once scareathon.rip redirects here.

- Design doc (living, with the switch-over checklist): the Claude Doc "Wayside Station: 3D Site Design",
  https://claude.ai/artifact/KyAfrBzcbkaCVmQzBs5apB
- Code: `src/station/`, plus the arcade it embeds (`src/pages/ArcadeV2/`, `src/pages/Arcade/games.tsx`).

## Direction (set by the owner; keep to it)

- **One UI only.** Everything lives on objects in the scene: papers on the board, flyers, the scoreboard,
  the ticket window. No side panels, and nothing links back to the classic pages. Internal links rendered
  inside the station are caught and mapped onto objects (`stationPlaceFor` / `keepInStation` in `page.tsx`).
- **The arcade stop is the real CartridgeArcade** (`withRoom={false}`), not a copy.
- **Phones first**, desktop also works. On a phone the object sits in the top of the screen and a card below
  holds what it offers (`HeldCard`); on desktop things are used in place or open in a `Sheet`.
- **Pixel look, readable text.** The scene is drawn at a fixed 640 rows and scaled up pixelated; anything you
  read is crisp HTML laid into the scene.
- **Back** is the pixel arrow, always bottom left (at the arcade: the power key on its terminal).
- When the owner says "push", merge to `main` and push (see Deploying).

## The place

Left to right along the back wall: end of the platform (railing, backless bench, scenic view) · lockers
(your wardrobe; your locker's door opens when you arrive) with a bracket clock · a small cartridge rack ·
the arcade cabinet (ARCADE sign, scoreboard above) · the bulletin board (home) under the WAYSIDE STATION
sign · the Scareathon poster and a flyer stand · the pigeonhole inbox · the settings register on a lectern.
A side wall on the right holds the ticket counter (sign in / item shop). Track side: stone arches, rails,
fields, a moon, an empty train passing now and then.

Four views on every screen: front (board), right (pigeonholes, counter), back (tracks), left (platform end,
lockers, arcade). Swipe to turn (desktop: side arrows); tap an object to walk to it.

Small interactions: tap a ceiling lamp and it flickers; leaves, stubs and paper scraps are strewn fresh
each visit and move when tapped or swept; at the arcade, the little terminal answers taps, holding the wire
vent shows NO SIGNAL bars, shaking the phone rocks the machine, drops dust and crashes it.

## How it works

| Piece | Where | Notes |
| --- | --- | --- |
| State | `page.tsx` | Search params: `?at=<stop>`, `?open=<thing>`, `?face=<heading>`. One route, no remounts. |
| Stops and views | `stops.ts` | Camera poses, which heading each stop belongs to, framing rules (`fit`, `fitHeight`, `snug`, `seat`). |
| Scene | `StationScene.tsx` | three.js + gsap. Builders per object, lighting, input, the arrival train, litter, lamps. |
| Readable surfaces | `StationScene.tsx` (`SURFACES`) | HTML placed with CSS3DRenderer over painted stand-ins. **HTML always draws over WebGL**, so a surface must be hidden wherever something could stand in front of it (`hiddenAt`, and all of them while aboard the train). |
| Board papers | `board/BoardPapers.tsx` | Welcome, arcade post, event post, news. |
| Object contents | `things/` | Scoreboard + calendar, flyers + poster, kiosk (sign in), belongings (shop, wardrobe, inbox, settings). |
| Arcade hand-over | `page.tsx`, `slotDressing.ts` | Tap the arcade: the camera walks up while cartridges fly from the wall rack into a row; at 1.05 s the real arcade (transparent canvas) fades in over the station's cabinet, which it matches part for part. The arcade reports where its cabinet lands (`onFramed`) so the station's camera ends exactly there. |
| Arcade preload | `page.tsx` | The arcade is built hidden while the arrival train stands at the platform (or after 3.5 s idle), then paused. It draws one warm-up frame so its first real frame doesn't stall. Hidden, it must take **no touches** (`visibility: hidden`), or its terminal card swallows taps and swipes below it. |
| Arrival | `StationScene.tsx` (`arrival`), `page.tsx` | A carriage rides in with you aboard, waits with its doors shut until the cabinet has loaded and the arcade is built, opens, and you step off. Skipped for deep links with `?at=`. |
| Agent keys | `server/utils/agentTokens.js`, `agent-cli/` | Settings > Agent keys makes a `wsa_` key for the `wayside` CLI. The auth hook sends those keys to `authenticateAgent`: allowlisted routes only (calendar, own season, mark/unmark watched for nights that have come, Scareboard), never admin. |
| Data | `data.ts` | react-query with the classic pages' query keys, `fetchWithAuth`, the Supabase session. |

## Running and testing locally

- Dev server with real data: `VITE_BASE_URL=https://scareathon-v3-production.up.railway.app npm run dev`,
  then http://localhost:5173/station. (The API's CORS list includes localhost:5173.)
- Checks: `npx tsc -b` (the real build's type check, catches unused imports) and `npx eslint src/station src/pages/ArcadeV2`.
- Screenshots/flows: playwright-core driving the headless shell in `~/AppData/Local/ms-playwright/chromium_headless_shell-*`
  with `--enable-unsafe-swiftshader --use-angle=swiftshader`. A normal Chrome tab in the background freezes
  requestAnimationFrame. Swiftshader is slow (seconds per frame on desktop sizes), so judge timing on a real phone.
- Signed-in views can be tested by seeding a fake Supabase session in localStorage (`sb-<project ref>-auth-token`)
  and fulfilling API calls with `page.route`.

## Deploying

- Vercel builds `main` for both domains. `vercel.json`: waysidestation.com hosts redirect `/` to `/station`
  and classic paths (`/profile/shop`, `/inbox`, `/scareboard`, `/arcade?game=X`...) to their station objects.
- **Vercel's plan caps deployments per day** (hit on 30 Sep 2026: "Deployment rate limited — retry in 24 hours").
  Every pushed branch deploys, so push `main` only and batch changes.
- The API (Railway, `server/`) must list every live origin in its CORS allowlist (`server/index.js`).
  Missing waysidestation.com once broke all data on phones ("LOAD FAILED").
- The in-site games (`/horde-rush`, `/frog-ball`, ...) and `/reset-password` are classic routes the station
  still uses. They must survive when the classic site is removed (see the design doc's Switch-over plan).

## Gotchas

- Files are CRLF on disk; scripted edits must match line endings.
- Desktop-only games (`availableOnMobile: false`) aren't in the arcade on phones. Anything that picks a game
  for the arcade (the platform preview) must pick from the same filtered list, or the arcade falls back to Shuffle.
- `useNavigatorContext` throws without its provider; the station and arcade both call it.
- Supabase sessions are per origin: moving domains signs everyone out once.
- iOS Safari: motion access needs `DeviceMotionEvent.requestPermission()` from a click; no vibration API.
