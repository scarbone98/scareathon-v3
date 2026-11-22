import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type Object3D,
  PlaneGeometry,
  Points,
  PointsMaterial,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  Vector3,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { CHRISTMAS_META as meta } from "./christmasMeta.ts";
import { mergeFixedParts } from "../pages/ArcadeV2/mergeParts.ts";
import { glowMap, paint, stationSeason, type StationShape } from "./halloween.ts";

// Christmas decorations for the station, from Thanksgiving to December 31: fir garland swagged
// along the walls, over the ticket window and along the railing, with strings of big bulbs (some
// blinking, the railing's chasing); wreaths; a tree at the platform's end with presents and a toy
// train; poinsettias, candy canes and nutcrackers about the place; candles, a village cottage and a
// snow globe on the lockers; a little tree, a snowman, a candy jar and stockings at the ticket
// counter. The props are Blender models (art/station/build_christmas.py -> public/models/Christmas.glb).
// Outside it snows, and the snow lies on the fields; the rug in the middle is a winter one
// (StationScene). Everything else is in this file; to take them down for good, delete it and
// the lines marked CHRISTMAS in StationScene.

export function isChristmasSeason(now = new Date()) {
  return stationSeason(now) === "christmas";
}

// Snow lying on the fields and over the line, for StationScene: the textures, and the colour
// they're lit by at night (moonlit blue) and by day (StationScene's fields are painted dark and
// multiplied well past white by day; snow is painted light, so its day colour stays near white)
export function snowyGround() {
  const drift = (base: string, dots: string[], count: number, size: number) =>
    paint(256, 256, (ctx, w, h) => {
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < count; i += 1) {
        ctx.fillStyle = dots[i % dots.length];
        ctx.fillRect(Math.random() * w, Math.random() * h, size, size);
      }
    });
  const fields = drift("#dfe5ee", ["#c9d1de", "#eef2f7", "#bfc9d8", "#f6f8fb", "#d3dae5"], 2600, 3);
  // (the line: snow over the gravel, the stones showing through here and there)
  const ballast = drift("#cfd6e0", ["#5a5550", "#e8edf3", "#3e3a36", "#b8c1cd"], 900, 2);
  return { fields, ballast, night: "#6f7c96", day: "#d8dde6" };
}

// The rug in the middle of the platform, for the season: deep red, a green border with a white
// stitch round it, a ring of snowflakes and a big one in the middle, worn pale where you stand
export function christmasRugTexture() {
  return paint(512, 512, (ctx, w) => {
    const c = w / 2;
    const ring = (r: number, colour: string) => {
      ctx.fillStyle = colour;
      ctx.beginPath();
      ctx.arc(c, c, r, 0, Math.PI * 2);
      ctx.fill();
    };
    ring(c, "#173c26");
    ring(c - 14, "#245a36");
    ring(c - 34, "#173c26");
    ring(c - 40, "#8e1c22");
    ring(c - 92, "#a8262a");
    ring(c - 98, "#e8dcc4");
    ring(c - 103, "#a8262a");
    // A white stitch round the border
    ctx.strokeStyle = "#efe6d2";
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 8]);
    ctx.beginPath();
    ctx.arc(c, c, c - 24, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    const flake = (x: number, y: number, r: number, width: number) => {
      ctx.strokeStyle = "#f4efe2";
      ctx.lineWidth = width;
      ctx.lineCap = "round";
      for (let k = 0; k < 6; k += 1) {
        const a = (k / 6) * Math.PI * 2;
        const ex = Math.cos(a);
        const ey = Math.sin(a);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + ex * r, y + ey * r);
        ctx.stroke();
        // (two little branches on each arm)
        [0.45, 0.7].forEach((along) => {
          const bx = x + ex * r * along;
          const by = y + ey * r * along;
          [-1, 1].forEach((side) => {
            const b = a + side * 0.75;
            ctx.beginPath();
            ctx.moveTo(bx, by);
            ctx.lineTo(bx + Math.cos(b) * r * 0.28, by + Math.sin(b) * r * 0.28);
            ctx.stroke();
          });
        });
      }
    };
    // A ring of snowflakes between the border and the middle, and a big one in the middle
    for (let i = 0; i < 12; i += 1) {
      const a = (i / 12) * Math.PI * 2;
      flake(c + Math.cos(a) * (c - 66), c + Math.sin(a) * (c - 66), 15, 3);
    }
    flake(c, c, 92, 7);
    // Gold studs between the flakes
    for (let i = 0; i < 12; i += 1) {
      const a = ((i + 0.5) / 12) * Math.PI * 2;
      const x = c + Math.cos(a) * (c - 66);
      const y = c + Math.sin(a) * (c - 66);
      ctx.fillStyle = "#d8a23a";
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    const worn = ctx.createRadialGradient(c, c, 8, c, c, c - 100);
    worn.addColorStop(0, "rgba(230,200,190,0.28)");
    worn.addColorStop(1, "rgba(230,200,190,0)");
    ctx.fillStyle = worn;
    ctx.fillRect(0, 0, w, w);
    for (let i = 0; i < 9000; i += 1) {
      ctx.fillStyle = Math.random() < 0.5 ? "rgba(0,0,0,0.12)" : "rgba(255,240,230,0.06)";
      ctx.fillRect(Math.random() * w, Math.random() * w, 2, 2);
    }
  });
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

// The colours the lights come in (old-fashioned big bulbs: red, green, amber, blue, warm white)
const BULBS = ["#ff3a3a", "#3aff6a", "#ffb43a", "#3a8aff", "#fff2d0"].map((colour) => new Color(colour));

// How a bulb behaves: most glow and gently twinkle, some blink right off and on, and the
// railing's string chases along
type Bulb = { at: Vector3; colour: number; mode: "twinkle" | "blink" | "chase"; phase: number; size: number };

// A paper snowflake, cut out: six arms with little branches, white on clear
function paperSnowflake() {
  return paint(128, 128, (ctx, w) => {
    ctx.clearRect(0, 0, w, w);
    const c = w / 2;
    ctx.strokeStyle = "#f4f6fa";
    ctx.lineCap = "round";
    for (let k = 0; k < 6; k += 1) {
      const a = (k / 6) * Math.PI * 2;
      const ex = Math.cos(a);
      const ey = Math.sin(a);
      ctx.lineWidth = 9;
      ctx.beginPath();
      ctx.moveTo(c, c);
      ctx.lineTo(c + ex * c * 0.9, c + ey * c * 0.9);
      ctx.stroke();
      ctx.lineWidth = 6;
      [0.4, 0.65].forEach((along) => {
        const bx = c + ex * c * along;
        const by = c + ey * c * along;
        [-1, 1].forEach((side) => {
          const b = a + side * 0.8;
          ctx.beginPath();
          ctx.moveTo(bx, by);
          ctx.lineTo(bx + Math.cos(b) * c * 0.26, by + Math.sin(b) * c * 0.26);
          ctx.stroke();
        });
      });
    }
    ctx.fillStyle = "#f4f6fa";
    ctx.beginPath();
    ctx.arc(c, c, 12, 0, Math.PI * 2);
    ctx.fill();
  });
}

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

// The props are models (art/station/build_christmas.py makes them in Blender), loaded once
// and placed by name; the lights and the candle flames are made here, so they can twinkle
const MODELS = "/models/Christmas.glb";

// Puts a copy of a prop where it goes: at (x, y, z), turned `turn` about the vertical, scaled
type Placing = [name: string, x: number, y: number, z: number, turn?: number, scale?: number];

export function buildChristmas({ wallZ, sideX, endX, ceilingY, ticketsAt, lockersTop }: StationShape, warm?: (object: Object3D) => Promise<unknown>) {
  const group = new Group();
  const hookY = ceilingY - 0.05;
  const needles = new MeshStandardMaterial({ map: boughTexture(), transparent: true, alphaTest: 0.35, side: DoubleSide, roughness: 0.9, emissive: "#0c2412", emissiveIntensity: 0.6 });
  const bulbs: Bulb[] = [];
  const bulb = (at: Vector3, mode: Bulb["mode"], size = 1) => bulbs.push({ at, colour: bulbs.length % BULBS.length, mode, phase: Math.random() * Math.PI * 2, size });
  // (every third bulb on a string blinks; the rest twinkle)
  const strung = (at: Vector3, i: number, size = 1) => bulb(at, i % 3 === 0 ? "blink" : "twinkle", size);

  // The ticket counter's own frame of reference: x along the counter, z out towards the
  // visitor, y up from the floor (the counter faces back along the platform)
  const counter = new Group();
  counter.position.set(ticketsAt[0], 0, ticketsAt[2]);
  counter.rotation.y = -Math.PI / 2;
  counter.updateMatrixWorld();
  const atCounter = (x: number, y: number, z: number) => new Vector3(x, y, z).applyMatrix4(counter.matrixWorld);
  const counterTop = ticketsAt[1];

  // Garland: swags of fir rope along the walls' tops, a bow at each hook, bulbs hung along them.
  // Each swag is the model's one swag, stretched a little to fit its stretch of wall
  const swagBulbs = meta.swagBulbs.map(([x, y, z]) => new Vector3(x, y, z));
  const swags: Placing[] = [];
  const bows: Placing[] = [];
  // (along a wall from `from` to `to`, `turn` facing out from it)
  const garland = (from: Vector3, to: Vector3, turn: number, span = meta.swagLength, bowed = true) => {
    const length = from.distanceTo(to);
    const count = Math.max(1, Math.round(length / span));
    const stretch = length / count / meta.swagLength;
    const along = to.clone().sub(from).normalize();
    for (let i = 0; i < count; i += 1) {
      const start = from.clone().addScaledVector(along, (length * i) / count);
      swags.push(["GarlandSwag", start.x, start.y, start.z, turn, stretch]);
      if (bowed) bows.push(["GarlandBow", start.x, start.y, start.z, turn]);
      const place = new Matrix4().makeRotationY(turn).scale(new Vector3(stretch, 1, 1)).setPosition(start);
      swagBulbs.forEach((point, k) => strung(point.clone().applyMatrix4(place), i * swagBulbs.length + k, 1.2));
    }
    if (bowed) bows.push(["GarlandBow", to.x, to.y, to.z, turn]);
  };
  garland(new Vector3(endX + 0.3, hookY, wallZ + 0.1), new Vector3(sideX - 0.1, hookY, wallZ + 0.1), 0);
  garland(new Vector3(sideX - 0.1, hookY, wallZ + 0.1), new Vector3(sideX - 0.1, hookY, wallZ + 4.2), -Math.PI / 2);
  // One over the ticket window, and along the railing at the platform's end (facing in)
  garland(atCounter(-0.75, 2.14, 0.1), atCounter(0.75, 2.14, 0.1), -Math.PI / 2, 1.5);
  const railX = endX + 0.12;
  garland(new Vector3(railX, 1.08, wallZ + 0.15), new Vector3(railX, 1.08, 3.1), Math.PI / 2, 0.9, false); // (no bows: seen from the bench they're right in your face)

  // Lights round the ticket window's frame, up one side and down the other, blinking in turn
  for (let i = 0; i <= 8; i += 1) {
    const y = 1.12 + (i / 8) * 0.9;
    bulb(atCounter(-0.8, y, 0.09), i % 2 ? "blink" : "twinkle");
    bulb(atCounter(0.8, y, 0.09), i % 2 ? "twinkle" : "blink");
  }
  // A string looped along the railing's handrail, chasing towards the view
  {
    const from = wallZ + 0.2;
    const to = 3.1;
    const n = 26;
    for (let i = 0; i <= n; i += 1) {
      const k = i / n;
      const sag = Math.abs(Math.sin(k * Math.PI * 6)) * 0.07;
      bulbs.push({ at: new Vector3(railX + 0.02, 0.99 - sag, from + k * (to - from)), colour: i % BULBS.length, mode: "chase", phase: k, size: 1 });
    }
  }

  // The tree, at the platform's end, its lights wound round it from the foot up
  const treeX = endX + 0.62;
  const treeZ = wallZ + 0.7;
  const tree = meta.tree;
  {
    const turns = 6.5;
    const n = 78;
    for (let i = 0; i < n; i += 1) {
      const k = i / n;
      const y = tree.baseY + k * (tree.topY - tree.baseY);
      const r = tree.baseRadius * (1 - k) * 0.95 + 0.04;
      const a = k * turns * Math.PI * 2;
      strung(new Vector3(treeX + Math.cos(a) * r, y, treeZ + Math.sin(a) * r), i, 0.9);
    }
  }
  // The star's glow
  const starGlow = new Sprite(new SpriteMaterial({ map: glowMap, color: "#ffd060", transparent: true, opacity: 0.45, blending: AdditiveBlending, depthWrite: false }));
  starGlow.scale.set(0.7, 0.7, 1);
  starGlow.position.set(treeX, tree.starY, treeZ + 0.02);
  group.add(starGlow);

  // A wreath: sprays round a ring, red berries in clumps, a red bow at the bottom. Built
  // facing +z, then turned to face out from its wall
  const red = new MeshStandardMaterial({ color: "#c8202a", roughness: 0.55, emissive: "#3a0608" });
  const berry = new SphereGeometry(0.018, 6, 5);
  const spray = new PlaneGeometry(0.3, 0.15);
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
  mergeFixedParts(group, [starGlow]);

  // Where the props go
  const [lockersX, lockersY, lockersZ] = lockersTop;
  const onCounter = (name: string, x: number, z: number, turn = 0, scale = 1): Placing => {
    const at = atCounter(x, counterTop, z);
    return [name, at.x, at.y, at.z, turn - Math.PI / 2, scale];
  };
  const hungOnCounter = (name: string, x: number): Placing => {
    const at = atCounter(x, 1.03, 0.5);
    return [name, at.x, at.y, at.z, -Math.PI / 2];
  };
  const props: Placing[] = [
    ...swags,
    ...bows,
    ["XmasTree", treeX, 0, treeZ, 0.4],
    ["Presents", treeX, 0, treeZ, 0.6], // (round the tree's foot, facing into the room)
    ["ToyTrain", lockersX - 0.1, 0, lockersZ + 0.62, 0.25],
    // On top of the lockers: candles, a village cottage and a snow globe
    ["CandleCluster", lockersX - 0.32, lockersY, lockersZ, 0.2],
    ["VillageHouse", lockersX + 0.08, lockersY, lockersZ - 0.03, -0.2],
    ["SnowGlobe", lockersX + 0.4, lockersY, lockersZ + 0.04, 0.3],
    // Poinsettias about the floor: under the board, beside the events table, by the bench
    ["Poinsettia", -1.55, 0, wallZ + 0.3, 0.5],
    ["Poinsettia", -0.25, 0, wallZ + 0.3, 1.7],
    ["Poinsettia", 2.15, 0, wallZ + 0.32, 2.6],
    ["Poinsettia", endX + 0.45, 0, 2.7, 0.9],
    // Big candy canes either side of the board
    ["CandyCane", -1.8, 0, wallZ + 0.22, 0.2, 2.2],
    ["CandyCane", 0.02, 0, wallZ + 0.22, Math.PI - 0.2, 2.2],
    // A gingerbread man on the bench, by the radio
    ["Gingerbread", endX + 1.2, 0.49, 0.55, Math.PI / 2],
    // The ticket shop: nutcrackers either side of the counter, and things on it
    (() => { const at = atCounter(-1.12, 0, 0.35); return ["Nutcracker", at.x, 0, at.z, -Math.PI / 2] as Placing; })(),
    (() => { const at = atCounter(1.12, 0, 0.35); return ["Nutcracker", at.x, 0, at.z, -Math.PI / 2] as Placing; })(),
    onCounter("MiniTree", -0.68, 0.27),
    onCounter("Snowman", -0.44, 0.36, 0.3),
    onCounter("CandleCluster", 0.42, 0.35, -0.4),
    onCounter("CandyJar", 0.68, 0.27),
    onCounter("Gingerbread", 0.24, 0.42, -0.5),
    hungOnCounter("Stocking", -0.45),
    hungOnCounter("Stocking", 0.45),
  ];

  // Paper snowflakes hung on threads either side of the ticket counter (clear of the adverts over
  // it, which are the shop's things), slowly turning
  const flakeMaterial = new MeshStandardMaterial({ map: paperSnowflake(), transparent: true, alphaTest: 0.4, side: DoubleSide, roughness: 1, emissive: "#3a4250", emissiveIntensity: 0.5 });
  const thread = new MeshBasicMaterial({ color: "#6e6a62" });
  const flakes: Mesh[] = [];
  [[-1.55, 2.55, 0.3], [-1.25, 2.25, 0.24], [1.25, 2.3, 0.26], [1.55, 2.6, 0.32]].forEach(([x, y, size], i) => {
    const at = atCounter(x, y, 0.45 + (i % 2) * 0.15);
    const flake = new Mesh(new PlaneGeometry(size, size), flakeMaterial);
    flake.position.copy(at);
    flake.rotation.y = i * 0.9;
    const string = new Mesh(new BoxGeometry(0.0025, ceilingY - y - size / 2, 0.0025), thread);
    string.position.set(at.x, (ceilingY + y + size / 2) / 2, at.z);
    flakes.push(flake);
    group.add(flake, string);
  });

  // Candle flames: on the lockers and on the counter, each wick's flame and its glow
  const flames: Mesh[] = [];

  const flameGeometry = new SphereGeometry(0.014, 8, 6);
  flameGeometry.scale(1, 2.2, 1);
  flameGeometry.translate(0, 0.026, 0);
  const flameMaterial = new MeshBasicMaterial({ color: "#ffd27a" });
  const flameGlow = new SpriteMaterial({ map: glowMap, color: "#ffb050", transparent: true, opacity: 0.5, blending: AdditiveBlending, depthWrite: false });
  props
    .filter(([name]) => name === "CandleCluster")
    .forEach(([, x, y, z, turn = 0]) => {
      const place = new Matrix4().makeRotationY(turn).setPosition(x, y, z);
      meta.candleWicks.forEach(([wx, wy, wz]) => {
        const at = new Vector3(wx, wy, wz).applyMatrix4(place);
        const flame = new Mesh(flameGeometry, flameMaterial);
        flame.position.copy(at);
        const glow = new Sprite(flameGlow);
        glow.scale.set(0.22, 0.22, 1);
        glow.position.copy(at).add(new Vector3(0, 0.03, 0));
        flames.push(flame);
        group.add(flame, glow);
      });
    });

  // The bulbs, all in one go, each its own colour, and a soft halo round each
  const bulbGeometry = new SphereGeometry(0.02, 8, 6);
  bulbGeometry.scale(1, 1.35, 1);
  const lamps = new InstancedMesh(bulbGeometry, new MeshBasicMaterial({ color: "#ffffff" }), bulbs.length);
  const place = new Matrix4();
  bulbs.forEach(({ at, colour, size }, i) => {
    lamps.setMatrixAt(i, place.makeScale(size, size, size).setPosition(at));
    lamps.setColorAt(i, BULBS[colour]);
  });
  group.add(lamps);
  const haloColours = new Float32Array(bulbs.length * 3);
  const haloGeometry = new BufferGeometry();
  haloGeometry.setAttribute("position", new Float32BufferAttribute(bulbs.flatMap(({ at }) => [at.x, at.y, at.z]), 3));
  haloGeometry.setAttribute("color", new BufferAttribute(haloColours, 3));
  const halos = new Points(haloGeometry, new PointsMaterial({ map: glowMap, size: 0.16, vertexColors: true, transparent: true, opacity: 0.55, blending: AdditiveBlending, depthWrite: false }));
  halos.frustumCulled = false;
  group.add(halos);

  // The props, once the models are in
  new GLTFLoader().load(MODELS, (gltf) => {
    const models = new Map<string, Object3D>();
    gltf.scene.traverse((child) => {
      if (child.parent === gltf.scene) models.set(child.name, child);
    });
    const placed = new Group();
    props.forEach(([name, x, y, z, turn = 0, scale = 1]) => {
      const model = models.get(name);
      if (!model) return;
      const copy = model.clone();
      copy.position.set(x, y, z);
      copy.rotation.set(0, turn, 0);
      // (the garland stretches along its length only)
      copy.scale.set(scale, name === "GarlandSwag" ? 1 : scale, name === "GarlandSwag" ? 1 : scale);
      placed.add(copy);
    });
    (warm ? warm(placed) : Promise.resolve()).then(() => group.add(placed));
  });

  const lit = new Color();
  let twinkledAt = -1;
  group.userData.update = (t: number, reduced: boolean) => {
    if (t - twinkledAt < 0.08) return;
    twinkledAt = t;
    bulbs.forEach(({ colour, mode, phase }, i) => {
      let level = 1;
      if (!reduced) {
        if (mode === "blink") level = Math.sin(t * 2.4 + phase) > -0.1 ? 1 : 0.12;
        else if (mode === "chase") level = ((phase * 6 - t * 0.9) % 1 + 1) % 1 < 0.45 ? 1 : 0.18;
        else level = 0.78 + 0.22 * Math.sin(t * (0.8 + (i % 5) * 0.21) + phase);
      }
      lit.copy(BULBS[colour]).multiplyScalar(level);
      lamps.setColorAt(i, lit);
      haloColours[i * 3] = lit.r;
      haloColours[i * 3 + 1] = lit.g;
      haloColours[i * 3 + 2] = lit.b;
    });
    if (lamps.instanceColor) lamps.instanceColor.needsUpdate = true;
    haloGeometry.attributes.color.needsUpdate = true;
    // The candles flicker; the star breathes
    flames.forEach((flame, i) => {
      const flicker = reduced ? 1 : 0.85 + 0.15 * Math.sin(t * 11 + i * 1.7) * Math.sin(t * 7.3 + i);
      flame.scale.set(1, flicker, 1);
    });
    flameGlow.opacity = reduced ? 0.5 : 0.42 + 0.1 * Math.sin(t * 9.1);
    starGlow.material.opacity = 0.4 + 0.08 * Math.sin(t * 1.3);
    if (!reduced) flakes.forEach((flake, i) => (flake.rotation.y = i * 0.9 + Math.sin(t * 0.4 + i * 1.3) * 0.8));
  };
  return group;
}
