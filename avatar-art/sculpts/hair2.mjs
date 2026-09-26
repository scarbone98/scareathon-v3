// The second wave of hairstyles, on the shared 3/4 head (cranium centre
// 63, 49; the face is toward the lower left). Same conventions as hair.mjs:
// a front part (hair_front, over the face) and a back part (hair_back).
import { capsule, ellipsoid, sphere } from "../../scripts/avatar-art/sculpt.mjs";
import { faceCut, hair, lock, nape, wave } from "./hair.mjs";

// Fine strand lines running down the hair, so big masses don't look like helmets.
const strandShift = (x, y, spacing = 5) => (Math.abs((x + Math.round(2 * Math.sin(y * 0.2))) % spacing) === 0 ? -1 : 0);
const strands = (spacing = 5) => (x, y) => ({ ramp: hair, shift: strandShift(x, y, spacing) });
// Straight-cut ends: drop everything below `y`.
const bluntAt = (y, spacing = 5) => (x, py) => (py > y ? null : { ramp: hair, shift: strandShift(x, py, spacing) });
// A tapering tail made of a few strands, fuller at the top.
const tail = (name, a, mid, b, r) => [
  ...wave(`${name}1`, a, mid, b, r, r * 0.85, 1.6),
  ...wave(`${name}2`, [a[0] + 1.5, a[1] + 2, a[2] + 1], [mid[0] + 2, mid[1] + 2, mid[2] + 1], [b[0] + 2.5, b[1] - 4, b[2] + 1], r * 0.7, r * 0.6, 1),
];
// A repeatable pseudo-random value in [0, 1) per pixel, for speckled textures.
const speckle = (x, y) => {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
// Small hair ties take the item's dye.
const tie = (group, center, r = 2.2) => sphere(center, r, { group, material: "dye1" });

export const parts = {
  // Hangman's Tail: a high ponytail tied at the back of the crown.
  ponytailFront: {
    comment: "Hangman's Tail, front (sculpted: avatar-art/sculpts/hair2.mjs ponytailFront).",
    shapes: [
      ellipsoid([64, 46, 0], [18.9, 17.4, 17.2], { group: "cap", material: hair, clip: faceCut(43, 56) }),
      lock("f1", [51, 36, 16], [46, 47, 13], 4.2),
      lock("f2", [57, 34, 18], [53, 48, 15], 4.6),
      lock("f3", [63, 34, 18], [61, 45, 16], 4.2),
      lock("side", [45, 42, 9], [42, 58, 6], 3.2),
    ],
  },
  ponytailBack: {
    comment: "Hangman's Tail, back: the tie and the tail (sculpted: avatar-art/sculpts/hair2.mjs ponytailBack).",
    shapes: [
      nape("nape"),
      tie("tie", [80, 35, -8], 2.6),
      sphere([84, 40, -9], 5.2, { group: "tail1", material: hair }),
      ...tail("tail", [84, 40, -9], [93, 60, -11], [90, 88, -12], 6),
    ],
  },

  // Twin Hexes: pigtails tied low at each side.
  twinFront: {
    comment: "Twin Hexes, front (sculpted: avatar-art/sculpts/hair2.mjs twinFront).",
    shapes: [
      ellipsoid([63.7, 46, 0], [19, 17.5, 17.3], { group: "cap", material: hair, clip: faceCut(44, 56) }),
      lock("f1", [52, 35, 17], [49, 47, 14], 4.4),
      lock("f2", [58, 33, 19], [56, 47, 16], 4.6),
      lock("f3", [65, 34, 18], [66, 45, 15], 4.2),
      tie("tieFar", [43, 54, 4]),
      ...tail("tailFar", [42, 57, 3], [38, 75, 1], [40, 96, 0], 5.2),
    ],
  },
  twinBack: {
    comment: "Twin Hexes, back (sculpted: avatar-art/sculpts/hair2.mjs twinBack).",
    shapes: [
      nape("nape"),
      tie("tieNear", [83, 53, -3]),
      ...tail("tailNear", [85, 56, -4], [90, 75, -6], [88, 96, -7], 5.2),
    ],
  },

  // Porcelain Bob: chin length with a blunt fringe and straight-cut ends.
  bobFront: {
    comment: "Porcelain Bob, front (sculpted: avatar-art/sculpts/hair2.mjs bobFront).",
    shapes: [
      ellipsoid([63.5, 45.5, 0], [20.2, 18.6, 18], {
        group: "cap",
        material: bluntAt(68, 4),
        clip: faceCut(47.5, 68),
      }),
      capsule([45, 40, 9], [43, 70, 6], 5.2, 5.6, { group: "cap", material: bluntAt(68, 4), blend: 6 }),
    ],
  },
  bobBack: {
    comment: "Porcelain Bob, back (sculpted: avatar-art/sculpts/hair2.mjs bobBack).",
    shapes: [ellipsoid([65.5, 51, -4], [20.5, 19.5, 15], { group: "mass", material: bluntAt(68, 4) })],
  },

  // Wisp Pixie: very short, tousled, bangs swept toward the face side.
  pixieFront: {
    comment: "Wisp Pixie, front (sculpted: avatar-art/sculpts/hair2.mjs pixieFront).",
    shapes: [
      ellipsoid([64, 46.2, 0], [18.7, 17.2, 17.1], { group: "cap", material: hair, clip: faceCut(41, 53) }),
      lock("sweep1", [62, 33, 17], [49, 43, 15], 4.4, 0.6),
      lock("sweep2", [68, 34, 15], [55, 44, 16], 3.8, 0.6),
      lock("tuft1", [70, 32, 8], [76, 27, 4], 3.2),
      lock("tuft2", [60, 31, 10], [62, 25, 7], 3),
      lock("burn", [78, 46, 9], [78, 54, 8], 2.2, 1),
    ],
  },
  pixieBack: {
    comment: "Wisp Pixie, back (sculpted: avatar-art/sculpts/hair2.mjs pixieBack).",
    shapes: [nape("nape")],
  },

  // Storm Cloud Curls: big round volume built from clustered curls.
  curlsFront: {
    comment: "Storm Cloud Curls, front (sculpted: avatar-art/sculpts/hair2.mjs curlsFront).",
    blend: 3,
    shapes: (() => {
      const curl = (i, center, r) => sphere(center, r, { group: `c${i}`, material: strands(3) });
      return [
        ellipsoid([63.7, 45, 0], [21, 19, 18.5], { group: "cap", material: strands(3), clip: faceCut(44, 58) }),
        ...[[48, 38, 14, 5.5], [55, 33, 16, 6], [63, 31, 15, 6.2], [71, 33, 11, 6], [78, 38, 6, 5.5], [44, 46, 9, 5], [50, 43, 14, 4.2], [58, 40, 17, 4]].map(
          ([x, y, z, r], i) => curl(i, [x, y, z], r)
        ),
      ];
    })(),
  },
  curlsBack: {
    comment: "Storm Cloud Curls, back (sculpted: avatar-art/sculpts/hair2.mjs curlsBack).",
    blend: 3,
    shapes: [
      ellipsoid([65, 50, -6], [23, 21, 17], { group: "mass", material: strands(3) }),
      ...[[42, 56, -4, 6.5], [86, 54, -6, 6.5], [48, 66, -8, 6], [82, 66, -8, 6], [64, 66, -12, 7]].map(([x, y, z, r], i) =>
        sphere([x, y, z], r, { group: `b${i}`, material: strands(3) })
      ),
    ],
  },

  // Bonehawk: a tall mohawk with stubble on the shaved sides.
  hawkFront: {
    comment: "Bonehawk, front: stubble and the crest (sculpted: avatar-art/sculpts/hair2.mjs hawkFront).",
    blend: 2,
    shapes: [
      ...[[54, 33, 12], [59, 31, 11], [64, 30, 9], [69, 31, 6], [74, 33, 2], [78, 37, -2]].map(([x, y, z], i) =>
        lock(`crest${i}`, [x, y + 1, z], [x + 2 + i, y - 13 + i, z - 1], 3.4 - i * 0.2)
      ),
    ],
  },
  // Stubble is scattered single pixels, so it has no outline (an outline
  // would ring every dot).
  hawkStubble: {
    comment: "Bonehawk, stubble on the shaved sides (sculpted: avatar-art/sculpts/hair2.mjs hawkStubble).",
    outline: "none",
    despeckle: false,
    contactLines: false,
    shapes: [
      ellipsoid([64, 46.5, 0], [18.2, 17.4, 17], {
        group: "stubble",
        material: (x, y) => (speckle(x, y) < 0.16 ? { ramp: hair, shift: -1 } : null),
        clip: faceCut(40, 55),
      }),
    ],
  },
  hawkBack: {
    comment: "Bonehawk, back (sculpted: avatar-art/sculpts/hair2.mjs hawkBack).",
    shapes: [lock("tail", [80, 42, -6], [84, 54, -8], 3, 0.8)],
  },

  // Crypt Fringe: a long emo sweep falling over the near eye.
  cryptFront: {
    comment: "Crypt Fringe, front (sculpted: avatar-art/sculpts/hair2.mjs cryptFront).",
    shapes: [
      ellipsoid([63.7, 46, 0], [19.3, 17.8, 17.5], { group: "cap", material: strands(4), clip: faceCut(44, 62) }),
      lock("sweep1", [52, 33, 18], [60, 58, 16], 5.2, 0.8),
      lock("sweep2", [58, 33, 18], [64, 55, 15], 4.6, 0.6),
      lock("sweep3", [47, 37, 15], [53, 50, 16], 4, 0.6),
      lock("sideFar", [44, 42, 9], [42, 60, 5], 3.8),
      lock("sideNear", [80, 44, 4], [82, 64, 2], 4),
    ],
  },
  cryptBack: {
    comment: "Crypt Fringe, back (sculpted: avatar-art/sculpts/hair2.mjs cryptBack).",
    shapes: [
      ellipsoid([65.5, 51, -4], [20, 20, 15], { group: "mass", material: strands(4) }),
      lock("b1", [54, 58, -6], [52, 70, -8], 4.5),
      lock("b2", [76, 58, -6], [80, 71, -8], 4.5),
    ],
  },

  // Gallows Braid: one thick braid over the near shoulder, tied with a ribbon.
  braidFront: {
    comment: "Gallows Braid, front: fringe and the braid over the shoulder (sculpted: avatar-art/sculpts/hair2.mjs braidFront).",
    blend: 2,
    shapes: [
      ellipsoid([63.7, 46.1, 0], [19.1, 17.6, 17.3], { group: "cap", material: hair, clip: faceCut(44, 58) }),
      lock("l1", [51, 35, 17], [48, 47, 13], 4.3),
      lock("l2", [57, 33, 19], [54, 49, 16], 4.8),
      lock("l3", [63, 33, 19], [62, 47, 16], 4.6),
      // braid: alternating bumps down over the chest, with a ribbon and a tuft
      ...Array.from({ length: 15 }, (_, i) => {
        const t = i / 14;
        const x = 80 - t * 6 + (i % 2 ? 0.9 : -0.9);
        // the weave: diagonal strands crossing each plait
        const weave = (px, py) => ({ ramp: hair, shift: (px + py * (i % 2 ? 1 : -1)) % 3 === 0 ? -1 : 0 });
        return sphere([x, 58 + t * 36, 8 + t * 4], 3.5 - t * 1.1, { group: `braid${i % 2}`, material: weave });
      }),
      tie("ribbon", [74.5, 96, 12], 2),
      lock("tuft", [74.5, 97, 12], [74, 103, 12], 2, 0.6),
    ],
  },
  braidBack: {
    comment: "Gallows Braid, back (sculpted: avatar-art/sculpts/hair2.mjs braidBack).",
    shapes: [nape("nape")],
  },

  // Buzzcut: close-cropped stubble over the whole skull, no outline.
  buzzFront: {
    comment: "Buzzcut (sculpted: avatar-art/sculpts/hair2.mjs buzzFront).",
    contactLines: false,
    despeckle: false,
    shapes: [
      ellipsoid([64, 46.3, 0], [18.4, 17.3, 17.1], {
        group: "buzz",
        // a scattered speckle reads as stubble (hashed, so it has no stripes)
        material: (x, y) => ({ ramp: hair, shift: speckle(x, y) < 0.4 ? -1 : 0 }),
        clip: faceCut(40.5, 55),
      }),
    ],
  },

  // Rat's Nest: short, messy bedhead with tufts sticking out every which way.
  nestFront: {
    comment: "Rat's Nest, front (sculpted: avatar-art/sculpts/hair2.mjs nestFront).",
    shapes: [
      ellipsoid([63.8, 45.8, 0], [19.4, 17.8, 17.6], { group: "cap", material: strands(4), clip: faceCut(43, 58) }),
      ...[
        [[50, 36, 16], [42, 30, 13]], [[56, 33, 17], [52, 23, 13]], [[63, 32, 16], [66, 21, 12]], [[70, 33, 12], [79, 26, 8]],
        [[77, 38, 6], [87, 36, 2]], [[46, 42, 12], [38, 44, 9]], [[52, 38, 17], [47, 47, 15]], [[60, 36, 18], [60, 46, 17]],
        [[79, 46, 6], [85, 55, 3]],
      ].map(([a, b], i) => lock(`tuft${i}`, a, b, 3.6 - (i % 3) * 0.4, 0.6)),
    ],
  },
  nestBack: {
    comment: "Rat's Nest, back (sculpted: avatar-art/sculpts/hair2.mjs nestBack).",
    shapes: [nape("nape"), lock("t1", [78, 52, -6], [86, 60, -8], 3.4), lock("t2", [54, 58, -6], [50, 66, -8], 3.2)],
  },

  // Shrine Maiden: straight hime cut, blunt fringe, cheek-length side locks,
  // and a long straight sheet behind.
  himeFront: {
    comment: "Shrine Maiden, front (sculpted: avatar-art/sculpts/hair2.mjs himeFront).",
    shapes: [
      ellipsoid([63.6, 45.5, 0], [19.8, 18.2, 17.8], { group: "cap", material: bluntAt(64, 4), clip: faceCut(47.5, 64) }),
      capsule([44.5, 42, 9], [43, 66, 6], 4.8, 4.8, { group: "cap", material: bluntAt(64, 4), blend: 6 }),
      capsule([81.5, 44, 3], [82.5, 66, 1], 4.4, 4.4, { group: "sideNear", material: bluntAt(64, 4) }),
    ],
  },
  himeBack: {
    comment: "Shrine Maiden, back: a straight sheet cut level at the waist (sculpted: avatar-art/sculpts/hair2.mjs himeBack).",
    shapes: [
      ellipsoid([65, 52, -6], [21.5, 21, 15.5], { group: "mass", material: bluntAt(104, 4) }),
      ellipsoid([64, 80, -13], [23, 30, 6], { group: "mass", material: bluntAt(104, 4), blend: 10 }),
    ],
  },

  // Werewolf Mullet: spiky and short on top, long and shaggy at the back.
  mulletFront: {
    comment: "Werewolf Mullet, front (sculpted: avatar-art/sculpts/hair2.mjs mulletFront).",
    shapes: [
      ellipsoid([64, 46, 0], [19, 17.4, 17.2], { group: "cap", material: strands(4), clip: faceCut(42, 56) }),
      lock("s1", [54, 33, 13], [48, 26, 11], 3.8),
      lock("s2", [61, 31, 12], [60, 22, 9], 4.2),
      lock("s3", [69, 32, 8], [74, 24, 4], 4),
      lock("f1", [50, 37, 16], [46, 45, 14], 3.6),
      lock("f2", [57, 36, 18], [54, 46, 16], 3.8),
      lock("burn", [78, 46, 9], [79, 58, 8], 2.8, 1),
    ],
  },
  mulletBack: {
    comment: "Werewolf Mullet, back: the shaggy length (sculpted: avatar-art/sculpts/hair2.mjs mulletBack).",
    shapes: [
      nape("nape"),
      ...wave("m1", [78, 52, -4], [86, 68, -6], [88, 86, -7], 5.5, 4.5, 0.8),
      ...wave("m2", [70, 58, -8], [74, 74, -9], [73, 88, -10], 5.5, 4.5, 0.8),
      ...wave("m3", [58, 58, -8], [56, 72, -9], [58, 84, -10], 5, 4, 0.8),
    ],
  },
};
