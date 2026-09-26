// Base mannequin, facing forward. Centred on x = 60 (pixels 59 | 60).
import { capsule, ellipsoid, sphere } from "../../scripts/avatar-art/sculpt.mjs";

const skin = "skin";
// Simple dark scoop-neck tee and shorts so the base is never bare.
const torsoMaterial = (x, y) => (y >= 91 + 4 * Math.exp(-(((x - 60) / 6) ** 2)) ? "night" : skin);
const legMaterial = (x, y) => (y <= 126 ? "night" : skin);
const both = (make) => [make(1), make(-1)];
const mx = (side, x) => 60 + side * (x - 60);

export default {
  comment: "Base mannequin (sculpted first pass: avatar-art/sculpts/base_body.mjs).",
  blend: 5,
  shapes: [
    // head: cranium, cheeks and jaw, chin
    ellipsoid([60, 58, 0], [24, 22, 21], { group: "head", material: skin, bias: 0.14 }),
    ellipsoid([60, 70, 6], [18, 13, 14], { group: "head", material: skin, blend: 10, bias: 0.14 }),
    sphere([60, 78, 8], 6.5, { group: "head", material: skin, blend: 8, bias: 0.14 }),
    ...both((s) => ellipsoid([mx(s, 36.5), 66, -2], [3, 5, 3], { group: `ear${s}`, material: skin })),
    // neck, shoulders and torso melt together
    capsule([60, 80, -4], [60, 93, -3], 5, 5.5, { group: "torso", material: skin, highlight: false }),
    ...both((s) => sphere([mx(s, 46), 97, -1], 6, { group: "torso", material: torsoMaterial })),
    ellipsoid([60, 102, 0], [15, 10, 9], { group: "torso", material: torsoMaterial }),
    ellipsoid([60, 116, 0], [13, 9, 8.5], { group: "torso", material: "night", blend: 8 }),
    // arms hang slightly away from the body
    ...both((s) => capsule([mx(s, 44), 98, 0], [mx(s, 41), 110, 0], 4.4, 3.9, { group: `arm${s}`, material: skin })),
    ...both((s) => capsule([mx(s, 41), 110, 0], [mx(s, 41), 120, 1], 3.9, 3.4, { group: `arm${s}`, material: skin })),
    ...both((s) => ellipsoid([mx(s, 41), 123, 2], [3.8, 4.6, 3.6], { group: `arm${s}`, material: skin })),
    // legs and feet
    ...both((s) => capsule([mx(s, 53), 120, 0], [mx(s, 53), 140, 0], 6.2, 4.3, { group: `leg${s}`, material: legMaterial })),
    ...both((s) => ellipsoid([mx(s, 52), 143, 3], [5.5, 3.5, 5.5], { group: `foot${s}`, material: skin })),
  ],
};
