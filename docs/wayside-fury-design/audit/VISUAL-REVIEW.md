# Independent baseline visual review

Native-DPR phone captures of `origin/main` were inspected directly. These are fixture views, not real-phone performance measurements. Coordinates can place the taxi inside water deliberately to expose the bank; this is not evidence of a collision failure.

| Severity | Element | Baseline evidence | Acceptance |
| --- | --- | --- | --- |
| High | Repeating reservoir channels and square banks read as horizontal terrain bands. Fine wave marks repeat uniformly instead of indicating depth. | [Reservoir north](before/390x844-2d-reservoir-north.png) | Organic bank treatment, shallow/deep falloff, quieter staggered motion; preserve safe road, checkpoint and exit reachability. |
| Medium | West lake has a ruler-straight sand/water boundary and repeated tile-sized wave motifs. | [West lake](before/390x844-2d-west-lake.png) | Rounded connected shoreline, continuous wet bank/foam and world-space ripples. |
| Medium | Woods gate apron and surrounding corruption visibly repeat cell borders/crack shapes; grass transition is an abrupt rectangular edge. | [Woods edge](before/390x844-2d-woods-edge.png) | Suppress county tile-grid bevels, soften the material join without changing collision. |
| Medium | Launch compound county approach repeats a regular stone grid. | [Launch junction](before/390x844-2d-launch-junction.png) | Quieter county-only paving detail; keep the compound and gate footprints. |
| Medium | County cliff texture rotates its strong strata between adjacent tiles and resembles metal grating. | [Woods cliff](before/390x844-3d-woods-edge.png) | Fine quiet strata, aligned across the slope; preserve elevation and actor footing. |
| Medium | Curved county lanes lose dash rhythm at polyline vertices. Existing curbs themselves are continuous and anti-aliased. | [Station junction](before/390x844-2d-station-junction.png), [Orchard edge](before/390x844-2d-orchard-edge.png) | Full arc-length dashes through bends; open junctions; preserve the county and legacy co-op road geometry. |

No authored road overpass or zebra crosswalk exists in this county map. The causeway is an at-grade water crossing. Dungeon bridges, room interiors and Blast-room ground are outside this audit.

3D layering review verifies that county-water decals draw below the causeway decal: transparent decals with `depthWrite:false` need explicit road/water ordering, even when road geometry is slightly higher. Lake UV animation must not translate the shoreline foam. Compare every fixed location in all four viewport/renderer combinations before marking these findings resolved.
