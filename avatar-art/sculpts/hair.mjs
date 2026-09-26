// More hairstyles on the shared 3/4 head (cranium centre 63, 49; the face is
// toward the lower left). Each style has a front part (hair_front, drawn over
// the face) and a back part (hair_back, behind the head and body).
import { capsule, ellipsoid, sphere } from "../../scripts/avatar-art/sculpt.mjs";

const hair = "hair";
const lock = (name, a, b, ra, rb = 0.4) => capsule(a, b, ra, rb, { group: name, material: hair });
// A lock with a bend in the middle, for waves.
const wave = (name, a, mid, b, ra, rm, rb = 0.5) => [
  capsule(a, mid, ra, rm, { group: name, material: hair }),
  capsule(mid, b, rm, rb, { group: name, material: hair }),
];
// The face opening every front cap cuts: open below `hairline` on the face
// side, and nothing below `bottom`.
const faceCut = (hairline, bottom) => (x, y) =>
  (x < 75.3 + 0.45 * (y - 49) && y > hairline + 0.1 * (x - 63)) || y > bottom;
const nape = (name) => ellipsoid([66, 50, -5], [18.6, 17.8, 13], { group: name, material: hair });

export const parts = {
  // Grave Crop: short and spiky, sticking up and back.
  cropFront: {
    comment: "Grave Crop, front (sculpted: avatar-art/sculpts/hair.mjs cropFront).",
    shapes: [
      ellipsoid([64, 46, 0], [18.8, 17.3, 17.2], { group: "cap", material: hair, clip: faceCut(40.5, 54) }),
      lock("s1", [52, 34, 12], [46, 26, 10], 4),
      lock("s2", [58, 32, 13], [55, 22, 9], 4.5),
      lock("s3", [65, 31, 11], [67, 21, 6], 4.5),
      lock("s4", [72, 33, 7], [78, 24, 3], 4.2),
      lock("s5", [78, 38, 3], [85, 31, -1], 3.6),
      lock("f1", [50, 37, 16], [47, 44, 15], 3.6),
      lock("f2", [56, 36, 18], [54, 45, 16], 3.8),
      lock("f3", [63, 36, 18], [62, 43, 16], 3.5),
      lock("burn", [78, 46, 10], [78, 56, 9], 2.4, 1),
    ],
  },
  cropBack: {
    comment: "Grave Crop, back (sculpted: avatar-art/sculpts/hair.mjs cropBack).",
    shapes: [nape("nape")],
  },

  // Undertaker Sweep: a raised quiff with strands combed straight back.
  sweepFront: {
    comment: "Undertaker Sweep, front (sculpted: avatar-art/sculpts/hair.mjs sweepFront).",
    shapes: [
      ellipsoid([64, 46.5, 0], [18.6, 17.3, 17.1], { group: "cap", material: hair, clip: faceCut(39, 55) }),
      // the quiff rises off the forehead, then each strand sweeps back
      lock("q1", [50, 35, 14], [60, 26, 12], 4.2, 3),
      ...wave("s1", [52, 37, 15], [62, 27, 11], [84, 34, -4], 3.6, 3.2, 1),
      ...wave("s2", [57, 35, 16], [66, 27, 9], [86, 40, -6], 3.6, 3.2, 1),
      ...wave("s3", [62, 36, 16], [71, 30, 8], [85, 46, -6], 3.4, 3, 1),
      ...wave("s4", [55, 40, 16], [70, 35, 12], [82, 50, 0], 3, 2.6, 1),
      lock("burn", [78, 46, 10], [78, 55, 9], 2.2, 1),
    ],
  },
  sweepBack: {
    comment: "Undertaker Sweep, back (sculpted: avatar-art/sculpts/hair.mjs sweepBack).",
    shapes: [nape("nape")],
  },

  // Ghoul Mop: shaggy, jaw length, the fringe falling over the far eye.
  mopFront: {
    comment: "Ghoul Mop, front (sculpted: avatar-art/sculpts/hair.mjs mopFront).",
    shapes: [
      ellipsoid([63.5, 45.5, 0], [20, 18.5, 18], { group: "cap", material: hair, clip: faceCut(46, 66) }),
      lock("l1", [60, 33, 19], [45, 55, 12], 5.5, 0.5),
      lock("l2", [66, 33, 18], [52, 50, 15], 5),
      lock("l3", [72, 35, 15], [62, 48, 14], 4.5),
      lock("l4", [54, 34, 18], [43, 50, 10], 5),
      lock("sideFar", [44, 44, 8], [41, 66, 4], 4.5),
      lock("sideNear", [80, 44, 4], [82, 64, 2], 4.5),
      lock("sideNear2", [76, 48, 8], [77, 64, 6], 3.5),
    ],
  },
  mopBack: {
    comment: "Ghoul Mop, back (sculpted: avatar-art/sculpts/hair.mjs mopBack).",
    shapes: [
      ellipsoid([65.5, 51, -4], [20, 20, 15], { group: "mass", material: hair }),
      lock("b1", [52, 56, -6], [49, 71, -8], 5),
      lock("b2", [78, 55, -3], [81, 71, -6], 5),
      lock("b3", [66, 60, -9], [66, 73, -10], 5),
    ],
  },

  // Spider Buns: two wrapped buns with a wisp trailing from each.
  bunsFront: {
    comment: "Spider Buns, front (sculpted: avatar-art/sculpts/hair.mjs bunsFront).",
    shapes: [
      ellipsoid([63.7, 46.1, 0], [19.1, 17.6, 17.3], { group: "cap", material: hair, clip: faceCut(44, 58) }),
      lock("l1", [51, 35, 17], [48, 45, 13], 4),
      lock("l2", [57, 33, 19], [54, 46, 15.8], 4.5),
      lock("l3", [63, 33, 19], [62, 44, 15.8], 4.2),
      lock("l4", [69, 35, 17], [70, 44, 14], 4),
      lock("side", [44.7, 42, 10], [42, 60, 5], 3.2),
    ],
  },
  bunsBack: {
    comment: "Spider Buns, back (sculpted: avatar-art/sculpts/hair.mjs bunsBack).",
    shapes: (() => {
      const wrapped = (x, y) => ({ ramp: hair, shift: (x + y) % 4 === 0 ? -1 : 0 });
      return [
        nape("nape"),
        sphere([49, 31, 2], 6.8, { group: "bunFar", material: wrapped }),
        sphere([77, 30, -3], 7.2, { group: "bunNear", material: wrapped }),
        ...wave("wispFar", [45, 35, -1], [40, 52, -4], [43, 72, -6], 2.4, 1.8),
        ...wave("wispNear", [82, 35, -5], [88, 52, -7], [85, 72, -8], 2.4, 1.8),
      ];
    })(),
  },

  // Banshee Mane: enormous, waist-length and wild.
  maneFront: {
    comment: "Banshee Mane, front (sculpted: avatar-art/sculpts/hair.mjs maneFront).",
    shapes: [
      ellipsoid([63.7, 45.6, 0], [20, 18.2, 17.8], { group: "cap", material: hair, clip: faceCut(43, 60) }),
      lock("l1", [50.8, 33.9, 17.3], [47.9, 47, 13], 4.6),
      lock("l2", [56.5, 32.4, 19.4], [53.6, 49.4, 15.8], 5.2),
      lock("l3", [62.3, 32.4, 19.4], [60.8, 48.7, 15.8], 5.2),
      lock("l4", [68, 33.9, 18], [68.8, 47.8, 15.1], 4.9),
      ...wave("curtainFar", [44, 42, 10], [35, 68, 5], [37, 98, 1], 5, 4, 1.2),
      ...wave("curtainFar2", [48, 50, 12], [44, 70, 8], [38, 90, 5], 3.6, 3),
      ...wave("curtainNear", [81, 43, 4], [90, 68, 0], [87, 97, -2], 5.5, 4.5, 1.2),
      ...wave("curtainNear2", [78, 48, 7], [83, 70, 4], [80, 88, 2], 3.6, 3),
    ],
  },
  maneBack: {
    comment: "Banshee Mane, back (sculpted: avatar-art/sculpts/hair.mjs maneBack).",
    shapes: [
      ellipsoid([65, 52, -6], [22.5, 22, 16], { group: "mass", material: hair }),
      ...wave("b1", [46, 60, -8], [36, 90, -10], [33, 124, -12], 6, 5, 1.5),
      ...wave("b2", [53, 62, -10], [46, 96, -12], [44, 128, -13], 6, 5, 1.5),
      ...wave("b3", [61, 64, -12], [56, 98, -13], [58, 131, -14], 6, 5, 1.5),
      ...wave("b4", [69, 64, -12], [74, 98, -13], [69, 131, -14], 6, 5, 1.5),
      ...wave("b5", [77, 62, -10], [85, 94, -12], [81, 128, -13], 6, 5, 1.5),
      ...wave("b6", [84, 59, -8], [94, 88, -10], [96, 122, -12], 6, 5, 1.5),
      ...wave("b7", [89, 56, -5], [101, 76, -7], [104, 102, -8], 5, 4, 1.2),
    ],
  },
};
