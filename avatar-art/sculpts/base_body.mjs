// Base mannequins. The shapes live in body.mjs so clothing can be sculpted to fit.
import { SIDES, bodyFor } from "./body.mjs";

const skin = "skin";

export function parts(build) {
  const body = bodyFor(build);
  // m: bare chest with a hint of muscle, grey boxers.
  // f: dark sports top and shorts.
  const underwear = build === "m" ? "steel" : "night";
  const topMaterial = (x, y) => {
    if (build === "f") return y >= 82 + 2 * Math.exp(-(((x - 58) / 5) ** 2)) && y <= 91 ? "night" : skin;
    if (y === 89 && ((x >= 47 && x <= 55) || (x >= 60 && x <= 71))) return { ramp: skin, shift: -1 }; // pecs
    if (x === 57 && y >= 91 && y <= 99) return { ramp: skin, shift: -1 }; // centre line
    return skin;
  };
  const shorts = (x, y) => (y <= 111 ? underwear : skin);

  return {
    body: {
      comment: `Base mannequin, build ${build} (sculpted: avatar-art/sculpts/base_body.mjs).`,
      blend: 5,
      shapes: [
        ...body.head({ material: skin, bias: 0.12 }),
        body.ear({ material: skin }),
        body.neck({ material: skin, highlight: false }),
        ...SIDES.map((s) => body.shoulder(s, { material: topMaterial })),
        ...body.chest({ material: topMaterial }),
        body.waist({ material: topMaterial }),
        body.hips({ material: underwear }),
        ...SIDES.flatMap((s) => [
          body.upperArm(s, { material: skin }),
          body.forearm(s, { material: skin }),
          body.hand(s, { material: skin }),
          body.thigh(s, { material: shorts }),
          body.shin(s, { material: skin }),
          body.foot(s, { material: skin }),
        ]),
      ],
    },
  };
}
