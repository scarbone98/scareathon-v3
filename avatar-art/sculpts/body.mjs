// The base body's shapes, shared so clothing is sculpted to fit it exactly.
// Every function takes { inflate, material, group, ...options }: `inflate`
// grows the shape by that many pixels, which is how clothes sit on top.
// `side` is 1 for the viewer's left, -1 for the viewer's right.
import { capsule, ellipsoid, sphere } from "../../scripts/avatar-art/sculpt.mjs";

export const mx = (side, x) => 60 + side * (x - 60);
export const SIDES = [1, -1];

const grow = (radii, by) => (Array.isArray(radii) ? radii.map((r) => r + by) : radii + by);

export function head({ inflate = 0, ...o } = {}) {
  return [
    ellipsoid([60, 58, 0], grow([24, 22, 21], inflate), { group: "head", ...o }),
    ellipsoid([60, 70, 6], grow([18, 13, 14], inflate), { group: "head", blend: 10, ...o }),
    sphere([60, 78, 8], 6.5 + inflate, { group: "head", blend: 8, ...o }),
  ];
}

export function ear(side, { inflate = 0, ...o } = {}) {
  return ellipsoid([mx(side, 36.5), 66, -2], grow([3, 5, 3], inflate), { group: `ear${side}`, ...o });
}

export function neck({ inflate = 0, ...o } = {}) {
  return capsule([60, 80, -4], [60, 93, -3], 5 + inflate, 5.5 + inflate, { group: "torso", ...o });
}

export function shoulder(side, { inflate = 0, ...o } = {}) {
  return sphere([mx(side, 46), 97, -1], 6 + inflate, { group: "torso", ...o });
}

export function chest({ inflate = 0, ...o } = {}) {
  return ellipsoid([60, 102, 0], grow([15, 10, 9], inflate), { group: "torso", ...o });
}

export function hips({ inflate = 0, ...o } = {}) {
  return ellipsoid([60, 116, 0], grow([13, 9, 8.5], inflate), { group: "torso", blend: 8, ...o });
}

export function torso(options = {}) {
  return [...SIDES.map((s) => shoulder(s, options)), chest(options), hips(options)];
}

export function upperArm(side, { inflate = 0, ...o } = {}) {
  return capsule([mx(side, 44), 98, 0], [mx(side, 41), 110, 0], 4.4 + inflate, 3.9 + inflate, { group: `arm${side}`, ...o });
}

export function forearm(side, { inflate = 0, ...o } = {}) {
  return capsule([mx(side, 41), 110, 0], [mx(side, 41), 120, 1], 3.9 + inflate, 3.4 + inflate, { group: `arm${side}`, ...o });
}

export function hand(side, { inflate = 0, ...o } = {}) {
  return ellipsoid([mx(side, 41), 123, 2], grow([3.8, 4.6, 3.6], inflate), { group: `arm${side}`, ...o });
}

export function thigh(side, { inflate = 0, ...o } = {}) {
  return capsule([mx(side, 53), 120, 0], [mx(side, 53), 131.5, 0], 6.2 + inflate, 5.3 + inflate, { group: `leg${side}`, ...o });
}

export function shin(side, { inflate = 0, ...o } = {}) {
  return capsule([mx(side, 53), 131.5, 0], [mx(side, 53), 143, 0], 5.3 + inflate, 4.3 + inflate, { group: `leg${side}`, ...o });
}

export function foot(side, { inflate = 0, ...o } = {}) {
  return ellipsoid([mx(side, 52), 145.5, 3], grow([5.5, 3.3, 5.5], inflate), { group: `foot${side}`, ...o });
}

// Useful bands and patterns for materials.
export const stripes = (y, every, a, b) => (Math.floor(y / every) % 2 === 0 ? a : b);
