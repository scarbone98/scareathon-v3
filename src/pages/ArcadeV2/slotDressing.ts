// What's bolted onto the cabinet around its cartridge slot: the raised port with its neon
// rim, the rig (wires, scope, vent) and the little terminal; and where the row of
// cartridges floats in front of it. Shared by the arcade and Wayside Station's cabinet, so
// the two are the same machine and nothing pops in when one hands over to the other.
import { Box3, BoxGeometry, CatmullRomCurve3, Color, Mesh, MeshBasicMaterial, MeshStandardMaterial, Object3D, Raycaster, TubeGeometry, Vector3, type BufferGeometry, type Material } from "three";
import { CARTRIDGE_ASPECT } from "./cartridge.ts";
import { shelfGroupOf, type MachineData } from "../Arcade/games.tsx";
import { createSlotRig, type SlotRig } from "./slotRig.ts";
import { createSlotTerminal, TERMINAL_ASPECT, type SlotTerminal } from "./slotTerminal.ts";
import { createTicketDispenser, DISPENSER_ASPECT, type TicketDispenser } from "./ticketDispenser.ts";

// The control panel's parts (the rig's wires drape over them rather than landing on them)
export const PANEL_MATERIALS = new Set(["JoystickBase", "JoystickStick", "JoystickBall", "OrangeButton", "PurpleButton"]);
export const SHELF_NEON = "#ff7a1a";

export type CartSize = { width: number; height: number; depth: number };

export type SlotDressing = {
  cartSize: CartSize;
  rig: SlotRig;
  terminal: SlotTerminal;
  dispenser: TicketDispenser; // under the marquee
  rimMaterial: MeshBasicMaterial;
  rims: Mesh[];
  portTop: number;
  surfaceY: number;
  panelCenter: Vector3;
  seat: Vector3; // where a plugged-in cartridge sits
  dispose: () => void;
};

// Builds it all in the cabinet's own space (the space `cabinetBox` was measured in); the
// caller adds `rig.group`, `rims`, `terminal.group` and `dispenser.group` to the cabinet
export function dressSlot({
  model,
  cabinetBox,
  panelBox,
  screenBox,
  marqueeBox,
  screenMaterial,
}: {
  model: Object3D;
  cabinetBox: Box3;
  panelBox: Box3;
  screenBox: Box3;
  marqueeBox: Box3;
  screenMaterial: Material | null;
}): SlotDressing {
  const cabinetSize = cabinetBox.getSize(new Vector3());
  const cartWidth = cabinetSize.x * 0.2;
  // Landscape cartridges, wider than tall
  const cartSize = { width: cartWidth, height: cartWidth * CARTRIDGE_ASPECT, depth: cartWidth * 0.18 };

  // The cartridge port: a box with a neon rim, in the empty strip
  // between the controls and the screen so it doesn't sit on the buttons
  const panelCenter = panelBox.isEmpty() ? new Vector3(0, cabinetSize.y * 0.45, cabinetBox.max.z * 0.6) : panelBox.getCenter(new Vector3());
  if (!panelBox.isEmpty() && !screenBox.isEmpty()) {
    panelCenter.z = screenBox.max.z + (panelBox.min.z - screenBox.max.z) * 0.35;
  }
  // Find the cabinet's surface there by dropping a ray onto it
  const surfaceRay = new Raycaster(new Vector3(0, screenBox.isEmpty() ? cabinetBox.max.y : screenBox.min.y, panelCenter.z), new Vector3(0, -1, 0));
  const surface = surfaceRay.intersectObject(model, true).find((hit) => (hit.object as Mesh).material !== screenMaterial);
  const surfaceY = surface ? surface.point.y : panelBox.isEmpty() ? panelCenter.y : panelBox.min.y;
  // A raised housing, so the slot reads above the joysticks rather than among them
  const portTop = Math.max(surfaceY + cartSize.height * 0.12, panelBox.isEmpty() ? 0 : panelBox.max.y + cartSize.height * 0.08);
  const portHeight = portTop - surfaceY + cartSize.height * 0.05;
  // ...retrofitted: bolted on, taped up, wired into the cabinet
  const cabinetRay = new Raycaster();
  // The cabinet's front surface at (x, y), found by a ray from in front
  const faceAt = (x: number, y: number) => {
    cabinetRay.set(new Vector3(x, y, cabinetBox.max.z + 1), new Vector3(0, 0, -1));
    const hit = cabinetRay.intersectObject(model, true).find((h) => (h.object as Mesh).material !== screenMaterial);
    return hit ? hit.point.z : panelCenter.z - cartSize.depth;
  };
  const rig = createSlotRig({
    width: cartSize.width * 1.22,
    height: portHeight,
    depth: cartSize.depth * 2.2,
    center: new Vector3(0, portTop - portHeight / 2, panelCenter.z),
    deckY: surfaceY,
    // Drop a ray onto the deck, passing through the buttons and joysticks
    deckAt: (x, z) => {
      cabinetRay.set(new Vector3(x, portTop + cartSize.height * 0.5, z), new Vector3(0, -1, 0));
      const hit = cabinetRay
        .intersectObject(model, true)
        .find((h) => !PANEL_MATERIALS.has(((h.object as Mesh).material as Material).name) && (h.object as Mesh).material !== screenMaterial);
      return hit ? hit.point.y : surfaceY;
    },
    deckFront: cabinetBox.max.z - cartSize.depth * 0.5,
    deckEdge: cabinetBox.max.x - cartSize.width * 0.17,
    faceZ: faceAt,
    // Under the screen's "AUTO TRACKING" label
    vent: new Vector3(screenBox.max.x - 0.1, screenBox.min.y - 0.1, 0),
    // Under the screen's "CH 03" label
    scopeX: screenBox.min.x + 0.15,
  });
  const rimMaterial = new MeshBasicMaterial({ color: new Color(SHELF_NEON) });
  const rimThickness = cartSize.depth * 0.18;
  const rimGeometryX = new BoxGeometry(cartSize.width * 1.26, rimThickness, rimThickness);
  const rimGeometryZ = new BoxGeometry(rimThickness, rimThickness, cartSize.depth * 2.24);
  const rims: Mesh[] = [];
  [-1, 1].forEach((side) => {
    const front = new Mesh(rimGeometryX, rimMaterial);
    front.position.set(0, portTop, panelCenter.z + side * cartSize.depth * 1.1);
    rims.push(front);
    const end = new Mesh(rimGeometryZ, rimMaterial);
    end.position.set(side * cartSize.width * 0.62, portTop, panelCenter.z);
    rims.push(end);
  });
  // The terminal, set into the bottom left of the housing's front face
  const housingFront = panelCenter.z + cartSize.depth * 1.1;
  const faceHeight = portTop - surfaceY;
  const terminalHeight = Math.min(faceHeight * 0.72, cartSize.width * 0.3);
  const terminalWidth = terminalHeight / TERMINAL_ASPECT;
  const terminalDepth = cartSize.depth * 0.25;
  const margin = faceHeight * 0.12;
  const terminal = createSlotTerminal(terminalWidth, terminalHeight, terminalDepth);
  terminal.group.position.set(-cartSize.width * 0.61 + margin + terminalWidth / 2, surfaceY + margin + terminalHeight / 2, housingFront + terminalDepth / 2);
  // The ticket dispenser, bolted on at the left of the strip under the marquee (below its
  // chaser lights), over the SCAREATHON badge, its back against the cabinet's face
  const dispenserWidth = cabinetSize.x * 0.3;
  const dispenser = createTicketDispenser(dispenserWidth);
  const dispenserHeight = dispenserWidth * DISPENSER_ASPECT;
  const underMarquee = marqueeBox.isEmpty() ? (screenBox.isEmpty() ? cabinetBox.max.y * 0.85 : screenBox.max.y + 0.12) : marqueeBox.min.y - 0.035;
  const dispenserY = underMarquee - dispenserHeight / 2;
  // Its left edge lined up with the badge's (just left of the screen's frame)
  const dispenserX = (screenBox.isEmpty() ? cabinetBox.min.x + cabinetSize.x * 0.12 : screenBox.min.x - 0.018) + dispenserWidth / 2;
  dispenser.group.position.set(dispenserX, dispenserY, faceAt(dispenserX, dispenserY) + (dispenserWidth * DISPENSER_ASPECT) / 2);
  // ...and wired in, by hand: a bundle out of its left end, down the face beside the screen and
  // taped on, into the cabinet by the scope; and two leads from its top up into the marquee
  const wireParts: { geometry: BufferGeometry; material: Material }[] = [];
  const wireRadius = cartSize.width * 1.22 * 0.018 * 0.8;
  const wire = (points: Vector3[], color: string) => {
    const geometry = new TubeGeometry(new CatmullRomCurve3(points), 64, wireRadius, 6);
    const material = new MeshStandardMaterial({ color: new Color(color), roughness: 0.45 });
    wireParts.push({ geometry, material });
    rig.group.add(new Mesh(geometry, material));
  };
  const dispenserDepth = dispenserWidth * DISPENSER_ASPECT;
  const boxLeft = dispenserX - dispenserWidth / 2;
  const boxZ = dispenser.group.position.z;
  const runX = screenBox.isEmpty() ? boxLeft - 0.04 : screenBox.min.x - 0.045;
  const runBottom = screenBox.isEmpty() ? dispenserY - 0.6 : screenBox.min.y + 0.03;
  const onFace = (x: number, y: number, lift: number) => new Vector3(x, y, faceAt(x, y) + lift);
  // At the bottom of the run, a steel junction box screwed to the face; the bundle goes in
  // through a rubber grommet in its top
  const jboxWidth = wireRadius * 14;
  const jboxHeight = wireRadius * 12;
  const jboxDepth = wireRadius * 7;
  const jboxTop = runBottom + 0.02;
  const jboxY = jboxTop - jboxHeight / 2;
  const jboxX = runX + wireRadius * 1.5;
  const jboxZ = faceAt(jboxX, jboxY) + jboxDepth / 2;
  const steel = new MeshStandardMaterial({ color: new Color("#a9adb3"), metalness: 0.35, roughness: 0.4 });
  const lidSteel = new MeshStandardMaterial({ color: new Color("#c3c6cb"), metalness: 0.35, roughness: 0.34 });
  const rubber = new MeshStandardMaterial({ color: new Color("#1b1a1c"), roughness: 0.8 });
  const fixed = (geometry: BufferGeometry, material: Material, x: number, y: number, z: number) => {
    wireParts.push({ geometry, material });
    const mesh = new Mesh(geometry, material);
    mesh.position.set(x, y, z);
    rig.group.add(mesh);
  };
  fixed(new BoxGeometry(jboxWidth, jboxHeight, jboxDepth), steel, jboxX, jboxY, jboxZ);
  // its lid, a shade lighter and a touch smaller, with a screw in each corner
  fixed(new BoxGeometry(jboxWidth * 0.88, jboxHeight * 0.86, wireRadius * 0.5), lidSteel, jboxX, jboxY, jboxZ + jboxDepth / 2);
  const screw = new BoxGeometry(wireRadius * 0.9, wireRadius * 0.9, wireRadius * 0.4);
  wireParts.push({ geometry: screw, material: rubber });
  [-1, 1].forEach((sx) =>
    [-1, 1].forEach((sy) => {
      const head = new Mesh(screw, rubber);
      head.position.set(jboxX + sx * jboxWidth * 0.34, jboxY + sy * jboxHeight * 0.33, jboxZ + jboxDepth / 2 + wireRadius * 0.4);
      rig.group.add(head);
    })
  );
  const grommetZ = jboxZ + jboxDepth * 0.1;
  fixed(new BoxGeometry(wireRadius * 8.4, wireRadius * 1.4, wireRadius * 3.6), rubber, jboxX, jboxTop + wireRadius * 0.6, grommetZ);
  ["#b3281e", "#151315", "#d9b83a"].forEach((color, i) => {
    const spread = (i - 1) * wireRadius * 2.4;
    const lift = wireRadius * 1.6 + (i === 1 ? wireRadius * 0.8 : 0);
    const sag = Math.sin(i * 2.1 + 0.4) * 0.012;
    // (the bundle closes up as it gathers into the grommet)
    const into = jboxX + spread * 0.8;
    wire([
      new Vector3(boxLeft + wireRadius, dispenserY + spread * 0.6, boxZ + spread * 0.3),
      new Vector3(boxLeft - 0.025, dispenserY - 0.01 + spread * 0.5, boxZ - dispenserDepth * 0.15),
      onFace(runX + spread - 0.012, dispenserY - dispenserHeight * 0.9, lift + 0.01),
      onFace(runX + spread + sag, (dispenserY + runBottom) / 2, lift),
      onFace(runX + spread, runBottom + 0.06, lift),
      new Vector3(into, jboxTop + wireRadius * 2.5, grommetZ),
      // In through the grommet
      new Vector3(into, jboxTop - wireRadius * 2, grommetZ),
    ], color);
  });
  // Up into the marquee housing
  const marqueeBottom = marqueeBox.isEmpty() ? dispenserY + dispenserHeight : marqueeBox.min.y;
  ["#2f5d9a", "#e6e0d2"].forEach((color, i) => {
    const x = boxLeft + dispenserWidth * (0.12 + i * 0.07);
    const top = dispenserY + dispenserHeight / 2;
    wire([
      new Vector3(x, top - wireRadius, boxZ - dispenserDepth * 0.1),
      new Vector3(x - 0.006, top + (marqueeBottom - top) * 0.5, boxZ - dispenserDepth * 0.25),
      new Vector3(x - 0.01, marqueeBottom + 0.004, faceAt(x, marqueeBottom - 0.01) - 0.02),
    ], color);
  });
  // Electrical tape holding the bundle down
  const tapeGeometry = new BoxGeometry(wireRadius * 10, wireRadius * 3, wireRadius * 2.4);
  const tapeMaterial = new MeshStandardMaterial({ color: new Color("#141214"), roughness: 0.55 });
  wireParts.push({ geometry: tapeGeometry, material: tapeMaterial });
  [0.35, 0.75].forEach((f) => {
    const y = dispenserY + (runBottom - dispenserY) * f;
    const tape = new Mesh(tapeGeometry, tapeMaterial);
    tape.position.copy(onFace(runX, y, wireRadius * 1.2));
    rig.group.add(tape);
  });
  // Sunk far enough that the part left standing stays below the screen
  const seat = new Vector3(0, portTop + cartSize.height / 2 - cartSize.height * 0.55, panelCenter.z);

  return {
    cartSize,
    rig,
    terminal,
    dispenser,
    rimMaterial,
    rims,
    portTop,
    surfaceY,
    panelCenter,
    seat,
    dispose() {
      rig.dispose();
      terminal.dispose();
      dispenser.dispose();
      wireParts.forEach(({ geometry, material }) => {
        geometry.dispose();
        material.dispose();
      });
      rimMaterial.dispose();
      rimGeometryX.dispose();
      rimGeometryZ.dispose();
    },
  };
}

// The row of cartridges: how far apart, how high, and how far out in front of the cabinet
// (x is from `shelfSlots`: a `pitchX` apart, more between groups)
export function shelfLayout(cartSize: CartSize, cabinetBox: Box3, panelBottom: number, seatY: number) {
  const { width: w, height: h, depth: d } = cartSize;
  const cabinetSize = cabinetBox.getSize(new Vector3());
  const plankT = h * 0.07; // (no plank any more: the cartridges float where it was)
  // Up under the control panel, so screen, controls and cartridges fit a screen together.
  // The cartridges' tops a little way below the controls, so they don't cover them
  const cartTop = Number.isFinite(panelBottom) ? panelBottom - h * 0.4 : seatY - h * 0.5;
  const ledgeY = Math.max(cabinetSize.y * 0.2, cartTop - h - plankT / 2);
  return { pitchX: w * 1.45, ledgeY, homeY: ledgeY + plankT / 2 + h / 2, z: cabinetBox.max.z + d * 6, depth: d * 3.4, plankT };
}

// The picked cartridge's pose on the shelf, `f` of the way up (0 resting, 1 picked)
export function focusedPose(cartSize: CartSize, f: number) {
  return {
    lift: cartSize.height * 0.08 * f,
    forward: cartSize.width * 0.9 * f,
    scale: 1 + 0.1 * f,
    tip: 0.15 * f,
  };
}

// Where each cartridge stands along the row: a pitch apart, and a little more between
// one group of games and the next, to set the groups apart
export function shelfSlots(games: MachineData[], pitchX: number) {
  let x = 0;
  return games.map((game, index) => {
    if (index > 0) x += pitchX * (shelfGroupOf(game) === shelfGroupOf(games[index - 1]) ? 1 : 1.3);
    return x;
  });
}
