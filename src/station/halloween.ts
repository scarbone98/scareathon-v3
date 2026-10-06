import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  type Ray,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
} from "three";

// Halloween decorations for the station, up through October only: a garland of black and
// orange paper bats along the ceiling corners, jack-o'-lanterns about the platform, green and
// purple streamers strung under the canopy and fallen on the floor, and candles round the
// room. (The canopy's lamps also come on in a colour of their own: StationScene.) Everything
// else is in this file; to take them down for good, delete it and the lines marked HALLOWEEN
// in StationScene.

export function isHalloweenSeason(now = new Date()) {
  const month = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "numeric" }).format(now));
  return month === 10;
}

// Where the station's walls are (from StationScene)
// (lockersTop: the middle of the lockers' top; edgeZ: the platform's edge)
export type StationShape = { wallZ: number; sideX: number; endX: number; edgeZ: number; ceilingY: number; ticketsAt: [number, number, number]; lockersTop: [number, number, number] };

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

// A crepe streamer: a ribbon along `points`, `width` across, turning over `twists` times
// along its length (none: it lies flat, its face up)
function streamer(points: Vector3[], width: number, twists: number, material: MeshStandardMaterial) {
  const positions: number[] = [];
  const indices: number[] = [];
  const up = new Vector3(0, 1, 0);
  points.forEach((point, i) => {
    const tangent = points[Math.min(i + 1, points.length - 1)].clone().sub(points[Math.max(i - 1, 0)]).normalize();
    const flat = new Vector3().crossVectors(tangent, up).normalize();
    const lift = new Vector3().crossVectors(flat, tangent);
    const angle = (i / (points.length - 1)) * twists * Math.PI * 2;
    const across = flat.multiplyScalar(Math.cos(angle)).add(lift.multiplyScalar(Math.sin(angle))).multiplyScalar(width / 2);
    positions.push(point.x - across.x, point.y - across.y, point.z - across.z, point.x + across.x, point.y + across.y, point.z + across.z);
    if (i > 0) indices.push(i * 2 - 2, i * 2 - 1, i * 2, i * 2 - 1, i * 2 + 1, i * 2);
  });
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return new Mesh(geometry, material);
}

// A skull, looking out: a cranium, a jaw with a row of teeth, hollow eyes and nose
function skull(size: number) {
  const group = new Group();
  const bone = new MeshStandardMaterial({ color: "#e4dcc6", roughness: 0.75, emissive: "#2a2014" });
  const hollow = new MeshBasicMaterial({ color: "#0a0806" });
  const cranium = new Mesh(new SphereGeometry(size, 18, 14), bone);
  cranium.scale.set(1, 1.02, 1.12);
  cranium.position.y = size * 1.25;
  group.add(cranium);
  const jaw = new Mesh(new BoxGeometry(size * 1.1, size * 0.55, size * 1.0), bone);
  jaw.position.set(0, size * 0.42, size * 0.42);
  group.add(jaw);
  [-1, 1].forEach((side) => {
    const eye = new Mesh(new SphereGeometry(size * 0.27, 10, 8), hollow);
    eye.position.set(side * size * 0.38, size * 1.2, size * 0.95);
    group.add(eye);
  });
  const nose = new Mesh(new ConeGeometry(size * 0.13, size * 0.24, 3), hollow);
  nose.position.set(0, size * 0.86, size * 1.06);
  group.add(nose);
  // Teeth: a dark line across the jaw, and the gaps between them
  const grin = new Mesh(new BoxGeometry(size * 0.9, size * 0.035, size * 0.02), hollow);
  grin.position.set(0, size * 0.5, size * 0.93);
  group.add(grin);
  for (let i = -2; i <= 2; i += 1) {
    const gap = new Mesh(new BoxGeometry(size * 0.03, size * 0.3, size * 0.02), hollow);
    gap.position.set(i * size * 0.2, size * 0.5, size * 0.93);
    group.add(gap);
  }
  return group;
}

// A candle: a stub of wax, a wick, a flame (two crossed leaves of it, so it shows from
// any side) and its glow
const flameMap = paint(32, 64, (ctx, w, h) => {
  const g = ctx.createRadialGradient(w / 2, h * 0.68, 1, w / 2, h * 0.6, h * 0.5);
  g.addColorStop(0, "rgba(255,250,220,1)");
  g.addColorStop(0.35, "rgba(255,200,90,0.95)");
  g.addColorStop(1, "rgba(255,110,20,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(w / 2, 2);
  ctx.quadraticCurveTo(w * 0.95, h * 0.6, w / 2, h - 4);
  ctx.quadraticCurveTo(w * 0.05, h * 0.6, w / 2, 2);
  ctx.fill();
});

function candle(height: number, seed: number) {
  const group = new Group();
  const radius = 0.022;
  const wax = new Mesh(new CylinderGeometry(radius, radius * 1.08, height, 10), new MeshStandardMaterial({ color: "#e8dcc0", roughness: 0.6, emissive: "#4a2c10" }));
  wax.position.y = height / 2;
  group.add(wax);
  const flameMaterial = new MeshBasicMaterial({ map: flameMap, transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide, fog: false });
  const flame = new Group();
  [0, Math.PI / 2].forEach((turn) => {
    const leaf = new Mesh(new PlaneGeometry(0.035, 0.07), flameMaterial);
    leaf.rotation.y = turn;
    flame.add(leaf);
  });
  flame.position.y = height + 0.04;
  group.add(flame);
  const glow = new Mesh(new PlaneGeometry(0.5, 0.5), new MeshBasicMaterial({ map: glowMap, color: "#ffa040", transparent: true, opacity: 0.3, blending: AdditiveBlending, depthWrite: false }));
  glow.position.y = height + 0.05;
  group.add(glow);
  group.userData.flame = flame;
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

export function buildHalloween({ wallZ, sideX, endX, edgeZ, ceilingY, ticketsAt, lockersTop }: StationShape) {
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
  place(ticketsAt[0] - 0.3, ticketsAt[1], ticketsAt[2] - 0.58, 0.11, -Math.PI / 2);

  // Streamers, green and purple turn about. Overhead: strung from the back wall out under
  // the canopy, twisted, sagging, each crossing the next
  const crepe = ["#39c95a", "#9a45e0"].map((colour) => new MeshStandardMaterial({ color: colour, roughness: 0.9, side: DoubleSide, emissive: colour, emissiveIntensity: 0.18 }));
  const swag = (from: Vector3, to: Vector3, sag: number) =>
    Array.from({ length: 41 }, (_, i) => {
      const point = from.clone().lerp(to, i / 40);
      point.y -= Math.sin((i / 40) * Math.PI) * sag;
      return point;
    });
  // (each hangs from a pivot at its hook on the wall, turning about the line between its
  // two hooks: brushed by a finger, it swings like a skipping rope and settles)
  const hung: { pivot: Group; axis: Vector3; push: Vector3; low: Vector3; angle: number; speed: number }[] = [];
  const firstX = endX + 0.9;
  const strung = 9;
  const step = (sideX - 0.6 - firstX) / (strung - 1);
  // (the last would hang over the ticket counter: left off)
  for (let i = 0; i < strung - 1; i += 1) {
    const x = firstX + i * step;
    const lean = (i % 2 ? -1 : 1) * 0.9;
    const from = new Vector3(x, hookY, wallZ + 0.12);
    const to = new Vector3(x + lean, hookY, wallZ + 3.9);
    const sag = 0.32 + (i % 3) * 0.05;
    const pivot = new Group();
    pivot.position.copy(from);
    pivot.add(streamer(swag(new Vector3(), to.clone().sub(from), sag), 0.07, 9, crepe[i % 2]));
    group.add(pivot);
    const axis = to.clone().sub(from).normalize();
    // (push: the way its lowest point goes as the angle grows)
    hung.push({ pivot, axis, push: new Vector3().crossVectors(axis, new Vector3(0, -1, 0)).normalize(), low: from.clone().lerp(to, 0.5).setY(hookY - sag), angle: 0, speed: 0 });
  }
  // Underfoot: lengths that have come down, lying where they fell, a curl lifting here and there
  const fallen: [number, number, number, number][] = [
    [-5.6, 0.9, 0.5, 1.3],
    [-4.2, 2.1, 2.4, 1.0],
    [-2.3, 0.3, -0.4, 1.5],
    [-1.2, 2.3, 1.2, 1.1],
    [0.6, 1.2, 2.9, 1.4],
    [2.0, 2.4, 0.2, 1.0],
    [3.3, 0.6, 1.9, 1.3],
    [4.3, 1.9, -0.8, 0.9],
  ];
  // (each in a holder at its middle: swept by a finger, it slides and turns across the slabs)
  const lying: { holder: Group; points: Vector3[]; vx: number; vz: number; spin: number }[] = [];
  fallen.forEach(([x, z, heading, length], i) => {
    const along = new Vector3(Math.cos(heading), 0, Math.sin(heading));
    const aside = new Vector3(-along.z, 0, along.x);
    const points = Array.from({ length: 33 }, (_, n) => {
      const k = n / 32;
      const curl = Math.max(0, Math.sin(k * Math.PI * 3 + i)) ** 6 * 0.035;
      return new Vector3(0, 0.014 + curl, 0)
        .add(along.clone().multiplyScalar((k - 0.5) * length))
        .add(aside.clone().multiplyScalar(Math.sin(k * Math.PI * 2.5 + i * 1.3) * 0.11));
    });
    const holder = new Group();
    holder.position.set(x, 0, z);
    holder.add(streamer(points, 0.06, 0.5, crepe[(i + 1) % 2]));
    group.add(holder);
    lying.push({ holder, points, vx: 0, vz: 0, spin: 0 });
  });

  // A finger dragged across the scene. Overhead: any streamer the finger's ray passes close
  // by is set swinging the way the finger went (`across`: its way in the world, m/s)
  const reach = new Vector3();
  group.userData.brush = (ray: Ray, across: Vector3) => {
    hung.forEach((one) => {
      // (as it hangs now, swung or not)
      reach.copy(one.low).sub(one.pivot.position).applyAxisAngle(one.axis, one.angle).add(one.pivot.position);
      if (ray.distanceToPoint(reach) > 0.3) return;
      one.speed += Math.max(-1.6, Math.min(1.6, across.dot(one.push) * 0.5));
      one.speed = Math.max(-6, Math.min(6, one.speed));
    });
  };
  // Underfoot: one the finger passes over (`at`: where on the floor) is pushed along, and
  // turned, by where along its length it was caught
  group.userData.sweep = (at: Vector3, vx: number, vz: number) => {
    lying.forEach((one) => {
      const { holder } = one;
      reach.set(at.x - holder.position.x, 0, at.z - holder.position.z);
      if (reach.length() > 1) return;
      const caught = reach.clone().applyAxisAngle(new Vector3(0, 1, 0), -holder.rotation.y);
      if (!one.points.some((point) => Math.hypot(point.x - caught.x, point.z - caught.z) < 0.16)) return;
      one.vx = vx * 0.6;
      one.vz = vz * 0.6;
      one.spin = Math.max(-5, Math.min(5, (reach.z * vx - reach.x * vz) * 2.5));
    });
  };
  let movedAt = -1;
  let facing: number | null = null;
  // (yaw: the way you're facing, round the upright: turning stirs the air, and the
  // streamers overhead swing with it)
  const moveStreamers = (t: number, yaw?: number) => {
    const dt = movedAt < 0 ? 0 : Math.min(t - movedAt, 0.05);
    movedAt = t;
    if (yaw !== undefined) {
      let turned = facing === null ? 0 : yaw - facing;
      facing = yaw;
      if (turned > Math.PI) turned -= Math.PI * 2;
      if (turned < -Math.PI) turned += Math.PI * 2;
      // (a jump, not a turn: you've been put somewhere else)
      if (Math.abs(turned) > 0.0005 && Math.abs(turned) < 0.5) {
        hung.forEach((one, i) => {
          one.speed = Math.max(-6, Math.min(6, one.speed + turned * (1.6 + (i % 3) * 0.35) * Math.sign(one.push.x || 1)));
        });
      }
    }
    hung.forEach((one) => {
      if (!one.angle && !one.speed) return;
      // A pendulum, with the air's drag on the paper
      one.speed += (-9 * Math.sin(one.angle) - 1.1 * one.speed) * dt;
      one.angle = Math.max(-1.3, Math.min(1.3, one.angle + one.speed * dt));
      if (Math.abs(one.angle) < 0.002 && Math.abs(one.speed) < 0.01) one.angle = one.speed = 0;
      one.pivot.quaternion.setFromAxisAngle(one.axis, one.angle);
    });
    lying.forEach((one) => {
      if (!one.vx && !one.vz && !one.spin) return;
      const p = one.holder.position;
      p.x += one.vx * dt;
      p.z += one.vz * dt;
      one.holder.rotation.y += one.spin * dt;
      const drag = Math.exp(-4 * dt);
      one.vx *= drag;
      one.vz *= drag;
      one.spin *= drag;
      // Kept on the open platform
      if (p.x < endX + 0.7 || p.x > sideX - 0.7) {
        p.x = Math.min(Math.max(p.x, endX + 0.7), sideX - 0.7);
        one.vx *= -0.3;
      }
      if (p.z < wallZ + 0.6 || p.z > edgeZ - 0.7) {
        p.z = Math.min(Math.max(p.z, wallZ + 0.6), edgeZ - 0.7);
        one.vz *= -0.3;
      }
      if (Math.hypot(one.vx, one.vz) < 0.01) one.vx = one.vz = 0;
      if (Math.abs(one.spin) < 0.02) one.spin = 0;
    });
  };

  // Candles: little huddles of them on the floor along the wall, and a pair on the counter
  const candles: Group[] = [];
  const huddle = (x: number, y: number, z: number, heights: number[]) => {
    heights.forEach((height, i) => {
      const one = candle(height, candles.length * 2.3);
      one.position.set(x + (i - (heights.length - 1) / 2) * 0.075, y, z + (i % 2 ? 0.05 : 0));
      group.add(one);
      candles.push(one);
    });
  };
  huddle(-5.9, 0, wallZ + 0.4, [0.12, 0.2, 0.09]);
  huddle(-3.95, 0, wallZ + 0.62, [0.16, 0.1]);
  huddle(-2.0, 0, wallZ + 0.35, [0.1, 0.22, 0.14]);
  huddle(-0.7, 0, wallZ + 0.3, [0.18, 0.11]);
  huddle(2.75, 0, wallZ + 0.55, [0.13, 0.2, 0.1]);
  huddle(4.3, 0, wallZ + 0.4, [0.2, 0.12]);
  // On top of the lockers: a skull keeping watch, candles burnt down either side of it
  const [lockersX, lockersY, lockersZ] = lockersTop;
  const watchman = skull(0.1);
  watchman.position.set(lockersX + 0.08, lockersY, lockersZ + 0.02);
  watchman.rotation.y = 0.25;
  group.add(watchman);
  huddle(lockersX - 0.45, lockersY, lockersZ + 0.05, [0.14, 0.24, 0.1]);
  huddle(lockersX + 0.5, lockersY, lockersZ + 0.08, [0.2, 0.12]);
  const counter = candle(0.1, 41);
  counter.position.set(ticketsAt[0] - 0.3, ticketsAt[1], ticketsAt[2] + 0.55);
  const counterTall = candle(0.16, 47);
  counterTall.position.set(ticketsAt[0] - 0.26, ticketsAt[1], ticketsAt[2] + 0.63);
  group.add(counter, counterTall);
  candles.push(counter, counterTall);

  group.userData.update = (t: number, reduced: boolean, yaw?: number) => {
    // (they only move when you move them, so reduced motion or not; but not for a turn of
    // the head, then)
    moveStreamers(t, reduced ? undefined : yaw);
    if (reduced) return;
    candles.forEach((each) => {
      const seed = each.userData.seed as number;
      const waver = Math.sin(t * 11 + seed) * Math.sin(t * 4.3 + seed * 1.7);
      const flame = each.userData.flame as Group;
      flame.scale.set(1 + waver * 0.12, 1 + waver * 0.2, 1 + waver * 0.12);
      flame.rotation.z = waver * 0.12;
      ((each.userData.glow as Mesh).material as MeshBasicMaterial).opacity = 0.28 + 0.07 * waver;
    });
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
