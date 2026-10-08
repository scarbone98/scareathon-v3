# Wayside Fury — playtest round 3 gameplay balance

October 7, 2026. World units and fixed-step rules are independent of display DPR; the existing native-resolution phone/desktop viewport stays unchanged. Art, renderers and UI layout are outside this pass.

| System | Before | Round 3 |
| --- | --- | --- |
| Regular encounters | 3 enemies in small zones; 5–7 in larger zones | Groups of 2 grunts + 1 shooter; 6 / 9 / 12 enemies by zone width; realm 6 |
| Breathing room | Enemies aggro within 230 units | Regular aggro 140; spawns ≥150 from starting position, ≥120 from door bounds; collision-checked, ≥24 apart |
| Grunt / shooter HP | 32 / 24 everywhere | 30 / 24 initially, +6 per two main-path zones; late zones and realm 48 / 42; optional routes 36 / 30 |
| Regular damage | 9 before defense | Retained at 9 with denser groups; defense subtracts half its value, Guard multiplies by 0.25, minimum 1 |
| Player growth / combo | Base Power 12–13, +3/level; combo ×1 / 1.15 / 1.9 | Growth retained; finisher ×1.6 keeps late crowds relevant; Ki blast ×1.5 and signature beams retained |
| Kill XP | Grunt 28; shooter 35; Sentinel 95; Watcher 130 | 12 / 16 / 90 / 160; next-level cost retained at 75 + 45 × (level − 1) |
| Level pacing | Sparse fights, large XP per kill | Level 6 after main-route Watcher; level 6 after realm; both optional routes bring the route to level 7 (before collectible XP) |
| Candy drops / shop | Regular 3–5; boss 35 solo, 35–42 co-op | Regular 2–4, boss unchanged; tonic 8 candy / 55 HP; Power and Ward charms remain 20 candy |
| Healing | Level +30 HP / +15 Ki | Level +18 / +10; first zone clear +12 / +8; caches retain +35 / +20 and 18 / 25 candy; hidden snacks retain +25 HP; recovery never revives a KO |
| Sentinel / Watcher HP | 165 / 260 | 235 / 520; existing co-op HP multipliers retained |
| Boss rush / nova damage | Both bosses 22→28 / 11→15 | Sentinel 18→24 / 9→12; Watcher 26→32 / 14→18, before defense; existing rush/nova telegraphs and 50% enrage retained |
| Ticket score | Included extra boss, collectible and cache credits | **New areas ×1000 + levels gained ×100 + new zone rooms ×50**, deltas only, score capped at 100000 |

Tickets use one calculation for local reports and cloud acknowledgements. Bosses, collectible finds and supply-cache IDs remain saved milestones but add no separate ticket bonus. Receipt unions and the level high-water mark prevent reloads, HOME retries and stale devices from paying old progress again. Server conversion/caps are unchanged. With HOME included, the main route plus realm targets 3950 raw score; both optional zones at level 7 target 4150, before any extra levels from collectibles.

The design merge removes ambient lane traffic and its simulation, collision and co-op snapshot lifecycle. Only player taxis and fixed cars in paved parking bays remain; the gag cab stays in its pullout.

Headless verification: collision/reachability across every map, encounter spacing, entrance idle safety, exact XP pacing, non-revivable/repeat-safe recovery, ticket/cloud/reload deltas, co-op scaling/rewards, and the existing full campaign simulation. The default-stat guarded combat bot clears all ten Blast zones and the realm with 68 kills, level 7, 307 candy and no deaths; Sentinel ~16 seconds and Watcher ~18 seconds. These are deterministic simulation measurements, not browser or human playtest timings.
