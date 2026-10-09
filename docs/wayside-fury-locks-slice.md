# Wayside Fury — LOCKS playable slice

Ten optional, original side pockets reuse the U3 enclosure, hit-testing, presentation and borrowed-host geometry patterns from `origin/wayside-fury-update1` (`7a45ad2`). No Update 1 inventory, radar, quest or combat system was imported.

Two pockets each are authored in the county, Blast Site (Road and Orchard), Ranger Lay-by, Moon landing area and Old City boulevard. Every pocket supplies a lore ledger, twelve candy, an explicitly allowlisted 100-ticket first-clear bonus, and an interaction return route after collection. Earth caches shortcut to Wayside; lunar caches start the existing return flight so lens progression, checkpoint reconciliation and the suit transition remain intact. The Finale is unavailable in this checkout; it receives no speculative geometry. Optional enemy/miniboss content is outside this slice. The chapter plan and section 11 remain unchanged.

Requirements are crew permission, guaranteed learned field ability, or exact story milestone. The county survey barricade uses Circuit Spark. Joe's Breaker Knuckle pockets and the story seals reward returning later. Crew gates use benched assists, preserving the active hero and avoiding downed-hero softlocks. Flood-fill regression checks every affected story exit and encounter with all optional gates closed, as well as sealed/reachable reward pockets and swept live movement.

Exit cues contain only area names, fading within three tiles. Opening paths, door frames and framing props remain; chevrons and floating arrow geometry are removed in Canvas, county three.js and Space three.js.

Persistent state extends the existing bounded `solvedInteractions` namespace with `locks-*`, `*-seen` and `locks-cache-*` receipts. Save version 4 is unchanged: explicit v1–3 migration initializes no gate receipts, and v4 sanitization defaults missing receipts to empty while preserving existing ones. HOME retry retains clears. Cache reward IDs join the existing first-clear allowlist; gate clears, seen markers, unknown IDs and repeated receipts pay nothing. The legacy 3,550-ticket campaign budget remains intact; the ten optional caches add a separate 1,000-ticket maximum.

Co-op protocol 7 uses host-owned clear/checkpoint snapshots and existing per-player reward receipts. Protocols 1–6 remain accepted and negotiate matching geometry with the optional pockets disabled. Existing map compatibility continues rejecting old clients from newer areas. Guests borrow old host clears without copying them into personal saves; leaving a borrowed pocket safely relocates the guest outside its restored barrier. Fresh checkpoint rewards persist shared discoveries. Host-only inspections lead shared clear/shortcut actions.

`lockedGateAnchors(state)` is the optional minimap/radar hook: it returns a small `lock` icon anchor only for seen, uncleared gates. The new minimap is absent from this worktree. Reward IDs and pocket anchors are exported from the obstacle registry for later inventory/radar integration.

The default Canvas renderer draws native vector artwork with Y sorting. Optional county and Moon three.js modes reuse the ported meshes, shared footprint dimensions and authoritative clear state. Other dungeons keep shared Canvas presentation in 3D mode. Clear effects shrink/fade the Canvas obstruction or lower the 3D obstruction, leaving walkable openings and edge debris. Moon crew assists use the shared pressure-suit rig in both renderers; native DPR and graphics fallback remain unchanged.

## Verification and capture

Run `npx tsc -b`, ESLint on changed files, `npm run check:wayside-fury`, and the obstacle, exits, areas, bridge, campaign, co-op simulation/rewards, Woods, City, Space and county road scripts. Server changes require `cd server && npx jest --forceExit`. On this heavily loaded host, the initial two-worker Jest run hit unrelated 5-second timeouts; the follow-up uses `--runInBand --testTimeout=30000`.

Start Vite on port **5226**. Capture with `FURY_BASE_URL=http://127.0.0.1:5226 node scripts/capture-wayside-fury-locks.mjs`; optionally set `FURY_PLAYWRIGHT_MODULE` to the installed Playwright module. The harness always launches Chromium with `--mute-audio`. Its target matrix covers each Circuit Spark, Breaker Knuckle and story gate locked/cleared in default 2D and actual three.js, at 390 × 844 DPR 3 and 1440 × 900 DPR 2. Paused fixtures assert unchanged simulation state and native backing dimensions; they are visual evidence, not sustained-phone performance measurements. Files and metrics belong in `docs/wayside-fury-design/locks/`.

Moon assist fixtures can be reproduced with `FURY_CAPTURE_ASSISTS=1` using the same capture command; their native-DPR, unchanged-state screenshots live in `locks/assists/`.

Completed simulation checks: Chapter 1, obstacle requirements/persistence/closed-gate reachability, exit cues, areas, Blast bridge, campaign, co-op simulation/rewards, Woods, City, Space and all three county road checks. The lunar shortcut regression also covers lens/no-lens return flights, mid-flight save reconciliation and ticket deduplication. Server verification passed **42 suites / 478 tests** with `npx jest --forceExit --runInBand --testTimeout=30000`.

The committed visual evidence includes 24 locked/cleared gate captures plus two lunar crew-assist captures, with native-DPR and immutable-render assertions. The loaded desktop host produced poor frame timings; these captures do not establish smooth performance on target phones. Real-device performance remains unverified.

The broad `check-wayside-fury-3d.mjs` run passed all **15 cases**: native-DPR layouts, renderer lifecycle/immutability, unavailable WebGL fallback, context loss and explicit retry, automatic quality reduction, and actual arcade iframe controls/toolbar sizing on portrait phone, landscape phone and desktop viewports. Changed-file ESLint passed.

`npx tsc -b` passed, including the final rerun after the lunar shortcut changes. All required checks for this slice are green. The local preview was stopped and its temporary configuration removed.

## Integration with U1WORLD

The design merge preserves this branch’s existing day/night runtime and lighting alongside obstacle discovery and presentation. The former level-8 county barricade now requires Circuit Spark; its stable clear/cache IDs, geometry, supplies and shortcut remain intact. Historical level-gate screenshots above show the incoming design revision. No new Update 1 system is implemented by this merge.

## Integration with U1ITEMS

Merging `origin/wayside-fury-design` preserves this branch’s existing chips, relics, radar, item UI and personal co-op combat effects alongside the incoming gates and county clock. Save creation, restoration and shared types retain both `u1.items` and `worldCycleSeconds`; missing clock values default to zero without resetting items. Canvas keeps item markers and obstacle actors in the same Y-sorted pass. Co-op checkpoint handling keeps relic-echo receipts out of room rewards while forwarding gate/cache discoveries through their existing host-owned path. Both branches’ features are retained; this merge adds no new Update 1 subsystem and leaves the chapter plan unchanged.

`scripts/check-wayside-fury-design-merge.mjs` checks the combined item/clock/gate save round trip, missing-clock migration, unchanged ticket progress, protocol-6 gate suppression and protocol-7 gate interactions.
