# OVERWORLD — County Cruiser playable slice

Implemented from [the reference analysis](wayside-fury-reference-analysis.md), with the chapter defaults and section 11 unchanged. Default Canvas 2D is complete; optional WebGL presents the same routes and destinations.

## County

Solo county is **2,304 × 1,536 units (96 × 64 named-hero heights)**, with a station rain garden/luggage yard, reservoir/causeway, and scrap orchard. Two reconverging driving loops cover 7,168 units together (about 45 seconds at cruise); a reservoir causeway shortens the western loop. Existing story landmarks and personal-find coordinates are retained. Hold Dash for taxi boost or safe-area sprint; Guard slows the taxi.

The generated map has 817 props. An 8-unit point-collision census finds 85.9% open ground, or **79.2 comparison-screen equivalents**. This exceeds the reference's approximately 74-screen forest presentation area, although point-walkability and reference artwork panels are different measurements: radius-aware reachability is tested separately. Six 240 × 160 route samples contain **11, 10, 9, 10, 12, and 15 props**, meeting the minimum-eight target in every sampled window. This is a small route sample, not a rendered-coverage census.

Original cached vector art adds water-tower, windmill, benches, crates, reeds and maintenance keepers. Larger overlapping canopies frame roads; foreground Canvas canopies fade over the player. Irregular reservoir banks, fenced causeway edges, clusters, lookout aprons and three talkable stop roles supply local navigation cues. New art is shared with the optional 3D presentation; parked traffic and physical bases remain authored. Terrain chunks retain the existing bounded cache, Canvas culls offscreen actors, 3D shares prop materials/textures and instanced geometry, and decorative effects can degrade without reducing native DPR.

## Globe travel

At a safe taxi stop choose **World route · County Cruiser**. Five crew portraits include the player's actual avatar. Steer with WASD/arrows, drag, or turn buttons; brake with Space/the button. A textual destination list offers automatic heading. Both presentations use rotating unit-sphere geography, curved horizons, hemisphere-culled pins, original landmark silhouettes and the same fixed-step travel state. Canvas uses cached contour polygons; three.js uses the same geography on a sphere. Take-off takes 1.25 seconds; deliberate landing takes 1.8 seconds and can be canceled.

Real routes are County roads, Wayside, Blast Site and the campaign-authorized launch compound. Woods, City and Finale remain explained, disabled previews. The Moon still requires the compound, suits and rocket sequence. A seeded optional mail-balloon offer can appear after twelve seconds of cruising, at most once per leg; its thirty-second signal exchange is harmless and awards no tickets or currency.

Travel validates campaign availability and a clear authored arrival before committing. It uses the existing version-4 safe `checkpointMapId`: departure saves the origin map's safe anchor; arrival saves the destination anchor. Airborne coordinates, offer rolls and projected geometry are transient. No new durable fields or save format were introduced; explicit existing v1/v2/v3/v4 migrations remain covered by the campaign checks. A fresh route can always restart after reload. Travel cannot add reward receipts or consume existing finds.

Globe rendering continues in Canvas after WebGL creation failure or context loss. Switching modes preserves the session; retry creates a fresh optional canvas. Local rendering is suspended underneath flight to avoid two scenes competing for GPU time. Hidden tabs stop the travel clock. Native backing sizes include DPR 4. Destination and district radar-anchor IDs are metadata for a later adapter; reserved reward IDs and a mail-signal callback live in `overworldHooks.ts`, with no adapter and no awards enabled. There is no Update 1 radar or inventory dependency.

**Co-op remains on the exact original 1,920 × 960 county geometry in both renderers**, verified against its pre-session geometry hash. Joining from an expanded district returns the local taxi to its original safe spawn before publishing. Globe departure is explicitly disabled for parties, with a notice. This avoids sending unversioned new scenes or mismatched collision to old clients; existing Space protocol fencing remains intact.

## Evidence and limits

Screenshots use muted Chromium at **390 × 844 DPR 3 and 1440 × 900 DPR 2**, default 2D and actual Metal WebGL. County captures are paused native-detail fixtures; they are not sustained-phone performance evidence.

| View | Before | After |
| --- | --- | --- |
| Phone station, 2D | [Before](wayside-fury-design/overworld-before/390x844-2d-station.png) | [After](wayside-fury-design/overworld-after/390x844-2d-station.png) |
| Phone reservoir, 3D | [Before](wayside-fury-design/overworld-before/390x844-3d-reservoir.png) | [After](wayside-fury-design/overworld-after/390x844-3d-reservoir.png) |
| Desktop orchard, 2D | [Before](wayside-fury-design/overworld-before/1440x900-2d-orchard.png) | [After](wayside-fury-design/overworld-after/1440x900-2d-orchard.png) |
| Desktop orchard, 3D | [Before](wayside-fury-design/overworld-before/1440x900-3d-orchard.png) | [After](wayside-fury-design/overworld-after/1440x900-3d-orchard.png) |
| Phone globe | — | [2D](wayside-fury-design/overworld-after/390x844-2d-globe.png) / [3D](wayside-fury-design/overworld-after/390x844-3d-globe.png) |
| Desktop globe | — | [2D](wayside-fury-design/overworld-after/1440x900-2d-globe.png) / [3D](wayside-fury-design/overworld-after/1440x900-3d-globe.png) |

Before fixtures at new district coordinates show the original county's clamped edge, since those places did not yet exist. Full matrices and backing-size measurements are in the adjacent metrics JSON files. Reproduce with `capture-wayside-fury-overworld.mjs before|after` and `check-wayside-fury-globe-browser.mjs`, using `FURY_BASE_URL` and `FURY_PLAYWRIGHT_MODULE` for local installations. All Chromium launches include `--mute-audio`.

This is the authorized coherent playable slice, not full reference-analysis acceptance. Remaining work: versioned host-owned co-op globe/district capability, repeat-route express travel, combat interception decks, new entered district interiors and personal secrets, full rendered-coverage/landmark-cadence census, richer 3D canopy occlusion, and ten-minute real-phone frame/thermal testing. Existing finds and lore remain playable. No new enemies, boss rules, ticket awards, Update 1 systems or server changes are included.

## Verification

The following checks passed:

- `npx tsc -b` and ESLint on changed source/check scripts.
- `npm run check:wayside-fury`; collision, roads, dressing, campaign, collectibles, Space, co-op simulation/rewards, quality and globe pure checks.
- Existing muted 3D harness: **15 cases pass**, including responsive layouts, immutability, lifecycle, context loss/retry, quality degradation and real arcade iframes.
- New muted globe browser matrix: round trips in both renderers at both requested sizes; five portraits; gated previews; canceled landing; context loss and mode retry without authoritative-state changes; DPR 4 unavailable-WebGL fallback and landscape resize.
- No server files changed; server Jest is not applicable. No push or main-branch changes.

Host-contended browser timings are recorded by the existing 3D harness under `/tmp/fury-3d-shots`; they do not establish the real-phone 60 FPS/p95 ≤20 ms acceptance target.
