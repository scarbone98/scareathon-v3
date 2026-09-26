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
      ...chain("near", [[72, 38, 10, 4.6], [79, 30, 6, 3.8], [86, 27, 2, 3], [91, 31, 0, 2.2], [90, 37, 1, 1.2]], "dye1"),
      ...chain("far", [[49, 37, 12, 4.2], [43, 29, 9, 3.5], [37, 27, 7, 2.7], [33, 31, 6, 2], [34, 36, 6, 1.1]], "dye1"),
    ],
  },
  witchHat: {
    comment: "Crooked witch hat (sculpted first pass: avatar-art/sculpts/accessories.mjs witchHat).",
    blend: 6,
    shapes: [
      ellipsoid([62, 40, 0], [34, 3.2, 23], { group: "brim", material: "dye1", blend: 0 }),
      ...chain(
        "cone",
        [[62, 37, 0, 19], [63, 26, -2, 13], [66, 15, -3, 8], [73, 7, -4, 4.5], [82, 5, -4, 2.4], [88, 8, -3, 1]],
        (x, y) => (y >= 30 && y <= 35 ? "dye2" : "dye1")
      ),
      // a stubby candle stuck to the brim, with a wax drip
      capsule([86, 38, 12], [86, 30, 12], 2.4, 2.2, { group: "candle", material: "bone", blend: 0 }),
      sphere([87.5, 36, 13], 1.3, { group: "candle", material: "bone" }),
    ],
  },
  choker: {
    comment: "Choker with a hanging charm (sculpted first pass: avatar-art/sculpts/accessories.mjs choker).",
    blend: 0,
    shapes: [
      ...chain("band", [[53, 86, 0, 1.6], [56, 88, 3, 1.6], [60, 89, 4, 1.6], [64, 88, 3, 1.6], [67, 86, 0, 1.6]], "dye1"),
      sphere([58, 92, 6], 2.6, { group: "charm", material: "dye2" }),
      capsule([58, 89, 5], [58, 91, 6], 0.8, 0.8, { group: "charm", material: "steel" }),
    ],
  },
  wings: {
    comment: "Tattered bat wings (sculpted first pass: avatar-art/sculpts/accessories.mjs wings).",
    blend: 2,
    shapes: [
      // membranes: flat ellipsoids with a scalloped lower edge
      ellipsoid([27, 88, -12], [22, 17, 2.5], {
        group: "farWing",
        material: "dye1",
        clip: (x, y) => y > 92 + 6 * Math.abs(Math.sin(((x - 5) * Math.PI) / 11)) || x > 46,
      }),
      ellipsoid([93, 86, -14], [22, 18, 2.5], {
        group: "nearWing",
        material: "dye1",
        clip: (x, y) => y > 92 + 6 * Math.abs(Math.sin(((x - 71) * Math.PI) / 11)) || x < 74,
      }),
      // arm bones along the top edge and down into each scallop
      ...chain("farBone", [[46, 92, -8, 2.2], [30, 74, -10, 1.8], [8, 78, -11, 1.2]], "dye2"),
      ...chain("farBone", [[30, 74, -10, 1.4], [16, 94, -11, 0.9]], "dye2"),
      ...chain("farBone", [[30, 74, -10, 1.4], [27, 97, -11, 0.9]], "dye2"),
      ...chain("nearBone", [[74, 92, -10, 2.2], [90, 72, -12, 1.8], [113, 76, -13, 1.2]], "dye2"),
      ...chain("nearBone", [[90, 72, -12, 1.4], [104, 94, -13, 0.9]], "dye2"),
      ...chain("nearBone", [[90, 72, -12, 1.4], [93, 97, -13, 0.9]], "dye2"),
    ],
  },
  mask: {
    comment: "Cracked porcelain half-mask over the near eye (sculpted first pass: avatar-art/sculpts/accessories.mjs mask).",
    blend: 0,
    contactLines: false,
    shapes: [
      ellipsoid([57, 68, 9], [18, 15, 16], {
        group: "mask",
        material: "bone",
        clip: (x, y) =>
          x < 53 || y < 57 || y > 80 || ((x - 58.5) / 6) ** 2 + ((y - 68.5) / 6.5) ** 2 < 1 || x > 76 - (y - 57) * 0.3,
      }),
    ],
  },
};
