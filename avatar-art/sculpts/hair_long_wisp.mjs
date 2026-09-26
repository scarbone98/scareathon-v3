// Long, choppy hair on the shared 3/4 head (centre 63, 49). Front: skull cap,
// fringe locks and a lock framing the face. Back: the mass behind the head.
import { capsule, ellipsoid } from "../../scripts/avatar-art/sculpt.mjs";

const hair = "hair";
const lock = (name, a, b, ra, rb = 0.4) => capsule(a, b, ra, rb, { group: name, material: hair });

export const parts = {
  front: {
    comment: "Long Wisp, front (sculpted: avatar-art/sculpts/hair_long_wisp.mjs).",
    shapes: [
      ellipsoid([63.7, 46.1, 0], [19.1, 17.6, 17.3], {
        group: "cap",
        material: hair,
        // open the face below the fringe; the back of the head keeps its hair
        clip: (x, y) => (x < 75.3 + 0.45 * (y - 49) && y > 42.8 + 0.1 * (x - 63)) || y > 59.8,
      }),
      lock("l1", [50.8, 33.9, 17.3], [47.9, 46.8, 13], 4.3),
      lock("l2", [56.5, 32.4, 19.4], [53.6, 49.4, 15.8], 5),
      lock("l3", [62.3, 32.4, 19.4], [60.8, 48.7, 15.8], 5),
      lock("l4", [68, 33.9, 18], [68.8, 47.8, 15.1], 4.7),
      lock("l5", [73.1, 36.8, 14.4], [76, 49.7, 11.5], 4.3),
      lock("side", [44.7, 39.6, 10.1], [40.4, 70.9, 4.3], 3.8),
    ],
  },
  back: {
    comment: "Long Wisp, back (sculpted: avatar-art/sculpts/hair_long_wisp.mjs).",
    shapes: [
      ellipsoid([65.9, 51.2, -4.3], [19.4, 19.4, 14.4], { group: "mass", material: hair }),
      lock("b1", [77.4, 51.2, -2.9], [82, 84, -5.8], 5.8),
      lock("b2", [70.2, 56.9, -7.2], [73, 88, -8.6], 5.8),
      lock("b3", [51.5, 54, -4.3], [47.6, 82, -7.2], 5),
      lock("b4", [60.1, 58.4, -8.6], [60.1, 86, -10.1], 5),
    ],
  },
};
