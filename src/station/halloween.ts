import {
  AdditiveBlending,
  BufferGeometry,
  CanvasTexture,
  CylinderGeometry,
  DoubleSide,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
} from "three";

// Halloween decorations for the station, up through October only: a garland of black and
// orange paper bats along the ceiling corners, and jack-o'-lanterns about the platform. Everything is
// in this file; to take them down for good, delete it and the lines marked HALLOWEEN in
// StationScene.

export function isHalloweenSeason(now = new Date()) {
  const month = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "numeric" }).format(now));
  return month === 10;
}

// Where the station's walls are (from StationScene)
export type StationShape = { wallZ: number; sideX: number; endX: number; ceilingY: number; ticketsAt: [number, number, number] };

function paint(width: number, height: number, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (ctx) draw(ctx, width, height);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

// A paper bat, cut out: wings spread, scalloped along their bottom edge
function batTexture(paper: string, edge: string) {
  return paint(128, 64, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    const cx = w / 2;
    ctx.beginPath();
    ctx.moveTo(cx, 18);
    ctx.lineTo(cx - 5, 10); // ears
    ctx.lineTo(cx - 7, 20);
    ctx.quadraticCurveTo(cx - 30, 6, cx - 60, 14); // left wing top
    ctx.quadraticCurveTo(cx - 50, 30, cx - 54, 44);
    ctx.quadraticCurveTo(cx - 42, 34, cx - 34, 46); // scallops
    ctx.quadraticCurveTo(cx - 24, 36, cx - 16, 48);
    ctx.quadraticCurveTo(cx - 8, 40, cx, 54);
    ctx.quadraticCurveTo(cx + 8, 40, cx + 16, 48);
    ctx.quadraticCurveTo(cx + 24, 36, cx + 34, 46);
    ctx.quadraticCurveTo(cx + 42, 34, cx + 54, 44);
    ctx.quadraticCurveTo(cx + 50, 30, cx + 60, 14);
    ctx.quadraticCurveTo(cx + 30, 6, cx + 7, 20);
    ctx.lineTo(cx + 5, 10);
    ctx.closePath();
    ctx.fillStyle = paper;
    ctx.fill();
    ctx.strokeStyle = edge;
    ctx.lineWidth = 2;
    ctx.stroke();
    // Eyes punched out
    ctx.fillStyle = paper === "#111111" ? "#e8e2d2" : "#111111";
    ctx.fillRect(cx - 4, 22, 2, 2);
    ctx.fillRect(cx + 2, 22, 2, 2);
  });
}

// A string of bats from `from` to `to`, swagging between hooks every `span` metres
function batGarland(from: Vector3, to: Vector3, sag: number, span: number, facing: number) {
  const group = new Group();
  const length = from.distanceTo(to);
  const swags = Math.max(1, Math.round(length / span));
  const at = (k: number) => {
    const point = from.clone().lerp(to, k);
    const local = (k * swags) % 1;
    point.y -= Math.sin(local * Math.PI) * sag;
    return point;
  };
  const points = Array.from({ length: swags * 24 + 1 }, (_, i) => at(i / (swags * 24)));
  group.add(new Line(new BufferGeometry().setFromPoints(points), new LineBasicMaterial({ color: "#2a2018" })));
  const black = new MeshBasicMaterial({ map: batTexture("#111111", "#000000"), transparent: true, side: DoubleSide, alphaTest: 0.3, color: "#9a9a9a" });
  const orange = new MeshBasicMaterial({ map: batTexture("#e8701e", "#5a2208"), transparent: true, side: DoubleSide, alphaTest: 0.3, color: "#c8c0b0" });
  const bats: Mesh[] = [];
  const count = Math.floor(length / 0.32);
  for (let i = 1; i < count; i += 1) {
    const k = i / count;
    const bat = new Mesh(new PlaneGeometry(0.24, 0.12), i % 2 ? black : orange);
    bat.position.copy(at(k)).add(new Vector3(0, -0.07, 0));
    bat.rotation.y = facing;
    bat.userData.seed = i * 1.7;
    group.add(bat);
    bats.push(bat);
  }
  group.userData.bats = bats;
  return group;
}

// A jack-o'-lantern: a ribbed pumpkin, a stalk, and a carved face that glows
function faceTexture(seed: number) {
  return paint(128, 96, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#ffd25a";
    ctx.shadowColor = "#ff9a20";
    ctx.shadowBlur = 8;
    // Triangle eyes, and a nose
    [[30, 18], [98, 18]].forEach(([x, y]) => {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 14, y + 22);
      ctx.lineTo(x - 14, y + 22);
      ctx.fill();
    });
    ctx.beginPath();
    ctx.moveTo(64, 44);
    ctx.lineTo(70, 54);
    ctx.lineTo(58, 54);
    ctx.fill();
    // A jagged grin, a different one for each pumpkin
    ctx.beginPath();
    ctx.moveTo(16, 62);
    const teeth = 5 + (seed % 3);
    for (let i = 0; i <= teeth; i += 1) {
      const x = 16 + (i * 96) / teeth;
      ctx.lineTo(x, 62 + (i % 2 ? 8 : 0));
    }
    ctx.quadraticCurveTo(64, 104, 16, 62);
    ctx.fill();
  });
}

const pumpkinSkin = () =>
  paint(256, 64, (ctx, w, h) => {
    ctx.fillStyle = "#d8661c";
    ctx.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 32) {
      const g = ctx.createLinearGradient(x, 0, x + 32, 0);
      g.addColorStop(0, "rgba(90,30,5,0.55)");
      g.addColorStop(0.5, "rgba(255,170,80,0.15)");
      g.addColorStop(1, "rgba(90,30,5,0.55)");
      ctx.fillStyle = g;
      ctx.fillRect(x, 0, 32, h);
    }
  });

function jackOLantern(size: number, seed: number) {
  const group = new Group();
  const skin = new MeshStandardMaterial({ map: pumpkinSkin(), roughness: 0.7, emissive: "#3a1404" });
  const body = new Mesh(new SphereGeometry(size, 20, 14), skin);
  body.scale.set(1.1, 0.82, 1);
  body.position.y = size * 0.82;
  group.add(body);
  const stalk = new Mesh(new CylinderGeometry(size * 0.08, size * 0.12, size * 0.35, 6), new MeshStandardMaterial({ color: "#4a5a24", roughness: 0.9 }));
  stalk.position.y = size * 1.75;
  stalk.rotation.z = 0.2;
  group.add(stalk);
  const face = new Mesh(new PlaneGeometry(size * 1.3, size * 0.98), new MeshBasicMaterial({ map: faceTexture(seed), transparent: true, depthWrite: false }));
  face.position.set(0, size * 0.82, size * 1.0);
  group.add(face);
  // The candle's glow on whatever's in front
  const glow = new Mesh(new PlaneGeometry(size * 4, size * 3), new MeshBasicMaterial({ map: glowMap, color: "#ff8a2a", transparent: true, opacity: 0.35, blending: AdditiveBlending, depthWrite: false }));
  glow.position.set(0, size * 0.82, size * 1.05);
  group.add(glow);
  group.userData.glow = glow;
  group.userData.seed = seed;
  return group;
}

const glowMap = paint(64, 64, (ctx, w, h) => {
  const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
  g.addColorStop(0, "rgba(255,200,120,0.9)");
  g.addColorStop(1, "rgba(255,120,30,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
});

export function buildHalloween({ wallZ, sideX, endX, ceilingY, ticketsAt }: StationShape) {
  const group = new Group();
  const hookY = ceilingY - 0.05;
  // Bats along the back wall's top, and down the side wall to the platform's edge
  const back = batGarland(new Vector3(endX + 0.3, hookY, wallZ + 0.1), new Vector3(sideX - 0.1, hookY, wallZ + 0.1), 0.2, 1.6, 0);
  const side = batGarland(new Vector3(sideX - 0.1, hookY, wallZ + 0.1), new Vector3(sideX - 0.1, hookY, wallZ + 4.2), 0.2, 1.4, -Math.PI / 2);
  group.add(back, side);
  const bats = [...(back.userData.bats as Mesh[]), ...(side.userData.bats as Mesh[])];

  // Jack-o'-lanterns: by the lockers, under the board, either side of the events table,
  // and one on the ticket counter
  const lanterns: Group[] = [];
  const place = (x: number, y: number, z: number, size: number, turn = 0) => {
    const lantern = jackOLantern(size, lanterns.length);
    lantern.position.set(x, y, z);
    lantern.rotation.y = turn;
    group.add(lantern);
    lanterns.push(lantern);
  };
  place(-4.35, 0, wallZ + 0.45, 0.17, 0.15);
  // (the board's two right up against the wall, under it: their tops peep in when you're
  // reading its bottom papers)
  place(-1.5, 0, wallZ + 0.24, 0.15, 0.1);
  place(-0.25, 0, wallZ + 0.22, 0.13, -0.1);
  place(0.28, 0, wallZ + 0.3, 0.18, 0.2);
  place(2.25, 0, wallZ + 0.7, 0.15, -0.25);
  // The counter faces back along the platform: its top, to one side of the coin slot
  place(ticketsAt[0] - 0.3, ticketsAt[1], ticketsAt[2] - 0.5, 0.11, -Math.PI / 2);

  group.userData.update = (t: number, reduced: boolean) => {
    if (reduced) return;
    bats.forEach((bat) => {
      bat.rotation.z = Math.sin(t * 1.3 + bat.userData.seed) * 0.12;
    });
    lanterns.forEach((lantern) => {
      const seed = lantern.userData.seed as number;
      const flicker = 0.3 + 0.08 * Math.sin(t * 9 + seed) * Math.sin(t * 3.7 + seed * 2);
      ((lantern.userData.glow as Mesh).material as MeshBasicMaterial).opacity = flicker;
    });
  };
  return group;
}
