# Wayside Fury — Buu’s Fury reference analysis

Measured 2026-10-08 against Wayside Fury checkout `2c5b9d0` on `wayside-fury-chapters`. This is a reference study and an implementation specification, not a game change. Read alongside [the chapter plan](wayside-fury-chapters-plan.md) and [the design review](wayside-fury-design-review.md).

**The main gap is the composition and sequence of places, not simply the number of square units.** Our county is already 1,920 × 960 units. Chapter 1’s ten Blast Site maps together occupy about 90 GBA-screen equivalents, comparable to or larger than the mapped panels of an individual reference destination. However, our walking routes frequently show zero to two props per comparison window, use the same straight corridor, and reveal little new geography. Buu’s Fury frames routes with substantial scenery, changes direction and elevation, connects settlements to interiors and wilderness, and puts a separate flight world above those local maps. Increasing our rectangle alone would make the problem worse.

All nine supplied files were opened read-only from `~/hark-work/fury-ref/`. No reference image, crop, extracted tile, traced shape, recolor, texture, or derived image was saved into the repository or used as Wayside art. Only measurements and written observations belong in this deliverable. Future artists should work from the original Wayside descriptions below, not these map layouts.

## 1. Measurement rules and confidence

- **H** means one reference/named-hero height: 24 native pixels in the reference, 24 world units for our unsuited named heroes. The reference hero is approximately 16 × 24 pixels; a tile is 16 × 16. Thus a GBA viewport, 240 × 160, is 15 × 10 tiles or 10 × 6.67 H. This is a comparison window, never a proposed render buffer.
- **Screen-equivalent area**, S, is area / 38,400. It is not a room count, a count of camera stops, or a traversal time. A 480 × 320 room is 4 S even if the camera scrolls continuously.
- **Exact:** PIL image dimensions; current generated map dimensions, props, exits and pickup registries. **Approximate:** reference panel selection/deduplication and visual density bands. **Unknown:** collision, live NPC populations and complete hidden-item counts absent from the rips. Unknown does not mean zero.
- The rips are **atlases**, with mint backgrounds, credits, detached foregrounds, sprite examples, and sometimes alternate states. Their outer bounding boxes are not playable map dimensions. PIL/NumPy row runs located large rectangular panels; visual inspection removed obvious labels, samples and duplicate states. Green-sheet panel borders generally add two pixels to the underlying tile dimensions. Black margins inside interior panels remain in panel-area totals. These totals describe mapped presentation space, not walkable floor.
- A **prop instance** is a separable tree, rock, bench, machine, etc.; repeated trees count individually. A flower patch counts once, not once per flower. Continuous cliff/water/hedge edges count as dressing coverage, not hundreds of props. A **cluster** is several related objects read together. A **landmark** changes navigation or scene identity; another identical tree is not a new landmark.
- Reference density values below are visual estimates over route/edge windows, not an automated object census. Expect approximately ±30% in prop/cluster estimates and ±10 percentage points in visual coverage. Reproducible exact current-code counts are kept separate. No reference walking speed was timed; distances are reported in H, and any seconds are explicitly Wayside-speed equivalents or future targets.

## 2. Reference dimensions: atlas versus area

Outer file dimensions are exact. Tile/H dimensions below are arithmetic divisions, so fractional values usually expose atlas padding rather than fractional game tiles.

| Reference / supplied asset ID | File pixels W × H | Atlas tile spans | Atlas hero-height spans | Atlas S, **not playable area** |
| --- | ---: | ---: | ---: | ---: |
| Southwest Forest / 274117 | 2407 × 4009 | 150.44 × 250.56 | 100.29 × 167.04 | 251.3 |
| Fukurou Forest / 274116 | 2101 × 4126 | 131.31 × 257.88 | 87.54 × 171.92 | 225.7 |
| West City / 54086 | 1892 × 2276 | 118.25 × 142.25 | 78.83 × 94.83 | 112.1 |
| Hercule City / 54227 | 2228 × 2176 | 139.25 × 136.00 | 92.83 × 90.67 | 126.3 |
| East District 439 / 53873 | 3856 × 2464 | 241.00 × 154.00 | 160.67 × 102.67 | 247.4 |
| Diablo Desert / 503338 | 2447 × 1805 | 152.94 × 112.81 | 101.96 × 75.21 | 115.0 |
| Nataday Village / 223507 | 2316 × 2755 | 144.75 × 172.19 | 96.50 × 114.79 | 166.2 |
| Roshi’s Island / 54382 | 1100 × 748 | 68.75 × 46.75 | 45.83 × 31.17 | 21.4 |
| Papaya Island / supplied filename | 1222 × 1972 | 76.38 × 123.25 | 50.92 × 82.17 | 62.8 |

The following panel measurements are more useful for production. Dimensions describe representative local spaces; total area is the sum of selected panels, never the atlas rectangle. Rounded totals deliberately avoid implying a collision-map census.

| Destination | Representative actual panel: pixels → tiles → H | Selected mapped area | What the count includes / excludes |
| --- | --- | ---: | --- |
| Southwest Forest | Main clearing 560 × 560 → 35 × 35 → 23.3 × 23.3; connecting strips 240 × 400 → 15 × 25 → 10 × 16.7 | About 11,150 tiles / 74 S across 19 panels | Forest, cliff and upper ship/crater panels; detached background/foreground excluded. Upper panels include story-state geography, so **74 S is an upper bound on unique space**, not one continuous forest rectangle. |
| Fukurou Forest | Large junction 480 × 480 → 30 × 30 → 20 × 20; bridge 320 × 160 → 20 × 10 → 13.3 × 6.7 | About 10,200 tiles / 68 S across 24 panels | Approach, giant-tree stronghold, bridges/stairs and boss branch. Detached foreground and leaf-shadow sample excluded. |
| West City | Main exterior 880 × 720 → 55 × 45 → 36.7 × 30; atrium 720 × 640 → 45 × 40 → 30 × 26.7 | 8,275 tiles / 55.2 S across 11 panels | Exterior, Capsule grounds and interiors. Detached fountain frames, ship and small sprite samples excluded. Main exterior alone is 16.5 S. |
| Hercule City | Street panel 640 × 320 → 40 × 20 → 26.7 × 13.3; running track 480 × 400 → 30 × 25 → 20 × 16.7 | About 7,125 tiles / 47.5 S across 15 panels | City/circus segments, school/track, mansion and one café state. Two alternate café interiors excluded. |
| East District 439 | Home/river panel 480 × 480 → 30 × 30 → 20 × 20; woods strip 240 × 480 → 15 × 30 → 10 × 20 | About 11,350 tiles / 75.7 S across 30 panels/groups | House interior group, home grounds, forest branches, hut and coast. Interior-group black padding remains; doorway/sprite samples excluded. |
| Diablo Desert | Each desert cell 480 × 320 → 30 × 20 → 20 × 13.3 | Desert alone 9,600 tiles / 64 S; with four train-interior panels 12,000 tiles / 80 S | Sixteen desert cells. Train exterior/roof strips and scenery samples excluded from this conservative subtotal; interior black margins remain. |
| Nataday + Northern Wilderness | Village 800 × 720 → 50 × 45 → 33.3 × 30; wilderness panels commonly 320 × 320 → 20 × 20 → 13.3 × 13.3 | 9,450 tiles / 63 S across 19 panels | Village, one hut interior and wilderness river detour. Village alone 15 S. Volcano is a further area, not included in this rip. |
| Roshi’s Island | Exterior 720 × 640 → 45 × 40 → 30 × 26.7 | 2,425 tiles / 16.2 S across 3 panels | Exterior 12 S plus 240 × 240 and 320 × 320 interiors. Exterior includes surrounding water. |
| Papaya Island | Exterior strip approximately 480 × 1600 → 30 × 100 → 20 × 66.7; stadium 720 × 720 → 45 × 45 → 30 × 30 | About 5,900 tiles / 39 S | Exterior, waiting/changing rooms and one stadium state. Alternate damaged stadium and effect/sprite strip excluded. |

Panel-location audit examples, in original file coordinates `(x,y,w,h)`: Roshi exterior `(23,20,720,640)`; West City exterior `(30,1523,880,720)` and atrium `(800,351,720,640)`; East District home grounds `(378,983,480,480)`; Nataday village art approximately `(248,2032,800,720)`; Southwest main clearing approximately `(932,2640,560,560)`. Small offsets on mint-bordered sheets are border corrections, not world coordinates.

## 3. What creates the reference’s density

The ranges below distinguish objects from continuous edge treatment. They summarize visual inspection of the supplied sheets; they are not claimed exact game-wide averages. Sample coordinates identify 240 × 160 inspection windows within the original sheets. Adjacent windows and full panels supply context for path width and cadence.

| Reference / sample window top-left | Prop instances / S; visual families | Clusters / S | Typical clear route width | Open ground : dressing, visual estimate | New spatial motif along route |
| --- | --- | --- | --- | --- | --- |
| Southwest Forest `(1100,2700)`, `(1100,3700)` | 8–16; 4–6 | 2–4 | 3–6 tiles / 2–4 H; clearings much wider | 45–60 : 55–40 | About 8–16 H: stump island, fork, cliff, stair or clearing |
| Fukurou `(760,950)`, `(730,2020)` | 3–8 large masses; 3–5 | 1–3 | 3–5 tiles / 2–3.3 H on stairs/bridges | 35–55 : 65–45 | About 10–20 H: stair-to-bridge, giant trunk, junction, door |
| West City `(120,1900)`, `(360,1760)` | 4–10; 3–6 | 1–3 | 3–6 tiles / 2–4 H for walks; broader streets | 45–65 : 55–35 | About 8–16 H: storefront, crossing, park or courtyard |
| Hercule City `(620,1570)`, `(90,1250)` | 5–12; 3–6 | 2–4 | 4–7 tiles / 2.7–4.7 H | 40–60 : 60–40 | About 8–20 H; circus wall is a sustained large landmark |
| East District `(410,1200)`, `(1320,1660)` | 8–16; 4–6 | 2–4 | 2–5 tiles / 1.3–3.3 H; wider fight pockets | 40–60 : 60–40 | About 8–18 H: bridge, mesa, hut path, rock barrier, beach |
| Diablo `(600,900)`, `(1500,1200)` | 4–10; 3–5 | 1–3 | 6–12 tiles / 4–8 H in open desert | 65–80 : 35–20 | About 12–24 H: bone bed, cactus patch, mesa or rock ring |
| Nataday `(300,2180)`, `(490,420)` | 8–16; 4–7 | 2–4 | 3–6 tiles / 2–4 H | 40–60 : 60–40 | About 8–18 H: crops/well, river bend, broken bridge, terraces |
| Roshi `(200,260)`, `(440,380)` | 2–6 large props; 2–4 | 1–2 | Beach approximately 3–6 tiles / 2–4 H | 60–75 : 40–25, excluding sea | House/yard props about 6–12 H apart; shoreline supplies continuous detail |
| Papaya `(760,700)`, `(760,950)` | 5–10; 3–5 | 1–3 | 6–10 tiles / 4–6.7 H on promenade | 50–70 : 50–30 | About 8–16 H: kiosk, planted island, gate, arrival craft |

These are distances, not measured GBA seconds. At our unbuffed walk speed of 70 units/s, 8–18 H corresponds to **2.7–6.2 seconds**; at our taxi’s 160 units/s it is only **1.2–2.7 seconds**. Author county cadence for the taxi, and local-area cadence for walking.

The strongest transferable lessons:

1. **Edges do most of the work.** Forest crowns overlap into irregular continuous masses, typically several tiles deep; trunks, roots, flowers and shadows establish a second scale. They do not read as a single evenly spaced row. Reference large crowns commonly span roughly 2–3 H; our common tree bounds are 24 × 32 units, only 1 × 1.33 H.
2. **Open ground is composed.** The walkable center stays relatively quiet while paths taper, fork and bend around dressing. A broad empty combat pocket can still feel rich when every edge has a purpose. Do not fill attack lanes with high-contrast grass speckles to meet a prop quota.
3. **Height is visible before it is interactive.** Cliffs have a top lip, vertical face, bottom rubble and an explicit ramp/stair. Fukurou’s bridges reveal architecture below; huge trunks pass through several layers. Water has irregular banks, foam and stones, not merely a differently colored rectangle.
4. **Objects tell a local story.** Nataday’s well/crops/crates form a village; Papaya’s successive kiosks and gates make an approach; West City moves from streets to grounds to laboratories. A sign, bin, cable and puddle next to one diner are more convincing than four unrelated objects evenly scattered across grass.
5. **Large silhouettes and small detail coexist.** Roshi’s Island has few major objects, yet the roof, irregular coast, grass edge, palms and furnished interiors make it feel complete. Prop count alone would wrongly rate it as poor.
6. **Layering needs a gameplay policy.** Wayside should retain precise base collisions and Y sorting, add separate foreground canopy/roof layers, and fade occluders over heroes, interactables and telegraphs. Shared footprints must remain identical across renderers.

## 4. Interactables, NPCs, secrets and area chains

Background rips generally omit runtime actors, chest overlays and scripts. A visible house is not proof every door works, and stadium spectators are background dressing, not hundreds of NPCs. The inventory below is a **minimum evidence inventory**, not a complete collectible guide. “Unknown” is deliberate; invented totals would distort the comparison.

| Area | Visible interaction/navigation anchors | NPC evidence / count limit | Secrets or optional content supported by evidence | Chain structure |
| --- | --- | --- | --- | --- |
| Southwest Forest | Upper ship/crater destinations, stair, two main branch directions, gated-looking transitions; interaction flags unknown | Detached character examples are not placements; population unknown | At least two optional rewards documented: Yajirobe exhibit and Armor of Darkness | Landing approach → branching forest → cliffs/ship; later revisit changes access |
| Fukurou Forest | Entry circle, save-like circle near upper trunk, stronghold entrance, locked boss door and key branch | At least one postgame exchange ninja; combat actors are not NPCs | At least two optional exhibits; key detour and boss reward are main progression | Approach → elevated loop → key spur → return to boss door |
| West City | Eleven major panels; park save-like circle, storefront and Capsule entrance; furnished labs/museum | Scientist interaction documented, but total population unknown | At least two optional exhibit interactions documented | Streets → Capsule grounds → atrium/labs/museum; small interiors expand one destination |
| Hercule City | School/track, circus frontage, bank/shop/café/mansion facades, two visible save-like circles | Mayor and Videl appear in the story; total persistent population unknown | School race is at least one optional reward activity | Several street segments with distinct services and entered interiors |
| East District 439 | Two visible save-like circles, house rooms, hut, bridge, coast/dock, blocked branches | Household population varies by chapter; rip cannot count it | At least one optional toy-box exhibit documented | Home → river crossing → branching forest → hut/coastal detours |
| Diablo Desert | Four-by-four desert panel arrangement; rock ring, stairs, train roof/interiors | Guide confirms train passengers, not an exact count | At least one equipment chest and one exhibit; switches provide progression | Desert navigation → raised ledge → train roof → carriage interiors |
| Nataday / Northern Wilderness | Four huts drawn, one supplied interior, well/crops, gate, broken bridge and river loop | At least two roles in guide: priest and gate guard | Main reward follows the Volcano excursion; wilderness secret total unknown, Volcano rewards excluded here | Village → wilderness → long river detour → Volcano → village return |
| Roshi’s Island | Two distinct circle graphics, house doorway, dock; two furnished interiors | Characters absent from background; total unknown | Dock supports fishing according to public guide; fixed-secret total unknown | Flight arrival → island yard → house rooms; compact rest destination |
| Papaya Island | Three named kiosks, successive gates, transport apron, waiting/changing rooms, stadium | Crowd is baked scenery; live population unknown | Purchasable exhibits documented; exact count not established here | Arrival coast → vendor promenade → gate/registration → tournament space |

Guide support for these minimums: [SOng’s Southwest revisit notes](https://www.neoseeker.com/dbz-buus-fury/faqs/144608-dragon-ball-z-buus-fury-d.html), [Tom Hayes’s walkthrough and exhibit list](https://www.supercheats.com/gameboyadvance/walkthroughs/dragonballzbuusfury-walkthrough05.txt), [contemporary exhibit tips](https://www.gamekult.com/forum/t/tout-sur-dragon-ball-z-buus-furys/75317), [Hercule story transcript in the walkthrough](https://www.neoseeker.com/dbz-buus-fury/faqs/86203-dragon-ball-z-buus-fury.html), and [fishing/location guide](https://www.geocities.ws/magnusdc/Guia_DBZ_Buu_s_Fury.html). Guide character/level instructions sometimes conflict; none are imported into our progression design.

The structural lesson is **world flight → distinct destination → several connected local places → useful return**, rather than one immense ground map. Adjoining rectangles on an atlas alone do not prove an in-game exit. The forest loop, key-return and wilderness-to-Volcano chains are supported by guides; precise exit graphs were not reverse-engineered from ROM data.

## 5. Wayside’s measured baseline

Sources: [world.ts](../src/pages/WaysideFury/game/world.ts), [worldBuilder.ts](../src/pages/WaysideFury/game/worldBuilder.ts), [dressing.ts](../src/pages/WaysideFury/game/dressing.ts), [content.ts](../src/pages/WaysideFury/game/content.ts), [render.ts](../src/pages/WaysideFury/game/render.ts), [viewport.ts](../src/pages/WaysideFury/game/viewport.ts), [sim.ts](../src/pages/WaysideFury/game/sim.ts), and the [shared collectible manifest](../server/shared/waysideFury/collectibles.js). Generated exports were evaluated with Node; no source edits were needed.

**Hero-scale caveat:** named heroes draw at 16 × 24 world units; loaded `you` uses `avatarStrip` at 32 × 48. Before that avatar loads, it falls back to Joe. Thus a map has half the linear hero-height span for the loaded avatar. Overworld play draws a taxi, not an on-foot hero; H below is a common comparison ruler, not the taxi’s size. Source-atlas resolution, rendered world size and physical display pixels must remain separate.

“Interior props” excludes props at `x < 32`, `y < 32`, `x >= width−32`, or `y >= height−40`, isolating the repetitive boundary belt. It is a coordinate filter, not an assertion that every remaining prop was hand-placed. Open percentages sample `isBlocked(..., radius=0)` on an 8-unit grid. They describe point collision, not clearance for an actual hero. Visual dressing is separately approximated by the union of prop rectangles on the same grid; terrain texture and shadows are excluded.

| Map | Units / tiles W × H | H spans: named hero; loaded You | S | Props total / interior | Point-open floor | Prop-rectangle coverage |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| County overworld | 1920 × 960 / 120 × 60 | 80 × 40; 40 × 20 | 48.0 | 433 / 257 | 84.3% | 16.6% |
| Wayside hub | 960 × 544 / 60 × 34 | 40 × 22.7; 20 × 11.3 | 13.6 | 145 / 55 | 72.9% | 26.1% |
| blast-0 Scorched Road | 640 × 384 / 40 × 24 | 26.7 × 16; 13.3 × 8 | 6.4 | 56 / 4 | 77.4% | 16.5% |
| blast-1 Split Creek | 960 × 544 / 60 × 34 | 40 × 22.7; 20 × 11.3 | 13.6 | 97 / 16 | 79.1% | 13.2% |
| blast-2 Ruined Yard | 640 × 384 / 40 × 24 | 26.7 × 16; 13.3 × 8 | 6.4 | 57 / 5 | 75.0% | 20.4% |
| blast-3 Furnace Pass | 1280 × 544 / 80 × 34 | 53.3 × 22.7; 26.7 × 11.3 | 18.1 | 133 / 32 | 78.9% | 12.5% |
| blast-4 Sentinel Gate | 640 × 384 / 40 × 24 | 26.7 × 16; 13.3 × 8 | 6.4 | 59 / 7 | 77.3% | 17.3% |
| blast-5 Shattered Courtyard | 960 × 544 / 60 × 34 | 40 × 22.7; 20 × 11.3 | 13.6 | 107 / 23 | 82.0% | 15.4% |
| blast-6 Rift Approach | 640 × 384 / 40 × 24 | 26.7 × 16; 13.3 × 8 | 6.4 | 55 / 3 | 75.1% | 25.4% |
| blast-7 Watcher’s Hollow | 640 × 384 / 40 × 24 | 26.7 × 16; 13.3 × 8 | 6.4 | 56 / 4 | 75.1% | 25.8% |
| blast-8 Ash Orchard | 640 × 384 / 40 × 24 | 26.7 × 16; 13.3 × 8 | 6.4 | 64 / 7 | 75.5% | 18.9% |
| blast-9 Old Supply Depot | 640 × 384 / 40 × 24 | 26.7 × 16; 13.3 × 8 | 6.4 | 64 / 6 | 73.1% | 22.2% |
| realm-0 coda | 640 × 384 / 40 × 24 | 26.7 × 16; 13.3 × 8 | 6.4 | 56 / 0 | 76.3% | 17.4% |

Ten Blast maps total **3,461,120 square units = 13,520 tiles = 90.1 S**, with 748 props but only 107 outside the boundary belt. Adding the coda gives 96.5 S. The coda’s authored portal is removed by the overlapping exit’s prop filtering; the final generated prop list has only boundary pines. This is an observation of the current export, not a fix in this session.

### Density where the player actually travels

The county’s 433 props include 220 trees and 146 flower patches: **84.5% are those two kinds**. Most are outside the road corridor. Seven birds and the single 3.5-second taxi gag from `dressing.ts` add motion, not additional permanent destinations. Large props can occupy much of a window; count them once even when clipped.

For comparison windows centered on `(x,480)`, count any prop rectangle intersecting `x±120, y±80`:

| County x | 208 | 400 | 656 | 800 | 1088 | 1280 | 1456 | 1680 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Props / S | 5 | 12 | 12 | 10 | 5 | 4 | 4 | 2 |

The diner-heavy region already meets a reasonable count; its composition can improve. The eastern road needs authored clusters. These counts exclude renderer-only destination miniature parts in `zonePreviews.ts`, terrain grain, birds and labels. Counting every window or cone of a miniature as a prop would inflate the comparison. They also do not imply identical final pixel coverage in 3D.

Blast-route windows centered at `y=spawn.y`, with x every 120 units from 120 through `width−120`, have **0–2 props in most samples**. Scorched Road is `[2,0,0,0]`; Furnace Pass is `[2,0,0,0,0,0,0,0,0]`; Ruined Yard is `[2,0,2,2]`. Boss crater rooms are mostly 1–3. Orchard entrance reaches 7, then falls to 0–1. This happens because `scatter()` rejects the whole `abs(y−spawn.y)<80` band, while many solid candidates also fail generous ground/clearance tests. The central dirt lane itself is 128 units / 8 tiles / 5.33 H wide. County roads are 64 units / 4 tiles / 2.67 H wide. Forest references often have narrower paths inside **much larger framing masses**.

### Useful things and route shape

| Wayside area | Interaction/NPC inventory | Personal finds on these maps | Route structure and cadence |
| --- | --- | --- | --- |
| County | 5 destination markers, of which Wayside/Blast are initially open; roadside sign and diner entry; no `npc` props | 6 Chapter-1 finds + 3 Chapter-2 finds | One long east–west road and short spurs. Station→cab→diner→Woods turn→Blast turn→launch; few alternate ways to arrive. |
| Hub | 7 `HUB_POINTS`, including 2 talk NPCs, Alex/Jon; other points provide services/story/return | 3 Chapter-1 + 2 Chapter-2 finds | One east–west road and a north–south path; buildings largely provide interaction menus/dialogue rather than reference-style entered room chains. |
| Blast Site | 2 supply chests, 1 scout NPC, 2 boss encounters; 62 authored enemy spawn entries including bosses | 8 Chapter-1 + 3 Chapter-2 finds | Eight-room main chain, two single-return side branches, no reconverging side loop. |
| Realm coda | 1 exit, no NPC/chest props; 6 enemy spawns | 8 Chapter-2-gated finds | One short return-to-hub coda. Its gated finds are not all available on the first entry. |

Do not add the NPCs to the interaction-point total again. Personal pickups, supply chests and navigation exits are separate categories. Vending/wreck/tree finds are pickup interactions, not a new general quest system.

At 70 units/s, a small Blast room’s x=56→592 travel is **7.7 seconds before combat**; Furnace Pass is approximately **16.8 seconds**. The eight-room main route plus coda is roughly **87 seconds of straight horizontal displacement**, excluding fighting, detours, turnbacks and transitions. On the county, station x=208→Blast branch x=1088 is 5.5 seconds at taxi cruise, and station→launch branch x=1584 is 8.6 seconds, before acceleration/branch approach. A physically large rectangle can therefore feel like a tiny transport corridor.

Our 2D viewport also changes perception. `getRenderViewport(390,844,3)` shows approximately **130 × 281.3 world units**: only 5.42 named-hero heights across, or 2.71 loaded-avatar heights. At 1440 × 900 DPR 2 it shows 360 × 225, or 15 × 9.38 H. HUD/dock occlusion reduces useful sight further. The reference has 10 H across its landscape screen. Native DPR supplies detail; it does not widen the visible world. Treat framing and avatar scale as separate design decisions.

## 6. Gap comparison and concrete targets

These are proposed acceptance targets for original Wayside work, not claims that the reference was timed in an emulator. Preserve existing coordinates and IDs when expanding. A density pass should precede a size increase.

| Dimension | Reference evidence | Wayside now | Target |
| --- | --- | --- | --- |
| Local scale | Roshi exterior 30 × 26.7 H; West City 36.7 × 30 H; village 33.3 × 30 H; forests are connected panels | Hub 40 × 22.7 H; small Blast room 26.7 × 16 H; county 80 × 40 H | Keep current county initially. After dressing, optional expansion to **96 × 64 H / 2304 × 1536 units** with actual districts/loops. New local hubs approximately **32–48 × 24–32 H**, partitioned when useful. No blanket doubling of Chapter 1. |
| Exploration distance | Turns, doors, bridges and return paths stretch useful traversal beyond each room’s diagonal | Short straight corridor traversal | New multi-room destination: **180–260 H of meaningful main-route walking** (62–89 s at 70), plus combat/story and a **40–80 H optional reconverging loop**. Size by route length, not empty acreage. |
| County route variety | Global travel separates distinct local destinations | One trunk road | **3 recognizable districts, 2 reconverging county loops, 6–8 memorable large landmarks**. Full optional driving tour **45–75 s at cruise** (7200–12000 units of cumulative routes), while direct story trips stay **8–15 s**. No forced scenic laps. |
| Route-side density | Roughly 8–16 instances/S in forest windows; fewer large masses can suffice | Blast commonly 0–2; east county 2–4; diner 10–12 | **10–18 instances/S**, **4–6 visual families**, **2–4 clusters/S** on dressed walking routes; county stop/road samples **8–14**. Quiet combat centers can be **3–6**, with rich edges. Aim for at least 8 in 80% of non-arena route samples. |
| Visual coverage | Typically 35–60% framing/dressing in forest/city route views | County prop bounds 16.6%; Blast bounds 12.5–25.8%, not including terrain | **30–45% visual dressing** in travel views; **45–65% at forest edges**. Measure rendered coverage including terrain edges, not collision or prop rectangles alone. Keep the center readable. |
| Cadence | Spatial motif typically every 8–20 H | Repeated same corridor; no guaranteed authored beat | Small cluster reveal every **2–3 s walking**; substantial route/landmark change every **4–6 s** (280–420 units / 11.7–17.5 H). Taxi landmark every **4–6 s** (640–960 units), with smaller roadside cues every **1–2 s**. |
| Path width | Often 2–4 H with open pockets | Dirt combat band 5.33 H; county 2.67 H | Walking links **2.5–4 H / 60–96 units**, four-player combat pockets **12–18 × 10–14 H** clear; bosses at least **16 × 12 H / 384 × 288**. Preserve taxi lanes and passing/revive clearances. |
| Edges/layers | Canopy/root/shadow; cliff lip/face/rubble; bank/water/foam | Rectangular terrain regions and regularly spaced boundary trees | Each district gets **3 readable depth layers** and at least **2 original edge treatments**. Large crowns **2–3 H** where appropriate, with small solid bases and occlusion fading. |
| Useful discoveries | Services, key spurs, secret rewards, interiors, revisit changes | County/hub already contain numerous pickups, but few entered local places | Per new local destination: **3–5 optional finds, 2–4 talkable roles, 2–3 useful services/story interactions**, and **1–2 entered spaces or meaningful branches**. Existing candy/lore/collectible contracts suffice. No ticket increase implied. |
| Framing | 10 H horizontal reference span | 5.42 H portrait for named hero; 2.71 for loaded You | Prototype **7–10 H of usable horizontal awareness** on portrait routes and **12–16 H** desktop; unify logical actor scale across all five identities before judging map size. Preserve avatar detail, wardrobe and collision semantics. Native DPR remains independent. |

An original county composition could use a **station rain garden and luggage yard**, a **reservoir causeway with maintenance pullouts**, and a **scrap-orchard road to the launch compound**. Give each a silhouette, material palette, local prop vocabulary and sound/motion cue. A luggage cart, bent timetable, lunch bench and drainage grate form one station cluster. A broken sprinkler, riprap bank and service hut form a reservoir cluster. These are new Wayside scenes, not arrangements translated from the reference.

Do not make progress depend on these optional counts. Chapters remain playable without chips, relics, fusion, arena, radar, quests or day/night. Maintain small optional reward-ID/radar-anchor hooks; missing adapters do nothing. Chapter order stays Woods → Space → City → Finale, the Architect’s defeat remains non-graphic, and You is the fifth foreground participant. This document does not change the plan’s section 11.

## 7. What Buu’s Fury’s world map does

The remembered presentation is a miniature curved world moving beneath a flying character: turning changes the landscape’s orientation, altitude changes its apparent scale, and descent reconnects it to a local place. **Curvature/rotating-globe appearance is a visual-memory description, not verified evidence of a particular spherical projection or GBA rendering algorithm.** No world-flight screenshot/video was among the nine supplied maps. The public sources found establish navigation behavior, not the exact globe mathematics. Build the requested visual effect explicitly in Wayside rather than assuming an undocumented implementation.

World Map Circles launch the character into flight. Separate Flight Circles connect local places. The directional pad moves/turns; A descends and lands, B ascends. A place name appears over accessible destinations; stars on the mini-map indicate key areas, while other places invite exploration. Contact with a roaming white airship or blue submarine enters a separate encounter/treasure area; flight itself is not ordinary continuous combat. The later Dragon Radar supplies directional arrows that change from purple toward red near a Dragon Ball area. It guides area discovery rather than exposing every local chest. [SOng, controls and flight tutorial](https://gamefaqs.gamespot.com/gba/920530-dragon-ball-z-buus-fury/faqs/37901)

The important distinction is between **randomly encountered roaming craft** and the **authored, multi-floor story Airship**. Wayside can use the first idea for optional interceptions without turning every travel leg into a mandatory dungeon or confusing it with Chapter 3’s rocket journey.

## 8. Original globe mode specification: County Cruiser

### Player experience

The existing taxi gains a playful travel presentation: wheels fold under, a small station-sign propeller starts, and it skims over a curved miniature Earth. The crew occupies the cabin; arrival/boarding shots show Joe, Matt, Alex, Jon and You, with the avatar’s identity preserved. A van can use the same rules later. No copied continents, destination layout, circle graphics, fonts, craft silhouettes or Dragon Ball iconography.

Keep two scales: **the existing county/local gameplay maps**, and **globe travel between region anchors**. The globe does not replace the diner, cab wreck, existing finds, county roads or Chapter 1 entrances. Offer “County roads” and “World route” at the taxi stop. Nearby county stops can still be reached normally. The Moon remains reached through the enclosed launch compound and rocket films; the taxi cannot bypass suits, the rocket or chapter abilities.

One complete travel interaction:

1. At a safe taxi stop, choose World route. Show a 1–1.5 s lift/zoom with the origin still recognizable. Controls are available as soon as lift completes.
2. Steer with stick/WASD/touch drag; vehicle stays near the lower-middle focus while the globe rolls beneath it. Left/right turns smoothly; up/down controls travel speed rather than adding mandatory altitude micromanagement. A modest automatic climb gives visibility. Brake remains available.
3. Original glowing pins identify regions. Shape/icon plus text distinguishes available, current-objective and unavailable locations. A short distance/time estimate and a **Land** action appear in range. An unavailable pin explains the required story ability/milestone, never a level number. Destination list + automatic heading is an equivalent accessible control path.
4. Land is a deliberate action, not automatic collision with a pin. Slow to an approach arc, match the landmark silhouette, crossfade scale and place the party at the destination’s authored safe taxi apron over **1.5–2 s**. Validate availability and arrival clearance before committing travel. Cancel before commitment returns to cruising.
5. Return to the globe from a local taxi anchor. Previously visited routes also offer a **3–5 s direct-travel transition**. No fuel grind, calendar wait, radar unlock, arena completion or paid ticket is required.

For a first implementation, register only real available regions plus clearly disabled previews. Do not fake a Woods/City dungeon behind an attractive pin. Ordinary chapter progression controls access. The full campaign defaults remain intact even though this checkout currently exposes Space as a playable slice before Woods content is available.

### Shared model, genuine curvature in default 2D

Store stable destination ID, unit-sphere anchor, local `mapId`, safe spawn, availability predicate, original landmark asset key and optional `radarAnchorId`. A travel session has origin, selected destination, vehicle unit-vector position/heading, speed, travel phase and encounter seed. Keep authored county coordinates separate from globe coordinates: enlarging the visual planet must not move old pickups or save checkpoints.

Both renderers consume one read-only travel view. A destination at latitude φ and longitude λ can be represented as `p=(cosφ·sinλ, sinφ, cosφ·cosλ)`. Rotate by the shared view orientation. Project the visible hemisphere to the viewport; use depth to scale/occlude pins and landmarks. Hide rear-hemisphere pins and expose them through a compass/list, rather than drawing labels through Earth. Near the horizon, roads/coastlines visibly bend and landmarks diminish. Tune the initial visible arc around **80–110°**, with a curved horizon in the upper third; portrait layouts retain the vehicle and next pin above the touch dock.

**Canvas 2D is complete on its own.** Draw an original ocean disk/atmosphere gradient, then cached, tessellated continent/road polygons projected onto the sphere, depth-sorted landmark sprites, soft cloud arcs and the taxi. An orthographic sphere establishes curvature; a closer pitched perspective provides the travel horizon. Subdivide long polygon edges before projection so coastlines bend, clip polygons at the horizon, and avoid seams at longitude wrap. Do not approximate the globe with an unchanging flat map and a circular border. Native-resolution Canvas paths and appropriately detailed original assets provide sharp output without a WebGL dependency.

**Optional 3D** uses a sphere/curved surface, the same original geography/anchors, a simple taxi model or shared detailed billboard, and modest atmosphere/cloud layers. It lives within the existing optional world-travel presentation, not a new commitment to 3D Woods/City/Finale dungeons. Those still use the shared 2D dungeon path; Space retains its supported 3D areas. Landing times, pin availability, touch targets and travel outcomes are identical.

Match backing dimensions to CSS dimensions × actual device DPR, including DPR 4. There is no 240 × 160 intermediate buffer, enlarged-pixel effect, artificial 30 FPS cap or default DPR reduction. Fixed simulation advances travel; presentation interpolates at display cadence. Bound cloud/particle counts, cache meshes/paths, cull far-side landmarks and reduce decorative effects first. Target 60 FPS and p95 frame time ≤20 ms over ten minutes on modern phones; desktop 90/120 Hz presentation should interpolate smoothly. Record real-device results rather than equating paused screenshots with performance.

On unavailable WebGL, import failure, context loss, or a mode switch during flight/landing, retain the travel state and immediately draw the Canvas globe. Do not teleport, re-roll an encounter, restart landing, replay rewards or require a reload. Restore 3D resources only after successful initialization. Reduced motion uses a steady globe, short eased heading changes and soft landing cuts; destination-list travel remains fully usable.

### Optional random intercepts

Spawn an original **mail balloon, runaway maintenance drone or ghost service tram** visibly along selected travel corridors. Use a host-seeded roll at route start, initially **20% chance after 12 s of cruising**, maximum one offer per leg and a **60 s cooldown**. This is a tuning proposal, not reference data. Telegraph the craft and offer **Intercept / Pass**; never surprise-load a fight or interrupt a landing. Direct repeat travel can skip offers.

Interception opens a bounded shared-2D deck/pullout arena for **30–60 s**, with a safe exit back to the same globe anchor. Examples: a courier drone paints a lane before a delivery rush; a cable thief anchors to two sockets then changes sides. Each enemy needs its own readable behavior and party-level scaling. Do not implement recolored grunts or demand Update 1 loadouts. Any intercept boss gets poise, a telegraphed escape burst, phase changes and clear recovery windows.

**No new tickets for random intercepts.** Cosmetic dialogue or already-budgeted personal finds may use stable reward IDs; ordinary repeat rewards require a separate approved economy policy. First-clear awards, if ever added, must be explicitly allowlisted and deduplicated. The existing cab crash remains a separate harmless, once-only gag.

### Persistence, co-op and optional hooks

- Introduce travel with an explicit save-version migration only when implementation requires durable fields. Old saves preserve every milestone, receipt, collectible and Chapter 1 coordinate; initialize travel as inactive at the existing valid checkpoint. Never treat “version less than latest” as one legacy format.
- Save stable origin/destination/arrival transaction IDs and safe resume anchors, not partially projected or airborne coordinates. Reload before arrival commit resumes at origin; after commit resumes at destination. Watching, skipping, reconnecting and replaying have the same idempotent result. Do not consume a first-clear reward merely for viewing a pin or landing.
- Co-op host owns route, seed, intercept choice and arrival commit. Guests receive bounded phase/progress/anchor state and can request travel; render locally in either mode. Host migration preserves the pending transaction. A guest returning to solo resumes at their own eligible checkpoint.
- Advertise a versioned globe-travel/content capability before travel. **Old clients cannot enter new scenes or areas.** Disable globe departure for an incompatible party and retain existing county travel, with a clear notice. Do not silently encode globe as an old numeric dungeon room. Unknown destination IDs fall back safely without rewards.
- Always-visible pins and textual destination lists work without radar. Expose optional anchor metadata for a later radar adapter and optional reward IDs for future systems. Do not build radar, quests, chips, relics, fusion, arena or shared day/night here. Globe lighting is an authored presentation profile, not a gameplay clock.

### Acceptance for a later implementation

Complete a loop from Wayside to one existing valid destination and back in default 2D, then the same loop in optional 3D. Check steering, rear-side pin occlusion, longitude wrap, accessible destination selection, blocked destinations, landing cancellation, clear arrivals and repeat travel. Compare authoritative state after identical input streams and repeated draws.

At 390 × 844 DPR 3, 844 × 390 DPR 3, 1440 × 900 DPR 2 and a DPR 4 fixture, verify native backing sizes, pin/vehicle/caption safe areas, input targets and horizon framing. Force WebGL loss while cruising, intercepting and landing. Exercise reload on both sides of arrival commit, mixed-renderer co-op, incompatible clients, guest departure and host migration. Verify zero ticket change from travel/replay and no Chapter 1 save regression. Every Playwright launch must include `--mute-audio`. Real-phone sustained performance remains a separate required measurement.

## 9. Combat-feel lessons and limits

The rips reveal combat-space composition, not animation timing or balance. Woods alternate constrictions with open pockets; desert allows broad approach angles; urban entrances create natural encounter boundaries. Adopt that contrast while keeping our camera able to show windups and at least two escape directions. Keep solid prop bases out of boss recovery/escape lanes and test four-player bodies as well as static collision.

The guide explicitly recommends rapid close attacks that prevent the Ninja Boss from teleporting. That supports the concern that continuous hit pressure can suppress an intended pattern. It is a lesson to avoid, not a model for our difficulty. [Hayes, Fukurou boss section](https://www.supercheats.com/gameboyadvance/walkthroughs/dragonballzbuusfury-walkthrough05.txt)

For every new Wayside boss, require finite poise/stagger windows, a clearly telegraphed break-out burst, a valid escape direction even against walls, and a phase change that alters the player’s response. Test repeated three-hit strings at all four arena edges and with four players surrounding the boss. Scale encounters to party level/power without turning trash into HP sponges. Give each new enemy a distinct action/read/counter, and combine at most two special behaviors at once. Gates should test a learned crew ability or solved route, never a level-number door. The user’s “about a dozen types” critique is a combat-variety concern, not a verified literal sprite/species census from these images.

## 10. Reproduction and validation

Read-only dimension check, run outside or inside the checkout without writing any image:

```python
from pathlib import Path
from PIL import Image
for path in sorted((Path.home() / "hark-work/fury-ref").glob("*.png")):
    w, h = Image.open(path).size
    print(path.name, (w, h), (w/16, h/16), (w/24, h/24), w*h/38400)
```

For the Wayside census, import `OVERWORLD`, `HUB_WORLD`, `BLAST_WORLDS`, `REALM_WORLD` and `isBlocked` directly from `world.ts` with Node’s TypeScript support. Count final `props` after exit filtering; apply the boundary filter specified above. Sample point collision and prop-rectangle unions at `(4+8i,4+8j)`. Route samples use rectangle intersection, not center containment. Group hidden pickups by canonical map ID and chapter, keeping chests/NPCs separate. This prevents counting authored props later removed by exits or treating gated finds as first-entry rewards.

Reference file provenance, SHA-256 prefixes (measurement identity only): Southwest `de89ff90185229a2`; Fukurou `a0abcba40e10c83a`; West `bd36b039186e0b8b`; Hercule `97bf259fd2f80263`; East District `acbf8acef5a4d8ba`; Diablo `173b430b50e3c7d9`; Nataday `0d82de311062755e`; Roshi `48157e0583abe836`; Papaya `fc0a40e767b752d8`.

Validation for this documentation-only session:

- `npx tsc -b` — passed.
- `npm run check:wayside-fury` — passed.
- `node scripts/check-wayside-fury-{roads,dressing,collision,collectibles,campaign}.mjs` — each script run separately; all five passed.
- `npx eslint docs/wayside-fury-reference-analysis.md` — exited successfully with the expected warning that Markdown has no matching ESLint configuration; no lintable source files changed. This is not a Markdown lint pass.
- Local Markdown links resolve; the document contains no embedded images. Diff whitespace checked before commit.

No server files changed, so server Jest is not applicable. No Playwright run, runtime art change, browser performance claim or new gameplay acceptance is part of this analysis.
