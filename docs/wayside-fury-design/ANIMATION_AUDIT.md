# Wayside Fury animation audit

Targets: modern 390×844 phones at DPR3 and desktop. All new art is original Canvas/vector code; no Buu's Fury assets or code. Existing project portraits and creature art are retained.

`graphics.ts` samples actual displacement into disposable `ActorMotion` copies. A 24-world-unit stride drives both renderers; blocked movement idles, analog speed changes cadence, pauses freeze, map changes reset, and teleports do not count as steps. Nothing is added to saves or co-op packets. Remote actors use their own position histories. Reduced motion removes decorative motion while preserving combat cues.

The county and launch/moon maps have WebGL renderers. Hub, Blast, Woods, City, realm, arena, and intro use the shared Canvas renderer even under `?gfx=3d`; they receive the same changes below.

| Character / actor | Audit and additions | 2D / `?gfx=3d` |
| --- | --- | --- |
| Player / You | Articulated outfit feet, distance-driven cadence, front/profile/rear pose; saved wardrobe retained | Shared crew rig in Canvas and Space; stationary county greeter retains outfit idle |
| Joe | Original four-direction rig, alternating planted feet and opposing arms; breathing, blink, talking/startled/ready expressions | Canvas + Space; native-resolution county idle atlas |
| Matt | Same directional rig; watch detail and individual palette; intro entrance and reactions | Canvas + Space; county idle atlas |
| Alex | Same directional rig; intro entrance, reactions, boarding | Canvas + Space; county idle atlas |
| Jon | Same directional rig, glasses, intro entrance and startled reaction | Canvas + Space; county idle atlas |
| All five pressure suits, including co-op | Existing eight-facing walk rig now uses traveled distance instead of fixed FPS; idle and combat poses retained | Same suit atlas in both renderers |
| Field-assist crew | Stationary appearances retain idle / fade | Shared scene path; Space crew rig |
| Alex/Jon quest NPCs, Bea, Marnie, Tessa, Ravi, Nia | Already stationary with breathing; retained | Canvas hub in both modes |
| Ranger, diner keeper, caretaker, stranded scout / crew-rest NPC | Original crew breathing and blink idle replaces flat sheet | Canvas scenes in both modes |
| Luggage keeper, reservoir keeper, orchard mechanic | Added subtle anchored breathing to cached original art | Canvas and WebGL county |
| Zombies | Distance-driven sheet frames, directional squash and step bob; slow idle | Canvas + county WebGL (including night spawns) |
| Pumpkins | Distance-driven squash/bounce; idle pulse | Canvas + county WebGL |
| Ghosts | Hover/bob and distance-driven frame timing; idle float | Canvas + county WebGL |
| Imps | Distance-driven bounce/squash and idle | Canvas + county WebGL |
| Shadowbeasts | Heavy stride bob/squash and idle; hit/attack tells preserved | Canvas + county WebGL |
| Blast Watcher, Gatekeeper, realm boss, relic echo, arena variants | Inherit base creature stride/idle with boss scale; telegraphs remain anchored | Shared Canvas path |
| Rooted (Woods) | Directional lumber/squash and breathing | Shared Canvas path |
| Lantern (Woods) | Traveling squash/bounce and idle pulse | Shared Canvas path |
| Wisp (Woods) | Moving hover and idle float; support link retained | Shared Canvas path |
| Bailiff, Foreman | Heavy movement squash/bob and breathing; windups retained | Shared Canvas path |
| Lunar rat | Directional scurry bob/squash and idle | Same body in Canvas + Space WebGL |
| Lunar walker | Movement bob/squash plus existing attack hop; idle | Canvas + Space WebGL |
| Scout, echo, satellite | Traveling hover and idle float; native attack silhouettes retained | Canvas + Space WebGL |
| Inspector, Warden | Inspector squash/step; Warden hover; idle and boss tells | Canvas + Space WebGL |
| Cable rat | Directional scurry squash and idle | Shared Canvas path |
| Clockwolf | Movement squash/step plus existing attack leap; idle | Shared Canvas path |
| Neon imp | Traveling hover and idle float | Shared Canvas path |
| Turnstile | Heavy movement squash/bob and idle; aimed shield retained | Shared Canvas path |
| Switchmaster, Architect | Boss movement squash/bob and idle; portal entrance fade in intro | Shared Canvas path |
| Local and co-op taxis | Wheel rotation and suspension driven by traveled distance; stationary engine tremor | Canvas + WebGL; continuous heading retained |
| Roadside taxi | Parked engine idle in both renderers; existing impact/wreck effects retained | Both; never slides |
| Parked cars, tractor, forklift, wrecks, lander | Static scenery: no locomotion or artificial wheel spinning | Both applicable scene paths |
| Roadside birds | Idle wing twitch retained; scatter flapping now follows traveled distance | Canvas + WebGL |
| Avatar companions | Catalog idle loops retained; moving-owner companion cadence follows distance | Canvas and county avatar billboards |
| Rocket / separating stage / floating burger | Existing film-driven launch, separation, drift/rotation retained | Canvas + Space WebGL |

## Opening sequence

All 12 story beats remain unchanged. New staging includes staggered portal exits and backyard arrivals, bounded speaker camera moves, stable gear-up ensemble framing, expressions/emotes, portal entrance, taxi boarding and a parked reading hold. Native canvas transforms retain full device DPR. Dialogue reveals at approximately 42 letters/second with punctuation rests; confirm reveals first, then advances. Lines never auto-expire. Existing portraits show named speakers. Music keeps its authored scene routing; speaker, portal and gear-up cues augment the existing dark-sky/horn cues.

Tap/click **Reveal line / Continue**, or press **J / Enter / pad A**. **Skip prologue** is a persistent ≥44px touch target; **Shift / pad Guard** also skips. Final advance and skip share a 0.55s fade out and county fade in. Reduced-motion readers see the full line immediately. Pausing freezes the transition. Host ownership and input-edge suppression remain intact.

## Verification

- `npm run lint`
- `npx tsc --noEmit`, plus `-p tsconfig.app.json` and `-p tsconfig.node.json`
- `npm test -- --forceExit --runInBand` (server Jest)
- `node scripts/check-wayside-fury-animation.mjs`: speed/collision/pause/teleport cadence, presentation isolation, 12 skip entry points, reveal semantics, host authority
- `node scripts/check-wayside-fury.mjs`: full combat, story, progression and save regression suite
- `node scripts/check-wayside-fury-audio.mjs` and `node scripts/check-wayside-fury-dressing.mjs`
- `scripts/check-wayside-fury-design-browser.mjs`: 390×844 DPR3 and 1440×900; all dialogue bounds, reveal, touch/Shift skip, native DPR, county WebGL, all five Space suits, reduced-motion final advance, four distinct crew facings and fixed-position animation changes for all 18 specialized creatures. Set `PLAYWRIGHT_MODULE`, `PLAYWRIGHT_EXECUTABLE_PATH`, and optionally `FURY_BASE_URL`; captures default to `work/fury-design-browser`.
