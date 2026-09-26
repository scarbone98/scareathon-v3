// Clothing sculpts. Every garment is built from the body's own shapes
// (body.mjs), inflated a little, so it fits whichever build it's sculpted for:
// parts(build) is called once per build by resculpt.mjs.
import { capsule, ellipsoid } from "../../scripts/avatar-art/sculpt.mjs";
import { SIDES, bodyFor } from "./body.mjs";

const rect = (x, y, x0, y0, x1, y1) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
const onEdge = (x, y, x0, y0, x1, y1) => rect(x, y, x0, y0, x1, y1) && (x === x0 || x === x1 || y === y0 || y === y1);
// A patch in `ramp` with big cross stitches around its edge.
const patch = (x, y, box, ramp) => {
  if (!rect(x, y, ...box)) return null;
  if (onEdge(x, y, ...box)) return (x + y) % 2 === 0 ? "bone" : { ramp, shift: -1 };
  return ramp;
};
const rib = (x) => ({ ramp: "dye1", shift: x % 2 ? -1 : 0 });
const tatter = (x, seed = 0) => 2.5 * Math.abs(Math.sin(x * 1.1 + seed)) + (x % 6 === 0 ? 2 : 0);
// Front centre of the turned torso, and the neckline across it.
const FRONT_X = 57;
// True inside the neck opening: a scoop `depth` px deep around the neck only,
// so the shoulders stay covered.
const neckOpen = (x, y, depth) => Math.abs(x + 0.5 - 60) < 9 && y < 73 + depth * Math.exp(-(((x + 0.5 - FRONT_X) / 5) ** 2));

export function parts(build) {
  const body = bodyFor(build);
  const { anchors } = body;
  const shinX = (side) => anchors.shin[side][1][0];

  return {
    sweater: {
      comment: `Stitchwork Sweater, build ${build} (sculpted: avatar-art/sculpts/clothing.mjs sweater).`,
      blend: 5,
      shapes: [
        ...body.torso({
          inflate: 2,
          material: (x, y) => {
            if (y > 108 || neckOpen(x, y, 2)) return null;
            if (y >= 105) return rib(x); // ribbed hem
            return patch(x, y, [63, 83, 69, 89], "dye2") ?? "dye1";
          },
        }),
        ...SIDES.flatMap((s) => [
          body.upperArm(s, { inflate: 1.7, material: "dye1" }),
          body.forearm(s, { inflate: 1.9, material: (x, y) => (y > 104 ? null : y >= 100 ? rib(x) : "dye1") }),
        ]),
      ],
    },
    tee: {
      comment: `Grave Tee, build ${build} (sculpted: avatar-art/sculpts/clothing.mjs tee).`,
      blend: 5,
      shapes: [
        ...body.torso({ inflate: 1, material: (x, y) => (y > 108 || neckOpen(x, y, 4) ? null : "dye1") }),
        ...SIDES.map((s) => body.upperArm(s, { inflate: 1.2, material: (x, y) => (y > 87 ? null : "dye1") })),
      ],
    },
    skirt: {
      comment: `Tattered Skirt, two layers, build ${build} (sculpted: avatar-art/sculpts/clothing.mjs skirt).`,
      blend: 0,
      shapes: [
        // the lining peeks out below the top layer
        capsule([61, 101, 0], [61, 118, 0], 12.2, 17.2, {
          group: "under",
          material: (x, y) => (y < 108 || y > 123 + 2 * Math.abs(Math.sin(x * 0.9)) ? null : { ramp: "dye2", shift: Math.cos((x - 61) * 0.9) > 0.5 ? -1 : 0 }),
        }),
        capsule([61, 100, 0], [61, 117, 0], 12.8 + (build === "m" ? 0.5 : 0), 17.8, {
          group: "top",
          material: (x, y) => {
            if (y < 99) return null;
            const hem = 119 + 3 * Math.abs(Math.sin(x * 1.3)) - (x % 7 === 0 ? 3 : 0);
            if (y > hem) return null;
            if (y <= 101) return "dye2"; // waistband
            return { ramp: "dye1", shift: Math.cos((x - 61) * 0.9) > 0.55 ? -1 : 0 };
          },
        }),
      ],
    },
    stockings: {
      comment: `Hex Stockings, build ${build} (sculpted: avatar-art/sculpts/clothing.mjs stockings).`,
      shapes: SIDES.flatMap((s) => {
        const material = (x, y) => {
          if (y < 113) return null;
          if (y <= 114) return { ramp: "dye2", shift: 1 };
          return Math.floor(y / 3) % 2 === 0 ? "dye1" : "dye2";
        };
        return [body.thigh(s, { inflate: 0.6, material }), body.shin(s, { inflate: 0.6, material }), body.foot(s, { inflate: 0.4, material: "dye1" })];
      }),
    },
    trousers: {
      comment: `Patched Trousers with a belt, build ${build} (sculpted: avatar-art/sculpts/clothing.mjs trousers).`,
      blend: 5,
      shapes: [
        body.hips({
          inflate: 1.2,
          material: (x, y) => {
            if (y < 98) return null;
            if (y <= 100) return Math.abs(x + 0.5 - FRONT_X) <= 2 ? "gold" : "wood";
            return "dye1";
          },
        }),
        ...SIDES.flatMap((s) => {
          const material = (x, y) => {
            if (y > 140) return null;
            if (y >= 138) return { ramp: "dye1", shift: -1 };
            return (s === "near" && patch(x, y, [65, 117, 71, 123], "dye2")) || "dye1";
          };
          return [body.thigh(s, { inflate: 1.8, material }), body.shin(s, { inflate: 2.2, material })];
        }),
      ],
    },
    boots: {
      comment: `Buckle Boots, build ${build} (sculpted: avatar-art/sculpts/clothing.mjs boots).`,
      blend: 4,
      shapes: SIDES.flatMap((s) => {
        const cx = shinX(s) - 1;
        const material = (x, y) => {
          if (y < 131) return null;
          if (y <= 132) return { ramp: "dye1", shift: 1 }; // folded cuff
          if (y >= 135 && y <= 136) return Math.abs(x + 0.5 - cx) <= 1.5 ? "gold" : "dye2";
          if (y >= 145) return "night";
          return "dye1";
        };
        return [body.shin(s, { inflate: 1.6, material }), body.foot(s, { inflate: 1.3, material })];
      }),
    },
    creepers: {
      comment: `Grave Creepers with a thick crepe sole, build ${build} (sculpted: avatar-art/sculpts/clothing.mjs creepers).`,
      blend: 3,
      shapes: SIDES.flatMap((s) => {
        const [fx, fy, fz] = anchors.foot[s];
        return [
          body.foot(s, { inflate: 1.5, material: (x, y) => (y === Math.round(fy) - 1 ? "dye2" : "dye1") }),
          ellipsoid([fx - 0.5, fy + 3, fz], [7, 1.8, 6.5], { group: `foot-${s}`, material: { ramp: "bone", shift: -1 }, blend: 1 }),
        ];
      }),
    },
    cloakHead: {
      comment: "Gravewarden hood shell (sculpted: avatar-art/sculpts/clothing.mjs cloakHead).",
      blend: 6,
      shapes: (() => {
        const opening = (x, y) => ((x + 0.5 - 58) / 14) ** 2 + ((y - 57) / 17) ** 2;
        const material = (x, y) => {
          const d = opening(x, y);
          if (d < 1 || y > 80) return null;
          return d < 1.2 ? { ramp: "dye1", shift: 1 } : "dye1";
        };
        return [
          ellipsoid([63.5, 48, -1], [21.5, 21, 19.5], { group: "hood", material }),
          ellipsoid([65, 29, -3], [6.5, 4.5, 6], { group: "hood", material }), // soft peak
          // the hood falls over the hair and onto the shoulders
          capsule([46, 56, 3], [45, 77, 2], 6, 7.5, { group: "hood", material }),
          capsule([80, 56, 0], [79, 77, -1], 6.5, 8, { group: "hood", material }),
        ];
      })(),
    },
    cloakBack: {
      comment: `Gravewarden hood inside and cloak lining, build ${build} (sculpted: avatar-art/sculpts/clothing.mjs cloakBack).`,
      contactLines: false,
      shapes: [
        ellipsoid([63.5, 49, -8], [20.5, 20, 13], { group: "hood", material: (x, y) => (y > 76 ? null : { ramp: "dye1", shift: -2 }) }),
        ellipsoid([61, 108, -14], [23, 31, 3], {
          group: "lining",
          material: (x, y) => (y < 78 || y > 140 - tatter(x, 2) ? null : { ramp: "dye2", shift: -1 }),
        }),
      ],
    },
    cloakOuter: {
      comment: `Gravewarden mantle and front panels, build ${build} (sculpted: avatar-art/sculpts/clothing.mjs cloakOuter).`,
      blend: 4,
      shapes: (() => {
        const open = (x, y) => Math.abs(x + 0.5 - FRONT_X) < 5 + (y - 80) * 0.17;
        const panel = (a, b, ra, rb, group) =>
          capsule(a, b, ra, rb, {
            group,
            material: (x, y) => {
              if (y > 140 - tatter(x) || open(x, y)) return null;
              if (open(x + 2, y) || open(x - 2, y)) return "dye2"; // lining turned out along the edge
              return { ramp: "dye1", shift: Math.cos((x - 61) * 0.8) > 0.6 ? -1 : 0 };
            },
          });
        return [
          panel([48, 80, 3], [41, 136, 1], 6.5, 10.5, "panel-far"),
          panel([74, 80, 5], [81, 136, 4], 7, 11.5, "panel-near"),
          ellipsoid([61, 80, 1], [21, 7.5, 13], {
            group: "mantle",
            blend: 0,
            material: (x, y) => (y < 73 || y > 84 + tatter(x, 1) ? null : { ramp: "dye1", shift: y <= 75 ? 1 : 0 }),
          }),
        ];
      })(),
    },
  };
}
