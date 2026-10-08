# Wayside Fury — Chapters 2–5 plan

**PLAN ONLY.** No game implementation is part of this document. Four new chapters finish the story, with Chapter 3 devoted to SPACE. Names, timings, rewards and tuning below are proposals for Siraj. Target: roughly 3–4 hours of new first-play story, plus optional exploration; individual rooms support short phone sessions.

## 1. What this plan builds on

Read against checkout `4d5740c`, including [scope](wayside-rpg-scope.md), [design review](wayside-fury-design-review.md), and these implementation boundaries:

| Source | Current behavior and consequence for the plan |
| --- | --- |
| `src/pages/WaysideFury/game/content.ts` | Five years after escaping 8 Bit Evil, the BBQ is interrupted by the Architect and his living egg. Wayside and Blast Site are open; Hollow Woods and Old City are statically locked. Keep those names and locations. |
| `game/world.ts` | A 1,280 × 720 county overworld; ten Blast Site maps, including eight main rooms and two supply branches; Sentinel in room 4, Watcher in room 7. `realm-0` is a short coda whose eastern exit currently goes to results. Tile collision, precise prop footprints, authored exits and spawn clearances are shared content. |
| `game/sim.ts` | Deterministic combat, three-hit melee, charged Ki signatures, dash, guard, two-slot tag party, shared character progression and co-op. Clearing `realm-0` advances chapter to 2. Dungeon routing, enemy tiers, clear IDs and several notices still assume Blast Site. New chapters require a routing/progression foundation before adding rooms. |
| `game/dressing.ts` | Host-owned, one-shot roadside taxi crash plus shared bird/rock presentation helpers. Use this separation for launchpad gags: persistent consequences in simulation, motion in presentation. Do not turn harmless scenery into surprise damage. |
| `game/render.ts` | Native-canvas drawing, terrain cache, Y-sorted actors, smooth camera, cinematic stage, shared DOM-label presentation, avatar layering, reduced motion. The 320 × 180 story stage is an authoring coordinate system, not a required output resolution. |
| `game/render3d.ts`, `game/graphics.ts` | Optional three.js **overworld only**, with sprite billboards, instanced props, lights, post effects and 2D fallback. Space gameplay and suited combat in actual 3D are new scope; selecting 3D today does not make dungeons 3D. |
| `game/collectibles.ts`, shared collectibles/save files | Authored personal finds, lore, candy and non-stacking speed/charge trinkets already exist, including chapter-2-gated finds in existing areas. Preserve every existing ID and reward. These are not evidence of a chip/relic inventory. |
| `game/save.ts`, `game/coop.ts`, server save/protocol | Version 3 saves, HOME retry, cloud revisions, personal loot and host-owned encounters exist. Saves currently resume in the hub. Co-op snapshots carry numeric room indices; server validation knows five enemy sprites and two boss phases. New checkpoints, maps and patterns need explicit compatible changes. |

**Update 1 dependency:** chips, relics, fusion, arena, radar and a general side-quest system are requested design inputs, but their gameplay implementations are not present in the reviewed checkout. Day/night is currently a renderer-local 180-second lighting cycle in 3D, not a shared gameplay clock. The reuse matrix below specifies intended content for Update 1. Milestone M0 must locate its actual branch/contracts or schedule the missing foundation; do not claim these systems already ship or build parallel replacements. Existing trinkets retain their effects during any later inventory migration.

**Cast continuity:** the story stars Joe, Matt, Alex and Jon. The current playable roster also includes `you`, the Wayside avatar; all five remain supported. All crew heroes are already unlocked. Chapters teach abilities rather than pretending to recruit them again. Keep the two-slot combat party; the full crew can appear in story scenes without spawning five controllable characters.

## 2. Campaign spine

The Architect is using familiar Station monsters as a network of living relays. Hollow Woods points the signal upward; the Moon relay reveals where the egg is being incubated; Old City exposes the Architect's plan; his Creation destroys him and turns the connected realms into a broken imitation of Wayside. The final victory is cutting that network and bringing everyone home. The BBQ gets its ending.

| Chapter | Main route | Story time target | Focus and completion reward |
| --- | --- | --- | --- |
| 2 · **The Woods Have Receipts** | Realm coda → Wayside → Hollow Woods / Rootwire Mill | 40–50 min | Joe and Matt learn to break and power the relay network; launch authorization and Moon coordinates. |
| 3 · **One Small Step, Four Big Mouths** | County launch compound → rocket → Moon: Dead Air → rocket home | 45–60 min, including films | Alex guides the crew; space suits, lunar movement and the Prism Lens that exposes Old City's shield. |
| 4 · **The Architect's Last Order** | Old City → Blackout Exchange → Eggworks | 45–60 min | Jon keeps everybody together; confront the Architect, witness the Creation kill him, open the final rift. |
| 5 · **Last Stop: Everywhere** | Wayside evacuation → Haywire Junction → Creation's Heart → BBQ | 40–50 min | Combine the crew's learned tools; defeat the Creation, restore both worlds, unlock epilogue/free roam. |

Main progression uses named milestones, never an arena rank, random drop, equipped relic, calendar wait or completion percentage. Existing `blast-watcher` and `realm-0` receipts form the Chapter 2 handoff. A migrated save with the coda already clear gets the new invitation at Wayside; it does not repeat the Watcher. The new `realm-0` exit returns through a story beat to Wayside and opens Hollow Woods instead of ending the campaign. Each later chapter ends in a safe hub/checkpoint and a clear next objective.

## 3. Chapter 2 — The Woods Have Receipts

### Story and places

1. The coda's ghosts keep repeating “return address unknown.” Alex gets the crew back to Wayside by leaving a trail of station lights. At the station, Jon notices the egg's pulse on an abandoned forestry radio frequency.
2. Drive the existing north branch to **Hollow Woods**. The gate now opens after the coda milestone. New local exploration spaces: **Ranger Lay-by**, **Lantern Marsh**, and **Rootwire Mill**. The county marker remains at `(656,176)`; these are entered maps, not buildings crammed into the marker miniature.
3. Rescue a Station maintenance ghost whose incident forms keep duplicating: “Under cause of damage, can I put ‘all of it’?” Its diagrams show roots wrapped around relay machinery. The monsters are being commanded; some are frightened too.
4. In the mill, Joe cracks the relay's armored housing while Matt charges its grounded bypass. A short rift deposits the crew into an 8-Bit copy of the mill, then back into its real control room. They learn the command signal is reflected from the Moon.
5. Defeat **The Foreman**, recover a launch key and return to Wayside. Alex: “We need altitude.” Joe points at the taxi. Matt: “More altitude than that.” The east county barrier opens toward the visibly fenced launch compound.

### Dungeon and encounters

**Rootwire Mill: six mandatory rooms and one optional loop, 2–5 minutes per room.** Ranger Gate teaches rooted zombies; Lantern Walk pairs Candle Wisps with pumpkin spitters; Pump House introduces the power socket and a safe bridge; Conveyor Yard hosts the **Briar Bailiff** scarecrow miniboss; Mirror Sawmill is the scripted realm detour; Heartwood Engine holds the Foreman. Optional **Lost Lunch Shed** loops from Pump House to Conveyor Yard, with a radar find and a shortcut back to the ranger checkpoint. The Lay-by is the taxi/rest point; Pump House is the midpoint checkpoint; a full refill sits before Heartwood Engine.

| Enemy | Readable behavior / player answer |
| --- | --- |
| Rooted zombie | Familiar grunt with a brief root snare telegraphed by a curling vine; dash sideways or cut the exposed root. No chained immobilization. |
| Lantern pumpkin | Familiar shooter fires a slow ember, leaving a small marked hot patch; guard the shot, move around the patch. |
| Candle Wisp | Station candle creature boosts nearby monsters while lit; a short Ki shot extinguishes it and exposes its ally. |
| Briar Bailiff | Scarecrow sweeps one broad lane, then tangles its own rake; a safe pocket is always visible. |
| **The Foreman** | Swampthing wrapped around a mill motor. Phase 1: root lanes and a slow log toss. Phase 2: two powered root anchors protect its core; break housings and charge bypasses between attacks. An exposed core stays vulnerable long enough for a complete combo. |

### Abilities, obstacles and new systems

**Joe — Breaker Knuckle:** a contextual strike breaks visibly cracked root/masonry seals. Its combat perk makes the third combo hit stagger braced foes; retain Wayside Wave. **Matt — Circuit Spark:** hold Ki at a marked grounded socket for one second to power a bridge or jam machinery; retain Golden Fury. Teach both with no enemies first, then combine in the boss room.

Field abilities become crew-wide interaction permissions once learned. The appropriate hero performs a brief assist if benched; the active hero stays equipped. A downed or absent party member cannot softlock a gate, and one player can complete every puzzle. Combat perks still belong to their named hero. No new touch button is required.

New chapter-specific system: persistent, binary **powered / unpowered machinery**, read by collision, art and radar from one state. Each machine has one obvious input, one visible outcome and a manual return path. This is not a wiring simulator. Update 1 reuse: forest chip/relic finds, a fusion challenge, a Foreman arena unlock, radar roots, ranger quests and dusk lantern variants; exact hooks are in section 7.

Art: pine `#28483F`, moss `#78935D`, lantern amber `#F2C879`, corrupted plum `#785078`. Soft canopy shadows and restrained shafts of warm light; quiet ground values leave vine telegraphs readable. Realm scenes change materials, outlines and palette at full resolution.

## 4. Chapter 3 — One Small Step, Four Big Mouths

### Why space matters

The Moon carries an old Wayside survey relay hijacked by the Architect's UFOs. It hides the egg's location and supplies its stabilizing field. The crew must disable that relay and bring home its **Prism Lens**, revealing the shielded Eggworks in Old City. Removing the stabilizer also explains why the Creation becomes uncontrollable in Chapter 4. The Moon is one self-contained dungeon, not a second overworld or a new planet campaign.

### County launch compound: an unmistakable enclosed zone

Expand the county eastward to a proposed **1,920 × 960 world units**, preserving existing landmarks and coordinates. Extend the east road after Chapter 2 to a new turnoff at `x=1488`; reserve a fenced footprint approximately `x=1328..1840, y=80..416`. Final positions require collision/camera validation. Move the old east boundary/barrier and remove only foliage intersecting the authored road; preserve the original taxi wreck, diner and collectible positions.

An arrival establishing view from the road shows all four silhouettes together: **a tall gantry, an upright white-and-amber rocket, a squat glass-front mission-control building, and three silver fuel tanks**. On narrow phones, briefly reframe that view and then restore the normal gameplay camera; the whole 512-unit compound need not fit in the walking viewport. Continuous chain-link fencing, corner lights, hazard stripes and a single broad gate enclose a paved compound. An external taxi bay connects to the road; the taxi cannot drive through the pedestrian gate. Fence feet and tank bases are solid in both renderers. Gantry supports have narrow footings and a clearly passable central walkway; tall art fades or cuts away when it obscures the hero.

| Compound stop | Interaction and visual story |
| --- | --- |
| Gate / taxi bay, south | Park and enter the local launchpad map on foot. Sign: “Wayside Aerospace — formerly the overflow parking lot.” Locked-state text explains the Chapter 2 requirement. |
| Mission control, southwest | Maintenance ghost confirms the coordinates; one launch checklist shows the relay battery, suits and navigation as three completed steps. Full heal, party/loadout access, save and free return to taxi. |
| Fuel farm, southeast | Matt powers a safe control panel. Hoses twitch, one gauge spins backward, and Jon taps it straight. This is a short interaction with no fuel currency, explosion hazard or collection grind. |
| Suit lockers, west of gantry | Helmet/suit montage, then a controllable suited walk to the rocket. All five playable identities can be inspected and swapped here. |
| Gantry / rocket, north-center | Joe opens a jammed access latch, Alex checks the route, Jon does a headcount. A deliberate “Board rocket” interaction starts the film and records the departure checkpoint. |

This is shared world geometry with full 2D artwork and optional 3D structures, not a portal icon with a rocket label. Show a distant fenced silhouette from Chapter 2; activate the local compound when its road opens. On return, the pad shows the recovered capsule and a “successful landings: 1-ish” board.

### Spacesuits: required deliverables, not a color filter

Create an authored suit set for **Joe, Matt, Alex and Jon**, plus a composited **You** suit compatible with the Wayside avatar. Every identity works in **Canvas 2D and three.js sprite billboards**, including remote co-op heroes. Shared atlas metadata controls frames, feet pivots, facing, helmet position, palette and effects in both renderers.

| Hero | Recognition inside the suit |
| --- | --- |
| Joe | Cyan piping, broad gloves, a scorched spatula patch; determined face behind a clear visor. |
| Matt | Gold piping, asymmetric instrument cuff; checks a gauge before striking. |
| Alex | Leaf-green piping, twin navigation lights; points out the safe route. |
| Jon | Violet piping, oversized supply pouch and tiny rear-view mirror; always counts heads. |
| You | Mint piping and station badge; preserve the player's face/skin/hair identity in the visor. Temporarily cover incompatible wardrobe layers without unequipping or changing their save. |

Asset target: 128 × 192 source cells per standard hero pose, with separately authored larger portrait/helmet inserts for film close-ups. Supply eight facings through authored cardinal/diagonal poses and approved mirroring; asymmetric badges must not flip text. Required animations: idle, walk, low-gravity bound, dash launch/air/land, three-hit melee, charge/release, guard, hurt/downed, revive, interact, helmet-on and helmet-off. Target 8–12 authored frames for locomotion and hero action sequences, with interpolated position and smooth effects; do not algorithmically enlarge the old 16 × 24 sheets and call that new detail.

The 3D variant uses the same suited action atlas on upright cutout planes, with a helmet highlight/rim-light layer and grounded shadow. It is not a separate skeletal character project. Keep faces bright enough to recognize; cyan suit piping must not be the only way to distinguish oxygen stations. Fusion uses Update 1's actor identity plus a fitted sealed suit/visor treatment, never briefly reverting to street clothes. Companion cosmetics ride in the cabin or receive a small bubble helmet, according to asset support.

### Suit-up and outbound film — shot by shot

Target **62 seconds total** (12-second suit-up plus 50-second flight). Dialogue is captioned, advances automatically at a readable pace and can be held for reading. Show every crew member even if the combat party has two slots; use the player's avatar in the foreground when applicable. These are stylized travel ellipses, not a real-time orbital simulation.

| Shot | Duration | Picture, movement and sound |
| --- | --- | --- |
| S1 | 2 s | Locker doors snap open in a four-panel composition; white fabric, colored cuffs, a tiny station patch. Percussive music enters on each latch. |
| S2 | 3 s | Joe tightens gloves; Matt connects his wrist gauge; Alex checks boot clips; Jon fills the snack pouch. Short match cuts, no flashing montage. |
| S3 | 4 s | Close helmet inserts: each visor lowers and seals with a soft click. You gets the same fitted visor insert when present. Joe tries to scratch his nose and taps glass. |
| S4 | 3 s | Wide suited lineup under gantry lights. Jon: “Four helmets. Four heads. Good start.” Avatar variant: “Everybody sealed? Good start.” Cut back to the short playable boarding walk. |
| F1 | 4 s | Low wide shot outside the fence: rocket, gantry, mission control and fuel tanks in one frame. Control lights tick down; the taxi waits behind the gate. |
| F2 | 4 s | Cabin inserts: hands secure harnesses, Alex nods, Matt's gauge finally settles. Control voice counts three, two, one. |
| F3 | 6 s | Gantry arms retract; ignition lights the concrete amber. Camera rises with the rocket, leaving a spreading smoke blanket below. Bass rumble, restrained shake. |
| F4 | 5 s | Side tracking shot through cloud layers. Wayside's road, station roof and tiny taxi shrink into the landscape; music opens into the adventure theme. |
| F5 | 5 s | Exterior against deep blue becoming black: first stage shuts down and separates visibly with a clean gap; the upper stage ignites. One discarded stage, one readable trajectory. |
| F6 | 7 s | Zero-gravity cabin gag: Jon's wrapped burger drifts past everyone. Joe lunges, rotates slowly, and bumps his visor against it. Matt: “Dinner finally achieved a higher plane.” Alex calmly clips the burger to Jon's tether. |
| F7 | 6 s | Over Alex's shoulder through the window: **Earth visibly shrinks** from filling the window to a small blue sphere across a time-lapse dissolve. Music quiets for a breath. Jon: “That's where we left the taxi.” |
| F8 | 4 s | Moon reveal: silver crater rims, blue Earth beyond, one impossible magenta pulse beneath the survey dish. Alex identifies their landing beacon. |
| F9 | 5 s | The service section peels away; lander legs unfold. Downward view of the marked landing ellipse; thrusters slow the descent and cast moving rim light over dust. |
| F10 | 4 s | Wide surface landing, dust settling in smooth arcs. A gentle, slightly crooked touchdown. Joe: “Nailed it.” A loose dashboard bobblehead falls over. Ramp lowers into room M01 and control returns. |

Both renderers use identical shot IDs, timing, captions, cues and final state. Canvas uses layered high-resolution backgrounds and camera transforms; 3D uses the launch model, suited billboards, cabin set and simple celestial spheres. Portrait compositions reframe around the action rather than cropping Earth or the stage separation. Reduced motion uses steady compositions and soft cuts, retaining all story/comedy. Hold Skip for one second; skipping applies the same completion transaction as watching. Pause/hidden tabs stop the solo timeline and oxygen. In co-op, the host owns timeline progress; unanimous skip among connected players, with a disconnected seat removed from the vote. Late joiners receive the current shot and arrive at the same safe landing checkpoint.

### Moon: Dead Air — one dungeon, room by room

One area ID, `moon`, with nine connected rooms. No lunar taxi or separate free-roam continent. Main route is **M01 → M02 → M03 → M04 → M05 → M06 → M08 → M09 → M01**. M07 is the only optional branch off M06. Shortcuts M03↔M01 and M06↔M03 open from the far side. The room map always marks the lander and unlocked shortcuts.

Dimensions below are world units, unrelated to screen resolution. Main walking lanes are at least 48 units wide and landing aprons at least 64; boss arena is at least 384 × 288 clear space. Keep entrances outside immediate aggro and preserve enough room for four players and revives.

| Room | Layout, encounter and purpose | Exit, supplies and reward |
| --- | --- | --- |
| **M01 · Crooked Landing**, 640 × 384 | Lander on west pad; flat practice loop east; Earth framed beyond the north rim. No enemies. Alex teaches a short bound and Guard braking using three painted footprints; award **Comet Bound** before leaving. | East to M02. Safe checkpoint, full crew refill, unlimited oxygen, loadout access and “Return to Earth” available from arrival. The rocket's radio keeps the objective pinned. |
| **M02 · First Footprints**, 640 × 384 | Crescent path around a shallow crater; two broad, marked bound gaps with a longer walkable path around each. Two Moon Rats scurry between scrap piles; then one suited zombie demonstrates a slow hop. | Northeast to M03; west back to M01. Free air post midway. Put the first optional bound before the first encounter, so players can practice without pressure. |
| **M03 · Survey Shack**, 480 × 320 | Pressurized base with broken radio, cot, snack dispenser and maintenance ghost on a screen. A window shows the distant dish. Matt powers one socket to restore the local relay. | North to M04; southwest shortcut to M01; later east lift from M06. Checkpoint, free refill, Collection/radar hint. Accept “One Small Snack” without blocking the story. |
| **M04 · Crater Hop**, 800 × 448 | Three stepped terraces joined by marked bound links, plus a continuous service ramp. UFO Scouts telegraph thin tractor lanes while Moon Rats pursue. Shadows show actual landing points; no precision platforming. | East to M05; return west. Air posts before and after the terraces. Small chip cache on a side lip reached by a forgiving bound; never place a key there. |
| **M05 · Glass Lava Tube**, 720 × 384 | S-shaped tunnel with mica walls, one breakable basalt plug, a grounded bridge socket and two roomy combat pockets. Echo Ghosts blink between three visible alcoves; Candle Satellites light their shields. | North to M06, back south. Air alcove between fights. Joe/Matt abilities reopen a safe route; the ghost recording names the Eggworks. No automatic realm warp on the Moon. |
| **M06 · Dish Service Ring**, 640 × 480 | Circular yard around three relay pylons. A shutter divides it into a safe entry wedge and combat space. **The Cheese Inspector**, a pumpkin in a survey helmet, stamps warning circles then rolls across one marked lane. | Defeat opens east to M08 and north to optional M07; activate lift shortcut to M03. Checkpoint/full refill, free oxygen everywhere in the safe wedge. Three pylons preview the boss's vulnerability language. |
| **M07 · The Wrong Flag**, 480 × 320, optional | A quiet cul-de-sac with an 8 Bit Evil pennant stuck in a rock. Two rats fight over a sealed snack pouch. A radar echo leads behind the flag to an old recording: the Creation imitates voices it hears. | Return only to M06. “One Small Snack” quest item, lunar relic and lore. Unlimited air at entry; reachable after the boss and after returning from Earth. No missable collection flag. |
| **M08 · Apogee Bowl**, 800 × 576 | Broad crater arena, three pylon pads around a central dish pedestal. **The Apogee Warden** descends: a giant Station UFO with a ghost face flickering on its underside. Floor sectors carry durable line/shape telegraphs. | Boss clear opens north to M09. Safe air is supplied across the whole arena, and boss retry starts at M06 with full crew resources. Optional fusion opportunity, never a fusion check. |
| **M09 · Quiet Side**, 480 × 320 | Peaceful dish overlook. Remove the Prism Lens; the magenta pulse stops and Old City's hidden skyline appears in a projection. Joe quietly radios, “Found you.” Give the reveal room to breathe. | Permanent lift to M01; free refill. Award `moon-relay-disabled` once, plus lens and boss receipt. Return quest now points to the lander. No escape timer or surprise second boss. |

**Lunar roster:** Moon Rats burst between scraps; Vacuum Walkers reuse the zombie silhouette with a bubble suit and long, dodgeable hop; UFO Scouts paint tractor lanes before firing; Echo Ghosts phase between fixed visible pads; Candle Satellites are floating relay lamps that power a nearby shield. These reuse Station monster identities with new lunar art and limited behavior variants. They do not require an unrelated alien bestiary.

**Apogee Warden fight, target 3–4 minutes:** Phase 1 alternates a 0.9-second tractor-lane warning, slow crescent projectiles, and a clearly shadowed crater stomp. Guard or sidestep the lane; bound out of a marked stomp circle. At 50% HP, three pylons shield it. Ground each with the same contextual socket interaction learned earlier, singly and in any order, while it fires one pattern at a time. Each grounded pylon stays grounded on that attempt. When all three are grounded, the Warden tips over for a six-second uncontested damage window, then resumes attacking with its shield permanently down. The final 20% combines familiar patterns with longer recovery; this can remain within a two-phase AI definition. No off-screen attack starts, vacuum suffocation, instant-kill fall or oxygen theft.

### Low gravity and friendly oxygen

**Alex — Comet Bound:** the Moon turns Dash into a smooth, steerable bound: initial target 1.35× normal travel distance, about 0.4 seconds of visible lift, the existing stamina cost and existing dash invulnerability duration. Extra airtime is not extra invulnerability. Guard brakes the drift promptly; ordinary walking still stops accurately enough to reach an air post. All heroes use the same movement rules. On Earth the unlocked field ability crosses only explicitly marked short gaps; combat Dash stays familiar. Twin Comet remains Alex's signature.

Keep authoritative position and combat on the same top-down ground plane. A visual lift curve and matching shadow sell low gravity in both renderers; attacks do not inexplicably miss because a sprite is drawn higher. Only authored traversal links may cross a gap, after validating start, landing clearance and completion milestone. Walls, fences and crater rims remain solid; lunar Dash must not globally disable collision. A failed link returns to its takeoff pad without damage or item loss. Guard-braking and a walking alternative make touch play forgiving.

**Oxygen is atmosphere and route guidance, not survival punishment.** Each local player has a 100-unit tank shared across their tag heroes; initially drain 1 unit/second only during active outdoor/tube exploration. Every required route segment reaches a free post in 20–30 seconds at walking speed. Stations refill automatically within two seconds. Interiors, dialogue, solo menus, films, downed/revive time and the boss arena suspend drain. In co-op, a local menu can suspend that player's drain without pausing the shared fight.

At 25%, show one calm message and the nearest unlocked post on radar. At 0%, a reserve recycler automatically engages: **no HP loss, slowed movement, lost Ki, forced teleport, alarm loop or failure**. The gauge reads “Reserve air — refill when convenient.” Offer an accessibility setting for unlimited air with identical rewards. No oxygen purchases, upgrades required for entry, or collectible timer. A refill returns the gauge to normal. Entering/rejoining the Moon always starts with full air; switching heroes does not refill it. If testing shows the gauge adds no fun, retain the air-post visuals and use a simple “sealed / reserve” indicator.

### Return trip and chapter close

At any point, M01 can fly home for free; unfinished objectives and shortcuts persist. Before boss clear this is “Return for supplies,” not chapter completion. Re-entry after first arrival uses a five-second travel montage, with full film replay available at mission control.

After obtaining the lens, play this **20-second return film**:

| Shot | Duration | Action |
| --- | --- | --- |
| R1 | 4 s | All crew board; Jon counts helmets and pats the secured snack pouch. Lander lifts, leaving footprints and the crooked flag behind. |
| R2 | 4 s | Earth grows through the window in a travel dissolve. Matt gently straps the bobblehead in. |
| R3 | 5 s | Capsule re-entry glows amber, then parachutes open over Wayside. Steady framing for reduced motion; music reprises the station theme. |
| R4 | 4 s | Capsule lands in the marked recovery apron inside the compound; the waiting taxi driver holds a “NO MOON DUST” sign. |
| R5 | 3 s | Helmets unseal. Joe sneezes a tiny silver sparkle. Alex holds the lens toward Old City; the false skyline peels away. Save, restore the normal outfit, unlock Chapter 4. |

The victory reward commits before departure; the return arrival commits once even on Skip/reload. Replaying either film cannot award candy, tickets or quest credit twice. Unfinished lunar finds remain accessible in free return visits.

### Moon and launch art direction

**HD-2D at modern display resolution:** slate regolith `#858EA4`, silver rim `#DAE4F2`, ink shadows `#111829`, Earth blue `#438ED4`, station amber `#F5C776`, hostile relay magenta `#CE6BBB`. Warm white suits read against cool terrain; small colored piping identifies crew. Crater edges have layered fracture detail, dust deposits, embedded glass and overlapping long shadows. Footprints persist locally with a bounded decal pool. Surface sky is black with restrained stars; no terrestrial fog blanket. Tunnel haze is sparse suspended dust, not an excuse to hide attacks.

One strong low-angle sun, blue Earth fill and helmet lamps create the depth. Canvas receives authored normal-like highlight/shadow layers, soft contact shadows, light masks and native-resolution gradients. 3D uses dimensional crater rims and gantry, textured surfaces, shared suited billboards and bounded local lights. Selective bloom belongs on thrusters, pylon cores and helmet lamps; keep faces, captions, oxygen and telegraphs sharp. Depth-of-field stays outside the combat focus region. Thruster plumes and long ballistic dust arcs should move smoothly; camera shake is small and optional. Lunar ambience is radio chatter, boots and filtered suit sounds under a spacious synth arrangement, with clear combat cues available when music is muted.

## 5. Chapter 4 — The Architect's Last Order

### Story and places

1. The Prism Lens reveals the existing **Old City** marker's true entrance at `(1032,560)`. New local streets: **Blackout Boulevard**, **Neon Market**, and **Clockroof Walk**. Freed market stalls become shops and a taxi return stop; civilians and several unpossessed monsters shelter together.
2. First dungeon, **Blackout Exchange**, has four rooms: Ticket Hall, Rat Cable Run, Transformer Floor and Switchmaster Booth. Jon hears the relay ordering everyone to “stand by forever.” Restore the district, defeat the Switchmaster, and expose the Eggworks route.
3. A forced but brief story rift leads through a two-room **Backstage 8-Bit** connector: a distorted station platform and the old escape doorway. Ghost recordings pay off the Moon clue: the Creation has learned every command and every terrified voice on the network.
4. Second dungeon, **Eggworks**, has five rooms: Delivery Floor, Shell Press, Incubator Gallery, Control Balcony and Hatching Chamber. A safe workshop before the balcony gives full healing and loadout access. The Architect claims he built the Creation to make the worlds obey him. Fight and defeat him; the egg wakes during his attempt to reassert control.
5. In a short, non-graphic scene, the Creation takes the Architect's staff, snaps it and erases him in a burst of his own portal light. His command, “You belong to me,” comes back in his voice: “No.” It tears open a rift to **Haywire Junction**, dragging pieces of both worlds into it. The crew shepherds survivors out; Jon is last through.

### Enemies and bosses

**Cable Rats** dash between marked outlets; **Neon Imps** fire bouncing shots with one visible bounce marker; **Turnstile Zombies** carry directional shields; **Clockroof Werewolves** wind up long leaps, leaving a generous landing circle. New sprites preserve the site's rat/werewolf identities; shield and ricochet behaviors are distinct from merely raising HP.

**Switchmaster** is a scarecrow signal operator: it lights two of four floor lanes, then attacks those lanes while the remaining pair stays safe. Deflect a signal shot to expose it; an ordinary Ki-hit switch gives an easier alternative. **The Architect** fights from a mobile ring of three portal pedestals: summons a small mixed squad, telegraphs a sweep, then loses his shield when a relay is interrupted. Phase 2 swaps the order and adds a fake pedestal recognizable by a broken sigil. He has no unavoidable command grab or unskippable defeat speech on retries.

### Ability, systems and art

**Jon — Night Anchor:** Interact at a marked anchor to hold a flickering bridge stable or open a one-way evacuation shutter permanently. In combat, a deliberate Guard timed during an obvious signal windup can deflect marked relay shots; ordinary Guard still reduces damage. Retain Night Breaker. Joins, departures and bench swaps cannot release a solved bridge.

New system: **district restoration states** change shops, NPC dialogue, lighting and shortcuts after milestones. An evacuation is a sequence of safe interactions and short fights, not an escort NPC with fragile HP. Reuse Chapter 2 machinery and the shared realm-transition director. Update 1 provides city loadouts, another fusion recipe, boss arena entries, radar triangulation, vendor quests and day/night stall variants; no new currency.

Palette: wet petrol teal `#23434E`, brick `#886B65`, sodium amber `#EDB86F`, portal violet `#9467C2`. High-detail signage, cable bundles, puddle reflections and window interiors; readable street midtones and clean lane warnings. Restored districts gain warm windows rather than a blinding full-screen grade. The Creation's first silhouette is soft egg-white with a dark mouth and borrowed monster features; avoid another oversized purple shadowbeast.

## 6. Chapter 5 — Last Stop: Everywhere

### Story, route and ending

1. Wayside Station becomes the last safe rally point. The crew helps the rescued residents board a shelter train; prior side-quest NPCs appear here without being prerequisites. The taxi takes the crew to a new **Last Stop road spur** beside the Blast Site. The final rift occupies an authored turnout, leaving the old route and collectibles accessible.
2. Enter one seven-room dungeon, **Haywire Junction**: Wrong-Way Platform → Upside-Down Orchard → Floating Crosswalk → Moon-in-a-Basement → Borrowed Voices → Last Platform → Creation's Heart. These are hand-authored mixtures of earlier environments, not procedurally shuffled rooms.
3. Each middle room resolves a familiar tool once: Joe breaks an egg-shell root seal; Matt powers a severed station switch; Alex bounds across a marked lunar slab; Jon anchors a flickering platform. Rooms then become permanent safe shortcuts. Moon-in-a-Basement uses lunar motion for one room, with free suits and reserve air; leaving it automatically restores normal movement/outfits.
4. In Borrowed Voices, the Creation repeats the crew's jokes and the Architect's orders. Alex identifies the difference: it can copy a voice but cannot make the crew abandon each other. The answer is to sever the relay feed, not feed it a bigger explosion.
5. Last Platform is the full-heal checkpoint and explicit “Ready for the final fight” prompt. A **Conductor Husk** miniboss first tests guard, swap and lane-reading; its clear persists on final-boss retries. The taxi radio still reaches home.
6. Defeat **The Creation, Unbound**. Joe breaks its shell anchors, Matt cuts the current, Alex fixes the route home and Jon holds the exit. The playable lead lands the final strike; all four crew members contribute in the finale regardless of loadout. The destructive body dissolves, the stolen voices return to their owners, and the separated worlds stabilize.
7. Everyone reaches Wayside. A two-minute epilogue revisits the station, the once-wrecked roadside cab and the BBQ. The driver now sells “I Survived Your Moon Trip” stickers. Joe approaches the grill with glowing hands; Matt silently unplugs its Ki adapter. Jon: “Everybody home?” Alex looks around: “Everybody.” End on dinner, not another cliffhanger egg.

### Encounters, final ability and systems

Mixed squads reuse earlier monsters, at most two special behaviors per encounter. Add one **Patchwork Echo** variant that borrows a single clearly signaled move from another monster; it never changes identity mid-windup. Conductor Husk combines the Sentinel rush and Switchmaster lane warning, with a recovery gap between them.

**Creation fight, three named stages, roughly five minutes total:** Shellstorm uses three familiar destructible anchors and crater-circle warnings; Borrowed Fury alternates one learned boss pattern at a time while the crew disables two feed points; Quiet Heart exposes the core for ordinary combos, Ki and optional fusion. Telegraphs remain visible through environmental distortion. Stage transitions clear lingering projectiles and refill some Ki; a wipe retries the fight at Last Platform with full resources. Three stages require either encounter-stage data or an explicit extension of today's two-phase boss type—never an unchecked `phase=3` in a renderer.

**Crew ability — Homeward Link:** a story-earned extension to Update 1 fusion combines all four field assists into one contextual relay-break sequence. It costs no rare item and works solo. If the fusion gauge is empty, disabling the final feed points supplies the required story charge; show the normal fusion controls and a forgiving prompt, with no timed button mash. Ordinary combat remains sufficient to bring the core to its finishing threshold. The player avatar can initiate the link; teammates are not forced into a particular hero.

New systems are limited to scripted **room environment profiles** and an **epilogue world state**. No new inventory, survival layer or crafting system in the finale. Save `campaign-complete` before credits; Continue returns to restored Wayside with all earlier areas, Moon travel, side quests and Update 1 arena rematches available. Boss replays use explicit arena/rematch encounters and cannot revoke story completion or reissue first-clear rewards.

Art moves from corrupted plum/cyan seams over recognizable assets to warm dawn amber. Wrong-Way Platform has tracks curving up a wall; Moon-in-a-Basement puts Earth behind an ordinary cellar window; Creation's Heart is a calm, pale stage with a dark core. Distortion uses local ripples and displaced scenery layers, never unreadable controls, fake UI errors or a reduced-resolution screen filter.

## 7. Reuse Update 1 instead of adding parallel systems

These are content contracts, pending reconciliation with Update 1's actual tuning, slot counts and IDs. All suggested chip effects are modest sidegrades in its existing loadout system; relics use its existing equip/passive rules. Do not add a second equipment screen, fusion meter, quest journal or radar button.

| Update 1 system | Chapter 2 | Chapter 3 / Moon | Chapter 4 | Chapter 5 / ending |
| --- | --- | --- | --- | --- |
| **Chips** | **Ground Wire:** guarding a marked electric hit gives a small Ki refund, once per cooldown. Seed a guaranteed first copy at Pump House. | **Soft Landing:** slightly quicker stamina recovery after a bound; guaranteed optional M04 cache, never required to cross a gap. | **Return to Sender:** modest reward for a successful marked deflection. Give a copy through a vendor quest. | One remix chip, **Home Team**, rewards a successful tag follow-up using existing combo rules; optional Last Stop cache. No mandatory late-game respec. |
| **Relics** | **Ranger's Lantern:** small existing-style defensive/utility bonus, with lore about lost travelers. | **Wrong Flag Pennant** in M07: exploration souvenir with a small Ki utility effect. No oxygen-capacity tax. | **Stationmaster's Watch:** a small guard/recovery utility bonus; the Prism Lens itself stays a story item, not required equipment. | **Cold Burger Charm:** completion souvenir and cosmetic aura; permanent combat power remains within Update 1 bounds. Preserve old trinkets. |
| **Fusion** | Optional Joe/Matt showcase against the Foreman's exposed core; follow Update 1's existing pair rules. | Alex/Jon showcase: **Orbit Break**, two crossing comet trails that briefly gather light enemies. Same fusion activation/gauge; sealed suit art required. | A city reward adds a supported pair recipe or variant; shield windows reward existing fusions without requiring one. | Homeward Link supplies the narrative payoff. Existing pair fusions remain useful in the actual fight and arena. |
| **Arena** | Foreman rematch unlocks after clear; a root-lane challenge teaches the new pattern. | Warden unlocks a lunar-rules arena exhibition back at the existing arena, not a second Moon arena map. Air is unlimited. | Switchmaster and Architect rematches; the Architect is explicitly a recorded echo after his death. | Mixed boss circuit and Creation rematch, with normal replay reward caps and first-clear dedupe. |
| **Radar** | Distinguish machinery, optional roots and chapter-2 finds already placed in old areas. | Mark air posts, lander and quest pings; show reachable-route distance, not an arrow through a crater wall. | Triangulate three relay echoes to identify Eggworks, all on the main route. | Point to remaining side quests and collection finds after credits; story anchors always have visible world markers too. |
| **Side quests** | **Lost Lunches:** recover two ranger tins in the optional shed; reward candy and lore. **Light the Way:** restore three lamps along the main route; cosmetic lantern badge. | **One Small Snack:** recover Jon's spare pouch in M07; **Flag Etiquette:** straighten the pennant and take a crew pose. Return visits allowed; no mandatory photo upload. | **Night Shift:** restore a vendor's sign; **Last Fare:** reunite a ghost passenger with the driver. Rewards are candy, a chip and optional dialogue. | Rescue cameos reflect earlier quests; **Dinner Is Served** pays off the lunch chain with an epilogue group portrait. Missing quests remain available. |
| **Day/night** | Lanterns and optional ghost chatter vary; a safe rest point can choose dusk immediately. Main route always open. | Earth launchpad uses the shared clock. Moon holds a fixed sun/earthshine profile; no invented 180-second lunar day. Clock-based quests wait until Earth return. | Neon/night and warm/day stalls share all essential services; optional chatter differs. Free wait at taxi/rest points. | Authored storm/dawn lighting follows the story; postgame resumes the shared Earth cycle. No clock can block the ending. |

Provisional loot budget: one named chip, one relic and two side quests per chapter, plus a few candy/lore finds. Count every personal pickup against the existing shared manifest and save limits. Optional content should add roughly 15–25 minutes per chapter, not force repeat grinding. Boss HP targets must be tested against actual Update 1 power ranges and one-to-four-player scaling before assigning final level bands.

## 8. Shared implementation contracts to agree before parallel work

Paths below are proposed future files, not files created by this plan. `G/` means `src/pages/WaysideFury/game/`; `S/` means `server/shared/waysideFury/`; `P/` means `public/wayside-fury/`. A single integration owner controls core-file changes. Content authors export definitions; they do not each patch `sim.ts` or add their own save flags.

| Boundary / owner | Proposed contract and invariants |
| --- | --- |
| Campaign registry / integration | `ChapterDefinition`: stable chapter ID, prerequisites, entry location, maps, story beats, reward IDs, completion milestone. `AreaDefinition`: stable area ID, map IDs, level band, environment and renderer support. `getArea(id)`, `getMap(id)`, `canEnter(progress, locationId)` replace assumptions that every dungeon is Blast Site. |
| Map identity / integration + persistence | Canonical string `mapId` accompanies numeric `room` during compatibility migration. Preserve `blast-0..9` and `realm-0`; new examples are `woods-pump-house`, `moon-m01`, `city-eggworks-hatching`, `haywire-heart`. Every exit names a destination map and safe spawn; unknown IDs fail to a safe hub with notice. Never append new chapters to `BLAST_WORLDS` and reuse its room-tier heuristics. |
| Content authoring / world owner | Extract reusable pure map/paint/prop/exit/encounter helpers into `G/worldBuilder.ts`; content lives under `G/chapters/`. A map bundle includes geometry, footprints, exits, encounters, interactables, traversal links and radar anchors. Validate spawn/exit reachability and optional-route return paths from the same data. |
| Field abilities / systems | `ObstacleDefinition`: stable ID, ability requirement, interaction anchor, visual state and resolved milestone. `resolveFieldAction(state, actor, obstacleId)` validates range and unlock, emits one result, and lets either renderer animate the appropriate assist. Mandatory interactions never require a specific equipped party. |
| Enemy behavior / combat | Separate `archetypeId`, `spriteId` and encounter stage from broad grunt/shooter/boss scaling. Behavior definitions emit explicit telegraph shape, direction, duration and active interval. Renderer never guesses danger from an unrelated animation timer. Add new sprite IDs to shared validation and both asset manifests. |
| Environment / systems | `EnvironmentProfile`: movement profile (`earth` / `lunar`), suit requirement, oxygen policy (`off` / `exploration` / `safe`), lighting profile and clock policy. `stepEnvironment(state, input, dt)` runs at fixed simulation rate. Traversal state carries link ID, endpoints and progress; render lift derives from it. |
| Film / story | `CinematicDefinition`: ID, ordered shot IDs/durations, camera framing per aspect, cast poses, caption/cue IDs, resume anchor and one completion milestone. `startCinematic`, `advanceCinematic`, `finishCinematic` own state; `finish` is idempotent. `sampleShot(definition, elapsed)` returns a read-only render view and never grants rewards. |
| Suits / art | `HeroVisualKey = (heroId, outfit, action, facing)` with `outfit = normal / space`. A manifest describes source rects, frame timings, foot/helmet anchors and layer order. `resolveHeroVisual(...)` feeds both 2D and 3D, including dash ghosts, hurt/downed, fusion and co-op peers. Outfit is derived from environment/film, not written into the player's cosmetic inventory. |
| Update 1 integration / systems | Reuse its registry IDs and APIs for grant/equip chip, relic ownership, fusion eligibility, arena unlock, radar marker and quest milestone. If absent, implement one shared adapter against agreed definitions before chapter modules consume it. No chapter owns a replacement economy. |
| Persistence / persistence owner | Store campaign milestones, chapter-local solved interactions, chosen safe checkpoint and film completion IDs through the shared sanitizer/types. Persist at room-clear, departure, arrival and boss reward. Store safe anchors, not partially falling coordinates; oxygen and cosmetic animation are transient. Preserve HOME retry and lifetime receipts explicitly. |
| Co-op / network owner | Versioned snapshot adds map identity, shared obstacles, environment, traversal, boss stage and film state. Host owns world/quest clear and travel; per-player receipts own loot/air/loadouts. All gates support one player and duplicate requests dedupe. Advertise compatible content/protocol version before joining; old clients cannot enter unknown areas. |

Compatibility work must cover browser **and** `server/wayside-fury/protocol.js`: current validation limits scene IDs, room range, sprite IDs and phases. Migrate old saves and HOME snapshots with an explicit version switch; today `raw.version < SAVE_VERSION` means the old two-hero format, so simply incrementing `SAVE_VERSION` would misclassify version 3. Preserve cloud 409/revision handling and reset semantics.

Do not silently expand ticket awards. `ticketDelta`/`receiptTotalScore` currently recognize room rewards only for `blast-*` and `realm-*`, while area additions also award points. Adopt a shared allowlisted chapter reward registry, budget its totals, and test replay/arena/return trips against it. Keep IDs within current validation bounds; audit the 128-milestone and 65,536-byte save limits with a fully completed campaign fixture. Avoid pushing more persistent IDs than the sanitizer can retain.

For co-op progression, grant eligible chapter/quest receipts once; repeat visitors get only Update 1's approved replay rewards. A guest visiting a later chapter may use the host's field permissions for that session without silently unlocking every prerequisite on their own account. Resume solo at their own last valid checkpoint. Host migration must preserve active pylon/obstacle state and film progress; no suit mismatch, duplicate reward or lost Moon return route.

## 9. Renderer and device acceptance

**2D remains the default and a complete first-class game.** The optional 3D mode retains the existing shared-2D behavior for non-space dungeons in Chapters 2, 4 and 5. Explicit new 3D scope is the expanded county launch compound, on-foot suit/boarding area, space films and all Moon rooms, so every required space-suit variant is actually playable in 3D. A reusable area renderer may enable other dungeons later, but that expansion is not required for this campaign. Test the full campaign with both graphics preferences, including supported-scene transitions and 2D fallback.

Native DPR is the baseline quality contract for modern phones and desktops: backing canvas dimensions match CSS size × actual device DPR, with detailed source art, crisp DOM typography and smooth world motion. Do not introduce a GBA-sized scene buffer, pixelated output filter or a 30-FPS artistic cap. Keep fixed simulation and interpolate presentation at the display cadence, including 90/120 Hz devices. Collision units, sprite source pixels and display pixels remain separate.

The current code caps normal DPR at 3 and can degrade to 1 under load. The design review explicitly says paused native-detail screenshots are not sustained-performance evidence. Future quality work must reconcile that implementation with this request: remove the default cap where actual native DPR is higher, budget native rendering, and reduce decorative particles, blur and dynamic shadows first. If a supported device cannot sustain native DPR after optimization, record it as an unmet target; do not quietly pass the gate using downsampled captures. Retain crash/context-loss fallback and recovery, with honest diagnostics for any emergency resolution reduction.

Performance acceptance proposal: 60 FPS target on agreed current iOS/Android phones and a Retina desktop during a ten-minute route/arena run; report median and p95 frame time, DPR, thermal behavior and memory, aiming for p95 ≤20 ms in active play. On 120 Hz displays, interpolation should remain smooth even when simulation stays at 60 Hz. Final devices are an M0 decision. Preload Moon assets at mission control, upload textures before boarding and stream/release area resources at safe transitions. Budget decoded atlas/texture memory, not just download size; split large action sheets into bounded atlases with gutters/mip-safe edges.

Preserve safe-area HUD reservations, 56–72 px action targets, reachable menu return controls and label avoidance around heroes. Oxygen sits with status meters, not over captions or touch controls. Telegraphs use shape plus color and remain visible with reduced motion. New captions use the existing accessible DOM layer. Neither renderer mutates state, advances a shot, opens a gate, rolls loot or changes the shared day/night clock.

## 10. Build breakdown for parallel Codex sessions

Each ticket below is intended for **one focused session and one reviewable handoff**, typically one map group, one mechanic or one renderer subsystem. If a ticket cannot meet its acceptance check in one session, split by the named subpart; estimates are work packaging, not wall-clock promises. Run up to three implementation sessions plus one integration/verification owner. These are future assignments; this plan does not start those sessions.

**Ownership rule:** sessions are not alone in the codebase. Use separate branches/worktrees, never revert another session's edits, and merge in dependency order. The named owner alone edits shared hot files during that wave. Pass interface changes to the integration owner rather than fixing them independently in three branches. Every handoff includes owned paths, exported IDs/types, screenshots if visual, tests run and unresolved issues.

| Milestone / ticket | Exclusive file ownership during the session | Deliverable and verification | Dependency / parallel opportunity |
| --- | --- | --- | --- |
| **M0-A · Contract reconciliation** | `G/campaignTypes.ts`, future shared campaign types/registry in `S/campaign.js` + `.d.ts` | Inventory Update 1 APIs; lock IDs, rewards, level bands, checkpoint semantics and content version. Write registry-validation fixtures. | First. No chapter code depends on imagined APIs. |
| **M0-U · Conditional Update 1 dependency** | Its existing owners/modules, identified by M0-A; reserve new paths only if that implementation does not exist | Track chips, relics, fusion, arena, radar, quests and clock as separate dependency tickets, each split into rules, persistence/UI and integration sessions as needed. Define acceptance against the reuse matrix before estimating. | An external merge if already built; otherwise a separately estimated prerequisite, never one oversized chapter session. |
| **M0-B · Campaign router** | `G/sim.ts`, `G/world.ts`, `G/content.ts`, `G/worldBuilder.ts`, `G/campaign.ts`, campaign regression script | Extract reusable authoring; adapt legacy map lookup, clear handling, dynamic location gates and Chapter 1→2 handoff. Old maps remain identical in collision/receipt behavior. | After M0-A; can overlap M0-C once types freeze. |
| **M0-C · Save and rewards** | `G/save.ts`, `G/cloud.ts`, `S/save.js`, `S/save.d.ts`, relevant server save/ticket tests | Explicit v1/v2/v3 migrations plus future version; safe checkpoint restore; allowlisted first-clear receipts, size-limit fixture and 409 regression. | After M0-A; separate from sim ownership. |
| **M0-D · Network extension** | `G/coop.ts`, `G/coopRewards.ts`, `server/wayside-fury/protocol.js`, `server/wayside-fury/rooms.js`, co-op tests | Version handshake, bounded campaign snapshot, new sprites/stages, eligibility and reward dedupe. | After M0-A; integrate with M0-B/C before chapter release. |
| **M1-A · Field tools** | `G/fieldAbilities.ts`, `G/environments.ts`, focused field test script | Break/power/anchor rules, solo assist permissions and saved obstacle states; fixture gates work with all heroes and a one-person party. | After M0; integration owner wires `sim.ts`. |
| **M1-B · Woods maps/story** | `G/chapters/ch2.ts`, `G/chapters/ch2Worlds.ts`, `P/chapters/ch2/` | Six main rooms, optional loop, quests, beats and palettes; every exit/return route reachable. | Parallel with M1-A/C against frozen schemas. |
| **M1-C · Woods combat** | `G/enemies/woods.ts`, `G/bosses/foreman.ts`, Woods combat tests | New patterns, readable telegraph records, Foreman fight; solo and four-player clears without optional gear. | After combat interface; integration owner wires enemy dispatch. |
| **M1-D · Earth presentation** | `G/render.ts`, `G/render3d.ts`, `G/scenery.ts`, `G/terrain.ts`, `G/zonePreviews.ts` | Woods props/telegraphs and dynamic county markers; freeze these files before space rendering sessions begin. The launch compound geometry arrives in M2-A. | After M1-A/B schemas; capture both preferences. |
| **M1-E · Clock integration** | `G/worldClock.ts`, clock regression script; exclusive renderer hooks handed over from M1-D | Adapt Update 1's shared clock to both renderers, free waiting and authored Moon/finale lighting. Reduced-motion settings must not alter quest availability. | After Update 1 clock contract; core state/network hooks go through their owners. |
| **M2-A · Compound authoring** | `G/chapters/ch3Launch.ts`, `G/chapters/ch3LaunchWorld.ts`, `G/launchDressing.ts` | Fenced compound, road/gate/footprint data, checklist, safe checkpoints, one-shot fuel gag. No separate world coordinates in renderers. | After M0; can overlap suit art and film authoring. |
| **M2-B · Suited cast art** | `P/space/heroes/`, `P/space/portraits/`, `G/heroVisuals.ts`, `G/spaceAvatar.ts` | Five identities, all poses, visor layers, atlas/anchor manifest; contact-sheet and avatar-wardrobe review. | After visual contract; split named crew and avatar composition into sequential tickets if needed. |
| **M2-C · Film director** | `G/cinematics.ts`, `G/chapters/ch3Films.ts`, `G/spaceAudio.ts`, timeline test script | Suit-up, ten outbound and five return shots; idempotent completion, captions, skip, pause, reduced motion. | Parallel with M2-A/B; integration owner owns controller/audio hooks. |
| **M2-D · Lunar rules** | `G/lunar.ts`, lunar simulation test script | Bound links, braking, oxygen/reserve, safe-room rules and swap/downed behavior. | After environment contract; no render or save edits. |
| **M3-A · Moon west half** | `G/chapters/moonWest.ts`, `P/space/moon-west/` | M01–M04, onboarding, air-post routes and first shortcut; measure walking times. | After M2-D interfaces; parallel with M3-B/C. |
| **M3-B · Moon east half** | `G/chapters/moonEast.ts`, `P/space/moon-east/` | M05–M09, optional quest, pylon pads and return lift; all routes reachable. | Shared edge/spawn IDs agreed with M3-A first. |
| **M3-C · Lunar enemies** | `G/enemies/lunar.ts`, `G/bosses/apogee.ts`, `P/space/enemies/`, lunar combat tests | Five lunar variants, miniboss and Warden; telegraph/reward/one-to-four-player checks. | After encounter interface. |
| **M3-D1/D2 · Space in 2D, two sessions** | `G/renderSpace2d.ts`, `G/render.ts`, space 2D capture script; same owner hands off sequentially | D1: compound, Moon surfaces, suited actions and telegraphs. D2: film compositions and portrait framing. Each supplies native-DPR captures. | After M2 asset contracts; parallel with M3-E, not M1-D. |
| **M3-E1/E2/E3 · Space in 3D, three sessions** | `G/renderSpace3d.ts`, `G/render3d.ts`, `G/terrain3d.ts`, space 3D capture script; sequential ownership | E1: area lifecycle, compound/Moon terrain and disposal. E2: suited combat billboards and telegraphs. E3: film sets, context-loss coverage and captures. | After M2; parallel with 2D sessions. Shared `graphics.ts` integration belongs to M3-F. |
| **M3-Q · Native display budget** | `G/viewport.ts`, `G/qualityRecovery.ts`, quality/viewport test scripts; renderer quality hooks by exclusive handoff | Actual native-DPR backing, effects-first quality policy, performance instrumentation and recovery. Verify DPR 4 without changing world framing. | After renderer integration; no concurrent edits to the render files being tuned. |
| **M3-F · Space integration gate** | Integration owner: `G/graphics.ts`, `G/controller.ts`, `G/motion.ts`, `G/sim.ts`, `G/audio.ts`, `G/music.ts`, page/store HUD hooks | Complete Earth→Moon→Earth trip with saves, co-op and both renderers; native-DPR and suit matrix. Persistence/network owners apply any follow-up only after exclusive file handoff. | M2/M3 outputs merged; block space release until gate passes. |
| **M4-A · City content** | `G/chapters/ch4.ts`, `G/chapters/ch4Worlds.ts`, `P/chapters/ch4/` | Streets, both dungeons, connector, restoration and Architect death scene; graph/quest validation. | After M1; can run while Moon presentation is built. |
| **M4-B · City combat** | `G/enemies/city.ts`, `G/bosses/architect.ts`, city combat tests | Shields, ricochets, Switchmaster and Architect patterns; playable with starter-compatible loadouts. | Parallel with M4-A. |
| **M4-C · City integration** | Integration owner core sim/render/content hooks, by explicit handoff | Jon's ability, restored NPCs, finale entrance; reload and co-op clear checks. | After M4-A/B and M1 tools. |
| **M5-A · Finale content** | `G/chapters/ch5.ts`, `G/chapters/ch5Worlds.ts`, `G/chapters/ending.ts`, `P/chapters/ch5/` | Seven rooms, coherent environment changes, epilogue, postgame routes and quest cameos. | After M1/M2 tool contracts; parallel with M5-B. |
| **M5-B · Creation battle** | `G/bosses/creation.ts`, finale combat tests | Three stages, Homeward Link hook, solo/party/fusion-empty completion and stable retries. | After Update 1 fusion contract and lunar rules. |
| **M5-C · Full campaign gate** | Integration owner core hooks; QA owner new campaign/capture scripts only | Full fresh and migrated playthroughs, completion save, postgame, balance and real-device report. | All milestones. No content session edits core while gate runs. |

Shared UI changes (oxygen status, quest objective, film captions) belong to the integration owner in `src/pages/WaysideFury/page.tsx`, `store.ts`, `style.css` and relevant existing UI modules. Shared collectible additions belong to the persistence/content-registry owner in `S/collectibles.js` and `.d.ts`; chapter sessions submit entries rather than editing that manifest concurrently. `G/dressing.ts` stays under the world/integration owner; chapter gags live in new modules. Registry imports are added once by integration, after individual modules validate.

### Verification checklist for those future builds

- **Current foundations:** run `npm run check:wayside-fury`, cloud check, and relevant existing collision, roads, context-attack, labels, dressing, collectibles, balance, quality and co-op simulation/reward scripts after shared changes. Tests assuming exactly ten Blast maps remain valid; add campaign-map tests rather than weakening that assertion. Use Node 24 as required by this repo.
- **Static/build:** `npx tsc -b`, `npm run lint`, `npm run build`. Server schema/protocol/reward changes require `npm test` plus focused Wayside Fury save, tickets, collectibles and co-op cases. This repo has no advertised `make verify` command; use its actual scripts.
- **Campaign graph:** validate unique IDs, all exit destinations and safe entry points, main-route reachability with only story grants, optional-loop return paths, dynamic fences and checkpoint fallback. Test a one-hero party and all five active identities; no mandatory equipped chip, relic, fusion pair or day/night phase.
- **Moon simulation:** measured post-to-post walking time, zero-air reserve with no penalties, local pause/hidden-tab policy, ordinary dash invulnerability duration, guard braking, blocked traversal landing, no wall tunneling, boss retry and Earth outfit restoration. Same seeded input must yield the same state at different render rates.
- **Film/save:** skip each shot, pause/reload at departure and arrival, reconnect during stage separation, migrate host during landing, and replay after clear. Always land at a valid checkpoint; no duplicate lens, tickets, quest reward or suit inventory write. Compare watched and skipped completion state.
- **Co-op:** one, two and four players; mixed 2D/3D clients; all peers downed; host departure during a bound/pylon interaction; late join on the Moon; one player returning to solo. Preserve HP percentages on live scaling, personal loot, revive access and party-independent field permissions.
- **Visual matrix:** default 2D and `?gfx=3d`, 390 × 844 DPR 3, 844 × 390 DPR 3 and 1440 × 900 DPR 2; add a DPR 4 native-backing assertion. Capture road approach, enclosed compound, each suited hero, helmet close-up, separation, shrinking Earth, M04 traversal, Warden, oxygen reserve, return and ending. Include live captures and sustained performance, not only paused fixtures.
- **Renderer parity:** compare authoritative state/world before and after repeated draw calls; modes share footprints, gates, oxygen, shadow/landing positions, telegraphs and film endpoints. Exercise WebGL failure/context loss mid-Moon, graphics toggles mid-film and remote avatar replacement. All must preserve gameplay through 2D fallback.
- **Browser/audio/accessibility:** use the existing muted Playwright wrapper and `FURY_BASE_URL`/`PLAYWRIGHT_MODULE` conventions from the design review. Run viewport, collision-browser, 3D, context-attack, co-op and WebKit audio checks as relevant. Confirm caption readability, safe areas, scrolled menus, reduced motion, keyboard/gamepad/touch, and no gesture-blocked audio preventing film progress.
- **Human play gate:** finish without optional quests or arena grinding; verify every boss teaches before combining attacks. Play ten minutes on actual target phones in each supported renderer, record thermal/FPS/DPR evidence, and retest only failures or affected areas after changes. Do not inherit green claims from the prior design-review session.

## 11. Risks, scope cuts and questions for Siraj

| Risk | Decision / mitigation |
| --- | --- |
| Update 1 is absent here | Reconcile first. Foundation work is a separate dependency, not hidden inside four content estimates. Reuse its real item/fusion/quest model once available. |
| Space 3D is a larger extension than overworld decoration | Fund it explicitly. Prototype one suited hero, one lunar room and one film shot in both renderers before full art production. Keep non-space dungeons on existing shared 2D behavior for this release. |
| High-detail five-identity suit set grows quickly | Shared rig/atlas metadata and billboard delivery; prototype Joe plus You first, then apply the approved treatment to Matt/Alex/Jon. Required hero coverage and action states cannot be cut. |
| Native DPR plus effects overheats phones | Profile early at real DPR and cut decorative effects first. Batch/cache terrain and props, bound decals/lights and unload unused atlases. Hardware targets and failures must be explicit. |
| Save migration or legacy room logic loses progress | Preserve old IDs, use explicit format migrations and named map adapters; fixture every old save version, HOME retry and existing chapter-2 collectible. Audit receipt capacity before content freezes. |
| Low gravity feels slippery or adds collision exploits | Short steerable bounds, Guard brake, broad landings, walking alternatives and approved links only. Keep hit logic on the ground plane. |
| Oxygen turns a fun trip into chores | Automatic reserve at zero, free nearby air, unlimited option, no punishment. Remove gauge complexity if playtests favor the simpler indicator. |
| Cinematics strand co-op players | Host timeline, versioned snapshots, late-join state, skip voting and safe resume anchors. Film completion and rewards must be idempotent. |
| Power creep trivializes bosses or forces grind | Use measured post-Chapter-1 saves and Update 1 loadouts; change patterns before HP inflation. Keep story abilities guaranteed and optional rewards modest. |
| Final world remix becomes visual noise | Fixed layouts, one environment rule per room, two special enemy behaviors maximum, clear transitions and telegraphs. Preserve the calm ending. |

If schedule tightens, first reduce optional quest count, decorative NPCs, fusion variants and arena challenge modifiers. Then shorten City side streets or the finale's middle rooms. Do **not** cut the visible fenced launch compound, four crew suit variants plus avatar support, suit-up/helmet beat, launch/separation/comedy/shrinking-Earth/landing shots, single playable Moon dungeon, friendly oxygen, lunar boss, return trip, full ending or renderer compatibility. Space is a core chapter, not an optional teaser.

**Open questions for Siraj — proposed defaults so planning can proceed:**

1. Where is Update 1's current branch/design, and which chip/relic slots, fusion pairs, arena rules, radar controls and quest APIs are final? Default: M0 reconciles before implementing content; this checkout is not treated as complete Update 1.
2. Does the four-chapter order work, with space as Chapter 3 and the Architect's death at the end of Chapter 4? Default: keep it; it gives the Moon a consequence and the Creation a full finale.
3. Is the Creation's non-graphic destruction of the Architect and definitive defeat right for the tone, or should it survive as a harmless character? Default: defeat the destructive entity, restore its stolen voices, no sequel bait after dinner.
4. How should You appear beside the four crew members in story films? Default: a fifth foreground participant with alternate headcount captions; never replace a named crew member or force an avatar change.
5. Is actual 3D Moon gameplay the desired optional-mode scope, while other new dungeons keep the current 2D presentation? Default: yes; budget the explicit extension above. Full-campaign 3D would need a separate estimate.
6. Which real iPhone, Android and desktop devices define acceptance, and is an explicitly labeled emergency DPR reduction acceptable outside those targets? Default: native DPR on the agreed modern-device matrix, effects reduced first, all deviations reported.
7. Are the playful launchpad/suit badges and burger-in-space gag on-brand? Default: keep the warm crew banter, modest slapstick and a quiet Earth-view moment.
8. Is a 3–4-hour new main campaign the right size, and should arena replay change site ticket totals? Default: this length; first-clear rewards only until the existing economy policy explicitly approves replay awards.

This document is the planning deliverable. Implementation, art generation, game-code edits, deployment and pushing are outside this change.
