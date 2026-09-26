// Long, choppy hair. Front: skull cap + fringe locks + locks framing the face.
// Back: the mass behind the head falling past the shoulders.
import { capsule, ellipsoid } from "../../scripts/avatar-art/sculpt.mjs";

const hair = "hair";
const lock = (name, a, b, ra, rb = 0.5) => capsule(a, b, ra, rb, { group: name, material: hair });

export const parts = {
  front: {
    comment: "Long Wisp, front (sculpted first pass: avatar-art/sculpts/hair_long_wisp.mjs).",
    shapes: [
      ellipsoid([60, 54, 0], [26.5, 24.5, 23.5], {
        group: "cap",
        material: hair,
        // open the face below the fringe
        clip: (x, y) => (Math.abs(x + 0.5 - 60) < 21 && y > 47) || y > 74,
      }),
      // fringe, swept slightly toward the viewer's left
      lock("l1", [44, 38, 20], [40, 60, 16], 6),
      lock("l2", [51, 35, 24], [47, 61, 20], 6.5),
      lock("l3", [59, 34, 25], [56, 62, 21], 7),
      lock("l4", [67, 35, 24], [66, 59, 20], 6.5),
      lock("l5", [75, 38, 21], [77, 58, 17], 6),
      // locks framing the face
      lock("sideL", [38, 46, 12], [34, 92, 6], 5.5),
      lock("sideL2", [40, 56, 13], [39, 80, 10], 4),
      lock("sideR", [82, 46, 12], [86, 88, 6], 5.5),
      lock("sideR2", [80, 56, 13], [82, 84, 10], 4),
    ],
  },
  back: {
    comment: "Long Wisp, back (sculpted first pass: avatar-art/sculpts/hair_long_wisp.mjs).",
    shapes: [
      ellipsoid([60, 60, -6], [27, 27, 20], { group: "mass", material: hair }),
      lock("b1", [40, 66, -6], [34, 104, -10], 8),
      lock("b2", [80, 66, -6], [86, 100, -10], 8),
      lock("b3", [50, 72, -10], [46, 108, -12], 7.5),
      lock("b4", [70, 72, -10], [74, 106, -12], 7.5),
    ],
  },
};
