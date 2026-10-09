PATHS ground regression comparisons

Source audit: f00838e and 114f44f against 1f0f213.
EXITS suppresses Blast road-network artwork and converts road tiles to stone.
The older organic-area overlay then dominates the floor: arbitrary 52–72-unit
contours, car connectors and exit-to-center diagonals, painted in two contrasting
strokes with round caps. Terrain tiles remain visible beneath them. ExitArt also
adds an opaque approach apron. Reverting EXITS alone leaves the older overlay.

The fix uses one scorched-earth or concrete composition per Blast room, cached
at native DPR, with quiet grain and soft material washes. Creek banks and pits
retain their authored extents; organic islands retain their own silhouettes.
Presentation-only trails are 28 units wide (1.75 tiles), routed between actual
entrances, exits and caches with clearance for the entire feathered width.
Corners are rounded only where the curve is clear. Narrow/closed approaches
get an opening without a path. Trail ends fade away rather than forming caps.
Crater/impact footprints are excluded even though gameplay permits walking
through them. Ground, trails, decals and Y-sorted props preserve their ordering.
Woods/City passable floors no longer expose old rectangular paving patches or
tile seams. County/City streets keep the authored road network without a second
unrelated foot-trail overlay. Exit frames/doors remain, with no caption arrow or
opaque outdoor apron. No collision, encounters, rewards or save data change.

Capture folders:
  before: dcee6ec renderers, including the EXITS regression.
  pre-exits: production renderer files from 1f0f213, same authored worlds/poses.
  after: fixed production renderers.

Scorched Road, Split Creek, Ruined Yard and Shattered Courtyard share identical
paused phone framing in all three folders. Fixtures call GraphicsRenderer using
default 2D and selected ?gfx=3d-equivalent routing. Blast intentionally uses the
shared Canvas path in both selections; the harness asserts exact canvas pixel
parity and unchanged simulation. Images are 390x844 at DPR 3; the production
stage backing is 1170x2148 for its 390x716 CSS rectangle. Fixture captions replace
the HUD; these are art/parity inspections, not sustained FPS/device measurements.
Chromium always launches with --mute-audio. Vite uses port 5231.

Reproduce:
  FURY_BASE_URL=http://localhost:5231 node scripts/capture-wayside-fury-paths.mjs after
  FURY_PLAYWRIGHT_MODULE can select an installed Playwright index.mjs.

Save finding: Siraj's AGENT_NOTES.md clarification at 18:30 confirms the LV1
screenshot was a deliberately started NEW GAME. It was not a migration reset;
item (5) was explicitly skipped. No save behavior was changed.

Visual inspection: all four after views have continuous, low-contrast ground.
Scorched Road's worn route skirts the impact bowl; wrecks remain above it.
Split Creek's banks meet the preserved bridges without tan loops or tile blocks.
Ruined Yard and Shattered Courtyard read as concrete spaces with their authored
wreckage/fountain, rather than multiple unrelated material strips. All four are
clearer than both the pre-EXITS and EXITS fixtures. The capture harness completed
all 24 images with native backing sizes, simulation immutability and pixel parity.

Completed verification: changed-file ESLint; npm run check:wayside-fury (full
starter-stat ten-zone Blast/realm run); collision/reachability; areas (81 exits,
nine doors, protocol guards); campaign/save/ticket/co-op; dressing; grounding;
road clearance; quality recovery; exits (103); paths (35 routed trails).
