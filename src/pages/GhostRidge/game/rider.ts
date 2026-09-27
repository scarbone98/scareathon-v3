// The rider: a pumpkin-headed boarder in an orange jacket, built from a
// handful of boxes like a PS1 character. Posed each frame from the sim.
import * as THREE from "three";

export type Pose = {
  crouch: number; // 0 standing tall, 1 deep crouch
  lean: number; // -1..1 into the turn
  grab: number; // 0..1 reaching for the board
  tuck: number; // 0..1 arms in for speed
  flail: number; // 0..1 arms windmilling (crashes)
  time: number;
};

function box(w: number, h: number, d: number, color: string, mat: (c: string) => THREE.Material) {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
}

function faceTexture() {
  const cv = document.createElement("canvas");
  cv.width = 64;
  cv.height = 32;
  const x = cv.getContext("2d")!;
  x.fillStyle = "#e8741c";
  x.fillRect(0, 0, 64, 32);
  // Ribs of the pumpkin.
  x.fillStyle = "#c95a12";
  for (let i = 0; i < 64; i += 8) x.fillRect(i, 0, 2, 32);
  // The carved face, centred on the front of the sphere (u = 0.75).
  x.fillStyle = "#ffe26a";
  const cx = 48;
  x.beginPath();
  x.moveTo(cx - 9, 13);
  x.lineTo(cx - 5, 8);
  x.lineTo(cx - 2, 13);
  x.moveTo(cx + 2, 13);
  x.lineTo(cx + 5, 8);
  x.lineTo(cx + 9, 13);
  x.fill();
  x.fillRect(cx - 9, 18, 18, 3);
  x.fillRect(cx - 9, 21, 3, 2);
  x.fillRect(cx - 1, 21, 3, 2);
  x.fillRect(cx + 6, 21, 3, 2);
  const t = new THREE.CanvasTexture(cv);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class RiderModel {
  readonly root = new THREE.Group(); // at the feet, lined up with the slope
  readonly pivot = new THREE.Group(); // spins and flips
  private body = new THREE.Group();
  private legL: THREE.Mesh;
  private legR: THREE.Mesh;
  private torso = new THREE.Group();
  private armL = new THREE.Group();
  private armR = new THREE.Group();
  private scarfTail: THREE.Mesh;
  readonly board: THREE.Mesh;

  constructor(mat: (c: string) => THREE.Material, basic: (t: THREE.Texture) => THREE.Material) {
    this.root.add(this.pivot);
    this.root.scale.setScalar(1.2);
    this.pivot.position.y = 0.9;
    const inner = new THREE.Group();
    inner.position.y = -0.9;
    this.pivot.add(inner);

    // The board runs along -z (forward); the rider stands sideways, facing +x.
    const board = box(0.42, 0.07, 1.75, "#6b2fa3", mat);
    const stripe = box(0.44, 0.075, 0.25, "#ff8a1f", mat);
    stripe.position.z = -0.55;
    board.add(stripe);
    const tip = box(0.36, 0.06, 0.2, "#6b2fa3", mat);
    tip.position.set(0, 0.06, -0.92);
    tip.rotation.x = 0.35;
    const tail = tip.clone();
    tail.position.z = 0.92;
    tail.rotation.x = -0.35;
    board.add(tip, tail);
    board.position.y = 0.04;
    this.board = board;
    inner.add(board, this.body);

    this.legL = box(0.18, 0.75, 0.2, "#1d1a2e", mat);
    this.legR = this.legL.clone();
    // Legs pivot at the feet, so crouching squashes them down onto the board.
    this.legL.geometry.translate(0, 0.375, 0);
    this.legL.position.set(0, 0.08, -0.32);
    this.legR.position.set(0, 0.08, 0.32);
    const bootL = box(0.3, 0.14, 0.24, "#0e0c18", mat);
    bootL.position.y = 0.05;
    this.legL.add(bootL);
    this.legR.add(bootL.clone());
    this.body.add(this.legL, this.legR);

    this.torso.position.y = 0.8;
    const jacket = box(0.34, 0.66, 0.6, "#ff7a1a", mat);
    jacket.position.y = 0.33;
    const band = box(0.35, 0.1, 0.61, "#1d1a2e", mat);
    band.position.y = 0.05;
    this.torso.add(jacket, band);

    const scarf = box(0.4, 0.12, 0.42, "#8c3cd6", mat);
    scarf.position.y = 0.7;
    this.scarfTail = box(0.08, 0.1, 0.6, "#8c3cd6", mat);
    this.scarfTail.geometry.translate(0, 0, 0.3);
    this.scarfTail.position.set(-0.05, 0.7, 0.15);
    this.torso.add(scarf, this.scarfTail);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), basic(faceTexture()));
    head.scale.set(1, 0.85, 1);
    head.position.y = 1.0;
    // Look down the hill over the open shoulders.
    head.rotation.y = -0.55;
    const stem = box(0.07, 0.14, 0.07, "#2f6b2a", mat);
    stem.position.y = 0.3;
    head.add(stem);
    this.torso.add(head);

    for (const [arm, side] of [
      [this.armL, -1],
      [this.armR, 1],
    ] as const) {
      const sleeve = box(0.13, 0.55, 0.13, "#ff7a1a", mat);
      sleeve.position.y = -0.27;
      const glove = box(0.15, 0.13, 0.15, "#1d1a2e", mat);
      glove.position.y = -0.58;
      arm.add(sleeve, glove);
      arm.position.set(0, 0.6, side * 0.36);
      this.torso.add(arm);
    }
    this.body.add(this.torso);
  }

  pose(p: Pose) {
    const c = p.crouch;
    const knee = 0.8 - c * 0.32;
    this.legL.scale.y = this.legR.scale.y = knee / 0.8;
    this.torso.position.y = knee;
    this.torso.rotation.set(0, 0.55, 0);
    this.torso.rotateZ(-0.1 - c * 0.3 - p.tuck * 0.2);
    this.body.rotation.x = p.lean * 0.12;
    this.body.rotation.z = -p.lean * 0.3;

    const spread = 1 - p.tuck * 0.7;
    const wave = p.flail > 0 ? Math.sin(p.time * 22) * p.flail * 2 : 0;
    this.armL.rotation.set(0.9 * spread + wave, 0, 0.35 * spread);
    this.armR.rotation.set(-0.9 * spread - wave, 0, 0.35 * spread);
    if (p.grab > 0) {
      // Reach down to the toe edge.
      this.armR.rotation.set(-0.9 * (1 - p.grab) * spread, 0, 0.35 + p.grab * 1.3);
      this.torso.rotation.z -= p.grab * 0.35;
    }
    this.scarfTail.rotation.y = Math.sin(p.time * 14) * 0.25;
    this.scarfTail.rotation.x = Math.sin(p.time * 9) * 0.15 - 0.1;
  }
}
