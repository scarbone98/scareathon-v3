# 3D puddle decals

The overworld puddle at `(766, 473)`, width 26, captured before and after at
390 × 844 DPR 3 and 1440 × 900 DPR 2. These are paused, reduced-motion,
native-DPR Metal WebGL fixtures, not sustained phone performance measurements.
Guest avatar appearance can vary between fresh browser sessions.

| View | Before | After |
| --- | --- | --- |
| Phone | [Opaque boxes](before-390x844.png) | [Water decal](after-390x844.png) |
| Desktop | [Opaque boxes](before-1440x900.png) | [Water decal](after-1440x900.png) |

Water and damp-earth rim each use one merged mesh across all three puddles.
Their concentric subdivisions sample terrain height at every vertex, with offsets
of 0.12 and 0.06 world units. The footprint matches the 2D ellipse: width `prop.w`,
depth `prop.w / 4`, centered at `prop.y + prop.h - 2`. Transparent standard
materials retain lighting/shadow reception, soft radial alpha, low water roughness,
and sky-colour reflection. Shader glints use the renderer's visual clock; reduced
motion freezes them. Neither decal casts shadows or writes depth; polygon offset
and explicit rim-before-water render order prevent coincident-surface artifacts.
The scene's existing disposal path owns their geometry and materials.

Capture assertions passed for native backing dimensions, unchanged simulation,
material flags, and every vertex's terrain-relative height (maximum error below
0.000001 world units). The matched fixture reports two fewer total draw calls:
203 → 201 on phone and 214 → 212 on desktop. Added geometry is bounded to 2,112
triangles for all three puddles, with no extra shadow draws or reflection pass.
See [before metrics](before-metrics.json) and [after metrics](after-metrics.json).

Reproduce with Vite on port 5217 and an installed Playwright module:

```sh
FURY_BASE_URL=http://127.0.0.1:5217 \
FURY_PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs \
node scripts/capture-wayside-fury-puddles.mjs after
```

Chromium launches with `--mute-audio`. The `before` phase requires the pre-fix
renderer. 2D rendering, collision, saves, rewards, and co-op data are unchanged.
