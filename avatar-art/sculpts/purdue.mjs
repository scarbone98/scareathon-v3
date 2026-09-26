// Purdue gear: a crewneck sweatshirt and a ball cap, both carrying the gold
// Motion P (hand-drawn prints: purdue_sweatshirt/p.txt, purdue_cap/p.txt).
import { capsule, ellipsoid, sphere } from "../../scripts/avatar-art/sculpt.mjs";
import { SIDES, bodyFor } from "./body.mjs";

const rib = (x) => ({ ramp: "dye1", shift: x % 2 ? -1 : 0 });
const FRONT_X = 57;
const neckOpen = (x, y, depth) => Math.abs(x + 0.5 - 60) < 9 && y < 73 + depth * Math.exp(-(((x + 0.5 - FRONT_X) / 5) ** 2));
// Where the cap's crown meets the forehead: just above the brows at the
// front, dropping toward the back of the head.
const band = (x) => 43.5 + Math.max(0, x - 52) * 0.13;

export function parts(build) {
  const body = bodyFor(build);
  return {
    sweatshirt: {
      comment: `Purdue P Sweatshirt, build ${build} (sculpted: avatar-art/sculpts/purdue.mjs sweatshirt).`,
      blend: 5,
      shapes: [
        ...body.torso({
          inflate: 2.2,
          material: (x, y) => {
            if (y > 109 || neckOpen(x, y, 1)) return null;
            if (neckOpen(x, y, 3)) return rib(x); // ribbed crew collar
            if (y >= 105) return rib(x); // ribbed waistband
            return "dye1";
          },
        }),
        ...SIDES.flatMap((s) => [
          body.upperArm(s, { inflate: 2, material: "dye1" }),
          body.forearm(s, {
            inflate: 2.1,
            material: (x, y) => {
              if (y > 104) return null;
              if (y === 99) return "dye2"; // gold stripe above the cuff
              return y >= 100 ? rib(x) : "dye1";
            },
          }),
        ]),
      ],
    },
    cap: {
      comment: "Purdue P Cap (sculpted: avatar-art/sculpts/purdue.mjs cap).",
      blend: 3,
      shapes: [
        ellipsoid([63.5, 45, -0.5], [19.3, 15.2, 19], {
          group: "crown",
          material: (x, y) => {
            if (y > band(x)) return null;
            if (y > band(x) - 1.5) return { ramp: "dye1", shift: -1 }; // sweatband edge
            // seams running from the button down the front panels
            const seam = Math.abs(x + 0.5 - (64 - (y - 30) * 0.75));
            return seam < 0.5 ? { ramp: "dye1", shift: -1 } : "dye1";
          },
        }),
        sphere([64, 30.6, 0], 1.6, { group: "button", material: "dye2" }),
        // the bill, pointing forward and toward the viewer's left
        capsule([56, 43.4, 6], [45.5, 44.6, 12], 5.5, 7.5, {
          group: "bill",
          material: (x, y) => (y > 45 ? { ramp: "dye2", shift: -1 } : "dye1"),
          clip: (x, y, z) => y < 42.2 || y > 46,
        }),
      ],
    },
  };
}
