import {
  BackSide,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  Color,
  CylinderGeometry,
  EquirectangularReflectionMapping,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  SRGBColorSpace,
  TubeGeometry,
  Vector3,
} from "three";
import { canvasFont, whenFontReady, type ArcadeFont } from "./arcadeFonts.ts";

// The cartridge slot as a retrofit someone bodged into the cabinet to play
// these cassette games: a box of bare silver sheet metal bolted onto the
// deck with L-brackets, a strip of duct tape, a hand-written masking tape
// label, and bundles of loose wires sprawling off both ends and away round the
// control panel's corners.

export const MARKER_FONT: ArcadeFont = { family: "Permanent Marker" };

type RigOptions = {
  width: number; // the housing
  height: number;
  depth: number;
  center: Vector3; // the housing's centre
  deckY: number; // the control deck's surface under it
  deckAt: (x: number, z: number) => number; // the deck's height at a point
  deckFront: number; // z of the deck's front edge
  deckEdge: number; // how far out from the centre the deck runs before the side panels
  faceZ: (x: number, y: number) => number; // the cabinet's front surface behind a point
  vent: Vector3; // where the vent under the screen is prised open (x, y)
  scopeX: number; // where the instrument box sits along the deck
};

export type SlotRig = {
  group: Group;
  // Run the scanner camera's lead from where it's mounted to the slot
  plugScanner: (from: Vector3) => void;
  update: (time: number) => void; // the instrument box's scrolling graph, and any sparks
  // A click or tap on part of the rig: the scope's graph goes haywire, the vent spits sparks
  poke: (object: Object3D, time: number) => "scope" | "sparks" | null;
  dispose: () => void;
};

function labelTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 80;
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const paint = () => {
    const context = canvas.getContext("2d")!;
    // Masking tape: cream, with torn ends
    context.clearRect(0, 0, 256, 80);
    context.fillStyle = "#e6d9b4";
    context.beginPath();
    context.moveTo(6, 4);
    for (let y = 4; y <= 76; y += 8) context.lineTo(y % 16 ? 0 : 8, y);
    context.lineTo(250, 76);
    for (let y = 76; y >= 4; y -= 8) context.lineTo(y % 16 ? 256 : 248, y);
    context.closePath();
    context.fill();
    context.fillStyle = "rgba(120, 90, 40, 0.12)";
    context.fillRect(0, 4, 256, 6);
    context.fillStyle = "#1c1a22";
    context.font = canvasFont(MARKER_FONT, 30);
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText("CART ADAPTER", 128, 32);
    context.font = canvasFont(MARKER_FONT, 17);
    context.fillText("don't bump!!", 140, 60);
    texture.needsUpdate = true;
  };
  paint();
  whenFontReady(MARKER_FONT).then(paint);
  return texture;
}

// A small, soft grey surrounding for the metal to reflect: bright strips
// overhead fading to dark below
function studioReflection() {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 64;
  const context = canvas.getContext("2d")!;
  const sky = context.createLinearGradient(0, 0, 0, 64);
  sky.addColorStop(0, "#f2f4f6");
  sky.addColorStop(0.45, "#9aa0a6");
  sky.addColorStop(0.55, "#4a4f55");
  sky.addColorStop(1, "#16181b");
  context.fillStyle = sky;
  context.fillRect(0, 0, 128, 64);
  context.fillStyle = "rgba(255, 255, 255, 0.8)";
  [18, 58, 98].forEach((x) => context.fillRect(x, 6, 10, 14));
  const texture = new CanvasTexture(canvas);
  texture.mapping = EquirectangularReflectionMapping;
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

export function createSlotRig({ width, height, depth, center, deckY, deckAt, deckFront, deckEdge, faceZ, vent, scopeX }: RigOptions): SlotRig {
  const group = new Group();
  const disposables: { dispose: () => void }[] = [];
  const track = <T extends { dispose: () => void }>(item: T) => {
    disposables.push(item);
    return item;
  };
  const add = (geometry: BufferGeometry, material: MeshStandardMaterial | MeshBasicMaterial, x: number, y: number, z: number) => {
    const mesh = new Mesh(track(geometry), material);
    mesh.position.set(x, y, z);
    group.add(mesh);
    return mesh;
  };

  // Matte brushed steel. It reflects its own cool grey "studio", and drains the
  // colour from whatever light falls on it, so under the room's orange lights it
  // still reads as silver rather than copper
  const studio = track(studioReflection());
  const metal = track(
    new MeshStandardMaterial({ color: new Color("#c8ced4"), roughness: 0.75, metalness: 0.6, envMap: studio, envMapIntensity: 0.8 })
  );
  metal.customProgramCacheKey = () => "slot-steel";
  metal.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <dithering_fragment>",
      `#include <dithering_fragment>
float steelLight = dot(gl_FragColor.rgb, vec3(0.299, 0.587, 0.114));
gl_FragColor.rgb = mix(vec3(steelLight), gl_FragColor.rgb, 0.12) * vec3(0.66, 0.69, 0.73);`
    );
  };
  const steel = track(new MeshStandardMaterial({ color: new Color("#8d8b86"), roughness: 0.35, metalness: 0.7 }));
  const rubber = track(new MeshStandardMaterial({ color: new Color("#141214"), roughness: 0.55 }));

  // The housing
  add(new BoxGeometry(width, height, depth), metal, center.x, center.y, center.z);
  const top = center.y + height / 2;
  const front = center.z + depth / 2;
  const halfWidth = width / 2;
  const plate = width * 0.018;

  // L-brackets down each end, bolted into the deck
  [-1, 1].forEach((side) => {
    const x = center.x + side * (halfWidth + plate / 2);
    const upright = top - deckY - height * 0.15;
    add(new BoxGeometry(plate, upright, depth * 0.7), steel, x, deckY + upright / 2, center.z);
    const footWidth = width * 0.14;
    add(new BoxGeometry(footWidth, plate, depth * 0.7), steel, x + side * footWidth / 2, deckY + plate / 2, center.z);
    [-1, 1].forEach((along) => {
      const bolt = add(new CylinderGeometry(plate * 1.4, plate * 1.4, plate * 1.6, 6), steel, x + side * footWidth * 0.6, deckY + plate * 1.3, center.z + along * depth * 0.22);
      bolt.rotation.y = 0.4;
    });
    // And a bolt through the upright into the housing
    const through = add(new CylinderGeometry(plate * 1.2, plate * 1.2, plate * 1.4, 6), steel, x + side * plate, deckY + upright * 0.55, center.z);
    through.rotation.z = Math.PI / 2;
  });

  // Duct tape over the top right corner and down the front
  const tape = track(new MeshStandardMaterial({ color: new Color("#9a9c9f"), roughness: 0.7, metalness: 0.3 }));
  const tapeWidth = width * 0.13;
  // Near the right end, where it also holds the label's end down
  const tapeX = center.x + halfWidth - tapeWidth * 0.7;
  add(new BoxGeometry(tapeWidth, plate * 0.5, depth * 0.6), tape, tapeX, top + plate * 0.25, center.z + depth * 0.2).rotation.y = 0.08;
  add(new BoxGeometry(tapeWidth, height * 0.45, plate * 0.5), tape, tapeX + width * 0.004, top - height * 0.22, front + plate * 0.25).rotation.z = 0.06;

  // The label, stuck on the front at a slant
  const label = track(labelTexture());
  const labelMaterial = track(new MeshStandardMaterial({ map: label, transparent: true, roughness: 0.9 }));
  const labelWidth = width * 0.34;
  const labelMesh = add(new PlaneGeometry(labelWidth, labelWidth * (80 / 256)), labelMaterial, center.x + halfWidth - labelWidth * 0.75, top - height * 0.62, front + plate * 0.3);
  labelMesh.rotation.z = -0.07;

  // Loose wiring. The left bundle sprawls across the deck behind the buttons,
  // along the side panel, over the control panel's front corner and away under
  // its overhang. The right one wanders across the deck and climbs into a vent
  // prised open in the bezel under the screen. Zip-tied here and there; all of
  // it clear of the screen and the cartridges.
  const radius = plate * 0.8;
  const scopeStart = group.children.length;
  // Partway along, the left bundle runs through a little instrument box: a
  // dark case with a green-screen scope drawing a scrolling line graph
  const scopeWidth = width * 0.38;
  const scopeHeight = width * 0.24;
  const scopeDepth = width * 0.2;
  const scopeZ = center.z + depth * 0.6;
  const scopeY = deckAt(scopeX, scopeZ) + scopeHeight / 2;
  const scopeCase = track(new MeshStandardMaterial({ color: new Color("#2b2a2e"), roughness: 0.5, metalness: 0.3 }));
  add(new BoxGeometry(scopeWidth, scopeHeight, scopeDepth), scopeCase, scopeX, scopeY, scopeZ);
  const scopeFront = scopeZ + scopeDepth / 2;
  const graphCanvas = document.createElement("canvas");
  graphCanvas.width = 160;
  graphCanvas.height = 96;
  const graph = graphCanvas.getContext("2d")!;
  const graphTexture = track(new CanvasTexture(graphCanvas));
  graphTexture.colorSpace = SRGBColorSpace;
  const graphMaterial = track(new MeshBasicMaterial({ map: graphTexture }));
  add(new PlaneGeometry(scopeWidth * 0.62, scopeHeight * 0.66), rubber, scopeX - scopeWidth * 0.1, scopeY + scopeHeight * 0.02, scopeFront + 0.001);
  add(new PlaneGeometry(scopeWidth * 0.56, scopeHeight * 0.58), graphMaterial, scopeX - scopeWidth * 0.1, scopeY + scopeHeight * 0.02, scopeFront + 0.002);
  // Beside the screen: two LEDs and a knob
  const ledMaterials = ["#ff3b2f", "#39ff6a"].map((color) => track(new MeshBasicMaterial({ color: new Color(color) })));
  ledMaterials.forEach((material, i) => {
    add(new BoxGeometry(plate * 1.1, plate * 1.1, plate * 0.6), material, scopeX + scopeWidth * 0.32, scopeY + scopeHeight * (0.25 - i * 0.18), scopeFront + plate * 0.3);
  });
  const knob = add(new CylinderGeometry(plate * 1.8, plate * 2, plate * 1.4, 12), steel, scopeX + scopeWidth * 0.32, scopeY - scopeHeight * 0.22, scopeFront + plate * 0.7);
  knob.rotation.x = Math.PI / 2;
  // Sockets either side, where the bundle plugs in and carries on
  [1, -1].forEach((side) => {
    const socket = add(new BoxGeometry(plate * 1.2, scopeHeight * 0.5, scopeDepth * 0.6), steel, scopeX + side * (scopeWidth / 2 + plate * 0.6), scopeY - scopeHeight * 0.12, scopeZ);
    socket.rotation.y = 0;
  });
  const scopeParts = new Set(group.children.slice(scopeStart));
  // The trace: a wandering signal, a sample added every few frames
  const trace: number[] = new Array(64).fill(0.5);
  let lastTrace = 0;
  let phase = 0;
  let haywireUntil = 0; // poked: the signal thrashes about for a moment
  const drawGraph = (time: number) => {
    const haywire = time < haywireUntil;
    if (time - lastTrace < (haywire ? 0.016 : 0.05)) return;
    lastTrace = time;
    phase += 0.35;
    const noise = Math.sin(phase * 1.7) * 0.15 + Math.sin(phase * 0.43) * 0.2 + (Math.random() - 0.5) * 0.18;
    if (haywire) {
      // A few samples a frame, slamming between the rails
      for (let i = 0; i < 3; i += 1) {
        trace.push(Math.random() < 0.5 ? Math.random() * 0.15 : 0.85 + Math.random() * 0.15);
        trace.shift();
      }
    }
    trace.push(0.5 + noise + (Math.random() < 0.04 ? (Math.random() - 0.5) * 0.7 : 0));
    trace.shift();
    graph.fillStyle = "#021407";
    graph.fillRect(0, 0, 160, 96);
    graph.strokeStyle = "rgba(57, 255, 106, 0.18)";
    graph.lineWidth = 1;
    for (let gx = 0; gx <= 160; gx += 20) {
      graph.beginPath();
      graph.moveTo(gx, 0);
      graph.lineTo(gx, 96);
      graph.stroke();
    }
    for (let gy = 0; gy <= 96; gy += 24) {
      graph.beginPath();
      graph.moveTo(0, gy);
      graph.lineTo(160, gy);
      graph.stroke();
    }
    graph.strokeStyle = "#39ff6a";
    graph.shadowColor = "#39ff6a";
    graph.shadowBlur = 6;
    graph.lineWidth = 2.5;
    graph.beginPath();
    trace.forEach((value, i) => {
      const gx = (i / (trace.length - 1)) * 160;
      const gy = 96 - Math.min(Math.max(value, 0.04), 0.96) * 96;
      if (i === 0) graph.moveTo(gx, gy);
      else graph.lineTo(gx, gy);
    });
    graph.stroke();
    graph.shadowBlur = 0;
    graphTexture.needsUpdate = true;
  };
  drawGraph(1);

  const left = ["#b3281e", "#151315", "#d9b83a"];
  left.forEach((color, i) => {
    const x = (along: number) => center.x - along;
    const on = (along: number, z: number, lift = radius) => new Vector3(x(along), deckAt(x(along), z) + lift, z);
    const spread = (i - (left.length - 1) / 2) * radius * 2.4;
    // Each wire strays a little differently, so the bundle doesn't lie neatly
    const stray = Math.sin(i * 2.3 - 1.7) * width * 0.05;
    const curve = new CatmullRomCurve3([
      new Vector3(x(halfWidth + plate), top - height * 0.35 + spread * 0.4, center.z + spread),
      on(halfWidth + width * 0.05, center.z + depth * 0.3 + spread, radius * 2),
      // Into the box's right socket, through it, and out of its left
      new Vector3(scopeX + scopeWidth / 2 + plate * 2, scopeY - scopeHeight * 0.12 + spread * 0.3, scopeZ + spread * 0.5),
      new Vector3(scopeX, scopeY - scopeHeight * 0.12, scopeZ),
      new Vector3(scopeX - scopeWidth / 2 - plate * 2, scopeY - scopeHeight * 0.12 + spread * 0.3, scopeZ + spread * 0.5),
      on(center.x - scopeX + scopeWidth / 2 + width * 0.12 + stray, center.z + depth * 0.8 + spread + stray * 0.5),
      on(deckEdge - width * 0.08, center.z + depth * 0.9 + spread, radius * 1.4),
      on(deckEdge - radius * 2 + spread * 0.3, (center.z + deckFront) / 2 + stray),
      on(deckEdge - radius * 2 + spread * 0.3, deckFront - radius * 3),
      new Vector3(x(deckEdge - radius * 2 + spread * 0.3), deckAt(x(deckEdge), deckFront - 0.01) - 0.02, deckFront + radius * 1.5),
      new Vector3(x(deckEdge - radius * 3), deckAt(x(deckEdge), deckFront - 0.01) - 0.11, deckFront + radius),
      new Vector3(x(deckEdge - radius * 4), deckAt(x(deckEdge), deckFront - 0.01) - 0.3, deckFront - 0.2),
    ]);
    const material = track(new MeshStandardMaterial({ color: new Color(color), roughness: 0.45 }));
    group.add(new Mesh(track(new TubeGeometry(curve, 90, radius, 6)), material));
  });
  [
    new Vector3(center.x - (deckEdge - width * 0.08), deckAt(center.x - (deckEdge - width * 0.08), center.z + depth * 0.9) + radius * 1.4, center.z + depth * 0.9),
    new Vector3(center.x - (deckEdge - radius * 2), deckAt(center.x - (deckEdge - radius * 2), deckFront - radius * 3) + radius, deckFront - radius * 3),
  ].forEach((at) => add(new BoxGeometry(radius * 3.2, radius * 3.2, radius * 1.4), rubber, at.x, at.y, at.z));

  const ventStart = group.children.length;
  // The vent: a steel collar standing proud of the bezel round a real opening,
  // its grille cover prised off and hanging by one screw. Inside, a dark tunnel
  // with a faint warm glow deep in the machine, and a rubber lip the wires
  // squeeze in over.
  const ventWidth = width * 0.4;
  const ventHeight = width * 0.17;
  const ventZ = faceZ(vent.x, vent.y);
  const collarDepth = plate * 7;
  const ventFront = ventZ + collarDepth;
  const bar = plate * 1.4;
  // The tunnel: an inside-out box, so only its inner walls and back show. The
  // part behind the bezel is hidden by it, leaving the collar's depth visible.
  const tunnelMaterial = track(
    new MeshStandardMaterial({ color: new Color("#0a0809"), roughness: 0.9, side: BackSide, emissive: new Color("#2a0d06"), emissiveIntensity: 0.6 })
  );
  const tunnelDepth = collarDepth + 0.05;
  add(new BoxGeometry(ventWidth, ventHeight, tunnelDepth), tunnelMaterial, vent.x, vent.y, ventFront - tunnelDepth / 2);
  // A dim glow at the back, as if something's running in there
  const glow = add(new PlaneGeometry(ventWidth * 0.8, ventHeight * 0.7), track(new MeshBasicMaterial({ color: new Color("#5a1e0c") })), vent.x, vent.y, ventZ + plate);
  glow.renderOrder = -1;
  // The collar, in four thick pieces, with a screw in each corner
  add(new BoxGeometry(ventWidth + bar * 2, bar, collarDepth), steel, vent.x, vent.y + ventHeight / 2 + bar / 2, ventZ + collarDepth / 2);
  add(new BoxGeometry(ventWidth + bar * 2, bar, collarDepth), steel, vent.x, vent.y - ventHeight / 2 - bar / 2, ventZ + collarDepth / 2);
  add(new BoxGeometry(bar, ventHeight, collarDepth), steel, vent.x - ventWidth / 2 - bar / 2, vent.y, ventZ + collarDepth / 2);
  add(new BoxGeometry(bar, ventHeight, collarDepth), steel, vent.x + ventWidth / 2 + bar / 2, vent.y, ventZ + collarDepth / 2);
  [-1, 1].forEach((sx) => {
    [-1, 1].forEach((sy) => {
      const bolt = add(new CylinderGeometry(bar * 0.35, bar * 0.35, plate * 0.8, 6), metal, vent.x + sx * (ventWidth / 2 + bar / 2), vent.y + sy * (ventHeight / 2 + bar / 2), ventFront + plate * 0.3);
      bolt.rotation.x = Math.PI / 2;
    });
  });
  // One slat left, bent down across the opening
  const slat = add(new BoxGeometry(ventWidth * 0.9, bar * 0.4, bar * 0.5), steel, vent.x - ventWidth * 0.05, vent.y + ventHeight * 0.3, ventFront - bar * 0.4);
  slat.rotation.z = -0.18;
  // The rubber lip along the bottom edge, where the wires go in
  add(new BoxGeometry(ventWidth * 0.7, bar * 0.8, bar * 1.2), rubber, vent.x, vent.y - ventHeight / 2 + bar * 0.4, ventFront - bar * 0.2);

  const cover = new Group();
  cover.position.set(vent.x + ventWidth / 2 + bar, vent.y - ventHeight / 2 - bar, ventFront + plate * 0.4);
  // Hanging down off the vent, clear of the label above it
  cover.rotation.z = 1.25;
  const coverPlate = new Mesh(track(new BoxGeometry(ventWidth, ventHeight, plate * 0.4)), metal);
  coverPlate.position.set(-ventWidth / 2, ventHeight / 2, 0);
  cover.add(coverPlate);
  for (let s = 0; s < 3; s += 1) {
    const slot = new Mesh(track(new PlaneGeometry(ventWidth * 0.8, ventHeight * 0.12)), rubber);
    slot.position.set(-ventWidth / 2, ventHeight * (0.25 + s * 0.25), plate * 0.21);
    cover.add(slot);
  }
  const hinge = new Mesh(track(new CylinderGeometry(plate * 0.9, plate * 0.9, plate, 8)), steel);
  hinge.rotation.x = Math.PI / 2;
  cover.add(hinge);
  group.add(cover);
  const ventParts = new Set(group.children.slice(ventStart));

  // Sparks spat out of the vent when it's poked: little glowing chips that
  // fly out, fall and fade
  const sparkGeometry = track(new BoxGeometry(plate * 0.7, plate * 0.7, plate * 2.2));
  const sparks = Array.from({ length: 36 }, () => {
    const material = track(new MeshBasicMaterial({ color: new Color("#ffd36b"), transparent: true }));
    const mesh = new Mesh(sparkGeometry, material);
    mesh.visible = false;
    group.add(mesh);
    return { mesh, material, velocity: new Vector3(), life: 0, age: 0 };
  });
  let lastSparkTime = 0;
  const burstSparks = () => {
    const speed = width * 2.2;
    sparks.forEach((spark) => {
      spark.mesh.position.set(vent.x + (Math.random() - 0.5) * ventWidth * 0.6, vent.y + (Math.random() - 0.5) * ventHeight * 0.5, ventFront);
      spark.velocity.set((Math.random() - 0.5) * speed * 0.9, (0.2 + Math.random() * 0.8) * speed * 0.7, (0.5 + Math.random() * 0.8) * speed);
      spark.age = 0;
      spark.life = 0.35 + Math.random() * 0.5;
      spark.mesh.visible = true;
    });
  };
  const moveSparks = (time: number) => {
    const dt = Math.min(time - lastSparkTime, 0.05);
    lastSparkTime = time;
    sparks.forEach((spark) => {
      if (!spark.mesh.visible) return;
      spark.age += dt;
      if (spark.age >= spark.life) {
        spark.mesh.visible = false;
        return;
      }
      spark.velocity.y -= width * 9 * dt;
      spark.mesh.position.addScaledVector(spark.velocity, dt);
      // Streaking along its path, white-hot cooling to orange
      spark.mesh.lookAt(spark.mesh.position.clone().add(spark.velocity));
      const cool = spark.age / spark.life;
      spark.material.opacity = 1 - cool;
      spark.material.color.setRGB(1, 0.95 - cool * 0.55, 0.7 - cool * 0.65);
    });
  };
  const partOf = (object: Object3D, parts: Set<Object3D>) => {
    for (let node: Object3D | null = object; node && node !== group; node = node.parent) if (parts.has(node)) return true;
    return false;
  };

  const right = ["#2f5d9a", "#3f8a4a", "#e6e0d2", "#c85a26"];
  const climbX = vent.x - ventWidth * 0.15;
  right.forEach((color, i) => {
    const spread = (i - (right.length - 1) / 2) * radius * 2.4;
    const stray = Math.sin(i * 1.9 + 0.6) * width * 0.04;
    const deckPoint = (x: number, z: number, lift = radius) => new Vector3(x, deckAt(x, z) + lift, z);
    const baseZ = ventFront + radius * 3;
    const curve = new CatmullRomCurve3([
      new Vector3(center.x + halfWidth + plate, top - height * 0.35 + spread * 0.4, center.z + spread),
      deckPoint(center.x + halfWidth + width * 0.08, center.z + depth * 0.35 + spread, radius * 2),
      deckPoint((center.x + halfWidth + climbX) / 2 + stray, center.z + depth * 0.55 + spread + stray),
      deckPoint(climbX + spread, baseZ + radius * 2),
      // Up the bezel, bowing out a little, and in through the hole
      new Vector3(climbX + spread * 1.2, (deckAt(climbX, baseZ) + vent.y) / 2 - ventHeight * 0.4, ventFront + radius * 4),
      new Vector3(vent.x + spread * 1.5, vent.y - ventHeight * 0.55, ventFront + radius * 3),
      // Over the lip and into the dark
      new Vector3(vent.x + spread * 1.6, vent.y - ventHeight * 0.18, ventFront + radius),
      new Vector3(vent.x + spread * 1.7, vent.y - ventHeight * 0.05, ventZ + collarDepth * 0.4),
      new Vector3(vent.x + spread * 1.8, vent.y, ventZ - 0.04),
    ]);
    const material = track(new MeshStandardMaterial({ color: new Color(color), roughness: 0.45 }));
    group.add(new Mesh(track(new TubeGeometry(curve, 90, radius, 6)), material));
  });
  const tie = new Vector3(climbX, deckAt(climbX, ventFront + radius * 5) + radius * 1.5, ventFront + radius * 5);
  add(new BoxGeometry(radius * 3.2 * 2.4, radius * 3.2, radius * 1.4), rubber, tie.x, tie.y, tie.z);

  // The scanner camera's lead, added once the camera is placed: off the back of
  // its mount, up the cabinet's front, over the deck's lip, then plugged into a
  // socket low on the housing's front, right of the terminal
  const housingFront = center.z + depth / 2;
  const leadRadius = radius * 1.1;
  const port = new Vector3(center.x + width * 0.12, deckY + height * 0.3, housingFront);
  // The socket: a dark square panel with a steel ring round the hole
  add(new BoxGeometry(leadRadius * 6, leadRadius * 6, plate * 0.4), rubber, port.x, port.y, housingFront + plate * 0.2);
  const ring = add(new CylinderGeometry(leadRadius * 2.1, leadRadius * 2.1, plate * 0.6, 16), steel, port.x, port.y, housingFront + plate * 0.4);
  ring.rotation.x = Math.PI / 2;
  // The plug: a metal collar seated in the socket, and a moulded boot behind it
  const collarLength = leadRadius * 1.6;
  const bootLength = leadRadius * 4;
  const collar = add(new CylinderGeometry(leadRadius * 1.7, leadRadius * 1.7, collarLength, 14), steel, port.x, port.y, housingFront + plate * 0.6 + collarLength / 2);
  collar.rotation.x = Math.PI / 2;
  const bootMaterial = track(new MeshStandardMaterial({ color: new Color("#2a2629"), roughness: 0.55 }));
  const boot = add(
    new CylinderGeometry(leadRadius * 1.25, leadRadius * 1.9, bootLength, 12),
    bootMaterial,
    port.x,
    port.y,
    housingFront + plate * 0.6 + collarLength + bootLength / 2
  );
  boot.rotation.x = -Math.PI / 2;
  const plugBack = housingFront + plate * 0.6 + collarLength + bootLength;

  let lead: Mesh | null = null;
  const leadMaterial = track(new MeshStandardMaterial({ color: new Color("#1b1a1d"), roughness: 0.5 }));
  const plugScanner = (from: Vector3) => {
    if (lead) {
      group.remove(lead);
      lead.geometry.dispose();
    }
    const x = port.x;
    const lip = deckAt(x, deckFront - 0.01);
    const midY = (from.y + lip) / 2;
    const curve = new CatmullRomCurve3([
      new Vector3(from.x + radius, from.y, faceZ(from.x, from.y) + radius),
      new Vector3((from.x + x) / 2, midY, faceZ((from.x + x) / 2, midY) + radius * 1.2),
      new Vector3(x, lip + radius, deckFront + radius),
      new Vector3(x, deckAt(x, (deckFront + plugBack) / 2) + radius, (deckFront + plugBack) / 2),
      // Rising off the deck to come in straight behind the plug
      new Vector3(x, (deckY + port.y) / 2 + radius, plugBack + leadRadius * 4),
      new Vector3(x, port.y, plugBack + leadRadius),
      new Vector3(x, port.y, plugBack - leadRadius),
    ]);
    lead = new Mesh(new TubeGeometry(curve, 60, leadRadius, 6), leadMaterial);
    group.add(lead);
  };

  return {
    group,
    plugScanner,
    update(time) {
      drawGraph(time);
      moveSparks(time);
    },
    poke(object, time) {
      if (partOf(object, scopeParts)) {
        haywireUntil = time + 1.4;
        return "scope";
      }
      if (partOf(object, ventParts)) {
        burstSparks();
        return "sparks";
      }
      return null;
    },
    dispose() {
      lead?.geometry.dispose();
      disposables.forEach((item) => item.dispose());
    },
  };
}
