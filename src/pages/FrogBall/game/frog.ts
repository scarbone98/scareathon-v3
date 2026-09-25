// The frog in its ball. The shell rolls with the ball; the frog inside stays
// upright and turns to face where it's going, like the monkeys do.
import * as THREE from "three";
import { BALL_R } from "./sim";

const mat = (color: string, emissive = "#000000", k = 0) => new THREE.MeshLambertMaterial({ color, flatShading: true, emissive, emissiveIntensity: k });

const SHELL_VERT = /* glsl */ `
varying vec3 vN;
varying vec3 vView;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vView = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;

const SHELL_FRAG = /* glsl */ `
uniform vec3 uTint;
varying vec3 vN;
varying vec3 vView;
void main() {
  float f = 1.0 - max(dot(normalize(vN), normalize(vView)), 0.0);
  float rim = pow(f, 2.2);
  // A soft window glint, fixed toward the top left like a studio light.
  vec3 l = normalize(vec3(-0.5, 0.7, 0.6));
  float spec = pow(max(dot(reflect(-l, normalize(vN)), normalize(vView)), 0.0), 60.0) * 0.7;
  vec3 col = mix(uTint, vec3(1.0), rim * 0.5) + spec;
  gl_FragColor = vec4(col, 0.05 + rim * 0.5 + spec);
}`;

export interface FrogBall {
  root: THREE.Group; // positioned at the ball centre
  roll: THREE.Group; // turns with the ball
  frog: THREE.Group; // stays upright
  update: (dt: number, t: number, vel: THREE.Vector3, grounded: boolean) => void;
  setTint: (color: string) => void;
}

function buildFrog() {
  const frog = new THREE.Group();
  const green = mat("#5fcf55", "#2a7a2a", 0.25);
  const dark = mat("#3f9e3c");
  const belly = mat("#e4f7a0");
  const white = mat("#ffffff", "#ffffff", 0.3);
  const black = mat("#1a1420");
  const pink = mat("#ff9ab8", "#ff6f9f", 0.4);

  const body = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 1), green);
  body.scale.set(1.15, 0.85, 1.15);
  body.position.set(0, -0.06, 0.02);
  frog.add(body);
  const tummy = new THREE.Mesh(new THREE.IcosahedronGeometry(0.15, 1), belly);
  tummy.scale.set(1.05, 0.8, 0.8);
  tummy.position.set(0, -0.1, -0.07);
  frog.add(tummy);
  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.17, 1), green);
  head.scale.set(1.35, 0.8, 1);
  head.position.set(0, 0.07, -0.1);
  frog.add(head);

  const eyes: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const eye = new THREE.Group();
    const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.075, 1), white);
    eye.add(ball);
    const lid = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), green);
    lid.position.y = 0.005;
    eye.add(lid);
    const pupil = new THREE.Mesh(new THREE.IcosahedronGeometry(0.038, 0), black);
    pupil.position.set(0, 0, -0.058);
    eye.add(pupil);
    const shine = new THREE.Mesh(new THREE.IcosahedronGeometry(0.012, 0), white);
    shine.position.set(side * 0.012, 0.018, -0.09);
    eye.add(shine);
    eye.position.set(side * 0.11, 0.16, -0.12);
    frog.add(eye);
    eyes.push(eye);
    const cheek = new THREE.Mesh(new THREE.CircleGeometry(0.03, 8), pink);
    cheek.position.set(side * 0.16, 0.04, -0.2);
    cheek.rotation.y = side * 0.9 + Math.PI;
    frog.add(cheek);
  }
  // A little smile.
  const smile = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.009, 4, 12, Math.PI), black);
  smile.position.set(0, 0.06, -0.25);
  smile.rotation.set(0, 0, Math.PI);
  frog.add(smile);

  const legs: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    // Back legs: a fat thigh and a flat foot.
    const back = new THREE.Group();
    const thigh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.09, 1), dark);
    thigh.scale.set(0.8, 0.7, 1.5);
    back.add(thigh);
    const foot = new THREE.Mesh(new THREE.IcosahedronGeometry(0.07, 0), dark);
    foot.scale.set(1, 0.35, 1.4);
    foot.position.set(side * 0.02, -0.08, -0.07);
    back.add(foot);
    back.position.set(side * 0.18, -0.12, 0.1);
    frog.add(back);
    legs.push(back);
    // Front arms.
    const arm = new THREE.Group();
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.14, 5), green);
    upper.position.y = -0.07;
    arm.add(upper);
    const hand = new THREE.Mesh(new THREE.IcosahedronGeometry(0.04, 0), dark);
    hand.scale.set(1.2, 0.5, 1.2);
    hand.position.y = -0.15;
    arm.add(hand);
    arm.position.set(side * 0.12, -0.06, -0.14);
    frog.add(arm);
    legs.push(arm);
  }
  return { frog, eyes, legs };
}

export function buildFrogBall(): FrogBall {
  const root = new THREE.Group();
  const roll = new THREE.Group();
  root.add(roll);

  const shellMat = new THREE.ShaderMaterial({
    vertexShader: SHELL_VERT,
    fragmentShader: SHELL_FRAG,
    transparent: true,
    depthWrite: false,
    uniforms: { uTint: { value: new THREE.Color("#bff6ff") } },
  });
  const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(BALL_R, 3), shellMat);
  shell.renderOrder = 5;
  roll.add(shell);
  // A band and a star so you can see it roll.
  const band = new THREE.Mesh(new THREE.TorusGeometry(BALL_R * 0.995, 0.018, 4, 32), new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.35, depthWrite: false }));
  roll.add(band);
  const band2 = band.clone();
  band2.rotation.y = Math.PI / 2;
  band2.material = new THREE.MeshBasicMaterial({ color: "#ffd84a", transparent: true, opacity: 0.3, depthWrite: false });
  roll.add(band2);

  // Shadow caster: an invisible solid ball so the shadow is round and dark.
  const shadow = new THREE.Mesh(new THREE.IcosahedronGeometry(BALL_R * 0.9, 1), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
  shadow.castShadow = true;
  root.add(shadow);

  const { frog, eyes, legs } = buildFrog();
  frog.position.y = -0.1;
  frog.scale.setScalar(1.1);
  root.add(frog);

  const spin = new THREE.Quaternion();
  const axis = new THREE.Vector3();
  let yaw = 0;
  let blinkAt = 2;
  let stride = 0;

  return {
    root,
    roll,
    frog,
    setTint: (color) => shellMat.uniforms.uTint.value.set(color),
    update(dt, t, vel, grounded) {
      const speed = Math.hypot(vel.x, vel.z);
      // Roll: angular velocity = up x v / r.
      axis.set(vel.z, 0, -vel.x);
      const w = axis.length() / BALL_R;
      if (w > 1e-4) {
        spin.setFromAxisAngle(axis.normalize(), w * dt);
        roll.quaternion.premultiply(spin);
      }
      if (speed > 0.4) {
        const target = Math.atan2(-vel.x, -vel.z);
        let d = target - yaw;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        yaw += d * Math.min(1, dt * 8);
      }
      frog.rotation.y = yaw;
      // Lean into speed, and scamper.
      frog.rotation.x = -Math.min(0.35, speed * 0.02);
      stride += dt * (4 + speed * 1.6);
      const run = Math.min(1, speed / 6);
      legs.forEach((leg, i) => {
        const back = i % 2 === 0;
        const side = i < 2 ? 1 : -1;
        if (!grounded) {
          leg.rotation.x = back ? -0.9 : -1.2;
          leg.rotation.z = side * (back ? 0.5 : 0.7);
        } else {
          leg.rotation.x = Math.sin(stride + (back ? 0 : Math.PI) + side) * 0.8 * run;
          leg.rotation.z = 0;
        }
      });
      frog.position.y = -0.1 + Math.abs(Math.sin(stride)) * 0.03 * run;
      // Blink now and then.
      if (t > blinkAt) blinkAt = t + 2 + Math.random() * 3;
      const blink = blinkAt - t > 0.12 || blinkAt - t < 0 ? 1 : 0.15;
      eyes.forEach((e) => (e.scale.y = blink));
    },
  };
}
