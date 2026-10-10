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
