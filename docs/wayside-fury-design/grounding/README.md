# Grounding fix · October 8, 2026

Crater surfaces render beneath actors with a dark bowl, illuminated far rim, shadowed near rim, ash and embers. Blast rubble and shards lose detached drop shadows and blend into soil at their bottom edges. Shared rocks use contact shadows and dirt overlap. These paths cover Blast, the county, Woods, Moon and City without changing authored worlds, collision or gameplay.

Optional overworld 3D deforms terrain into bowls with low soft rims. Four-unit subdivisions and matching decal triangles share terrain footing; polygon offset prevents z-fighting. Rocks, debris and ground-level destination-preview fragments sample rotated footprint corners, edge midpoints and center, use the lowest height, sink about 32% into the surface and tilt to the slope. A second decorative Blast boulder necklace was replaced with sparse fragments. Terrain-conforming contact AO and reduced shadow bias remove the hovering gap. Moon rocks are also buried, with soft contact shadows; crater decals conform to flat lunar ground with a low rim. Airborne taxi-gag rocks remain airborne during their authored animation.

## Before / after

| Room | Default 2D | Optional `?gfx=3d` |
| --- | --- | --- |
| Scorched Road | [Before](before-2d-scorched-road.png) · [After](after-2d-scorched-road.png) | [Before](before-3d-scorched-road.png) · [After](after-3d-scorched-road.png) |
| Rift Approach | [Before](before-2d-rift-approach.png) · [After](after-2d-rift-approach.png) | [Before](before-3d-rift-approach.png) · [After](after-3d-rift-approach.png) |
| The Watcher's Hollow | [Before](before-2d-watchers-hollow.png) · [After](after-2d-watchers-hollow.png) | [Before](before-3d-watchers-hollow.png) · [After](after-3d-watchers-hollow.png) |
| County crater | [Before](before-2d-overworld-crater.png) · [After](after-2d-overworld-crater.png) | [Before](before-3d-overworld-crater.png) · [After](after-3d-overworld-crater.png) |
| Moon rocks | [Before](before-2d-moon-rocks.png) · [After](after-2d-moon-rocks.png) | [Before](before-3d-moon-rocks.png) · [After](after-3d-moon-rocks.png) |

Blast, Woods and City intentionally use the shared Canvas path for either renderer selection. County and Moon optional-mode captures use real Metal WebGL. Woods/City after fixtures supplement the comparisons.

Captures use local Vite port **5220**, muted Chromium, 1440 × 900 at native DPR 2, reduced motion and paused simulation. Each fixture asserts native backing size and unchanged simulation after repeated draws. These are visual inspections, not sustained FPS or real-phone measurements. Metrics beside the images record actual renderer selection; the overworld follow-up also checks the physical bowl depth and context-loss fallback.

Reproduce from the repository with the local server running:

```sh
FURY_BASE_URL=http://127.0.0.1:5220 FURY_PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node scripts/capture-wayside-fury-grounding.mjs before
FURY_BASE_URL=http://127.0.0.1:5220 FURY_PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node scripts/capture-wayside-fury-grounding.mjs after
```

Set `FURY_GROUND_CAPTURE=chapters` for Woods/City or `overworld` for the county follow-up. Every launch uses `--mute-audio`.

## Validation

- Base simulation/collision checks, Space graph and Space combat, grounding footprint/layer checks, and all ten Blast native-DPR/parity fixtures pass.
- A direct comparison against an archived unchanged `HEAD` confirms every authored world, collision tile, prop, spawn, exit and co-op county remains byte-for-byte equivalent as data.
- The campaign script fails its `blast-0` geometry hash (`17ca9649…` versus fixture `0db07fff…`). The identical failure reproduces on unchanged `HEAD`; the historical hash fixture is not updated by this rendering fix.
- `npx tsc -b`, ESLint on changed files, and dressing/roads checks pass.
- The final real-WebGL county fixture measures bowl center height 25.36 versus original ground height 34 (8.64 units below). Context loss switches to Canvas 2D with `fallback` status and identical simulation state.
- The full `check-wayside-fury-3d.mjs` harness did not complete green: the first run timed out rebuilding phone 3D; a longer-timeout retry failed its maximum-quality comparison assertion (`2d` versus `high`). Later lifecycle/iframe cases did not run. The dedicated real-WebGL fixtures above passed their native-DPR and immutable-state assertions; they do not substitute for the full harness.
