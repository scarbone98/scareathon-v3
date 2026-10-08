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
