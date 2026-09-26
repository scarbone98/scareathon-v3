// Long, choppy hair. Front: skull cap + fringe locks + a lock framing the face.
// Back: the mass behind the head falling past the shoulders.
import { capsule, ellipsoid } from "../../scripts/avatar-art/sculpt.mjs";

const hair = "hair";
const lock = (name, a, b, ra, rb = 1) => capsule(a, b, ra, rb, { group: name, material: hair });

export const parts = {
  front: {
    comment: "Long Wisp, front (sculpted first pass: avatar-art/sculpts/hair_long_wisp.mjs).",
    shapes: [
      ellipsoid([63, 55, 0], [26.5, 24.5, 24], {
        group: "cap",
        material: hair,
        // cut the face open below the fringe; the back of the head keeps its hair
        clip: (x, y) => (x < 75 + (y - 50) * 0.45 && y > 48 + (x - 38) * 0.1) || y > 74,
      }),
      lock("l1", [45, 38, 24], [41, 56, 18], 6),
      lock("l2", [53, 36, 27], [49, 61, 22], 7),
      lock("l3", [61, 36, 27], [59, 60, 22], 7),
      lock("l4", [69, 38, 25], [70, 58, 21], 6.5),
      lock("l5", [76, 42, 20], [80, 60, 16], 6),
      lock("side", [38, 46, 14], [32, 88, 6], 5, 1.5),
    ],
  },
  back: {
    comment: "Long Wisp, back (sculpted first pass: avatar-art/sculpts/hair_long_wisp.mjs).",
    shapes: [
      ellipsoid([66, 62, -6], [27, 27, 20], { group: "mass", material: hair }),
      lock("b1", [82, 62, -4], [87, 100, -8], 8, 2),
      lock("b2", [72, 70, -10], [75, 104, -12], 8, 2),
      lock("b3", [46, 66, -6], [42, 98, -10], 7, 2),
      lock("b4", [58, 72, -12], [58, 102, -14], 7, 2),
    ],
  },
};
