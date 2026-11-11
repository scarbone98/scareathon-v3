import {
  AdditiveBlending,
  BoxGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  Vector3,
} from "three";
import { mergeFixedParts } from "../pages/ArcadeV2/mergeParts.ts";
import { glowMap, paint, seasonMonth, type StationShape } from "./halloween.ts";

// Christmas decorations for the station, through December only: evergreen garland along the
// ceiling corners with coloured lights strung through it, wreaths on the walls, and a tree at
// the platform's end, its lights twinkling, a star on top and presents under it. (Outside it
// snows all month: StationScene.) Everything else is in this file; to take them down for good,
// delete it and the lines marked CHRISTMAS in StationScene.

export function isChristmasSeason(now = new Date()) {
  return seasonMonth(now) === 12;
}

// A spray of fir: a stem down the middle, needles off it both ways, dark and light greens
function boughTexture() {
  return paint(128, 64, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    const greens = ["#1f4a2a", "#2a5e34", "#173a22", "#3a7040"];
    ctx.lineCap = "round";
    for (let side = -1; side <= 1; side += 2) {
      for (let x = 4; x < w - 6; x += 3) {
        // (shorter towards the tip)
        const reach = (h * 0.46 * (1 - (x / w) * 0.55)) * (0.75 + Math.random() * 0.25);
        ctx.strokeStyle = greens[Math.floor(Math.random() * greens.length)];
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, h / 2);
        ctx.lineTo(x + reach * 0.55, h / 2 + side * reach);
        ctx.stroke();
      }
    }
    ctx.strokeStyle = "#3a2a18";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w - 4, h / 2);
    ctx.stroke();
  });
}

// The colours the lights come in, and how bright each is when it's lit
const BULBS = ["#ff3a3a", "#3aff6a", "#ffd23a", "#3a8aff", "#fff2d0"].map((colour) => new Color(colour));
const BULB_DIM = 0.22;

// Moves a sub-assembly's meshes into `group` with its placing baked into each, so they can be
// merged with everything else (see mergeFixedParts): the sub-assembly must only turn and move
// (no scaling), and its meshes keep their own scale
function bake(group: Group, sub: Group) {
  sub.updateMatrix();
  [...sub.children].forEach((child) => {
    child.applyMatrix4(sub.matrix);
    group.add(child);
  });
}

export function buildChristmas({ wallZ, sideX, endX, ceilingY }: StationShape) {
  const group = new Group();
  const hookY = ceilingY - 0.05;
  const needles = new MeshStandardMaterial({ map: boughTexture(), transparent: true, alphaTest: 0.35, side: DoubleSide, roughness: 0.9, emissive: "#0c2412", emissiveIntensity: 0.6 });
  const bulbAt: Vector3[] = [];

  // Garland: sprays of fir along a swag, every which way, thick enough to look like a rope of it
  const spray = new PlaneGeometry(0.3, 0.15);
  const garland = (from: Vector3, to: Vector3, sag: number, span: number) => {
    const length = from.distanceTo(to);
    const swags = Math.max(1, Math.round(length / span));
    const at = (k: number) => {
      const point = from.clone().lerp(to, k);
      point.y -= Math.sin(((k * swags) % 1) * Math.PI) * sag;
      return point;
    };
    const along = to.clone().sub(from).normalize();
    const heading = Math.atan2(-along.z, along.x);
    const count = Math.floor(length / 0.08);
    for (let i = 0; i <= count; i += 1) {
      const mesh = new Mesh(spray, needles);
      mesh.position.copy(at(i / count));
      mesh.rotation.set(((i * 47) % 13) * 0.24, heading + ((i * 31) % 9) * 0.1 - 0.4, ((i * 17) % 11) * 0.3 - 1.5);
      group.add(mesh);
    }
    // A light every so often along it, hung a little below
    const lights = Math.floor(length / 0.28);
    for (let i = 1; i < lights; i += 1) bulbAt.push(at(i / lights).add(new Vector3(0, -0.06, 0)).addScaledVector(along.clone().cross(new Vector3(0, 1, 0)), -0.05));
  };
  garland(new Vector3(endX + 0.3, hookY, wallZ + 0.1), new Vector3(sideX - 0.1, hookY, wallZ + 0.1), 0.2, 1.6);
  garland(new Vector3(sideX - 0.1, hookY, wallZ + 0.1), new Vector3(sideX - 0.1, hookY, wallZ + 4.2), 0.2, 1.4);

  // A wreath: sprays round a ring, red berries in clumps, a red bow at the bottom. Built
  // facing +z, then turned to face out from its wall
  const red = new MeshStandardMaterial({ color: "#c8202a", roughness: 0.55, emissive: "#3a0608" });
  const berry = new SphereGeometry(0.018, 6, 5);
  const wreath = (x: number, y: number, z: number, turn: number, radius: number) => {
    const sub = new Group();
    const sprays = 16;
    for (let i = 0; i < sprays; i += 1) {
      const angle = (i / sprays) * Math.PI * 2;
      [0, 1].forEach((layer) => {
        const mesh = new Mesh(spray, needles);
        mesh.scale.setScalar(radius * 2.4);
        mesh.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius, 0.01 + layer * 0.02);
        mesh.rotation.set(layer ? 0.5 : -0.3, layer ? -0.4 : 0.3, angle + Math.PI / 2 + (layer ? 0.4 : 0));
        sub.add(mesh);
      });
    }
    for (let i = 0; i < 7; i += 1) {
      const angle = 0.6 + (i / 7) * Math.PI * 1.7;
      [0, 1, 2].forEach((k) => {
        const one = new Mesh(berry, red);
        one.position.set(Math.cos(angle) * radius + (k - 1) * 0.022, Math.sin(angle) * radius + (k === 1 ? 0.02 : 0), 0.06);
        sub.add(one);
      });
    }
    // The bow: two loops and two tails
    [-1, 1].forEach((side) => {
      const loop = new Mesh(new BoxGeometry(0.11, 0.07, 0.02), red);
      loop.position.set(side * 0.06, -radius, 0.07);
      loop.rotation.z = side * 0.35;
      const tail = new Mesh(new BoxGeometry(0.035, 0.16, 0.012), red);
      tail.position.set(side * 0.04, -radius - 0.09, 0.065);
      tail.rotation.z = side * 0.25;
      sub.add(loop, tail);
    });
    const knot = new Mesh(new BoxGeometry(0.04, 0.05, 0.03), red);
    knot.position.set(0, -radius, 0.08);
    sub.add(knot);
    sub.position.set(x, y, z);
    sub.rotation.y = turn;
    bake(group, sub);
  };
  // On the side wall by the corner (the posters have the wall over the ticket window), and on
  // the back wall between the events poster and the pigeonholes
  wreath(sideX - 0.05, 2.45, wallZ + 0.7, -Math.PI / 2, 0.24);
  wreath(2.3, 2.45, wallZ + 0.05, 0, 0.24);

  // The tree, at the platform's end: layered boughs round a dark core, each tier drooping,
  // wider towards the floor, in a red-wrapped tub
  const tree = new Group();
  const treeX = endX + 0.5;
  const treeZ = wallZ + 0.85;
  const foot = 0.3; // (the tub's top)
  const height = 2.05;
  const core = new Mesh(new ConeGeometry(0.27, height * 0.92, 10, 1, true), new MeshStandardMaterial({ color: "#0f2a16", roughness: 1, side: DoubleSide }));
  core.position.set(0, foot + height * 0.46 + 0.05, 0);
  tree.add(core);
  const trunk = new Mesh(new CylinderGeometry(0.05, 0.06, 0.3, 8), new MeshStandardMaterial({ color: "#4a3020", roughness: 1 }));
  trunk.position.y = foot + 0.05;
  tree.add(trunk);
  const tub = new Mesh(new CylinderGeometry(0.2, 0.16, foot, 14), red);
  tub.position.y = foot / 2;
  tree.add(tub);
  const bough = new PlaneGeometry(1, 0.32);
  bough.translate(0.5, 0, 0);
  const tiers = 9;
  const tipAt: Vector3[] = [];
  for (let tier = 0; tier < tiers; tier += 1) {
    const k = tier / (tiers - 1); // 0 at the bottom
    const y = foot + 0.12 + k * (height - 0.25);
    // (the widest tier clear of the railing on one side and the lockers on the other)
    const reach = 0.36 * (1 - k) + 0.08;
    const count = Math.max(5, Math.round(12 - k * 6));
    for (let i = 0; i < count; i += 1) {
      const angle = ((i + (tier % 2) * 0.5) / count) * Math.PI * 2;
      const droop = 0.35 + (1 - k) * 0.2;
      const mesh = new Mesh(bough, needles);
      mesh.scale.set(reach, reach * 0.9 + 0.1, 1);
      mesh.position.set(0, y, 0);
      // (laid flat, drooped at the tip, then turned round the trunk)
      mesh.rotation.set(-Math.PI / 2, angle, -droop, "YZX");
      tree.add(mesh);
      tipAt.push(new Vector3(Math.cos(angle) * reach * Math.cos(droop) * 0.85, y - Math.sin(droop) * reach * 0.85 - 0.02, -Math.sin(angle) * reach * Math.cos(droop) * 0.85));
    }
  }
  tree.position.set(treeX, 0, treeZ);
  bake(group, tree);
  // Lights and baubles on the bough tips, every other one each, turning about the tree
  const baubleAt: Vector3[] = [];
  tipAt.forEach((tip, i) => (i % 2 ? bulbAt : baubleAt).push(tip.add(new Vector3(treeX, 0, treeZ))));
  // The star on top
  const star = new Shape();
  for (let i = 0; i <= 10; i += 1) {
    const angle = Math.PI / 2 + (i / 10) * Math.PI * 2;
    const r = i % 2 ? 0.045 : 0.11;
    if (i === 0) star.moveTo(Math.cos(angle) * r, Math.sin(angle) * r);
    else star.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
  }
  const gold = new MeshBasicMaterial({ color: "#ffd860", side: DoubleSide, fog: false });
  const topper = new Mesh(new ShapeGeometry(star), gold);
  topper.position.set(treeX, foot + height + 0.08, treeZ);
  topper.rotation.y = 0.5;
  const topperGlow = new Mesh(new PlaneGeometry(0.6, 0.6), new MeshBasicMaterial({ map: glowMap, color: "#ffd060", transparent: true, opacity: 0.45, blending: AdditiveBlending, depthWrite: false }));
  topperGlow.position.copy(topper.position);
  topperGlow.rotation.y = 0.5;
  group.add(topper, topperGlow);
  // Presents under it: wrapped boxes, a ribbon each way round
  const papers = ["#c8202a", "#1f6a3a", "#e0c060", "#2a4a9a"].map((colour) => new MeshStandardMaterial({ color: colour, roughness: 0.7 }));
  const ribbon = new MeshStandardMaterial({ color: "#f2e6c8", roughness: 0.5 });
  ([
    [0.32, 0.25, 0.22, 0.16, 0.4, 0],
    [0.05, 0.4, 0.18, 0.14, 0.9, 1],
    [0.38, -0.12, 0.14, 0.2, -0.3, 2],
    [-0.12, 0.42, 0.13, 0.1, 0.2, 3],
  ] as const).forEach(([dx, dz, size, tall, turn, paper]) => {
    const sub = new Group();
    const box = new Mesh(new BoxGeometry(size, tall, size), papers[paper]);
    box.position.y = tall / 2;
    const across = new Mesh(new BoxGeometry(size + 0.004, tall + 0.004, 0.025), ribbon);
    across.position.y = tall / 2;
    const along = new Mesh(new BoxGeometry(0.025, tall + 0.004, size + 0.004), ribbon);
    along.position.y = tall / 2;
    sub.add(box, across, along);
    sub.position.set(treeX + dx, 0, treeZ + dz);
    sub.rotation.y = turn;
    bake(group, sub);
  });

  mergeFixedParts(group, [topper, topperGlow]);

  // The baubles: shiny, red, gold and silver
  const baubles = new InstancedMesh(new SphereGeometry(0.03, 10, 8), new MeshStandardMaterial({ color: "#ffffff", roughness: 0.25, metalness: 0.6, emissive: "#202020" }), baubleAt.length);
  const place = new Matrix4();
  const baubleColours = ["#c8202a", "#e0b040", "#c0c8d0"].map((colour) => new Color(colour));
  baubleAt.forEach((at, i) => {
    baubles.setMatrixAt(i, place.makeTranslation(at.x, at.y, at.z));
    baubles.setColorAt(i, baubleColours[i % baubleColours.length]);
  });
  group.add(baubles);
  // The lights, garland and tree alike, in one go: each its own colour, twinkling
  const bulbs = new InstancedMesh(new SphereGeometry(0.016, 8, 6), new MeshBasicMaterial({ color: "#ffffff", fog: false }), bulbAt.length);
  bulbAt.forEach((at, i) => {
    bulbs.setMatrixAt(i, place.makeTranslation(at.x, at.y, at.z));
    bulbs.setColorAt(i, BULBS[i % BULBS.length]);
  });
  group.add(bulbs);
  const lit = new Color();
  let twinkledAt = -1;
  group.userData.update = (t: number, reduced: boolean) => {
    if (reduced || t - twinkledAt < 0.12) return;
    twinkledAt = t;
    // (each bulb on a slow wave of its own; a few at a time dip right down and come back)
    bulbAt.forEach((_, i) => {
      const wave = Math.sin(t * (0.7 + (i % 7) * 0.13) + i * 2.3);
      const level = wave > 0.85 ? BULB_DIM : 0.75 + 0.25 * Math.sin(t * 1.9 + i);
      bulbs.setColorAt(i, lit.copy(BULBS[i % BULBS.length]).multiplyScalar(level));
    });
    if (bulbs.instanceColor) bulbs.instanceColor.needsUpdate = true;
    (topperGlow.material as MeshBasicMaterial).opacity = 0.4 + 0.08 * Math.sin(t * 1.3);
  };
  return group;
}
