# Wayside Fury: optional HD-2D overworld

## Decision

Recommend **B, with C's integration boundary**: render only the taxi overworld in three.js 0.168, retain the existing native-resolution Canvas 2D renderer for all other scenes and for fallback, and keep the React HUD, labels and controls. The brief describes Phaser, but this worktree's `game/render.ts` uses Canvas 2D directly; migrating that renderer to Phaser would add unnecessary scope. Phaser is an installed dependency, not the current Fury rendering engine.

| Approach | Look | Cost and risk | Mobile performance |
| --- | --- | --- | --- |
| A. Phaser 2.5D | Elevated tile layers, cliff faces, y-sorted art, blob/soft shadows, normal-map lighting and a mild tilt can improve the existing top-down look. Perspective and depth of field remain approximations. | Medium art/renderer cost, plus a Phaser migration in this checkout. Lowest integration risk if implemented directly in the current canvas instead; slopes, clipping and occlusion still need custom work. | Static chunk caching is inexpensive. Light2D requires prepared normals; multiple lights and full-resolution soft effects increase fill cost. |
| B. three.js HD-2D | Real terrain heights and cliffs, sloping roads, dimensional buildings and trees, crisp sprite billboards, a tilted perspective camera, fog, day/night lighting and selective bloom. Strongest visible change. | Higher initial scene/camera work. WebGL availability, GPU memory, shader compilation, disposal and context loss need explicit handling. Existing three.js dependency avoids another engine install. | Batch terrain by material, reuse prop geometry/materials, cull offscreen props, bound point lights and use a single post-processing pass. Adaptive effects and DPR provide a fallback ladder. Physical iPhone profiling remains necessary. |
| C. Hybrid canvas terrain plus projected/extruded props | Stronger depth than today's renderer while preserving its art; less coherent perspective than a full 3D scene. | Medium cost; two projection systems and height-aware occlusion can become more complex than B. Reusing the DOM UI and non-overworld renderer is useful regardless. | Avoids some mesh/shader costs, but canvas projection and dynamic shadows can consume main-thread time. A full-resolution composite adds bandwidth. |

These are engineering estimates based on the current implementation, not measured performance claims. See [three.js WebGLRenderer](https://threejs.org/docs/#api/en/renderers/WebGLRenderer) for renderer sizing, resource and context APIs. The installed 0.168 source and types govern this prototype.

## Prototype boundary

- Default remains 2D. `?gfx=3d` enables the prototype; an Overworld graphics setting remembers the choice in a separate device preference, outside the game save format. An explicit query overrides the device preference.
- Load three.js only when 3D is requested and the overworld is being rendered. Continue presenting 2D while loading. Initialization, rendering or context failure returns immediately to 2D; selecting 3D again retries.
- Read the same interpolated `GameState`, tile materials and world coordinates. Presentation elevation never alters collision, spawns, movement, `sim.ts`, world walkability or save serialization.
- Use native canvas pixels at device DPR capped at 3, a smooth camera with comfortable tile scale, crisp nearest-filtered billboards and soft ground shadows.
- Add presentation-only plateaus, cliff faces, ramps and lowered water. Build terrain once and batch its geometry; reuse props and limit dynamic lights.
- High quality includes tilt-shift depth of field, bloom and vignette. Sustained slow frame cadence reduces effects and then DPR. Hidden tabs and large resumed-frame gaps do not count as sustained load.
- Preserve React controls, readable DOM labels, safe areas and the existing portrait/landscape layout. Other scenes keep their current renderer.

## Implementation and verification plan

Files: `game/graphics.ts` (renderer selection and device preference), `game/render3d.ts` (scene, camera, actors, effects and quality), `game/terrain3d.ts` (batched terrain and visual elevations), `game/controller.ts` (renderer bridge), `page.tsx` and `style.css` (Settings and canvas overlay), `scripts/check-wayside-fury-3d.mjs` (browser checks and captures), and this memo. `terrain.ts` may expose its existing palette without changing its behavior.

The renderer contract remains `draw(state, dt, frameDelta)`, `presentation(state)`, `onEvent(state, event)`, `setAvatar(avatar)`, `reset()` and `dispose()`. The terrain builder returns a group, a matching `heightAt(x, y)`, animated water meshes and `dispose()`.

Verify default/lazy loading, query and Settings selection, unchanged simulation/save data, movement and interactions, 2D rendering outside the overworld, context-loss fallback, quality reduction, resource cleanup and control bounds at 390×844, 430×932, 844×390, 932×430 and desktop/iframe. Capture comparisons at 390×844 and 1440×900 in `/tmp/fury-3d-shots/`. Run TypeScript, ESLint, the existing Fury checks and server tests.

## Screenshot findings and frame times

Pending implementation and browser measurement. Final evidence will record browser/backend, DPR, quality tier, frame cadence and renderer CPU timings separately. Desktop browser emulation cannot certify the ~16 ms mid-iPhone hardware target.
