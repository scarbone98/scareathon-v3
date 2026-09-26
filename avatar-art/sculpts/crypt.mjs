// The Crypt Collection. Head items sit on the shared 3/4 head (cranium centre
// 63, 49, radius ~17.5, face toward the lower left); worn items follow the
// build's body through bodyFor(build).
import { capsule, ellipsoid, sphere } from "../../scripts/avatar-art/sculpt.mjs";
import { SIDES, bodyFor } from "./body.mjs";

const chain = (group, points, material, extra = {}) =>
  points.slice(1).map(([x, y, z, r], i) => {
    const [px, py, pz, pr] = points[i];
    return capsule([px, py, pz], [x, y, z], pr, r, { group, material, ...extra });
  });

// Point-in-polygon, for cutting flat shapes (the coffin's outline).
const inside = (x, y, poly) => {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
};

// The crown's ring of points around the head, split into the half in front of
// the skull (drawn over the hair) and the half behind it (behind the head).
const CROWN_RING = Array.from({ length: 14 }, (_, i) => {
  const a = (i / 14) * Math.PI * 2;
  return [63 + Math.cos(a) * 16.5, 36.5 - Math.sin(a) * 1.5, Math.sin(a) * 14];
});
function crownHalf(front) {
  const shapes = [];
  CROWN_RING.forEach(([x, y, z], i) => {
    if (front !== z >= -1) return;
    const [nx, ny, nz] = CROWN_RING[(i + 1) % CROWN_RING.length];
    shapes.push(capsule([x, y, z], [nx, ny, nz], 2.3, 2.3, { group: "band", material: "bone" }));
    const tall = i % 2 === 0 ? 10 : 6;
    shapes.push(capsule([x, y - 1, z], [x + (x - 63) * 0.08, y - tall, z], 2.2, 0.4, { group: `spike${i}`, material: "bone" }));
  });
  if (front) shapes.push(sphere([51, 35, 12], 2, { group: "gem", material: "dye1", highlight: true }));
  return shapes;
}

// Front centre of the turned torso (see clothing.mjs).
const FRONT_X = 57;

export function parts(build) {
  const body = bodyFor(build);
  const { anchors } = body;
  const [sx, sy] = anchors.shoulder.near;
  const [hx, hy, hz] = anchors.hand.near;

  return {
    crownFront: {
      comment: "Bone Crown, front half (sculpted: avatar-art/sculpts/crypt.mjs crownFront).",
      blend: 1,
      shapes: crownHalf(true),
    },
    crownBack: {
      comment: "Bone Crown, back half, behind the head (sculpted: avatar-art/sculpts/crypt.mjs crownBack).",
      blend: 1,
      shapes: crownHalf(false),
    },

    plagueMask: {
      comment: "Plague Doctor Mask: the leather over the face (sculpted: avatar-art/sculpts/crypt.mjs plagueMask).\nThe beak is its own part (plagueBeak) and the goggles a hand-drawn overlay, goggles.txt.",
      blend: 5,
      shapes: [
        ellipsoid([57.5, 56, 7], [13.5, 11.5, 12], {
          group: "mask",
          material: (x, y) => (x > 73 - (y - 44) * 0.2 || y < 44 ? null : "dye1"),
        }),
        capsule([50, 66, 12], [58, 69, 8], 1.1, 1.1, { group: "strap", material: "wood" }),
      ],
    },
    // The beak juts out past the hair, so it sits a layer above hair_front
    // (hair_acc) while the leather stays under the fringe.
    plagueBeak: {
      comment: "Plague Doctor Mask, the beak, drawn over the hair (sculpted: avatar-art/sculpts/crypt.mjs plagueBeak).",
      blend: 5,
      shapes: [
        capsule([52, 61, 15], [43, 64, 16], 5.2, 3.6, { group: "beak", material: "dye1" }),
        capsule([43, 64, 16], [33, 70, 14], 3.6, 0.6, { group: "beak", material: "dye1" }),
      ],
    },

    pumpkinHead: {
      comment: "Jack-o'-Lantern Head: a ribbed pumpkin over the whole head (sculpted: avatar-art/sculpts/crypt.mjs pumpkinHead).\nThe carved face is a hand-drawn overlay, face.txt.",
      blend: 4,
      shapes: [
        ...[-12, -6, 0, 6, 12].map((dx) =>
          ellipsoid([61 + dx, 50, 0], [dx === 0 ? 12 : 10, 18.5, 17.5], {
            group: "pumpkin",
            material: "dye1",
            blend: 6,
          })
        ),
        capsule([62, 32, 0], [66, 25, -2], 2.6, 1.6, { group: "stem", material: "moss" }),
        capsule([66, 25, -2], [70, 23, -2], 1.6, 0.8, { group: "stem", material: "moss" }),
      ],
    },

    mothWings: {
      comment: "Death's-Head Moth Wings: pointed forewings, round hindwings, veins and eye spots (sculpted: avatar-art/sculpts/crypt.mjs mothWings).",
      blend: 2,
      shapes: (() => {
        // Veins fan out from the wing root; an eye spot sits near the tip.
        const wing = (root, poly, spot) => (x, y) => {
          if (!inside(x + 0.5, y + 0.5, poly)) return null;
          if (spot) {
            const d = Math.hypot(x + 0.5 - spot[0], y + 0.5 - spot[1]);
            if (d < 1.8) return "ink";
            if (d < 3.8) return "dye2";
          }
          const angle = Math.atan2(y + 0.5 - root[1], x + 0.5 - root[0]);
          const vein = Math.abs(((angle * 7) / Math.PI) % 1) < 0.13;
          return { ramp: "dye1", shift: vein ? -1 : 0 };
        };
        const sheet = (group, center, radii, material) => ellipsoid(center, radii, { group, material });
        return [
          sheet("farFore", [30, 64, -12], [24, 20, 2.5], wing([50, 74], [[50, 72], [12, 46], [16, 66], [40, 80]], [22, 58])),
          sheet("farHind", [36, 92, -11], [16, 14, 2.5], wing([50, 82], [[50, 82], [28, 84], [22, 98], [34, 106], [48, 96]])),
          sheet("nearFore", [92, 62, -14], [24, 20, 2.5], wing([72, 74], [[72, 72], [108, 44], [106, 64], [84, 80]], [100, 55])),
          sheet("nearHind", [86, 92, -13], [16, 14, 2.5], wing([72, 82], [[72, 82], [96, 84], [101, 98], [88, 106], [74, 96]])),
          capsule([50, 76, -8], [72, 76, -10], 3.5, 3.5, { group: "thorax", material: "ink" }),
        ];
      })(),
    },

    coffin: {
      comment: `Coffin Backpack, the coffin (sculpted: avatar-art/sculpts/crypt.mjs coffin), build ${build}.`,
      blend: 0,
      contactLines: false,
      shapes: (() => {
        const outline = [[70, 52], [88, 52], [95, 68], [90, 118], [74, 118], [66, 68]];
        const rim = [[72, 54], [86, 54], [92.5, 68], [88, 116], [76, 116], [68.5, 68]];
        return [
          ellipsoid([80.5, 85, -15], [18, 36, 4], {
            group: "coffin",
            material: (x, y) => {
              if (!inside(x + 0.5, y + 0.5, outline)) return null;
              if (!inside(x + 0.5, y + 0.5, rim)) return "dye2"; // lid edge
              if ((Math.abs(x + 0.5 - 86) < 1 && y > 58 && y < 84) || (Math.abs(y + 0.5 - 65) < 1 && x > 81 && x < 91)) return "gold"; // cross
              return "dye1";
            },
          }),
        ];
      })(),
    },
    coffinStraps: {
      comment: `Coffin Backpack straps over the shoulders, build ${build} (sculpted: avatar-art/sculpts/crypt.mjs coffinStraps).`,
      blend: 0,
      shapes: [
        // a flat leather band (two tubes side by side) with a brass buckle
        ...[0, 1.6].map((dx) =>
          capsule([sx + 1 + dx, sy - 5, 6], [sx - 3 + dx, sy + 20, 9], 1.1, 1.1, {
            group: "strap",
            material: (x, y) => (Math.abs(y - (sy + 9)) <= 1.5 ? "gold" : "wood"),
          })
        ),
      ],
    },

    raven: {
      comment: `Raven Familiar perched on the outer edge of the near shoulder, build ${build} (sculpted: avatar-art/sculpts/crypt.mjs raven).`,
      blend: 3,
      shapes: [
        ellipsoid([sx + 8, sy - 11, 6], [7, 6.2, 5.5], { group: "body", material: "dye1" }),
        sphere([sx + 4.5, sy - 18.5, 8], 4.4, { group: "body", material: "dye1" }),
        capsule([sx + 0.5, sy - 18.5, 10], [sx - 5, sy - 17, 10], 1.7, 0.3, { group: "beak", material: "steel" }),
        capsule([sx + 13, sy - 7, 4], [sx + 20, sy, 2], 3.2, 0.7, { group: "tail", material: "dye1" }),
        ellipsoid([sx + 9.5, sy - 11, 10], [5.5, 4, 2], { group: "wing", material: "dye1" }),
        capsule([sx + 6, sy - 5, 7], [sx + 6, sy - 3, 7], 0.7, 0.7, { group: "feet", material: "steel" }),
        capsule([sx + 10, sy - 5, 6], [sx + 10, sy - 3, 6], 0.7, 0.7, { group: "feet", material: "steel" }),
      ],
    },

    coat: {
      comment: `Undertaker Coat: a long tailcoat with lapels and brass buttons, build ${build} (sculpted: avatar-art/sculpts/crypt.mjs coat).`,
      blend: 5,
      shapes: (() => {
        const vOpen = (x, y) => y > 72 && y < 92 && Math.abs(x + 0.5 - FRONT_X) < (92 - y) * 0.45;
        const lapel = (x, y) => y < 92 && Math.abs(x + 0.5 - FRONT_X) < (92 - y) * 0.45 + 2.2;
        const slit = (x, y) => y > 106 && Math.abs(x + 0.5 - FRONT_X) < 1 + (y - 106) * 0.25;
        const cloth = (x, y) => {
          if (Math.abs(x + 0.5 - 60) < 9 && y < 74) return null;
          if (vOpen(x, y) || slit(x, y) || y > 128 + Math.abs(x - 60) * 0.12) return null;
          if (lapel(x, y)) return "dye2";
          if (Math.abs(x + 0.5 - 58) < 1 && [95, 100, 105].includes(y)) return "gold";
          return { ramp: "dye1", shift: y > 108 && Math.cos((x - 60) * 0.9) > 0.6 ? -1 : 0 };
        };
        return [
          ...body.torso({ inflate: 2.8, material: cloth }),
          ...SIDES.flatMap((side) => [
            body.upperArm(side, { inflate: 2.3, material: "dye1" }),
            body.forearm(side, { inflate: 2.3, material: (x, y) => (y > 104 ? null : y >= 100 ? "dye2" : "dye1") }),
          ]),
          capsule([51, 104, -2], [47, 130, -4], 9, 12, { group: "torso", material: cloth, blend: 6 }),
          capsule([67, 104, 3], [71, 130, 1], 9.5, 12.5, { group: "torso", material: cloth, blend: 6 }),
        ];
      })(),
    },

    scythePole: {
      comment: `Reaper's Scythe pole, behind the fingers, build ${build} (sculpted: avatar-art/sculpts/crypt.mjs scythePole).`,
      blend: 1,
      shapes: [
        capsule([hx + 1, hy + 22, hz - 1], [hx - 5, 14, hz - 4], 1.5, 1.5, { group: "pole", material: "wood" }),
        sphere([hx + 1.2, hy + 23, hz - 1], 1.9, { group: "pole", material: "steel" }),
      ],
    },
    scytheBlade: {
      comment: `Reaper's Scythe blade, arching behind the head (it sits in the back slot), build ${build} (sculpted: avatar-art/sculpts/crypt.mjs scytheBlade).`,
      blend: 2,
      shapes: [
        sphere([hx - 5, 16, hz - 3], 2.2, { group: "collar", material: "gold" }),
        ...chain("blade", [[hx - 5, 15, hz - 3, 2.8], [hx - 14, 11, hz - 3, 3.2], [hx - 26, 12, hz - 2, 3], [hx - 36, 17, hz - 1, 2.2], [hx - 42, 24, hz, 0.4]], "steel", { bias: 0.15 }),
      ],
    },

    wraps: {
      comment: `Grave Wraps: bandaged forearms and hands with a loose end, build ${build} (sculpted: avatar-art/sculpts/crypt.mjs wraps).`,
      blend: 3,
      shapes: (() => {
        const bandage = (x, y) => (y < 97 ? null : { ramp: "bone", shift: Math.floor((y * 2 + x) / 3) % 2 === 0 ? 0 : -1 });
        return [
          ...SIDES.flatMap((side) => [
            body.forearm(side, { inflate: 0.7, material: bandage }),
            body.hand(side, { inflate: 0.6, material: bandage }),
          ]),
          capsule([hx + 2, hy - 4, hz + 2], [hx + 5, hy + 8, hz + 1], 0.8, 0.4, { group: "loose", material: "bone" }),
        ];
      })(),
    },
  };
}
