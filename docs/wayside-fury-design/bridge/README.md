# Walkable surfaces — Oct 8 bridge fix

Walkable props now draw in a separate Canvas ground pass before local heroes,
remote heroes, enemies and assists. Bridges/docks use native vector top-down
transverse decking, side rails and post caps. The water-spanning blob shadow is
gone. Rugs and floor decals also remain below actors; existing organic stairs
and interior floor artwork already use ground passes.

Split Creek's broken deck occupies `(416,96)..(448,160)` and
`(512,96)..(544,160)`. Both inner ends are splintered; the water gap at
`x=448..512` stays blocked. The intact crossings at `y=224..320` and
`y=384..432` remain continuous. Rail footprints stay solid and the Supply Cache
dock no longer has a solid strip across its walkable deck.

Shared `surface` metadata optionally supplies travel direction, deck height and
gap fractions for chapter-specific props. Collision remains authored tile/rail
geometry; adding a visual deck does not clear water globally. Real three.js paths
use horizontal deck planes over thin slabs, and lift local/remote actors and
Space enemies to deck height. Slabs and actors sample the same deck base on
sloping county terrain. Blast Site and other non-Space dungeons retain their
shared Canvas path with `?gfx=3d`.

## Captures

Paused production render fixtures: Chrome, 390 × 844 CSS pixels, native DPR 3
(1170 × 2532 backing pixels), reduced motion, Vite port 5221, `--mute-audio`.
The same Joe pose is used before/after. Fixtures omit the HUD and combat noise to
make ground contact visible. All four rooms have byte-identical 2D/optional-3D
after screenshots, checked by the capture script.

| Surface | Before 2D | After 2D | Before `?gfx=3d` | After `?gfx=3d` |
| --- | --- | --- | --- | --- |
| Split Creek broken span | [Before](before-2d-split-creek-broken.png) | [After](after-2d-split-creek-broken.png) | [Before](before-3d-split-creek-broken.png) | [After](after-3d-split-creek-broken.png) |
| Split Creek intact crossing | [Before](before-2d-split-creek-crossing.png) | [After](after-2d-split-creek-crossing.png) | [Before](before-3d-split-creek-crossing.png) | [After](after-3d-split-creek-crossing.png) |
| Blast ravine bridges | [Before](before-2d-ravine-bridge.png) | [After](after-2d-ravine-bridge.png) | [Before](before-3d-ravine-bridge.png) | [After](after-3d-ravine-bridge.png) |
| Supply Cache dock | [Before](before-2d-supply-dock.png) | [After](after-2d-supply-dock.png) | [Before](before-3d-supply-dock.png) | [After](after-3d-supply-dock.png) |

The [real WebGL fixture](after-real-3d-standing-regression.png) temporarily adds
a broken deck to the launch map to exercise the actual Space renderer. It is a
regression fixture, not new campaign content. [Metrics](webgl-regression-metrics.json)
assert two horizontal planes matching the shared span rectangles; local, co-op
and enemy standing heights; no lift at the gap; Canvas ground-before-actor
ordering; native DPR; and render-state immutability. Temporary world edits are
restored after the check.

## Verification

- `npx tsc -b` and ESLint on changed source/check files pass.
- `npm run check:wayside-fury` includes the new bridge unit regression and passes.
- Collision/reachability and Blast dressing checks pass, including every exit,
  encounter and existing find in Split Creek. Areas, Woods, Space and City graph /
  progression checks also pass.
- `check-wayside-fury-bridge-browser.mjs` passes real Metal WebGL deck geometry,
  standing-height and local/remote/enemy Canvas ordering checks.
- The existing `check-wayside-fury-3d.mjs` passed its four phone/desktop
  comparison captures and two responsive cases, then timed out waiting for 3D
  at 932 × 430. An isolated retry used the same harness functions/assertions for
  that case and all remaining lifecycle, switching, fallback/context-loss,
  quality-reduction and three arcade iframe checks: all nine recorded checks
  passed with no uncaught browser errors. [Retry report](3d-retry-metrics.json).
  The original full invocation has no aggregate green result; completed cases
  were retained and the timed-out/remaining cases were rerun.
- `capture-wayside-fury-bridge.mjs after` passes the eight native phone captures,
  state immutability, ground-before-hero checks and exact graphics-mode parity.

Reproduce with a Vite server on port 5221:

```sh
npm run dev -- --port 5221 --strictPort
node scripts/check-wayside-fury-bridge.mjs
node scripts/check-wayside-fury-collision.mjs
FURY_BASE_URL=http://127.0.0.1:5221 node scripts/check-wayside-fury-bridge-browser.mjs
FURY_BASE_URL=http://127.0.0.1:5221 node scripts/capture-wayside-fury-bridge.mjs after
```

Set `FURY_PLAYWRIGHT_MODULE` to an installed Playwright `index.mjs` when it is
outside this checkout. The two new browser scripts always launch muted Chrome;
the real WebGL fixture uses Metal. Baseline images were captured before the fix.
These are desktop browser phone/DPR fixtures, not real-iPhone thermal/FPS results.

## Design merge verification

Merged `origin/wayside-fury-design` into `wayside-fury-BRIDGE`, keeping deck
geometry, broken gaps and actor heights alongside embedded rock art, terrain
bowls and contact decals. Canvas combines both ground classifications before
sorting actors; both optional 3D renderers retain the shared deck heights.

Post-merge TypeScript, changed-file ESLint, `npm run check:wayside-fury` and
21 targeted scripts passed: grounding, bridge, collision, areas, globe, balance,
campaign, woods, woods-combat, space, space-combat, city, combat, coop-sim,
coop-rewards, quality, labels, dressing, interiors-coop, roads and telegraph.
The real Metal WebGL bridge regression passed at DPR 3 with state immutability.
The muted areas browser check passed keyboard travel, held-input debounce,
personal pickup deduplication, save resume and unavailable-WebGL fallback.
Its first run pressed during a fixture prompt transition and timed out waiting
for the pickup; the harness now waits through the presentation grace period
before keyboard presses, and the rerun passed. Correctness review found no issues.

There is no `make verify` target in this repository. No server files changed.
These browser results use desktop emulation, not real-phone thermal testing.
