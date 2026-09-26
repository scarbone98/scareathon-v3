// First-pass sculpts for clothing. Every garment is built from the body's own
// shapes (body.mjs), inflated a little, so it fits the base exactly.
import { capsule, ellipsoid } from "../../scripts/avatar-art/sculpt.mjs";
import * as body from "./body.mjs";

const { SIDES, mx } = body;
const rect = (x, y, x0, y0, x1, y1) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
const onEdge = (x, y, x0, y0, x1, y1) => rect(x, y, x0, y0, x1, y1) && (x === x0 || x === x1 || y === y0 || y === y1);
// A patch in `ramp` with big cross stitches around its edge.
const patch = (x, y, box, ramp) => {
  if (!rect(x, y, ...box)) return null;
  if (onEdge(x, y, ...box)) return (x + y) % 2 === 0 ? { ramp: "bone", shift: 0 } : { ramp, shift: -1 };
  return ramp;
};

export const parts = {
  sweater: {
    comment: "Stitchwork Sweater (sculpted first pass: avatar-art/sculpts/clothing.mjs sweater).",
    blend: 5,
    shapes: [
      ...body.torso({
        inflate: 2,
        material: (x, y) => {
          if (y > 122) return null;
          if (y >= 119) return { ramp: "dye1", shift: x % 2 ? -1 : 0 }; // ribbed hem
          return patch(x, y, [47, 103, 54, 110], "dye2") ?? "dye1";
        },
      }),
      body.neck({ inflate: 1.5, material: (x, y) => (y >= 88 && y <= 91 ? { ramp: "dye1", shift: x % 2 ? -1 : 0 } : null) }),
      ...SIDES.flatMap((s) => [
        body.upperArm(s, { inflate: 2, material: "dye1" }),
        body.forearm(s, {
          inflate: 2.2,
          material: (x, y) => (y > 121 ? null : y >= 117 ? { ramp: "dye1", shift: x % 2 ? -1 : 0 } : "dye1"),
        }),
      ]),
    ],
  },
  tee: {
    comment: "Grave Tee body and sleeves (sculpted first pass: avatar-art/sculpts/clothing.mjs tee).",
    blend: 5,
    shapes: [
      ...body.torso({
        inflate: 1,
        material: (x, y) => (y > 123 ? null : y < 90 + 4 * Math.exp(-(((x - 60) / 5) ** 2)) ? null : "dye1"),
      }),
      ...SIDES.map((s) => body.upperArm(s, { inflate: 1.4, material: (x, y) => (y > 105 ? null : "dye1") })),
    ],
  },
  skirt: {
    comment: "Tattered Skirt, two layers (sculpted first pass: avatar-art/sculpts/clothing.mjs skirt).",
    blend: 0,
    shapes: [
      // the lining peeks out below the top layer
      capsule([60, 113, 0], [60, 131, 0], 13.2, 19.2, {
        group: "under",
        material: (x, y) => (y < 120 || y > 137 + 2 * Math.abs(Math.sin(x * 0.9)) ? null : { ramp: "dye2", shift: Math.cos((x - 60) * 0.9) > 0.5 ? -1 : 0 }),
      }),
      capsule([60, 112, 0], [60, 130, 0], 13.8, 19.8, {
        group: "top",
        material: (x, y) => {
          if (y < 111) return null;
          const hem = 132 + 3 * Math.abs(Math.sin(x * 1.3)) - (x % 7 === 0 ? 3 : 0);
          if (y > hem) return null;
          if (y <= 114) return "dye2"; // waistband
          return { ramp: "dye1", shift: Math.cos((x - 60) * 0.9) > 0.55 ? -1 : 0 };
        },
      }),
    ],
  },
  stockings: {
    comment: "Hex Stockings (sculpted first pass: avatar-art/sculpts/clothing.mjs stockings).",
    shapes: SIDES.flatMap((s) => {
      const material = (x, y) => {
        if (y < 128) return null;
        if (y <= 129) return { ramp: "dye2", shift: 1 };
        return body.stripes(y, 3, "dye1", "dye2");
      };
      return [body.thigh(s, { inflate: 0.6, material }), body.shin(s, { inflate: 0.6, material }), body.foot(s, { inflate: 0.4, material: "dye1" })];
    }),
  },
  trousers: {
    comment: "Patched Trousers with a belt (sculpted first pass: avatar-art/sculpts/clothing.mjs trousers).",
    blend: 5,
    shapes: [
      body.hips({
        inflate: 1.2,
        material: (x, y) => {
          if (y < 110) return null;
          if (y <= 112) return Math.abs(x + 0.5 - 60) <= 2 ? "gold" : "wood";
          return "dye1";
        },
      }),
      ...SIDES.flatMap((s) => {
        const material = (x, y) => {
          if (y > 144) return null;
          if (y >= 142) return { ramp: "dye1", shift: -1 };
          return (s === -1 && patch(x, y, [63, 128, 69, 134], "dye2")) || "dye1";
        };
        return [body.thigh(s, { inflate: 1.8, material }), body.shin(s, { inflate: 2.2, material })];
      }),
    ],
  },
  boots: {
    comment: "Buckle Boots (sculpted first pass: avatar-art/sculpts/clothing.mjs boots).",
    blend: 4,
    shapes: SIDES.flatMap((s) => {
      const cx = mx(s, 53);
      const material = (x, y) => {
        if (y < 136) return null;
        if (y <= 137) return { ramp: "dye1", shift: 1 }; // folded cuff
        if (y >= 140 && y <= 141) return Math.abs(x + 0.5 - cx) <= 1.5 ? "gold" : "dye2";
        if (y >= 148) return "night";
        return "dye1";
      };
      return [body.shin(s, { inflate: 1.6, material }), body.foot(s, { inflate: 1.3, material })];
    }),
  },
  creepers: {
    comment: "Grave Creepers with a thick crepe sole (sculpted first pass: avatar-art/sculpts/clothing.mjs creepers).",
    blend: 3,
    shapes: SIDES.flatMap((s) => [
      body.foot(s, { inflate: 1.5, material: (x, y) => (y === 144 ? "dye2" : "dye1") }),
      ellipsoid([mx(s, 52), 147.6, 3], [7.4, 1.9, 7], { group: `foot${s}`, material: { ramp: "bone", shift: -1 }, blend: 1 }),
    ]),
  },
};

// Gravewarden Hood & Cloak: hood shell (head), hood inside + cloak lining
// (back), mantle and long front panels (outer).
const tatter = (x, seed = 0) => 2.5 * Math.abs(Math.sin(x * 1.1 + seed)) + (x % 6 === 0 ? 2 : 0);
const hoodOpening = (x, y) => ((x + 0.5 - 60) / 19.5) ** 2 + ((y - 71) / 24) ** 2;
const panelOpen = (x, y) => Math.abs(x + 0.5 - 60) < 8 + (y - 96) * 0.16;

export const cloakParts = {
  cloakHead: {
    comment: "Gravewarden hood shell (sculpted first pass: avatar-art/sculpts/clothing.mjs cloakHead).",
    blend: 8,
    shapes: (() => {
      const material = (x, y) => {
        const d = hoodOpening(x, y);
        if (d < 1 || y > 97) return null;
        return d < 1.18 ? { ramp: "dye1", shift: 1 } : "dye1";
      };
      return [
        ellipsoid([60, 56, -1], [29.5, 28.5, 26], { group: "hood", material }),
        ellipsoid([60, 31, -4], [9, 6, 8], { group: "hood", material }), // soft peak
        // the hood falls over the hair and onto the shoulders
        ...SIDES.map((s) => capsule([mx(s, 36), 66, 4], [mx(s, 34), 94, 2], 8, 10, { group: "hood", material })),
      ];
    })(),
  },
  cloakBack: {
    comment: "Gravewarden hood inside and cloak lining (sculpted first pass: avatar-art/sculpts/clothing.mjs cloakBack).",
    contactLines: false,
    shapes: [
      ellipsoid([60, 57, -8], [28.5, 27.5, 18], { group: "hood", material: (x, y) => (y > 92 ? null : { ramp: "dye1", shift: -2 }) }),
      ellipsoid([60, 121, -14], [26, 27, 3], {
        group: "lining",
        material: (x, y) => (y < 94 || y > 145 - tatter(x, 2) ? null : { ramp: "dye2", shift: -1 }),
      }),
    ],
  },
  cloakOuter: {
    comment: "Gravewarden mantle and front panels (sculpted first pass: avatar-art/sculpts/clothing.mjs cloakOuter).",
    blend: 4,
    shapes: [
      ...SIDES.map((s) =>
        capsule([mx(s, 45), 96, 5], [mx(s, 37), 142, 3], 7.5, 12.5, {
          group: `panel${s}`,
          material: (x, y) => {
            if (y > 145 - tatter(x) || panelOpen(x, y)) return null;
            if (panelOpen(x + 2 * s, y) || panelOpen(x + s, y)) return "dye2"; // lining turned out along the edge
            return { ramp: "dye1", shift: Math.cos((x - 60) * 0.8) > 0.6 ? -1 : 0 };
          },
        })
      ),
      ellipsoid([60, 97, 2], [24.5, 10, 16], {
        group: "mantle",
        blend: 0,
        material: (x, y) => (y < 87 || y > 102 + tatter(x, 1) ? null : { ramp: "dye1", shift: y <= 90 ? 1 : 0 }),
      }),
    ],
  },
};
