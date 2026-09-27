import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  Color,
  CylinderGeometry,
  DoubleSide,
  EquirectangularReflectionMapping,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  TubeGeometry,
  Vector3,
} from "three";
import { canvasFont, whenFontReady, type ArcadeFont } from "./arcadeFonts.ts";

// The cartridge slot as a retrofit someone bodged into the cabinet to play
// these cassette games: a box of bare silver sheet metal bolted onto the
// deck with L-brackets, a strip of duct tape, a hand-written masking tape
// label, a rainbow ribbon cable arcing into a hole hacked in the bezel, and
// loose wires trailing across the deck into a grommet.

export const MARKER_FONT: ArcadeFont = { family: "Permanent Marker" };

type RigOptions = {
  width: number; // the housing
  height: number;
  depth: number;
  center: Vector3; // the housing's centre
  deckY: number; // the control deck's surface under it
  // The cabinet's front surface (its z) straight behind a point, for the cables to plug into
  surfaceZ: (x: number, y: number) => number;
};

export type SlotRig = { group: Group; dispose: () => void };

// A flat ribbon along a curve, lying across it rather than standing up
function ribbonGeometry(curve: CatmullRomCurve3, width: number, segments: number) {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const up = new Vector3(0, 1, 0);
  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments;
    const point = curve.getPointAt(t);
    const tangent = curve.getTangentAt(t);
    const side = new Vector3().crossVectors(tangent, up);
    if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
    side.normalize().multiplyScalar(width / 2);
    positions.push(point.x - side.x, point.y - side.y, point.z - side.z, point.x + side.x, point.y + side.y, point.z + side.z);
    uvs.push(0, t, 1, t);
    if (i < segments) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute("uv", new BufferAttribute(new Float32Array(uvs), 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function ribbonTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 4;
  const context = canvas.getContext("2d")!;
  const colors = ["#8a2a1f", "#c84a26", "#e8952e", "#e9c94a", "#5c8f4a", "#3a6b9a", "#6a4a8a", "#9a9a9a", "#e8e2d4", "#2a2a2a"];
  colors.forEach((color, i) => {
    context.fillStyle = color;
    context.fillRect((i * 64) / colors.length, 0, 64 / colors.length, 4);
    context.fillStyle = "rgba(0, 0, 0, 0.35)";
    context.fillRect(((i + 1) * 64) / colors.length - 1, 0, 1, 4);
  });
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

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

export function createSlotRig({ width, height, depth, center, deckY, surfaceZ }: RigOptions): SlotRig {
  const group = new Group();
  const disposables: { dispose: () => void }[] = [];
  const track = <T extends { dispose: () => void }>(item: T) => {
    disposables.push(item);
    return item;
  };
  const add = (geometry: BufferGeometry, material: MeshStandardMaterial, x: number, y: number, z: number) => {
    const mesh = new Mesh(track(geometry), material);
    mesh.position.set(x, y, z);
    group.add(mesh);
    return mesh;
  };

  // Bare brushed steel. It reflects its own cool grey "studio", and drains the
  // colour from whatever light falls on it, so under the room's orange lights it
  // still reads as silver rather than copper
  const studio = track(studioReflection());
  const metal = track(
    new MeshStandardMaterial({ color: new Color("#c8ced4"), roughness: 0.35, metalness: 0.85, envMap: studio, envMapIntensity: 1.2 })
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

  // The ribbon cable: out of the housing's right side, just above the bracket,
  // arcing back into a hole cut in the bezel
  const ribbonY = top - height * 0.1;
  const holeX = center.x + width * 0.74;
  const holeY = top + height * 0.12;
  const holeZ = surfaceZ(holeX, holeY);
  const ribbonCurve = new CatmullRomCurve3([
    new Vector3(center.x + halfWidth - plate, ribbonY, center.z),
    new Vector3(center.x + halfWidth + width * 0.08, ribbonY, center.z + depth * 0.05),
    new Vector3(center.x + halfWidth + width * 0.16, top + height * 0.1, (center.z + holeZ) / 2),
    new Vector3(holeX, holeY + height * 0.05, holeZ + depth * 0.15),
    new Vector3(holeX, holeY, holeZ - depth * 0.1),
  ]);
  const ribbonMap = track(ribbonTexture());
  const ribbon = new Mesh(
    track(ribbonGeometry(ribbonCurve, width * 0.26, 48)),
    track(new MeshStandardMaterial({ map: ribbonMap, roughness: 0.5, side: DoubleSide }))
  );
  group.add(ribbon);
  // The hacked hole: a rough dark gap
  add(new PlaneGeometry(width * 0.34, height * 0.3), rubber, holeX, holeY, holeZ + 0.001);

  // Loose wires off the housing's left end, across the deck and into a grommet
  const grommetX = center.x - halfWidth - width * 0.16;
  const grommetY = deckY + height * 0.55;
  const grommetZ = surfaceZ(grommetX, grommetY);
  const wireColors = ["#b3281e", "#151315", "#d9b83a"];
  wireColors.forEach((color, i) => {
    const offset = (i - 1) * plate * 1.6;
    const curve = new CatmullRomCurve3([
      new Vector3(center.x - halfWidth - plate, top - height * 0.3 + offset, center.z + depth * 0.1 + offset),
      new Vector3(center.x - halfWidth - width * 0.05, deckY + plate * 2, center.z + depth * 0.15 + offset),
      new Vector3(grommetX + width * 0.03, deckY + plate * 1.5, (center.z + grommetZ) / 2 + offset),
      new Vector3(grommetX, grommetY + offset * 0.5, grommetZ - depth * 0.1),
    ]);
    const material = track(new MeshStandardMaterial({ color: new Color(color), roughness: 0.45 }));
    group.add(new Mesh(track(new TubeGeometry(curve, 40, plate * 0.75, 6)), material));
  });
  const grommet = add(new CylinderGeometry(plate * 4, plate * 4, plate * 1.5, 12), rubber, grommetX, grommetY, grommetZ + plate * 0.4);
  grommet.rotation.x = Math.PI / 2;

  return {
    group,
    dispose() {
      disposables.forEach((item) => item.dispose());
    },
  };
}
