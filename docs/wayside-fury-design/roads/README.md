# Roads / intersections — Oct 8

The county's rectangle roads and independent organic overlays have been replaced by one polyline network. Original road IDs, map exits, stop anchors, taxi motion, save fields, rewards and co-op boundaries are preserved. Old raster lanes are removed together before generating the replacement material grid. Exact ribbon queries keep the reservoir's water outside the causeway blocked; Chapter 1 wooden bridges retain their existing behavior.

Both renderers consume the same network pavement and junction paint. Asphalt merges across T/X/Y crossings, internal curbs and lane dashes disappear, approach stop bars precede the junction, tangent fillets round the corner curbs, and junction terminals connect to adjoining centerlines. Footpaths render beneath county asphalt. The three City street maps use the same network surface; City retains the shared 2D renderer in optional 3D mode.

**Crossing classification:** all authored road-to-road crossings in this checkout are at grade. There are no authored overpass/underpass road levels, elevated taxi routes or ramp links. The previously apparent “bridge” at the diagonal crossing was overlapping independent road strokes. It is now a normal merged junction. The reservoir causeway crosses water, not another road. This change does not invent an overpass or introduce an ambiguous actor level at a crossing.

Optional 3D uses native vector pavement textures at three pixels per world unit, draped over terrain triangles with polygon offset. Duplicate 3D lane boxes and visible tiled asphalt are removed. Ground and actor footing continue to share the existing terrain-height function; all at-grade actors and taxis keep their normal depth behavior. Road meshes, textures and materials are released with the terrain renderer. Road normals sample the same height gradients as the ground, removing faceted causeway lighting.

## Captures

`before/` uses the original checkout; `after/` uses this change. Muted Chromium on port **5222**, real Metal WebGL, paused native-detail fixtures: 390 × 844 at DPR 3 and 1440 × 900 at DPR 2. The harness asserts each map and active renderer, backing dimensions and absence of uncaught browser errors. Both phases use identical paused scene and camera resets; the 2D fixture retains the paused transition shade. Images cover station/garden, forest and reservoir junctions, both reservoir causeway approaches, and two City streets. City images requested with 3D explicitly verify the intended 2D presentation.

| Phone view | 2D before / after | 3D before / after |
| --- | --- | --- |
| Forest junction | [Before](before/390x844-2d-forest-junction.png) / [After](after/390x844-2d-forest-junction.png) | [Before](before/390x844-3d-forest-junction.png) / [After](after/390x844-3d-forest-junction.png) |
| Reservoir junction | [Before](before/390x844-2d-reservoir-junction.png) / [After](after/390x844-2d-reservoir-junction.png) | [Before](before/390x844-3d-reservoir-junction.png) / [After](after/390x844-3d-reservoir-junction.png) |
| Causeway west | [Before](before/390x844-2d-causeway-west.png) / [After](after/390x844-2d-causeway-west.png) | [Before](before/390x844-3d-causeway-west.png) / [After](after/390x844-3d-causeway-west.png) |

Run `FURY_BASE_URL=http://localhost:5222 node scripts/capture-wayside-fury-roads.mjs after`. `FURY_PLAYWRIGHT_MODULE` can select an external Playwright installation. Chromium always uses `--mute-audio`. `FURY_CAPTURE_SIZE=390` or `1440` selects one size.

These are emulated visual fixtures, not real-device sustained FPS or thermal measurements.

## Verification

- `npx tsc -b`; ESLint on changed TypeScript and scripts.
- `npm run check:wayside-fury` and collision, areas/reachability, grounding, roads and globe checks.
- New `check-wayside-fury-road-network.mjs`: T/X/Y curb/paint regressions, centerline clearance in county/co-op/hub, no leftover road tiles, water outside the causeway ribbon stays solid.
- Muted `check-wayside-fury-3d.mjs` with real Metal WebGL and 30 frame samples: **all 15 cases passed**, including context loss/retry, unavailable WebGL, quality reduction and arcade iframes. Measurements and case results: [3d-checks.json](3d-checks.json).

The final normal-smoothing follow-up was verified with TypeScript/ESLint and all 16 native 3D capture fixtures after the full 15-case harness.

No server, campaign registry, save format, ticket economy or Update 1 implementation changes.
