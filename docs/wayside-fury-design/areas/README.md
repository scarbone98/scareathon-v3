# Organic areas and walk-in buildings

AREAS slice, October 8, 2026. Default Canvas 2D remains first-class. Optional 3D uses the same county terrain/collision and raised cliff polygons; non-Space interiors and dungeons use the shared 2D renderer, including when `?gfx=3d` is selected. No reference pixels, crops, traces or textures were copied. The reference analysis and read-only Roshi’s Island rip informed only the ideas of irregular boundaries, loops and furnished entered rooms.

The county spine and district roads bend around the landscape. Blast Site, Woods and City paths have diagonal contours, return loops, irregular cliffs/water, and inset stair approaches. All original room IDs, spawn anchors, enemy definitions/positions, exit IDs/targets/arrival coordinates, ability gates and rewards are retained. `baseline-graph.json` freezes the original routing/encounter contract. Existing parked cars and their paved bays remain fixed. Small rooms retain open combat pockets; decorative changes never add an enemy or a level-number door.

Nine buildings now enter their own furnished maps: Wayside Station, Last Light Diner, Scrap Orchard farmhouse, rocket compound office, Ruined Yard tool shed, Old Supply Depot warehouse, Ranger Lay-by cabin, Blackout Boulevard archive and Neon Market cafe. Each has a different palette, furniture arrangement, caretaker and local ledger; caretakers refill the crew. The diner preserves `pickup-c1-diner`, its six candy/15 Ki and one-shot Collection/save receipt. Exterior Chapter 2 diner lore stays at its existing position. Interior doors and return mats use contextual Use; the entrance is away from the mat and a held button cannot bounce back outside. Existing transition fades remain active with reduced-motion support.

The Station’s Chapter 5 survivor rally remains outside, immediately south of the door at `(480,224)`, so its original story action does not make the building inaccessible after Chapter 4.

## Save and party compatibility

This is an additive version-4 checkpoint migration, not a new character-sheet format. Old v1–v4 sheets keep their existing migration behavior. The shared sanitizer recognizes registered interior checkpoint IDs only when their parent chapter is authorized; otherwise it falls back to `hub`. Restore/retry enters the room at its safe spawn. Leaving records the fixed parent door position and returns to the parent’s existing checkpoint policy. No location coordinates, avatar equipment or character progression are fabricated by the migration.

Interior room identities require co-op protocol 6. Protocols 1–5 remain accepted for their existing maps; mixed parties cannot enter interiors. Protocol-6 parties can reach the expanded county farmhouse; older mixed parties keep the frozen original county and its bounds. Host snapshots carry the named interior map; guests follow that map, and host migration retains it. Door checkpoint events publish state without creating reward receipts. Guest saves retain the existing personal-checkpoint policy; reconnect uses the host’s world snapshot.

No ticket allowlist entries were added. Local ledger IDs and `interior-…-door` / `interior-…-lore` radar anchors are small optional content hooks. Chips, relics, fusion, arena, radar UI, quests and day/night were not implemented.

## Visual evidence

`before/` contains 16 phone/desktop screenshots from an isolated snapshot of the committed pre-change source. `after/` contains 52 screenshots: county, Ruined Yard, Ranger Lay-by, Blackout Boulevard and all nine interiors, at 390 × 844 DPR 3 and 1440 × 900 DPR 2, default 2D and optional 3D. Captures are paused native-detail fixtures with reduced motion. The JSON metrics assert backing dimensions and repeated-draw state equality. They do not establish sustained FPS or thermal behavior on physical phones.

| View | Before | After |
| --- | --- | --- |
| Phone county | [Before](before/390x844-2d-overworld.png) | [After](after/390x844-2d-overworld.png) |
| Phone Ruined Yard | [Before](before/390x844-2d-blast-2.png) | [After](after/390x844-2d-blast-2.png) |
| Desktop Woods | [Before](before/1440x900-2d-woods-layby.png) | [After](after/1440x900-2d-woods-layby.png) |
| Desktop City | [Before](before/1440x900-2d-city-boulevard.png) | [After](after/1440x900-2d-city-boulevard.png) |
| County 3D | [Before](before/1440x900-3d-overworld.png) | [After](after/1440x900-3d-overworld.png) |
| Diner | Previous overlay | [Entered room](after/1440x900-2d-interior-diner.png) |
| Warehouse | Exterior only | [Entered room](after/1440x900-2d-interior-warehouse.png) |

Reproduce on Vite port **5218** with `scripts/capture-wayside-fury-areas.mjs before|after`; the before phase must serve an unchanged source snapshot. Use `FURY_BASE_URL`, `FURY_PLAYWRIGHT_MODULE`, optional `FURY_CHROMIUM_PATH`, and `FURY_WEBGL_BACKEND=metal`. Chromium always launches with `--mute-audio`. The separate areas browser check forces unavailable WebGL and exercises keyboard entry, prompt timing, the original diner find, exit/re-entry and reload resume.

## Verification

The area check uses an 8-unit navigation grid with 2-unit swept edges and the actual hero radius. It verifies every exit and door with ability gates solved, every incoming anchor, existing finds, and authored encounters. Nine solo return/save/retry loops and protocol 1–5 exclusion are covered. The dedicated interior co-op check validates snapshots with the server, guest arrival, diner state, host migration and receipt-free checkpoint events.

Passed: `npx tsc -b`, ESLint on all changed source/check scripts, `npm run check:wayside-fury`, and the areas, interiors-coop, collision, roads, dressing, campaign, co-op-sim, co-op-rewards, Woods, City, Space, collectibles and context-attack-unit scripts. Server Jest: **41 suites / 467 tests passed**.

The muted areas browser check passed real keyboard diner entry, held-button debounce, the original collectible, exit/re-entry, save/reload and unavailable-WebGL fallback. All four native-DPR screenshot cases passed. The base starter-stat Chapter 1 playthrough completed all ten zones and the Realm with 68 kills and no deaths.

Correctness review found a guest checkpoint that could remain inside after exiting and then becoming host. The parent checkpoint now replaces it on return; the exit-before-promotion regression passes. Review of that fix and the stale-cache one-shot reward guard found no remaining correctness issues. No Makefile exists in this repository; the explicit checks above are the verification gate.
