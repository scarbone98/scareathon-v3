# ROADS2 road cleanup

Shared final-network clearance reserves each road ribbon plus an 8-unit (half-tile) shoulder, traversable plazas and vector sidewalks. Plaza furnishing bases and parking bays are deliberate pockets; they never exempt a base from road/shoulder clearance. The mask rejects terrain blades, scatter props, destination miniatures and instanced 3D fragments. Solid offenders move on a deterministic four-unit search grid, carrying their footprints, IDs, labels and radar anchors. The county water tower moves north by 20 units. The parked car has a slightly adjusted, still paved pullout.

Entrance roads receive flared paved thresholds. Roads meeting dirt/ash trails taper into faded gravel with broken edges. Paint stops before thresholds, pavement stops at facade planes and physical gate/barrier bases, and 3D uses the same native artwork draped over terrain with polygon offset and no transparent depth writes. Authored exits, taxi stops, gates, encounter identities, saves and reward receipts are preserved.

All 56 current campaign maps are audited by `scripts/check-wayside-fury-road-clearance.mjs`; the fixture also covers diagonal crossings, shoulders and a road wholly contained in a large prop. Road infrastructure (barriers, portal feet, gate walls and bridge rails) intentionally retains collision. The pre-protocol-6 county keeps its exact frozen geometry for mixed-version peers; the campaign hash regression verifies it. Current protocol-6 parties use the expanded county. Both versions use scatter rejection, and taxi effects/sign interactions resolve the appropriate anchor. No server, save schema, protocol, economy or Update 1 changes.

## Captures

`before/` and `after/` each contain 24 screenshots: water tower, forest/station/launch endings, garden/orchard road stretches; default Canvas and actual Metal WebGL; 390 × 844 DPR 3 and 1440 × 900 DPR 2. The harness pauses simulation and asserts native backing dimensions and active renderer. These are visual fixtures, not sustained real-device performance measurements. The taxi is the player in these staged county views, including the water-tower frame.

Reproduce against one Vite server on port 5223:

```sh
FURY_BASE_URL=http://localhost:5223 node scripts/capture-wayside-fury-roads2.mjs before
FURY_BASE_URL=http://localhost:5223 node scripts/capture-wayside-fury-roads2.mjs after
```

Set `FURY_PLAYWRIGHT_MODULE` if Playwright is installed elsewhere. Every launch includes `--mute-audio`.

## Verification

See `verification.txt` for final results. Correctness review found and resolved a taxi anchor mismatch, contained-road intersection omission and overlapping miniature relocations. Follow-up found no correctness issues. The first full 3D run switched to fallback during a sustained-frame sample while another browser run was active; the isolated rerun timed out waiting for 3D startup. The aggregate full suite is not green; the focused native road matrix, real context-loss/retry and unavailable-WebGL checks pass. The chapter plan and section 11 are unchanged.
