import {
  BoxGeometry,
  BufferGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  SphereGeometry,
  Vector3,
} from "three";
import { mergeFixedParts } from "../pages/ArcadeV2/mergeParts.ts";
import { paint, seasonMonth, type StationShape } from "./halloween.ts";

// Autumn decorations for the station, through November only (no event, just the season):
// garlands of red, orange and gold leaves along the ceiling corners, squashes and gourds about
// the platform, a hay bale and corn sheaves at the platform's end. (The canopy's lamps burn a
// little warmer too: StationScene.) Everything else is in this file; to take them down for
// good, delete it and the lines marked AUTUMN in StationScene.

export function isAutumnSeason(now = new Date()) {
  return seasonMonth(now) === 11;
}

// A fallen leaf cut out of paper: a maple's five points, or an oak's rounded lobes
const LEAF_COLOURS = ["#b8321c", "#d9701e", "#e0a826", "#8a5a2a"];
function leafTexture(colour: string, maple: boolean) {
  return paint(64, 64, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = colour;
    ctx.strokeStyle = "rgba(40,20,5,0.55)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (maple) {
      // Five lobes about the stem's end, each a point
      const cx = w / 2;
      const cy = h * 0.58;
      for (let i = 0; i <= 10; i += 1) {
        const angle = -Math.PI / 2 + ((i - 5) / 10) * Math.PI * 1.6;
        const r = i % 2 ? h * 0.2 : h * (i === 0 || i === 10 ? 0.22 : i === 4 || i === 6 ? 0.42 : 0.36);
        ctx.lineTo(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r);
      }
    } else {
      // Rounded lobes down either side of a long leaf
      for (let i = 0; i <= 16; i += 1) {
        const k = i / 16;
        const angle = k * Math.PI * 2;
        const r = 0.36 + 0.06 * Math.cos(angle * 4);
        ctx.lineTo(w / 2 + Math.sin(angle) * w * r * 0.62, h / 2 - Math.cos(angle) * h * r);
      }
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // The stem and the middle vein
    ctx.beginPath();
    ctx.moveTo(w / 2, h * 0.95);
    ctx.lineTo(w / 2, h * 0.2);
    ctx.stroke();
  });
}

// A string of leaves from `from` to `to`, swagging between hooks every `span` metres
function leafGarland(group: Group, from: Vector3, to: Vector3, sag: number, span: number, facing: number, materials: MeshStandardMaterial[]) {
  const length = from.distanceTo(to);
  const swags = Math.max(1, Math.round(length / span));
  const at = (k: number) => {
    const point = from.clone().lerp(to, k);
    point.y -= Math.sin(((k * swags) % 1) * Math.PI) * sag;
    return point;
  };
  const points = Array.from({ length: swags * 24 + 1 }, (_, i) => at(i / (swags * 24)));
  group.add(new Line(new BufferGeometry().setFromPoints(points), new LineBasicMaterial({ color: "#3a2a18" })));
  const leaf = new PlaneGeometry(0.22, 0.22);
  const count = Math.floor(length / 0.075);
  for (let i = 1; i < count; i += 1) {
    const mesh = new Mesh(leaf, materials[(i * 7) % materials.length]);
    mesh.position.copy(at(i / count)).add(new Vector3(0, -0.08, 0));
    // (hung every which way along the cord, as leaves do)
    mesh.rotation.set(((i * 37) % 9) * 0.06 - 0.24, facing + ((i * 13) % 7) * 0.12 - 0.36, ((i * 29) % 11) * 0.3 - 1.5);
    group.add(mesh);
  }
}

// A squash or gourd: a ribbed, squashed sphere with a stalk. `kind` picks which
const SQUASH = [
  { skin: "#d8661c", ribs: "#8a3a0a", stretch: [1.15, 0.78, 1.1] }, // a pumpkin
  { skin: "#e8e0c8", ribs: "#b0a080", stretch: [1.1, 0.72, 1.05] }, // a white one
  { skin: "#3e5a2a", ribs: "#1e3014", stretch: [1.05, 0.85, 1.0] }, // a green, striped
  { skin: "#e0b030", ribs: "#9a6a10", stretch: [0.85, 1.25, 0.85] }, // a gold gourd, tall
];
function squashSkin(skin: string, ribs: string) {
  return paint(256, 64, (ctx, w, h) => {
    ctx.fillStyle = skin;
    ctx.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 32) {
      const g = ctx.createLinearGradient(x, 0, x + 32, 0);
      g.addColorStop(0, ribs);
      g.addColorStop(0.5, "rgba(255,240,200,0.12)");
      g.addColorStop(1, ribs);
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = g;
      ctx.fillRect(x, 0, 32, h);
      ctx.globalAlpha = 1;
    }
  });
}

// Straw: pale gold, streaked
function strawTexture() {
  return paint(128, 128, (ctx, w, h) => {
    ctx.fillStyle = "#c9a24a";
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 700; i += 1) {
      ctx.strokeStyle = Math.random() < 0.5 ? "rgba(255,230,150,0.5)" : "rgba(110,80,25,0.45)";
      ctx.lineWidth = 1;
      const x = Math.random() * w;
      const y = Math.random() * h;
      const angle = (Math.random() - 0.5) * 0.6;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(angle) * 14, y + Math.sin(angle) * 14);
      ctx.stroke();
    }
  });
}

export function buildAutumn({ wallZ, sideX, endX, ceilingY, ticketsAt }: StationShape) {
  const group = new Group();
  const hookY = ceilingY - 0.05;
  const leaves = LEAF_COLOURS.flatMap((colour, i) =>
    [true, false].map((maple) => new MeshStandardMaterial({ map: leafTexture(colour, maple), transparent: true, alphaTest: 0.4, side: DoubleSide, roughness: 0.9, emissive: colour, emissiveIntensity: 0.12 + i * 0.02 }))
  );
  // Leaves along the back wall's top, and down the side wall to the platform's edge
  leafGarland(group, new Vector3(endX + 0.3, hookY, wallZ + 0.1), new Vector3(sideX - 0.1, hookY, wallZ + 0.1), 0.22, 1.6, 0, leaves);
  leafGarland(group, new Vector3(sideX - 0.1, hookY, wallZ + 0.1), new Vector3(sideX - 0.1, hookY, wallZ + 4.2), 0.22, 1.4, -Math.PI / 2, leaves);

  // Squashes and gourds, in little heaps where the jack-o'-lanterns stood in October
  const skins = SQUASH.map(({ skin, ribs }) => new MeshStandardMaterial({ map: squashSkin(skin, ribs), roughness: 0.7, emissive: skin, emissiveIntensity: 0.08 }));
  const stalk = new MeshStandardMaterial({ color: "#5a4a24", roughness: 0.9 });
  const ball = new SphereGeometry(1, 18, 12);
  const stem = new CylinderGeometry(0.08, 0.12, 0.35, 6);
  const squash = (x: number, y: number, z: number, size: number, kind: number, turn = 0) => {
    const [sx, sy, sz] = SQUASH[kind].stretch;
    const body = new Mesh(ball, skins[kind]);
    body.scale.set(size * sx, size * sy, size * sz);
    body.position.set(x, y + size * sy, z);
    body.rotation.y = turn;
    const top = new Mesh(stem, stalk);
    top.scale.setScalar(size);
    top.position.set(x, y + size * sy * 2 + size * 0.1, z);
    top.rotation.set(0.2, turn, 0.15);
    group.add(body, top);
  };
  const heap = (x: number, y: number, z: number, parts: [number, number, number, number][]) =>
    parts.forEach(([dx, dz, size, kind], i) => squash(x + dx, y, z + dz, size, kind, i * 1.3));
  heap(-4.35, 0, wallZ + 0.45, [[0, 0, 0.16, 0], [0.24, 0.08, 0.08, 1], [-0.2, 0.1, 0.07, 3]]);
  heap(-1.5, 0, wallZ + 0.26, [[0, 0, 0.13, 0], [0.2, 0.02, 0.07, 2]]);
  heap(0.24, 0, wallZ + 0.3, [[0, 0, 0.15, 1], [-0.2, 0.06, 0.08, 0], [0.18, 0.1, 0.06, 3]]);
  heap(2.22, 0, wallZ + 0.28, [[0, 0, 0.14, 0], [0.2, 0.05, 0.07, 2]]);
  // (and a few on the ticket counter, to one side of the coin slot)
  heap(ticketsAt[0] - 0.3, ticketsAt[1], ticketsAt[2] - 0.58, [[0, 0, 0.07, 3], [0, 0.12, 0.05, 1]]);

  // At the platform's end, in the corner by the railing: a hay bale, a pumpkin on it, and
  // corn sheaves leant on the wall either side
  const straw = new MeshStandardMaterial({ map: strawTexture(), roughness: 1 });
  const bale = new Mesh(new BoxGeometry(0.62, 0.42, 0.45), straw);
  bale.position.set(endX + 0.55, 0.21, wallZ + 0.55);
  group.add(bale);
  const twine = new MeshStandardMaterial({ color: "#6a4a20", roughness: 1 });
  [-0.16, 0.16].forEach((dx) => {
    const band = new Mesh(new BoxGeometry(0.02, 0.43, 0.46), twine);
    band.position.set(endX + 0.55 + dx, 0.21, wallZ + 0.55);
    group.add(band);
  });
  squash(endX + 0.5, 0.42, wallZ + 0.55, 0.14, 0);
  squash(endX + 0.73, 0.42, wallZ + 0.62, 0.06, 3);
  // A sheaf: dry stalks bundled at the waist, splaying out top and bottom
  const stalks = new MeshStandardMaterial({ color: "#b8954a", roughness: 1, emissive: "#3a2a10" });
  const blade = new BoxGeometry(0.024, 1, 0.024);
  const sheaf = (x: number, z: number, lean: number, height: number) => {
    for (let i = 0; i < 26; i += 1) {
      const around = (i / 26) * Math.PI * 2 + i * 0.4;
      const splay = 0.12 + (i % 3) * 0.03;
      const piece = new Mesh(blade, stalks);
      piece.scale.y = height * (0.9 + (i % 4) * 0.04);
      // (each stalk crosses the others at the tie, half way up: out at the foot, out at the top)
      piece.position.set(x - Math.sin(lean) * height * 0.5, height * 0.5, z);
      piece.rotation.set(Math.cos(around) * splay, 0, Math.sin(around) * splay + lean);
      group.add(piece);
    }
    const tie = new Mesh(new CylinderGeometry(0.06, 0.06, 0.05, 8), twine);
    tie.position.set(x - Math.sin(lean) * height * 0.5, height * 0.5, z);
    tie.rotation.z = lean;
    group.add(tie);
  };
  // (one in the corner behind the bale, one against the railing past it)
  sheaf(endX + 0.24, wallZ + 0.2, 0.05, 1.5);
  sheaf(endX + 0.24, wallZ + 1.05, 0.08, 1.35);

  mergeFixedParts(group);
  group.userData.update = () => {};
  return group;
}
