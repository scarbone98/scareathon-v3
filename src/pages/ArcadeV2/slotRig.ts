import {
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  Color,
  CylinderGeometry,
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
};

export type SlotRig = { group: Group; dispose: () => void };

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

export function createSlotRig({ width, height, depth, center, deckY, deckAt, deckFront, deckEdge }: RigOptions): SlotRig {
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

  // Loose wiring: a bundle off each end of the housing, sprawling across the
  // deck behind the buttons, along the side panel, over the control panel's
  // front corner and away under its overhang, clear of the screen and the
  // cartridges. Zip-tied here and there.
  const bundles = [
    { side: -1, colors: ["#b3281e", "#151315", "#d9b83a"] },
    { side: 1, colors: ["#2f5d9a", "#3f8a4a", "#e6e0d2", "#c85a26"] },
  ];
  const radius = plate * 0.8;
  bundles.forEach(({ side, colors }) => {
    const x = (along: number) => center.x + side * along;
    const on = (along: number, z: number, lift = radius) => new Vector3(x(along), deckAt(x(along), z) + lift, z);
    colors.forEach((color, i) => {
      const spread = (i - (colors.length - 1) / 2) * radius * 2.4;
      // Each wire strays a little differently, so the bundle doesn't lie neatly
      const stray = Math.sin(i * 2.3 + side * 1.7) * width * 0.05;
      const curve = new CatmullRomCurve3([
        new Vector3(x(halfWidth + plate), top - height * 0.35 + spread * 0.4, center.z + spread),
        on(halfWidth + width * 0.07, center.z + depth * 0.3 + spread, radius * 2),
        on(halfWidth + width * 0.55 + stray, center.z + depth * 0.7 + spread + stray * 0.5),
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
    // Zip ties round the bundle where it turns along the side panel and at the corner
    [
      on(deckEdge - width * 0.08, center.z + depth * 0.9, radius * 1.4),
      on(deckEdge - radius * 2, deckFront - radius * 3),
    ].forEach((at) => {
      add(new BoxGeometry(radius * 3.2, radius * 3.2, radius * 1.4), rubber, at.x, at.y, at.z);
    });
  });

  return {
    group,
    dispose() {
      disposables.forEach((item) => item.dispose());
    },
  };
}
