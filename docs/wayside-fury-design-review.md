# Wayside Fury — design review

Scope: `/wayside-fury` only; preserve the site's shell, simulation, save format and co-op protocol. Buu's Fury informs adventure structure, not rendering resolution.

## Baseline critique

- **Art consistency:** native-resolution canvases are already present, but high-contrast, per-tile lighting creates a checkerboard across grass and roads. Rectangular tree crowns and taxi panels still read as magnified low-resolution art. The sparse title background does little to establish Wayside's setting.
- **Readability:** DOM typography is crisp at DPR 3. HP/Ki numerals rely on heavy shadows over bright fills. Tiny meter labels and densely nested Collection cards need clearer hierarchy.
- **HUD and safe areas:** the portrait HUD and separate touch dock fit comfortably at 393 × 852. Existing safe-area reservations and 56–72px action targets are worth keeping. Landscape needs scrolling menus with a reachable return action.
- **Overlaps:** the hub's Taxi label can sit directly across the player. Multiple labels clamped to the same screen edge can pile up; labels should avoid the hero and each other.
- **Color/contrast:** teal, pine and amber are a useful shared palette. Terrain needs quieter midtones so heroes, interaction markers and combat effects have visual priority.
- **Motion/game feel:** fixed-step interpolation, eased cameras, hit trails and reduced-motion support already exist. Preserve these; use native-resolution curves and finer material details instead of adding more screen shake.
- **2D/3D parity:** 3D is an overworld option; other scenes intentionally share 2D. Both must retain the same HUD, controls, location labels and simulation. Terrain filtering should avoid shimmering at oblique angles.

## Changes and comparisons

- Illustrated title landscape, a stronger amber primary action, and a two-column landscape title layout.
- Fine, quieter terrain grain; detailed curved tree crowns and taxi bodywork; small charge sparks. Terrain chunks align to physical pixels to eliminate camera seam lines. 3D uses 256px material textures, mipmaps, restrained tile tint and continuous ground normals.
- Shared screen-space label placement avoids the hero and neighboring labels in both renderers. Fixed DOM boxes preserve explicit line breaks and ellipsize long names. DOM meters have larger numerals and darker fills; touch targets and safe-area reservations remain intact.
- Pause actions use two columns. Collection gains a top return button, progress meter and clearer unknown-item cards. Account avatar identities and equipment layering remain compatible.

| Inspect | Before | After |
| --- | --- | --- |
| Portrait title | [Before](wayside-fury-design/before/iphone-portrait-2d-title.png) | [After](wayside-fury-design/after/iphone-portrait-2d-title.png) |
| Landscape title | [Before](wayside-fury-design/before/iphone-landscape-2d-title.png) | [After](wayside-fury-design/after/iphone-landscape-2d-title.png) |
| Hero / Taxi label | [Before](wayside-fury-design/before/iphone-portrait-2d-hub-hud.png) | [After](wayside-fury-design/after/iphone-portrait-2d-hub-hud.png) |
| Combat | [Before](wayside-fury-design/before/desktop-2d-battle.png) | [After](wayside-fury-design/after/desktop-2d-battle.png) |
| Landscape pause | [Before](wayside-fury-design/before/iphone-landscape-2d-pause.png) | [After](wayside-fury-design/after/iphone-landscape-2d-pause.png) |
| Collection | [Before](wayside-fury-design/before/iphone-portrait-2d-collection.png) | [After](wayside-fury-design/after/iphone-portrait-2d-collection.png) |
| 3D overworld | [Before](wayside-fury-design/before/iphone-portrait-3d-overworld.png) | [After](wayside-fury-design/after/iphone-portrait-3d-overworld.png) |

## Capture conditions and limits

Matrix: title, overworld, hub/HUD, battle, pause and Collection; 2D default and `?gfx=3d`; 393 × 852 DPR 3, 852 × 393 DPR 3, and 1440 × 900 DPR 2. Chromium is muted; 3D uses Metal after software rendering timed out. Scene jumps and staged enemies use the existing development hook; guest looks and animation frames can vary. Desktop battle after-shots use keyboard input; phone shots include touch controls.

This heavily loaded host triggers the existing adaptive 2D DPR fallback, often to 1. Live screenshots preserve that behavior. Additional `*-native.png` images pause the simulation and restore the renderer's native DPR **only in the capture fixture**, with asserted DPR 3 on phones / 2 on desktop. These expose fine art detail separately; they are not performance measurements. Available canvas dimensions and quality tiers are recorded in the JSON metrics. The after-metrics file covers the partial post-review refresh. Real-device sustained FPS remains unmeasured. Existing camera zoom, interpolation, quality fallback and reduced-motion support are preserved.

The complete before/after matrix contains 36 baseline images and 45 after-images (including nine native-detail fixtures). The final label-width follow-up was recaptured in portrait 2D title, overworld, hub and battle views; the remaining refresh hit a headless screenshot timeout, and browser retries were interrupted at 21:50 during the production launch. Those other after-images show the preceding visual pass.

Title art: built-in imagegen, saved as [title-landscape.webp](../public/wayside-fury/title-landscape.webp) (244 KB). [Exact generation prompt](wayside-fury-design/art-prompt.txt). Gameplay scenery is native Canvas artwork, not a low-resolution scene buffer. Existing character source art remains part of the avatar/wardrobe system.

## Verification

- Server: **39 suites / 458 tests passed**.
- Final `npx tsc -b` and `npm run lint` passed after resuming. Production build passed before the final label-box follow-up.
- All 11 non-browser Wayside Fury scripts passed, including the new label-layout regression check.
- Browser checks: collision and native WebKit audio passed. Viewport, 3D, context-attack, arcade and co-op did not complete green; retries were interrupted. No browser checks or dev servers were restarted after the launch hold.
- Review triage: **1 medium finding, fix-now, resolved** — edge labels could wrap outside their collision boxes. Applied fixed dimensions and ellipsis; pure regression checks and capture-time DOM assertions cover the fix. Follow-up review found no correctness issues.
- The 3D immutability check now renders twelve passes synchronously, avoiding an unrelated async save/avatar readiness callback resuming simulation between frames. Complete authoritative state/world equality assertions remain intact.

Reproduce captures with `scripts/capture-wayside-fury-design.mjs before|after`, `FURY_BASE_URL` pointing at Vite and `PLAYWRIGHT_MODULE` pointing at the installed Playwright module. Optional `FURY_WEBGL_BACKEND=metal`. Use `scripts/wayside-fury-muted-playwright.mjs` as `PLAYWRIGHT_MODULE` for the existing browser checks; `FURY_PLAYWRIGHT_MODULE` selects an external installation. It mutes Chromium output and WebKit's hardware sink while preserving the upstream audio signal for its tests. Default browser waits are extended for host contention; assertions and explicit timing checks are unchanged.


## Round 2

Fixed the portrait save badge covering chapter notices and the desktop keyboard hint: feedback now stacks with messages, and world labels reserve their measured height. Collection keeps its Back button visible while scrolling, with more compact unknown-item cards. Also corrected clipped pine tips and replaced coarse 3D grass marks with finer curved blades. The merged wider taxi interaction zones are unchanged.

Both renderers now recover one quality tier after ten uninterrupted seconds of healthy frame cadence. Slow frames, scene changes, pauses and hidden tabs reset recovery; existing degradation thresholds remain intact.

Final verification targets **390 × 844 DPR 3 and 1440 × 900 DPR 2**, default 2D and `?gfx=3d`, per the narrowed request. The muted capture harness checks canvas backing dimensions, HUD/control bounds, label boxes, save-message separation, scrolled Collection navigation, and simulated quality degradation/recovery without changing game state. TypeScript (`npx tsc -b`), ESLint (`npx eslint .`) and the quality-recovery unit check pass; all four size/renderer combinations pass with no uncaught browser errors. The single Vite server was stopped after capture. Code review found no correctness issues.

Artifacts: [34 final screenshots and metrics](wayside-fury-design/round2-after/) include six paused native-detail fixtures. Compare the portrait [before](wayside-fury-design/round2-before/390x844-2d-overworld.png) / [after](wayside-fury-design/round2-after/390x844-2d-overworld.png), [3D detail](wayside-fury-design/round2-after/390x844-3d-overworld.png), and [scrolled Collection](wayside-fury-design/round2-after/390x844-2d-collection-scrolled.png). Reproduce with `FURY_CAPTURE_SIZE=390x844,1440x900` and capture phase `round2-after`.

Remaining: sustained FPS/thermal testing on real phones, richer character source art compatible with wardrobe layers, and further 3D architecture/material detail. Paused native-detail fixtures establish visual fidelity, not sustained device performance.

## CH3B — playable Space rendering slice

The suit overlay has been replaced by a shared code-authored pressure-suit rig through `resolveHeroVisual`: 128 × 192 source cells, feet/helmet anchors, eight facing selections, twelve frame samples, five identities, action poses and a separate visor layer. Joe has a spatula patch, Matt an instrument cuff, Alex navigation lights, Jon a pouch/mirror and You a station badge. The avatar's saved portrait is fitted into the visor; its wardrobe is covered during suit use without a save write. Local and remote actors use the same resolver. The [pose contact sheet](wayside-fury-design/ch3b/suit-contact-sheet.png) records the current authored treatment.

Optional three.js Space scenes now use actual compound structures, lunar ground/rocks/crater rims, authored collision boundaries, suited billboards, shared enemy artwork and ground telegraphs. The WebGL context is shared with the existing overworld renderer; Space owns and disposes its area meshes, materials and textures. Non-Space dungeons retain Canvas. Both renderers read existing chapter state and film shot records. Space films have cabin/rocket/celestial sets; portrait Canvas crew shots reframe into two rows. Moon regolith and crater highlights are quieter, and native DPR is retained.

[Twenty matrix screenshots, two shot-size fixtures and a suit contact sheet](wayside-fury-design/ch3b/) cover the compound, M04 traversal, Warden, separation and Earth view at 390 × 844 DPR 3 and 1440 × 900 DPR 2, default 2D and real Metal WebGL. Phone fixtures use touch controls. A targeted crew-to-helmet shot transition verifies native texture replacement. These are paused, reduced-motion native-detail fixtures, with repeated-draw authoritative-state equality and backing-size assertions. They are visual evidence, not sustained-phone performance measurements. Reproduce with `scripts/check-wayside-fury-space-rendering.mjs`, `FURY_BASE_URL`, `FURY_PLAYWRIGHT_MODULE`, `FURY_WEBGL_BACKEND=metal` and `FURY_SPACE_SHOTS`. Chromium launches with `--mute-audio`. This checkout has no environment file; the capture server used inert local Supabase placeholders.

Verification: TypeScript and ESLint on changed files; base simulation/collision, Space graph/rules, Space combat, campaign/save migration, co-op simulation, quality, labels and dressing checks. The existing overworld 3D harness passed comparisons, responsive layouts, lifecycle/switching and actual context-loss/retry, then failed its artificial slow-frame case during the concurrent browser run. An isolated rerun of that case passed (high → minimum effects, still 3D at DPR 3); the full harness has no aggregate green result and its later iframe cases did not run. The new real-WebGL matrix checks mid-film context-loss fallback without changing state; the existing Space browser matrix separately forces unavailable WebGL, including landscape and DPR 4. Review found five correctness issues (downed-cell clipping, Warden texture clipping, stale film-avatar readiness, missing unsuited wardrobe layers, stale texture dimensions after viewport/shot changes), all corrected; follow-up review found none. No server implementation, save format, ticket receipts, new enemy rules or Update 1 systems were changed.

This is the coherent playable rendering slice, not full acceptance of all M2-B/M3-D/M3-E art-production tickets. Dedicated large helmet portraits, richer directional/action artwork and detailed shot-specific film environments remain. Native DPR has been checked in desktop Chromium emulation; ten-minute thermal/FPS acceptance on real phones remains unmeasured. The local checks ran with installed Node 26.4.0; Node 24 is not installed on this host. The chapter plan and its section 11 scope list are unchanged.
