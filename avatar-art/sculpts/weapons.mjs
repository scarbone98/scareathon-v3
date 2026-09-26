// Weapon sculpts. Held weapons follow the hand of whichever build they are
// sculpted for (body.anchors.hand), so parts(build) is called per build.
import { capsule, ellipsoid, sphere } from "../../scripts/avatar-art/sculpt.mjs";
import { bodyFor } from "./body.mjs";

// Diamond-wrapped handle: dark cord crossing over the dye2 wrap.
const wrap = (x, y) => ((x + y) % 3 === 0 ? "ink" : "dye2");

export function parts(build) {
  const [hx, hy, hz] = bodyFor(build).anchors.hand.near;

  return {
    katanaBack: {
      comment: "Graveblade katana worn on the back: hilt over the near shoulder, scabbard behind the body (sculpted: avatar-art/sculpts/weapons.mjs katanaBack).",
      blend: 1,
      shapes: [
        sphere([92.5, 48.5, -6], 1.5, { group: "hilt", material: "gold" }),
        capsule([92, 49.5, -6], [83.5, 66.5, -6], 1.7, 1.7, { group: "hilt", material: wrap }),
        ellipsoid([83, 68, -6], [2.8, 1.3, 2.8], { group: "guard", material: "gold" }),
        capsule([82.5, 69.5, -8], [38, 121, -10], 2, 1.8, {
          group: "scabbard",
          // a gold collar at the mouth and a gold cap at the tip
          material: (x, y) => (y <= 71 || y >= 119 ? "gold" : "dye1"),
        }),
      ],
    },
    katanaStrap: {
      comment: "Graveblade katana strap across the chest (sculpted: avatar-art/sculpts/weapons.mjs katanaStrap).",
      blend: 0,
      shapes: [
        capsule([75, 75, 9], [50, 104, 10], 0.8, 0.8, {
          group: "strap",
          material: (x, y) => (Math.abs(y - 89) <= 1 ? "gold" : "wood"),
        }),
      ],
    },
    katanaGrip: {
      comment: `Graveblade katana grip, behind the fingers, build ${build} (sculpted: avatar-art/sculpts/weapons.mjs katanaGrip).`,
      blend: 1,
      shapes: [
        sphere([hx - 1.8, hy - 6, hz], 1.3, { group: "grip", material: "gold" }),
        capsule([hx - 1.5, hy - 5, hz], [hx + 1.5, hy + 4, hz], 1.6, 1.6, { group: "grip", material: wrap }),
      ],
    },
    katanaBlade: {
      comment: `Graveblade katana guard and blade, build ${build} (sculpted: avatar-art/sculpts/weapons.mjs katanaBlade).`,
      blend: 1,
      shapes: [
        ellipsoid([hx + 2, hy + 5.5, hz + 1], [3, 1.2, 3], { group: "guard", material: "gold" }),
        // two segments give the blade a katana's gentle curve
        capsule([hx + 2.5, hy + 7, hz + 1], [hx + 11, hy + 24, hz + 2], 1.6, 1.4, { group: "blade", material: "steel", bias: 0.15 }),
        capsule([hx + 11, hy + 24, hz + 2], [hx + 22, hy + 39, hz + 3], 1.4, 0.3, { group: "blade", material: "steel", bias: 0.15 }),
      ],
    },
  };
}
