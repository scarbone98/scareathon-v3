# Wayside Fury: optional HD-2D overworld

## Decision

Recommend **B, with C's integration boundary**: render only the taxi overworld in three.js 0.168, retain the existing native-resolution Canvas 2D renderer for all other scenes and for fallback, and keep the React HUD, labels and controls. The brief describes Phaser, but this worktree's `game/render.ts` uses Canvas 2D directly; migrating that renderer to Phaser would add unnecessary scope. Phaser is an installed dependency, not the current Fury rendering engine.

| Approach | Look | Cost and risk | Mobile performance |
| --- | --- | --- | --- |
| A. Phaser 2.5D | Elevated tile layers, cliff faces, y-sorted art, blob/soft shadows, normal-map lighting and a mild tilt can improve the existing top-down look. Perspective and depth of field remain approximations. | Medium art/renderer cost, plus a Phaser migration in this checkout. Lowest integration risk if implemented directly in the current canvas instead; slopes, clipping and occlusion still need custom work. | Static chunk caching is inexpensive. Light2D requires prepared normals; multiple lights and full-resolution soft effects increase fill cost. |
| B. three.js HD-2D | Real terrain heights and cliffs, sloping roads, dimensional buildings and trees, crisp sprite billboards, a tilted perspective camera, fog, day/night lighting and selective bloom. Strongest visible change. | Higher initial scene/camera work. WebGL availability, GPU memory, shader compilation, disposal and context loss need explicit handling. Existing three.js dependency avoids another engine install. | Batch terrain by material, reuse prop geometry/materials, scope dynamic billboard work to the camera, bound point lights and use a single post-processing pass. Adaptive effects and DPR provide a fallback ladder. Physical iPhone profiling remains necessary. |
| C. Hybrid canvas terrain plus projected/extruded props | Stronger depth than today's renderer while preserving its art; less coherent perspective than a full 3D scene. | Medium cost; two projection systems and height-aware occlusion can become more complex than B. Reusing the DOM UI and non-overworld renderer is useful regardless. | Avoids some mesh/shader costs, but canvas projection and dynamic shadows can consume main-thread time. A full-resolution composite adds bandwidth. |

These are engineering estimates based on the current implementation, not measured performance claims. See [three.js WebGLRenderer](https://threejs.org/docs/#api/en/renderers/WebGLRenderer) for renderer sizing, resource and context APIs. The installed 0.168 source and types govern this prototype.

## Prototype boundary

- Default remains 2D. `?gfx=3d` enables the prototype; an Overworld graphics setting remembers the choice in a separate device preference, outside the game save format. An explicit query overrides the device preference.
- Load three.js only when 3D is requested and the overworld is being rendered. Continue presenting 2D while loading. Initialization, rendering or context failure returns immediately to 2D; selecting 3D again retries.
- Read the same interpolated `GameState`, tile materials and world coordinates. Presentation elevation never alters collision, spawns, movement, `sim.ts`, world walkability or save serialization.
- Use native canvas pixels at device DPR capped at 3, a smooth camera with comfortable tile scale, crisp nearest-filtered billboards and soft ground shadows.
- Add presentation-only plateaus, cliff faces, ramps and lowered water. Build terrain once and batch its geometry; reuse props and limit dynamic lights.
- High quality includes tilt-shift depth of field, bloom and vignette. Sustained slow frame cadence reduces effects and then DPR. Paused presentation and hidden tabs do not establish a gameplay budget; isolated resume gaps have a bounded contribution.
- Preserve React controls, readable DOM labels, safe areas and the existing portrait/landscape layout. Other scenes keep their current renderer.

## Implementation and verification plan

Files: `game/graphics.ts` (renderer selection and device preference), `game/render3d.ts` (scene, camera, actors, effects and quality), `game/terrain3d.ts` (batched terrain and visual elevations), `game/controller.ts` (renderer bridge), `page.tsx` and `style.css` (Settings and canvas overlay), `scripts/check-wayside-fury-3d.mjs` (browser checks and captures), and this memo. `terrain.ts` may expose its existing palette without changing its behavior.

The renderer contract remains `draw(state, dt, frameDelta)`, `presentation(state)`, `onEvent(state, event)`, `setAvatar(avatar)`, `reset()` and `dispose()`. The terrain builder returns a group, a matching `heightAt(x, y)`, animated water meshes and `dispose()`.

Verify default/lazy loading, query and Settings selection, unchanged simulation/save data, movement and interactions, 2D rendering outside the overworld, context-loss fallback, quality reduction, resource cleanup and control bounds at 390×844, 430×932, 844×390, 932×430 and desktop/iframe. Capture comparisons at 390×844 and 1440×900 in `/tmp/fury-3d-shots/`. Run TypeScript, ESLint, the existing Fury checks and server tests.

## Implemented presentation

The terrain builder shares the existing material palette and generates raised station, blast-site and corrupted terraces, road ramps, rocky banks, lowered lakes and water surfaces. Its elevation query uses the same triangles as the visible mesh, so taxi, billboard feet and shadows agree with slopes. The taxi, trees, lamps, station, fences and parked cars have real volume. Existing character and wardrobe frames use nearest-filtered billboards. A tilted perspective camera follows the already interpolated simulation; actor positions receive no additional follow delay.

Sunlight, soft ground shadows, fog, a slow day/night cycle, four nearby environment point lights and taxi headlights establish depth. Water drifts subtly. Reduced motion freezes decorative animation. A single depth-aware post-processing pass applies tilt-shift focus, bloom and vignette, while the DOM HUD and touch controls remain outside the effect.

| Tier | Maximum DPR | Effects and shadows |
| --- | --- | --- |
| High | 3 | Real and blob shadows; depth of field, bloom, vignette |
| Medium | 3 | Blob shadows; bloom and vignette |
| Balanced | 2 | Blob shadows; bloom and vignette |
| Low | 1.5 | Blob shadows; post effects off |
| Minimum | 1 | Blob shadows; post effects off |

More than two accumulated seconds of slow active frames drops one tier. Every tier was exercised with positive triangle counts and no shader or WebGL errors. Failed WebGL initialization or a lost context returns to 2D. Switching back to 2D resets its dormant camera, including while paused; selecting 3D after failure retries without changing simulation or save data.

The production manifest confirms that Fury's static dependency graph excludes three.js. The renderer is a separate dynamic chunk; `terrain.ts` only adds an export for its existing palette. A pre-existing `any` lint error in `Home/MovieInfo.tsx` was removed with a type predicate so repository-wide lint can pass.

## Screenshot findings and frame times

The four comparison files are `/tmp/fury-3d-shots/2d-390x844.png`, `3d-390x844.png`, `2d-1440x900.png` and `3d-1440x900.png`. The complete report is `/tmp/fury-3d-shots/frame-times.json`.

At 390×844, 2D retains the top-down pixel-art view; 3D makes the station facade, awning, steps, taxi wheels and shadows visibly dimensional. Cliff banks beside the road show the raised station terrace. Both views retain the compact HUD, readable location label, stick and all five touch actions. At 1440×900, the tilted view reveals the lake, bank slopes, dimensional trees, lamps and fence, while the foreground focus falloff gives the terrain a diorama appearance. Billboards and the DOM UI stay crisp. The paused 3D comparisons were explicitly checked at high quality with all effects: DPR 3 on the phone and DPR 2 on desktop. The phone scene surface is 1170×1932 backing pixels below the HUD and above the dock; desktop is 2880×1800.

The passing run used headless Chromium **153.0.8010.12**, full Chromium channel, **ANGLE Metal / Apple M1 Max**, and 30 active frames per comparison. Screenshot quality is recorded separately from the adaptive tier reached after sampling. Values below are milliseconds, median / p95.

| View | Screenshot tier / DPR | rAF frame cadence | Renderer CPU submission | Final sampled tier / DPR |
| --- | --- | --- | --- | --- |
| 2D · 390×844 | 2D / 3 | 249.9 / 433.3 | 12.6 / 115.8 | 2D / 1 |
| 3D · 390×844 | High / 3 | 216.7 / 2116.6 | 58.7 / 2259.7 | Low / 1.5 |
| 2D · 1440×900 | 2D / 2 | 133.2 / 366.6 | 12.5 / 149.9 | 2D / 1.5 |
| 3D · 1440×900 | High / 2 | 100.1 / 299.9 | 19.7 / 182.4 | Balanced / 2 |

These are actual measurements from a heavily delayed shared host, with other local verification work running, rather than a target-device benchmark. CPU submission uses elapsed `performance.now()` time around drawing; it includes scheduling stalls and shader compilation and is not GPU duration. A preceding 180-frame capture pass on the same Metal backend measured 3D CPU submission medians of 8.6 ms at both sizes after falling to minimum/DPR 1, with rAF medians of 50.0 ms on the phone viewport and 33.4 ms on desktop. Even the 2D baseline missed a 16.7 ms cadence here. The initial software-only SwiftShader browser also incurred first-shader stalls of tens of seconds; it was replaced with the hardware backend for the final run.

**The ~16 ms mid-iPhone target remains unverified.** These numbers do not establish 60 fps on a physical iPhone. Profile real Safari hardware, shader transitions, GPU duration and sustained thermal load before promoting 3D to the default. The prototype remains optional, and the pressure test proves a high-to-minimum quality reduction without losing 3D rendering.

## Verification

- `npx tsc -b` and `npm run build` pass. The optional renderer is 32.61 kB minified / 12.37 kB gzip, and the existing three vendor chunk is 614.00 kB / 157.19 kB gzip; neither is in Fury's default static dependency graph.
- Repository-wide ESLint passes with zero errors and seven pre-existing warnings; all new and changed prototype files pass targeted lint without warnings.
- Existing Fury simulation/story/combat/save, cloud-save (18 tests), music and audio checks pass. Server tests pass: 35 suites, 404 tests, using `npm test -- --runInBand --testTimeout=180000` in `server` because the host exceeded the original short asynchronous deadlines.
- The new browser script passes all 14 cases: comparisons, all four phone sizes, desktop, immutable simulation/world data, Settings and independent preference persistence, other scenes in 2D, paused camera reactivation, real multi-touch movement/collision, rapid switches, disposal, unavailable WebGL, context loss/retry, quality pressure and three actual arcade iframe layouts. No uncaught browser errors occurred.
- Existing viewport checks pass all 9 cases: four phones, desktop DPR 2 and 3, and three actual arcade iframe sizes. They cover native DPR, integer world scale, controls, stories, dialogues, camera bounds, resizing, reduced motion and adaptive quality.
- Correctness review found actor follow delay and dormant 2D camera reactivation; both were fixed. The final reviewer reports no open findings. `sim.ts`, `save.ts` and `world.ts` remain unchanged.

Reproduce captures against a development server, since the inspection API is DEV-only:

```sh
FURY_BASE_URL=http://127.0.0.1:5178 \
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs \
PLAYWRIGHT_CHANNEL=chromium FURY_WEBGL_BACKEND=metal \
FURY_FRAME_SAMPLES=30 node scripts/check-wayside-fury-3d.mjs
```

The default sample count is 180; the recorded complete run selected 30. Omit the channel/backend overrides for Playwright's default browser, or choose another available WebGL backend. `FURY_READY_TIMEOUT` controls startup and action deadlines; it does not alter frame measurements. For an isolated local guest server without site credentials, the verified setup used `VITE_SUPABASE_URL=http://127.0.0.1:5178`, `VITE_SUPABASE_ANON_KEY=wayside-fury-local-test` and `VITE_BASE_URL=http://127.0.0.1:5178` with `npm run dev -- --host 127.0.0.1 --port 5178 --strictPort`.
