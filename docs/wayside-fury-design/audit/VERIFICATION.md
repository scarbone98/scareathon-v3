# AUDIT verification evidence

Independent checks run on the shared AUDIT checkout on October 8, 2026. The base checkout was `origin/main` (`bb026c3e`); the first committed regression check is `5fbbb7e`.

Passed:

- `npm run check:wayside-fury`: collision and all-map radius-aware reachability; simulation combat, progression, receipts, party/taxi/HOME/save behavior.
- `node scripts/check-wayside-fury-minimap.mjs`: Chapters 1–5 objectives, co-op receipts, visibility, responsive clearance.
- `node scripts/check-wayside-fury-road-clearance.mjs`: 56 maps, 1,358 solid footprints, 662 scatter props, 21 authored relocations.
- `node scripts/check-wayside-fury-road-network.mjs`: T/X/Y junction paint, county/co-op/hub centerlines, exact ribbon coverage.
- `node scripts/check-wayside-fury-areas.mjs`: 81 reachable exits, nine doors and return/save/retry loops, preserved finds, protocol guards, zero ticket inflation.
- `node scripts/check-wayside-fury-grounding.mjs`: footprint/layer checks.
- `node scripts/check-wayside-fury-audit-paint.mjs`: one complete lane dash follows a polyline corner; county and legacy co-op paint clear junctions and preserve world data.

These initial checks establish the original gameplay constraints and the independent paint regression. The final renderer checks are recorded below. No server implementation was changed.

Final geometry rerun on `987585e` passed the base simulation/collision checks, areas, road clearance, road network, roads, minimap, grounding, overworld audit and bend-paint regression. Counts after removal of water-covered scenery: **56 maps, 1,356 solid footprints, 647 scatter props**; all **81 exits** remain reachable.

The isolated `origin/main` archive passed TypeScript and the production Vite build (2,536 modules). The baseline matrix contains **64 native-DPR captures across 16 locations** with no uncaught browser errors. Native-DPR assertions run against the actual visible canvas backing size, not a scaled screenshot fixture. The full game is paused for capture; these are not performance acceptance claims.

Final `npx tsc -b` and changed-source ESLint passed after the crater-bank subdivision correction. The refreshed phone 3D Blast approach capture also passed native-DPR and browser-error assertions.

Real-WebGL `check-wayside-fury-3d.mjs` completed capture/layout, lifecycle, fallback/context-recovery, adaptive-quality and phone portrait/landscape iframe cases successfully. Its final desktop iframe initialization timed out (300 seconds) on the contended host. The identical desktop case, extracted without changing assertions, passed on an isolated muted retry. No renderer fix was needed; the aggregate first invocation exited nonzero due to that timeout. Physical-phone FPS/thermal performance remains outside this emulated visual audit.
