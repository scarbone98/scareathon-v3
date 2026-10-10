# Wayside Fury clean-up audit (Opus pass)

Scope, per the owner's FOCUS note of Oct 9: (1) overworld performance,
(2) overworld layout, (3) overworld and HUD design coherence. Combat, items,
menus and unrelated dead code are out of scope unless they block these.

Method: Playwright with `--mute-audio`, phone portrait 390×844 @3x (2D and
`?gfx=3d`) and desktop 1440×900 @2x (2D). Baseline is `origin/main` at 13d8a0c6,
served side by side with the working tree, so every change gets a
before/after render at the same frozen state.

## Measurement notes

- The SwiftShader backend used by the existing browser checks rasterizes on the
  CPU. On this machine it renders the phone overworld at about 0.5 fps, with the
  main thread idle. That is a test-harness artifact, not the game's speed.
  Perf numbers below use `--use-angle=metal`.
- The host was shared with other sessions (load average 7–21), so absolute FPS
  is noisy. Each change is judged by machine-independent work: JS ms per frame
  by subsystem (CPU profile), canvas calls per frame, 3D draw calls and
  triangles, and world-build time.
- The cloud continuation (Oct 10) has no GPU. 2D timings there use
  `--disable-gpu` (CPU canvas), which charges full price for every blit and
  alpha blend. Treat those ms as a pessimistic upper bound. Canvas call counts
  are exact. Harness: drive 916 frames along the county road, down the shortcut
  and back along the reservoir loop, calling `renderer.draw` directly.

## Baseline (origin/main 13d8a0c6)

| Metric | Phone 2D | Phone 3D | Desktop 2D |
| --- | --- | --- | --- |
| World modules built at load (`world.ts` import, browser) | 8.1 s | 8.1 s | 8.1 s |
| World build, Node | 11.3 s | | |
| Canvas 2D calls per frame | ~4,400 | 17 | ~4,600 |
| `lineTo` / `fillRect` / `beginPath` per frame | 1,093 / 808 / 550 | | 1,107 / 889 / 569 |
| WebGL draw calls / triangles | | 94 / 109k | |
| React re-renders of the whole game page | ~45/s (labels at ~33 Hz + HUD at 12.5 Hz) | same | same |

Where frame time went (dev build, profiled while driving):
- 2D: terrain chunk baking (`makeChunk`, mostly `roadMask().intersects` for
  grass blades) and the full vector road network, trails, landforms and
  lane paint redrawn every frame (`drawAreaGround`).
- All modes: `onPresentation` updated React state about 33 times a second,
  re-rendering the HUD, touch controls and minimap just to move floating labels.
- World build: `scatter → isBlocked` scanned every prop footprint for each of
  thousands of clearance samples. `shapeOrganicAreas` ribbons tested every
  segment for every tile. `settleOverworldProps` compared each prop against
  every placed prop.

## Findings

### P0 — broken or blocking
- **P0-1 Load-time hitch.** The world modules took 8 s of main-thread time in
  desktop Chrome before the title screen, longer on phones. *Fixed in batch 1.*
- **P0-3 Phone 3D tutorial load stall.** After "Skip prologue" the game sits in
  the overworld scene behind the "Practice the basics?" modal. The 3D path
  started building the full overworld renderer there, which blocked the main
  thread for seconds and delayed the "Play tutorial" tap. It then tore that
  renderer down (`forceContextLoss`) and created a second WebGL context for
  the training course. Traced: one throwaway overworld build plus an 8–10 s
  stall before the course renderer even started (SwiftShader, 4× CPU throttle).
  Baseline does the same in this harness, so it is not new code. But a full
  overworld build plus a second WebGL context, back to back, is the likeliest
  cause of the reported phone load that never finishes. The hang did not
  reproduce in Chromium on either tree. *Fixed in batch 1:* no 3D world is
  built while the tutorial choice is open, so only the course renderer is
  built. Tutorial reached in ~8 s instead of ~18.6 s (dev server, phone 3D).
- **P0-2 Collision cost per tick.** `isBlocked` scanned all ~450 overworld
  footprints, and on curved roads walked about 1,000 road segments, for every
  query (taxi, hero, enemies, projectiles, several times a tick). *Fixed in batch 1.*

### P1 — looks wrong or confusing
- **P1-1 Phone 2D camera is very tight.** At zoom 2.33 the view is 167×362 world
  units, and the taxi plus junction fill most of the screen. You see too little
  county to steer by. *Fixed in batch 5.*
- **P1-2 Chapter progress card covers the world.** It sits over the station
  front and the road ahead on phone portrait. *Fixed in batch 3.*
- **P1-3 Odd shaded trapezoid behind the cab at the start junction.** It's the
  station apron or turnout drawn as a dark gradient slab.
- **P1-5 Middle water road dead-ends (owner report).** The reservoir causeway
  stopped in a rounded cap short of the county shortcut, and its west end
  stuck out past the garden loop. The reservoir loop left rounded stubs at
  both bottom corners, and the garden loop poked a semicircle above the county
  road beside the station. Cause: `roadPoints` cached each road's centerline
  by road object, so the junction-snap pass in `shapeOrganicAreas` rewrote
  `r.curve` but every reader kept the pre-snap line. The snap never applied to
  any road. *Fixed in batch 2.*
- **P1-6 Station off its drive.** The station is authored on its driveway, but
  the pond's west shore overlapped that spot, so placement pushed the building
  56 px left and 24 px up. That left the drive's entrance flare as the stray
  grey slab of P1-3. *Fixed in batch 2.*
- **P1-4 Only one house and one mailbox in the overworld.** 657 props, of which
  289 are trees and 244 flowers. The "town" reads as trees and roads. *Fixed in
  batch 5.*

### P2 — polish
- (to be filled as the pass continues)

## Batches

### Batch 1 — overworld performance foundations
- Spatial index for prop footprints (`sealWorld`), plus bounding-box prefilters
  for road distance, ribbon rasterizing, road-mask intersection and prop
  settling. Built worlds are byte-identical to baseline (same SHA-1 of the
  serialized worlds).
- Floating labels moved to a small external store. Only the label layer
  re-renders at camera rate; the HUD stays at its 80 ms cadence.
- Roads, trails, landforms and lane paint are baked into a transparent chunk
  layer (`TerrainCache` overlay) above the animated water, with bounds culling,
  instead of being redrawn every frame.
- Verification: frozen-frame pixel compare at 10 overworld spots on phone 2D
  and desktop 2D. World pixels match baseline; the only strong differences are
  the DOM HUD portrait and the minimap's pulsing marker.
- Cloud follow-up:
  - The 3D load stall (P0-3): `GraphicsRenderer` waits for the tutorial
    choice before building any 3D world.
  - `terrain.ts` (also imported by the 3D terrain) no longer imports the 2D
    area art. The 2D renderer passes the overlay painter to `TerrainCache`.
  - The sealed collision index also checks the props array's length, so
    fixtures that push a temporary wall into a world fall back to the full
    scan (`radar` and `relics` checks).
  - Overlay chunks that paint nothing get a zero-size canvas and are never
    blitted. Roads are culled per segment, not per whole-road box.
  - Restored the original mixed CRLF/LF line endings in `render.ts`,
    `terrain.ts` and `world.ts`, so the diff shows only real changes.
- Full-map check: the whole overworld rendered at 1× and 2× matches baseline.
  No pixel differs by 32/255 or more. The largest difference is 17/255, from
  alpha-compositing anti-aliased edges through the transparent layer.
- Checks: `tsc -b`, eslint on changed files, 595 server tests, 58 node Fury
  checks (same 9 pre-existing failures as baseline: audit-paint, campaign,
  context-attack-unit, coop-sim, dressing, globe, obstacles, road-clearance,
  roads), and the UX, HUD and playtest browser checks for phone 2D, phone 3D
  and desktop 2D all pass.

| Batch 1 before → after | Baseline 13d8a0c | Batch 1 |
| --- | --- | --- |
| World build, Node (cloud) | 568–621 ms | 209–224 ms, identical SHA-1 |
| Phone 2D canvas calls/frame, mean (median) | 3,864 (3,300) | 1,059 (463) |
| Desktop 2D canvas calls/frame, mean (median) | 4,097 (3,561) | 1,304 (727) |
| Phone 2D draw ms, CPU canvas: mean / median / p95 | 1.6 / 0.7 / 8.9 | 1.4 / 0.4 / 7.9 |
| Desktop 2D draw ms, CPU canvas: mean / median / p95 | 1.8 / 0.9 / 9.8 | 6.0 / 4.1 / 16.7 |
| Phone 3D tutorial: 3D renderers built | 2 (overworld, then course) | 1 (course) |

The desktop CPU-canvas median rises because the cached overlay is a second,
transparent layer. A CPU canvas pays a full alpha blend for each of the ~20
visible 512² chunks. Dropping the layer brings it back to 0.6 ms; smaller
chunks don't help. With GPU canvas (the normal case) these are texture blits.
**Open:** confirm on a desktop with GPU canvas disabled. If it matters, bake the
overlay straight into ground chunks that have no animated water or corruption
sparkle, which removes the second blit for most of the map.

### Batch 2 — road junctions and the station front (`claude/fury-road-junctions`)
- `roadPoints` keys its cache on the road's current `curve`, so reshaped and
  snapped roads are what collision, paint, the 3D decal and placement see.
- Junction ends slide along their own heading onto the crossing centerline,
  falling back to the old sideways projection. Spurs stay straight: the forest,
  blast and launch spurs end exactly on the county road's centerline.
- Solo county only: the pond's west shore moves 64 px east, and the station
  sits at its authored spot facing the road through a one-tile paved apron.
  The stub drive is gone. The party county (`COOP_OVERWORLD`) is byte-identical
  to before, since older party clients share its layout.
- Prop IDs are positional (`overworld-<kind>-<index>`), so the landmark IDs
  shift by two. Nothing references them: interiors attach by position, and
  saves only store chest IDs, which the overworld has none of.
- Checks: `check-wayside-fury-roads` now passes (it failed on baseline).
  `playtest-layout`, `road-network`, `paths` and `collision` pass. The other
  eight pre-existing failures are unchanged.

| Batch 2 before → after | Batch 1 | Batch 2 |
| --- | --- | --- |
| Road ends that miss their junction | causeway ×2, reservoir loop ×2, garden loop ×1 (5) | 0 |
| Station offset from authored spot | (−56, −24) | (0, 0) |
| Node Fury checks failing | 9 | 8 |

### Batch 3 — chapter progress joins the HUD column (`claude/fury-hud-chapter`)
- The renderer-owned `ChapterGoalStrip` (a DOM panel injected beside the
  canvas, centred 128 px from the top) is replaced by a compact React panel
  inside the left `.wf-play-band` column, under the objective. World labels
  already lay out below that column, so they no longer collide with it. Like
  the minimap and items HUD, it hides while driving straight. Same text, same
  `.wf-chapter-goal` / "Chapter progress" hooks, same visibility rules (also
  hidden while paused).
- Phone portrait before → after: the 280×58 card at y 185–243 over the road
  and the "Old County Road" and "Candy machine" labels → a 254×42 row at
  y 124–166 in the left column; both labels are readable again. Desktop: a
  254×42 row under the objective, clear of the minimap.
- Checks: tsc, eslint, `feel` and `feel-browser` (asserts the panel), and the
  UX, HUD and playtest browser checks for phone 2D, phone 3D and desktop 2D
  pass. Node Fury checks are unchanged from batch 2.

### Batch 4 — interactable reachability check (`claude/fury-placement-tests`)
- New `scripts/check-wayside-fury-interactables.mjs`, also added to the Fury UX
  CI workflow. It flood-fills drivable space from spawn at the taxi's movement
  radius (7) on a 4 px grid, ignoring progression locks. It then asserts that
  every overworld interactable has a reachable point inside its interaction
  radius (minus 4 px of slack): chapter stops (72), county stops, interior
  doors and the roadside sign (46), and hidden pickups (28).
- Solo county: 20 interactables; party county: 15. Both pass on baseline and on
  this branch, and an injected target in the reservoir fails as expected.
  Together with `playtest-layout` (grounded props, no road or prop overlaps,
  every road sample reachable with taxi clearance), this covers the brief's
  placement-validation list.
- Full CI set on the top branch: `npm run lint`, `tsc -b`, 595 server tests,
  onboarding, playtest-layout, interactables, and the HUD, tutorial, playtest,
  UX and art browser checks (383 original-art pixel comparisons) all pass.

### Batch 5 — phone camera and the Wayside town (`claude/fury-town-camera`)

Phone camera (P1-1):
- The tight phone view was not the 2.3 zoom target. `getRenderViewport` also
  caps the view at 640×400 world units, and on a 390×844 phone at 3× that
  height cap forced the integer device-pixel scale up to 7 (zoom 2.33,
  37 CSS-pixel tiles, 167×362 units). Phones (shorter side under 600 CSS px)
  now target 29-pixel tiles (zoom 1.8) and may show up to 520 units tall;
  desktops and tablets keep the 4× zoom and the 400 cap. Every scale is still
  a whole number of device pixels per world unit, so the art stays crisp.
- Portrait 390×844 @3×: 167×362 → 234×506 world units (zoom 2.33 → 1.67, 37 →
  27 CSS px per tile; the gameplay canvas under the HUD band shows 234×389
  instead of 167×278). Landscape 844×390 @3×: 362×167 → 506×234. 2× phones:
  156×338 → 195×422. Desktop 1440×900: 360×225 both before and after.
- The 2D and 3D renderers share the viewport, so phone 3D frames the same
  wider area. Small rooms (interiors 448×352, blast rooms 640×384) draw their
  ground tile past the walls as before; on the real 389-unit-tall gameplay
  canvas the overrun is at most 37 units.
- `check-wayside-fury.mjs` now asserts the new phone band (24–32 CSS px per
  tile, portrait view at least 220×400, landscape at least 480 across,
  desktop zoom unchanged at 4).

Wayside town (P1-4), `src/pages/WaysideFury/game/town.ts`:
- Eight houses from the existing house kit (`home` props, so the six-variant
  colouring, mirroring and door positions apply): a station cottage behind the
  station with a lane down its west side, the Hollow Lane house east of the
  woods turn-off, two shore houses south of the county road facing the
  reservoir, two lake cottages on the reservoir loop and two garden cottages
  along the rain-garden loop. Each has a dirt yard, a mailbox at its road
  (the existing mailbox art and road-facing rule), flanking fence runs, and
  foliage; plus a pond bench between the station and the diner, lamps by the
  lake and garden cottages and a crate in the shore yard. All props are
  existing kinds that both renderers and the minimap already draw.
- The town is laid out after `shapeOrganicAreas`, against the final curved
  roads. Every placement is checked at build time against the real road
  ribbon, water, solid terrain and every other prop's sprite and base, and a
  bad placement throws, so a future road or terrain change cannot silently
  sink a house. Scatter foliage under a yard or a new prop is removed; nothing
  authored moves. `settleOverworldProps` and `clearRoads` leave every town
  prop exactly where it was authored (shift 0,0 for all eight houses).
- The party county (`COOP_OVERWORLD`) is untouched, as in batch 2.
- `check-wayside-fury-interactables.mjs` now also floods to the drawn front
  door of every house, shed and farmhouse in the county (the facade door at
  the variant's door fraction, mirrored for mirrored variants), so 31 solo
  targets are checked instead of 20. Mailbox rules (beside a building, within
  72 units of a road, facing it) are already covered by `playtest-layout`.
- Overworld props: 665 → 659 (eight houses, nine mailboxes, eight fences,
  three lamps, a bench and a crate added; 55 pieces of scatter under yards
  removed). Reachability audit: 0 errors, same single pre-existing warning.

Checks on this branch: `npx tsc -b`, `npm run lint`, 595 server tests,
`playtest-layout`, `interactables`, the reachability test runner and strict
audit, the 44 passing node Fury checks (same 14 failures as `main`: 7 need a
Playwright install, 7 are the known pre-existing failures), and the HUD,
tutorial, playtest, UX, art and viewport browser checks for phone 2D, phone
3D and desktop 2D all pass.

Performance, same harness as batch 1 (916 frames along the county road, down
the shortcut and back along the reservoir loop, `renderer.draw` called
directly; 2D on a CPU canvas so call counts are exact, 3D on SwiftShader).
`main` and this branch were served side by side from clean checkouts.

| Batch 5 before → after | main (bd3883b) | Batch 5 |
| --- | --- | --- |
| World build, Node (this machine, 3 runs) | 413–468 ms | 431–450 ms |
| Overworld props | 665 | 681 |
| Phone 2D canvas calls/frame, mean (median / p95) | 1,391 (488 / 5,804) | 1,627 (826 / 9,062) |
| Phone landscape 2D canvas calls/frame, mean (median / p95) | 1,470 (622 / 4,959) | 1,742 (869 / 7,592) |
| Desktop 2D canvas calls/frame, mean (median / p95) | 1,654 (730 / 6,254) | 1,634 (827 / 6,428) |
| Phone 2D draw ms, CPU canvas: mean / median / p95 | 2.1 / 0.8 / 12.9 | 1.9 / 0.8 / 9.9 |
| Phone landscape 2D draw ms, CPU canvas: mean / median / p95 | 3.3 / 1.1 / 12.5 | 4.6 / 4.0 / 13.1 |
| Desktop 2D draw ms, CPU canvas: mean / median / p95 | 6.6 / 4.9 / 17.7 | 6.1 / 4.5 / 17.1 |
| Phone 3D WebGL draw calls / triangles per frame, mean (116 frames) | 165 / 190k | 207 / 209k |

Where the phone calls go (steady-state frames, below the median): trees 37 →
142, terrain blits 87 → 123, flowers 39 → 75, houses 31 → 73, rocks 37 → 54.
That is the wider view: it holds about twice the county, so twice the
foliage, and the town adds houses along the route. Three exact-output
savings offset part of it and are why desktop (same view as before) ends
below its baseline despite the extra town props:
- Prop culling tests each prop's bounds (plus a 64-unit overhang margin)
  instead of its top-left corner with a width-sized margin. The 512-unit
  launch-compound fence runs, the craters and other wide props were being
  drawn from hundreds of units off-screen (fences alone averaged 185
  calls/frame on `main`; 51 now).
- The tree canopy blit no longer wraps its single `drawImage` in a
  `save`/`restore` pair; the smoothing flags are set and restored directly.
- Shadow gradients are cached per width instead of rebuilt for every tree,
  bush and actor each frame.
The draw time per frame on a CPU canvas is unchanged in phone portrait and
desktop and up in phone landscape (the 506-unit-wide view); every one of these
calls is a `fillRect` or a cached-image blit, which a GPU canvas batches.
**Open:** phone 2D canvas calls per frame are still about 17% above the
`main` mean and 70% above its median because of the larger view. The next
exact saving is caching each building's static layers (walls, roof, siding,
windows) as offscreen images: a house is ~100 `fillRect`s a frame and only
its window glow animates. It needs per-window layers to keep the exact draw
order under the glow, so it was left for a follow-up.
Phone 3D draws 25% more calls for the same reason (more chunks and props in
the frustum); the 3D scene is instanced and stays well under a thousand draw
calls.
