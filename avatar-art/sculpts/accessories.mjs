// Sculpts for the starter accessories, fitted to the shared 3/4 head
// (centre 63, 49) and the neck/shoulders both builds share.
import { capsule, ellipsoid, sphere } from "../../scripts/avatar-art/sculpt.mjs";

const chain = (group, points, material, extra = {}) =>
  points.slice(1).map(([x, y, z, r], i) => {
    const [px, py, pz, pr] = points[i];
    return capsule([px, py, pz], [x, y, z], pr, r, { group, material, ...extra });
  });

const scallop = (x, y, top, period) => y > top + 5 * Math.abs(Math.sin((x * Math.PI) / period));

export const parts = {
  horns: {
    comment: "Ram-curl horns (sculpted: avatar-art/sculpts/accessories.mjs horns).",
    blend: 3,
    shapes: [
      ...chain("near", [[70.2, 33.9, 7.2, 3.8], [75.4, 27.6, 4.3, 3.1], [80.8, 25.2, 1.4, 2.5], [84.6, 28.3, 0, 1.8], [83.8, 33.2, 0.7, 0.9]], "dye1"),
      ...chain("far", [[53.6, 33.2, 8.6, 3.5], [49.1, 26.9, 6.5, 2.9], [44.6, 25.2, 5, 2.2], [41.5, 28.3, 4.3, 1.6], [42.3, 32.4, 4.3, 0.8]], "dye1"),
    ],
  },
  witchHat: {
    comment: "Crooked witch hat (sculpted: avatar-art/sculpts/accessories.mjs witchHat).",
    blend: 5,
    shapes: [
      ellipsoid([63, 35.3, 0], [25.5, 2.4, 17], { group: "brim", material: "dye1", blend: 0 }),
      ...chain(
        "cone",
        [[63, 33.2, 0, 14.3], [63.7, 25.2, -1.4, 9.8], [65.9, 17.3, -2.2, 6], [70.9, 11.6, -2.9, 3.4], [77.4, 10.1, -2.9, 1.8], [81.7, 12.3, -2.2, 0.7]],
        (x, y) => (y >= 28 && y <= 31 ? "dye2" : "dye1")
      ),
      // a stubby candle stuck to the brim, with a wax drip
      capsule([80.3, 33.9, 8.6], [80.3, 28.1, 8.6], 1.9, 1.8, { group: "candle", material: "bone", blend: 0 }),
      sphere([81.5, 32.4, 9.4], 1, { group: "candle", material: "bone" }),
    ],
  },
  choker: {
    comment: "Choker with a hanging charm (sculpted: avatar-art/sculpts/accessories.mjs choker).",
    blend: 0,
    shapes: [
      ...chain("band", [[55, 69.5, 0, 1.3], [57, 71.5, 3, 1.3], [60, 72.5, 4.5, 1.3], [63, 72, 3.5, 1.3], [66.5, 70, 0, 1.3]], "dye1"),
      sphere([59.5, 75.8, 6], 2.1, { group: "charm", material: "dye2" }),
      capsule([59.5, 73, 5], [59.5, 74.5, 6], 0.7, 0.7, { group: "charm", material: "steel" }),
    ],
  },
  wings: {
    comment: "Tattered bat wings (sculpted: avatar-art/sculpts/accessories.mjs wings).",
    blend: 2,
    shapes: [
      // membranes: flat ellipsoids with a scalloped lower edge
      ellipsoid([29, 70, -12], [20, 15, 2.5], {
        group: "farWing",
        material: "dye1",
        clip: (x, y) => scallop(x - 9, y, 74, 10) || x > 47,
      }),
      ellipsoid([93, 68, -14], [20, 16, 2.5], {
        group: "nearWing",
        material: "dye1",
        clip: (x, y) => scallop(x - 73, y, 74, 10) || x < 75,
      }),
      // arm bones along the top edge and down into each scallop
      ...chain("farBone", [[47, 76, -8, 2], [32, 58, -10, 1.6], [11, 62, -11, 1.1]], "dye2"),
      ...chain("farBone", [[32, 58, -10, 1.3], [19, 76, -11, 0.8]], "dye2"),
      ...chain("farBone", [[32, 58, -10, 1.3], [29, 79, -11, 0.8]], "dye2"),
      ...chain("nearBone", [[75, 76, -10, 2], [90, 56, -12, 1.6], [111, 60, -13, 1.1]], "dye2"),
      ...chain("nearBone", [[90, 56, -12, 1.3], [103, 76, -13, 0.8]], "dye2"),
      ...chain("nearBone", [[90, 56, -12, 1.3], [92, 79, -13, 0.8]], "dye2"),
    ],
  },
  mask: {
    comment: "Porcelain half-mask over the near eye (sculpted: avatar-art/sculpts/accessories.mjs mask).\nThe cracks are a separate hand-drawn part, cracks.txt.",
    blend: 0,
    contactLines: false,
    shapes: [
      ellipsoid([60, 55.5, 7], [13.5, 11, 12], {
        group: "mask",
        material: (x, y) => (x >= 72 - (y - 44) * 0.3 ? { ramp: "bone", shift: -1 } : "bone"),
        clip: (x, y) =>
          x < 53 || y < 44 || y > 65 || ((x + 0.5 - 57.5) / 4.6) ** 2 + ((y + 0.5 - 55) / 5.2) ** 2 < 1 || x > 75 - (y - 44) * 0.3,
      }),
    ],
  },
};
