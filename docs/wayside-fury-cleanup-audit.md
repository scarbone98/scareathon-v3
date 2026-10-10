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
  county to steer by.
- **P1-2 Chapter progress card covers the world.** It sits over the station
  front and the road ahead on phone portrait.
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
  289 are trees and 244 flowers. The "town" reads as trees and roads.

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
