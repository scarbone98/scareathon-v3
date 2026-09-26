// The base body's shapes, shared so clothing is sculpted to fit it exactly.
//
// 3/4 view, turned toward the viewer's left, with Gaia-like proportions: the
// head is ~35 px wide and a third of the figure's height. The far side
// (viewer's left) sits back (-z); the near side (viewer's right) comes forward.
//
// bodyFor(build) returns shape makers for "f" or "m". Both builds share the
// head, so hair, faces and hats fit either. Every maker takes
// { inflate, material, ...options }; `inflate` grows the shape by that many
// pixels, which is how clothes sit on top.
import { capsule, ellipsoid, sphere } from "../../scripts/avatar-art/sculpt.mjs";

export const SIDES = ["far", "near"];
const TORSO_TURN = -25;

const grow = (radii, by) => radii.map((r) => r + by);

// Shared head. Cranium centre (63, 49), radius ~17.5; face toward lower left.
export const HEAD = { x: 63, y: 49, r: 17.5 };

export function head({ inflate = 0, ...o } = {}) {
  return [
    ellipsoid([63, 49, 0], grow([17.5, 17, 16.5], inflate), { group: "head", ...o }),
    ellipsoid([57.2, 57.6, 4.3], grow([13, 9.4, 10.8], inflate), { group: "head", blend: 7, ...o }),
    sphere([54.4, 63.4, 5.8], 4.5 + inflate, { group: "head", blend: 6, ...o }),
  ];
}

export function ear({ inflate = 0, ...o } = {}) {
  return ellipsoid([78.8, 54, -1.4], grow([2.6, 4, 2.2], inflate), { group: "ear", ...o });
}

// Per-build measurements. [x, y, z] points and radii.
const BUILD_SPECS = {
  m: {
    neck: [[61, 63, -3], [61, 74, -2], 4.8, 5.4],
    shoulder: { far: [[47, 77.5, -4], 4.6], near: [[75, 77.5, 3], 5] },
    chest: [[61, 84, 0], [15.5, 9, 9.5]],
    bust: [],
    waist: [[61, 95, 0], [12.5, 8, 8.5]],
    hips: [[61, 103, 0], [12.5, 7, 8.5]],
    upperArm: { far: [[44.5, 79, -5], [40, 92, -5], 3.1, 2.8], near: [[77.5, 79, 4], [83, 92, 5], 3.3, 2.9] },
    forearm: { far: [[40, 92, -5], [38.5, 103, -3], 2.8, 2.4], near: [[83, 92, 5], [84.5, 103, 7], 2.9, 2.5] },
    hand: { far: [[38.5, 106, -2], [2.8, 3.5, 2.6]], near: [[84.5, 106, 8], [3, 3.7, 2.8]] },
    thigh: { far: [[54, 104, -3], [51, 121, -3], 6.2, 5.1], near: [[67.5, 104, 3], [68, 121, 3], 6.6, 5.4] },
    shin: { far: [[51, 121, -3], [49, 138, -3], 5.1, 3.9], near: [[68, 121, 3], [68, 138, 3], 5.4, 4.2] },
    foot: { far: [[46, 141.5, -1], [5.2, 3.2, 4.6]], near: [[65, 142.5, 5], [6, 3.3, 5.2]] },
  },
  f: {
    neck: [[61, 63, -3], [61, 74, -2], 4.2, 4.7],
    shoulder: { far: [[49, 78, -4], 4], near: [[73, 78, 3], 4.4] },
    chest: [[61, 85, 0], [13, 8.5, 8.5]],
    bust: [[[55.5, 88, 5], 3.6], [[65.5, 88, 6.5], 4]],
    waist: [[61, 95, 0], [10, 8, 7.5]],
    hips: [[61, 104, 0], [13.5, 7.5, 9]],
    upperArm: { far: [[46.5, 80, -5], [42.5, 92, -5], 2.7, 2.4], near: [[75.5, 80, 4], [80.5, 92, 5], 2.9, 2.5] },
    forearm: { far: [[42.5, 92, -5], [41, 103, -3], 2.4, 2], near: [[80.5, 92, 5], [82, 103, 7], 2.5, 2.1] },
    hand: { far: [[41, 106, -2], [2.5, 3.2, 2.4]], near: [[82, 106, 8], [2.7, 3.4, 2.5]] },
    thigh: { far: [[54, 105, -3], [51, 121, -3], 6.6, 5], near: [[67.5, 105, 3], [68, 121, 3], 7, 5.2] },
    shin: { far: [[51, 121, -3], [49.5, 138, -3], 5, 3.5], near: [[68, 121, 3], [68, 138, 3], 5.2, 3.8] },
    foot: { far: [[46.5, 141.5, -1], [4.8, 3, 4.3]], near: [[65, 142.5, 5], [5.5, 3.1, 4.8]] },
  },
};

export function bodyFor(build) {
  const b = BUILD_SPECS[build];
  if (!b) throw new Error(`Unknown build "${build}"`);
  const tube = ([a, c, ra, rb], inflate, o) => capsule(a, c, ra + inflate, rb + inflate, o);

  const maker = {
    build,
    head,
    ear,
    neck: ({ inflate = 0, ...o } = {}) => tube(b.neck, inflate, { group: "torso", ...o }),
    shoulder: (side, { inflate = 0, ...o } = {}) =>
      sphere(b.shoulder[side][0], b.shoulder[side][1] + inflate, { group: "torso", ...o }),
    chest: ({ inflate = 0, ...o } = {}) => [
      ellipsoid(b.chest[0], grow(b.chest[1], inflate), { group: "torso", rotY: TORSO_TURN, ...o }),
      ...b.bust.map(([c, r]) => sphere(c, r + inflate, { group: "torso", blend: 4, ...o })),
    ],
    waist: ({ inflate = 0, ...o } = {}) =>
      ellipsoid(b.waist[0], grow(b.waist[1], inflate), { group: "torso", rotY: TORSO_TURN, blend: 7, ...o }),
    hips: ({ inflate = 0, ...o } = {}) =>
      ellipsoid(b.hips[0], grow(b.hips[1], inflate), { group: "torso", rotY: TORSO_TURN, blend: 7, ...o }),
    upperArm: (side, { inflate = 0, ...o } = {}) => tube(b.upperArm[side], inflate, { group: `arm-${side}`, bias: 0.1, ...o }),
    forearm: (side, { inflate = 0, ...o } = {}) => tube(b.forearm[side], inflate, { group: `arm-${side}`, bias: 0.1, ...o }),
    hand: (side, { inflate = 0, ...o } = {}) =>
      ellipsoid(b.hand[side][0], grow(b.hand[side][1], inflate), { group: `arm-${side}`, bias: 0.1, ...o }),
    thigh: (side, { inflate = 0, ...o } = {}) => tube(b.thigh[side], inflate, { group: `leg-${side}`, ...o }),
    shin: (side, { inflate = 0, ...o } = {}) => tube(b.shin[side], inflate, { group: `leg-${side}`, ...o }),
    foot: (side, { inflate = 0, ...o } = {}) =>
      ellipsoid(b.foot[side][0], grow(b.foot[side][1], inflate), { group: `foot-${side}`, ...o }),
  };
  maker.torso = (options = {}) => [
    ...SIDES.map((s) => maker.shoulder(s, options)),
    ...maker.chest(options),
    maker.waist(options),
    maker.hips(options),
  ];
  // Anchor points items can hang things from.
  maker.anchors = {
    shoulder: { far: b.shoulder.far[0], near: b.shoulder.near[0] },
    hand: { far: b.hand.far[0], near: b.hand.near[0] },
    foot: { far: b.foot.far[0], near: b.foot.near[0] },
    shin: { far: b.shin.far, near: b.shin.near },
  };
  return maker;
}

// Useful bands and patterns for materials.
export const stripes = (y, every, a, b) => (Math.floor(y / every) % 2 === 0 ? a : b);
