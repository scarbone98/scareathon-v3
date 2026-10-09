EXITS — Siraj's Blast Site / Split Creek report, 2026-10-08

Striped transition floors, green arrow circles and interior exit mats are replaced
by native Canvas terrain openings, side framing, edge shade and hinged door art.
Destination names and subtle chevrons appear within 48 world units (three tiles)
of a room trigger. County entrance cues use the same three-tile range.

Blast carriageways render as ruined paving. Asphalt ribbons and road paint are
limited to authored county, hub and City street scenes; local streets continue
edge-to-edge. ROADS2 clipping and termination artwork run only in the overworld.
Dirt/paving borders have irregular fine gravel contours. Existing scorched impact
bowls remain authored scenery, not manholes.

The simulation, world content, trigger rectangles, collision, spawn coordinates,
destinations, save schema, ticket receipts and co-op protocol are unchanged.
No migration is needed for this presentation-only fix. No Update 1 systems added.

Reproduce screenshots:
  VITE_SUPABASE_URL=http://127.0.0.1:9 VITE_SUPABASE_ANON_KEY=local-fixture npm run dev -- --port 5225 --strictPort
  FURY_BASE_URL=http://localhost:5225 node scripts/capture-wayside-fury-exits.mjs before|after
Use an unchanged checkout for "before". FURY_PLAYWRIGHT_MODULE can select another
Playwright installation. Chromium always launches with --mute-audio.

The five iPhone-size fixtures are Blast entrance, Split Creek, county/Woods
approach, Station interior return door and Ranger Lay-by seam, at 390x844 DPR 3.
Each is captured with default 2D and the optional 3D preference. County uses real
Metal WebGL; Blast, Woods and interiors intentionally retain shared Canvas.
Metrics assert native backing dimensions and report the active renderer. The
after run also checks unavailable-WebGL fallback. These are paused inspection
fixtures, not real-phone performance measurements.

Checks: npx tsc -b; ESLint on changed files; npm run check:wayside-fury; exit,
area reachability, collision, grounding, roads, road network and road clearance
scripts. Area checks include nine save/return/retry loops and legacy co-op guards.
