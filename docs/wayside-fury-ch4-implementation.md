# CH4 — The Architect's Last Order

Playable Chapter 4 slice on `wayside-fury-CH4`. Enter the existing Old City marker after `space-complete`. The Chapter 3 return trip already grants this milestone. Chapter 1 geometry and save migrations remain unchanged.

The connected route is Blackout Boulevard → Neon Market → Clockroof Walk → Ticket Hall → Rat Cable Run → Transformer Floor → Switchmaster Booth → Backstage Platform → Old Escape Door → Delivery Floor → Shell Press → Incubator Gallery → Control Balcony workshop → Hatching Chamber → Survivor Refuge → Wayside. The Switchmaster restores the market supply stall, warm windows and a two-way Exchange shortcut. Return paths remain available during encounters. Boulevard, Market, Balcony and Refuge are safe refill/checkpoints; their HOME panel supports party changes.

Jon assists any active hero at three Night Anchors. These persist as solved interactions and unlock routes without a level requirement or an equipped/downed Jon dependency. His timed Guard deflects marked Switchmaster shots; the floor switch also accepts Interact or an ordinary Ki shot. Turnstile shields protect the front, Cable Rats dash between marked outlets, Neon Imps bank once at a visible marker, and Clockroof Werewolves bound toward a warned landing circle. Both bosses scale from party power, have poise/break-out bursts and change patterns at half health. The Architect alternates mixed summons and portal sweeps, relocates among arena positions, and introduces a broken-sigil decoy in phase two. Relay interruptions create ordinary-combat exposure windows.

After defeating the Architect, holding the marked evacuation shutter completes the chapter before the readable, manually advanced scene. The Creation snaps his staff and erases him in portal light without graphic violence. All four crew members and the player's avatar appear in a screen-space foreground composition. Reload resumes at the safe refuge; returning home presents the Chapter 5 shelter-rally objective. Haywire Junction implementation belongs to Chapter 5.

All City maps use shared native-DPR Canvas presentation, including when `?gfx=3d` is selected. Native curves, material gradients, windows, cable bundles, puddle reflections and explicit attack shapes supplement existing art. The two-room realm connector changes palette without changing render resolution. Update 1 systems are not implemented or required. `CITY_HOOKS` exports optional reward/recorded-echo IDs and radar IDs, and map definitions carry visible anchors.

Persistence uses the existing explicit v1/v2 → five-hero and v3 → v4 migrations; no schema-version bump is needed. New safe checkpoints use registered map IDs. City tickets remain **zero** until an explicit budget is added to `CHAPTER_REWARDS`; no prefix-based awards were introduced. Room clears and completion are idempotent. Co-op protocol 4/content 3 register City while accepting older clients for compatible maps. Older clients cannot travel, join or rejoin into City. Guest relay/anchor requests use the bounded hit envelope and are validated by the host against the actor, map and recorded launch trajectory; receipts dedupe requests. City rewards use distinct entry/rest/anchor/completion checkpoint IDs and never copy the host's Space prerequisites to a visiting guest.

This is a condensed playable content/combat/integration slice, not acceptance of the proposed 45–60-minute chapter or sustained real-phone FPS/thermal targets. Automated starter-gear bots at levels 1 and 12 cleared the authored route without deaths; combat took roughly six minutes plus travel and dialogue. Larger bespoke film artwork and actual-device testing remain outside the evidence from this run. The chapter plan, including section 11, is unchanged.

Reproduce:

- `npx tsc -b`
- ESLint on changed TypeScript/JavaScript and City scripts
- `npm run check:wayside-fury`
- `node scripts/check-wayside-fury-city.mjs`
- `node scripts/check-wayside-fury-campaign.mjs`
- `node scripts/check-wayside-fury-space.mjs`
- `node scripts/check-wayside-fury-coop-sim.mjs`
- `node scripts/check-wayside-fury-coop-rewards.mjs`
- `cd server && npx jest --forceExit`
- `FURY_BASE_URL=http://127.0.0.1:5214 node scripts/check-wayside-fury-city-browser.mjs` (uses `--mute-audio`; `FURY_PLAYWRIGHT_MODULE` / `PLAYWRIGHT_BROWSERS_PATH` may point to an installed Playwright runtime)

The commands above passed. Server Jest passed 40 suites / 462 tests. Review has no remaining findings after fixing guest relay authority, checkpoint receipt deduplication and local guest handoff dialogue.

The City browser script checks 390 × 844 at DPR 3 and 1440 × 900 at DPR 2, both renderer choices, repeated-render state immutability, and unavailable-WebGL fallback. Captures/metrics default to `/private/tmp/fury-ch4-shots`; the final verified matrix is in `/private/tmp/fury-ch4-final-shots`. These are emulation evidence, not sustained-device performance measurements.


## Design branch merge — October 8, 2026

Merged `origin/wayside-fury-design` into `wayside-fury-CH4`, retaining the playable Woods route, charged melee/Normal-Hard combat, native Space presentation and County Cruiser alongside every City map, enemy, Night Anchor, restoration state and five-person Architect scene. Combined routing and checkpoint/retry migrations support Woods → Space → City. Both Woods and City use native-DPR shared Canvas when the optional 3D preference is selected. Update 1 remains absent; optional content hooks and the allowlisted ticket budget are unchanged.

The two source branches independently used protocol 4/content 3 for different maps. The combined client now advertises protocol 5/content 4. The server still accepts protocol 4/content 3 for compatible legacy/Space areas, but blocks Woods/City travel and joining for those older clients. A room-manager regression covers both cases. City keeps its own poise, phase changes and authored breakout movement; the incoming generic Chapter 1/Moon burst handler must not consume City bursts. The Woods browser harness now waits for chapter HUD layout and ResizeObserver before sampling native canvas dimensions, preserving its original DPR assertions.

City starter-gear combat passed at levels 1 and 12. The muted City matrix passed 390 × 844 DPR 3 and 1440 × 900 DPR 2 in both graphics preferences, including unavailable-WebGL fallback and repeated-draw state equality. Captures are in `/private/tmp/fury-ch4-merge-shots`. The first default-worker server run timed out in unrelated socket/casino tests under host contention; the full rerun with `--runInBand --testTimeout=30000` passed **40 suites / 464 tests**. These remain emulation and automated combat evidence; sustained real-phone performance is unmeasured. The chapter plan and section 11 were not edited.
