// Base mannequin, facing forward. Centred on x = 60 (pixels 59 | 60).
// The shapes live in body.mjs so clothing can be sculpted to fit.
import * as body from "./body.mjs";

const skin = "skin";
// Simple dark scoop-neck tee and shorts so the base is never bare.
const torsoMaterial = (x, y) => (y >= 91 + 4 * Math.exp(-(((x - 60) / 6) ** 2)) ? "night" : skin);
const legMaterial = (x, y) => (y <= 126 ? "night" : skin);

export default {
  comment: "Base mannequin (sculpted first pass: avatar-art/sculpts/base_body.mjs).",
  blend: 5,
  shapes: [
    ...body.head({ material: skin, bias: 0.14 }),
    ...body.SIDES.map((s) => body.ear(s, { material: skin })),
    body.neck({ material: skin, highlight: false }),
    ...body.SIDES.map((s) => body.shoulder(s, { material: torsoMaterial })),
    body.chest({ material: torsoMaterial }),
    body.hips({ material: "night" }),
    ...body.SIDES.flatMap((s) => [
      body.upperArm(s, { material: skin }),
      body.forearm(s, { material: skin }),
      body.hand(s, { material: skin }),
      // one leg shape, as before: thigh + shin
      body.thigh(s, { material: legMaterial }),
      body.shin(s, { material: legMaterial }),
      body.foot(s, { material: skin }),
    ]),
  ],
};
