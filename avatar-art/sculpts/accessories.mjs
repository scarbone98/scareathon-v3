// First-pass sculpts for the starter accessories. One export per part.
import { capsule, ellipsoid, sphere } from "../../scripts/avatar-art/sculpt.mjs";

const chain = (group, points, material, extra = {}) =>
  points.slice(1).map(([x, y, z, r], i) => {
    const [px, py, pz, pr] = points[i];
    return capsule([px, py, pz], [x, y, z], pr, r, { group, material, ...extra });
  });

export const parts = {
  horns: {
    comment: "Ram-curl horns (sculpted first pass: avatar-art/sculpts/accessories.mjs horns).",
    blend: 3,
    shapes: [
      ...[1, -1].flatMap((s) =>
        chain(`horn${s}`, [[70, 38, 10, 4.6], [77, 30, 6, 3.8], [84, 27, 2, 3], [89, 31, 0, 2.2], [88, 37, 1, 1.2]].map(([x, ...rest]) => [60 + s * (x - 60), ...rest]), "dye1")
      ),
    ],
  },
  witchHat: {
    comment: "Crooked witch hat (sculpted first pass: avatar-art/sculpts/accessories.mjs witchHat).",
    blend: 6,
    shapes: [
      ellipsoid([60, 40, 0], [34, 3.2, 23], { group: "brim", material: "dye1", blend: 0 }),
      ...chain(
        "cone",
        [[60, 37, 0, 19], [61, 26, -2, 13], [64, 15, -3, 8], [71, 7, -4, 4.5], [80, 5, -4, 2.4], [86, 8, -3, 1]],
        (x, y) => (y >= 30 && y <= 35 ? "dye2" : "dye1")
      ),
      // a stubby candle stuck to the brim, with a wax drip
      capsule([84, 38, 12], [84, 30, 12], 2.4, 2.2, { group: "candle", material: "bone", blend: 0 }),
      sphere([85.5, 36, 13], 1.3, { group: "candle", material: "bone" }),
    ],
  },
  choker: {
    comment: "Choker with a hanging charm (sculpted first pass: avatar-art/sculpts/accessories.mjs choker).",
    blend: 0,
    shapes: [
      ...chain("band", [[53, 86, 0, 1.6], [56, 88, 3, 1.6], [60, 89, 4, 1.6], [64, 88, 3, 1.6], [67, 86, 0, 1.6]], "dye1"),
      sphere([60, 92.5, 6], 2.6, { group: "charm", material: "dye2" }),
      capsule([60, 89, 5], [60, 91, 6], 0.8, 0.8, { group: "charm", material: "steel" }),
    ],
  },
  wings: {
    comment: "Tattered bat wings (sculpted first pass: avatar-art/sculpts/accessories.mjs wings).",
    blend: 2,
    shapes: [1, -1].flatMap((s) => {
      const m = ([x, ...rest]) => [60 + s * (x - 60), ...rest];
      const bone = (points) => chain(`bone${s}`, points.map(m), "dye2");
      return [
        // membrane: a flat ellipsoid with a scalloped lower edge
        ellipsoid(m([27, 86, -12]), [22, 17, 2.5], {
          group: `wing${s}`,
          material: "dye1",
          clip: (x) => {
            const u = s === 1 ? x : 119 - x;
            return u > 46;
          },
        }),
        ...bone([[46, 92, -8, 2.2], [30, 74, -10, 1.8], [8, 78, -11, 1.2]]),
        ...bone([[30, 74, -10, 1.4], [16, 94, -11, 0.9]]),
        ...bone([[30, 74, -10, 1.4], [27, 97, -11, 0.9]]),
      ];
    }).map((shape) => {
      if (!shape.group.startsWith("wing")) return shape;
      const side = shape.group === "wing1" ? 1 : -1;
      const inner = shape.clip;
      return {
        ...shape,
        clip: (x, y, z) => {
          const u = side === 1 ? x : 119 - x;
          return inner(x, y, z) || y > 92 + 6 * Math.abs(Math.sin(((u - 5) * Math.PI) / 11));
        },
      };
    }),
  },
  mask: {
    comment: "Cracked porcelain half-mask over the right eye (sculpted first pass: avatar-art/sculpts/accessories.mjs mask).",
    blend: 0,
    contactLines: false,
    shapes: [
      ellipsoid([60, 68, 9], [19, 15, 15], {
        group: "mask",
        material: "bone",
        // right half of the face, with a hole for the right eye
        clip: (x, y) => x < 60 || y < 57 || y > 80 || ((x - 70.5) / 6.5) ** 2 + ((y - 68) / 6.5) ** 2 < 1 || x > 81 - (y - 57) * 0.25,
      }),
    ],
  },
};
