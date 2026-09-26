// Base mannequin, 3/4 view turned toward the viewer's left.
// The far side (viewer's left) sits slightly back (-z); the near side forward.
import { capsule, ellipsoid, sphere } from "../../scripts/avatar-art/sculpt.mjs";

const skin = "skin";
// Simple dark scoop-neck tee and shorts so the base is never bare.
const torsoMaterial = (x, y) => (y >= 91 + 4 * Math.exp(-(((x - 57) / 6) ** 2)) ? "night" : skin);
const legMaterial = (x, y) => (y <= 126 ? "night" : skin);

export default {
  comment: "Base mannequin (sculpted first pass: avatar-art/sculpts/base_body.mjs).",
  blend: 5,
  shapes: [
    // head: cranium, cheeks and jaw pushed toward the face side, chin
    ellipsoid([62, 59, 0], [24, 22, 22], { group: "head", material: skin }),
    ellipsoid([54, 71, 6], [18, 13, 15], { group: "head", material: skin, blend: 10 }),
    sphere([50, 79, 8], 6, { group: "head", material: skin, blend: 8 }),
    ellipsoid([84, 66, -2], [3.5, 5.5, 3], { group: "ear", material: skin }),
    // neck, shoulders and torso melt together
    capsule([60, 80, -4], [60, 93, -3], 5, 5.5, { group: "torso", material: skin, highlight: false }),
    sphere([47, 97, -5], 5.5, { group: "torso", material: torsoMaterial }),
    sphere([71, 97, 4], 6, { group: "torso", material: torsoMaterial }),
    ellipsoid([59, 102, 0], [14, 10, 9], { group: "torso", material: torsoMaterial, rotY: -25 }),
    ellipsoid([59, 116, 0], [12.5, 9, 8.5], { group: "torso", material: "night", rotY: -25, blend: 8 }),
    // far arm (behind the torso)
    capsule([45, 97, -6], [42, 109, -6], 4, 3.7, { group: "farArm", material: skin }),
    capsule([42, 109, -6], [43, 120, -4], 3.7, 3.2, { group: "farArm", material: skin }),
    ellipsoid([44, 123, -3], [3.6, 4.5, 3.5], { group: "farArm", material: skin }),
    // near arm
    capsule([74, 97, 5], [77, 109, 6], 4.6, 4.1, { group: "nearArm", material: skin }),
    capsule([77, 109, 6], [76, 120, 8], 4.1, 3.5, { group: "nearArm", material: skin }),
    ellipsoid([75, 123, 9], [4.1, 5, 4], { group: "nearArm", material: skin }),
    // legs: far leg back and to the left, near leg forward
    capsule([52, 120, -3], [51, 140, -3], 6, 4, { group: "farLeg", material: legMaterial }),
    capsule([66, 120, 3], [66, 140, 3], 6.4, 4.4, { group: "nearLeg", material: legMaterial }),
    // feet point toward the viewer's left
    ellipsoid([47, 143, -1], [6, 3.5, 5], { group: "farFoot", material: skin }),
    ellipsoid([62, 144, 5], [7, 3.6, 5.5], { group: "nearFoot", material: skin }),
  ],
};
