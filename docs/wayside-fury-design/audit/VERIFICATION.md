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

These checks establish the original gameplay constraints and the independent paint regression. They must be rerun after final renderer wiring. Browser/DPR and TypeScript evidence is recorded separately once complete. No server implementation was changed by this verification.
