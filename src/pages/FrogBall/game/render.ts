// Draws a Frog Ball stage with three.js: the world's sky and scenery, the
// stage parts (kept in step with the sim's moving bodies), flies, boost pads,
// the goal gate and the frog in its ball.
import * as THREE from "three";
import { buildFrogBall, type FrogBall } from "./frog";
import { GOAL_H, goalFrame, type Body, type Game } from "./sim";
import type { Tone } from "./stages";
import { makeSky, PALETTES, SCENERY, type Palette, type Scenery } from "./worlds";

const TILE = 2; // world units per floor texture tile

function canvasTexture(size: number, draw: (x: CanvasRenderingContext2D, s: number) => void) {
  const cv = document.createElement("canvas");
  cv.width = cv.height = size;
  draw(cv.getContext("2d")!, size);
  const t = new THREE.CanvasTexture(cv);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestMipmapNearestFilter;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Monkey Ball floors are gridded so you can read slopes and speed.
function floorTexture(top: string, line: string, tone: Tone) {
  return canvasTexture(32, (x, s) => {
    x.fillStyle = top;
    x.fillRect(0, 0, s, s);
    if (tone === "alt") {
      x.globalAlpha = 0.18;
      x.fillStyle = line;
      x.fillRect(0, 0, s / 2, s / 2);
      x.fillRect(s / 2, s / 2, s / 2, s / 2);
      x.globalAlpha = 1;
    }
    if (tone === "spring" || tone === "cap") {
      x.fillStyle = line;
      for (const [dx, dy, r] of [
        [8, 8, 4],
        [24, 14, 3],
        [12, 25, 3],
        [27, 28, 2],
      ]) {
        x.beginPath();
        x.arc(dx, dy, r, 0, Math.PI * 2);
        x.fill();
      }
      return;
    }
    if (tone === "bumper") {
      x.fillStyle = line;
      x.fillRect(0, s * 0.35, s, s * 0.3);
      return;
    }
    x.fillStyle = line;
    x.fillRect(0, 0, s, 2);
    x.fillRect(0, 0, 2, s);
  });
}

function glowTexture() {
  return canvasTexture(32, (x, s) => {
    const g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.35, "rgba(255,255,255,0.5)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    x.fillStyle = g;
    x.fillRect(0, 0, s, s);
  });
}

function arrowTexture() {
  return canvasTexture(32, (x, s) => {
    x.fillStyle = "#ff5ab0";
    x.fillRect(0, 0, s, s);
    x.fillStyle = "#fff2a6";
    x.beginPath();
    x.moveTo(4, s * 0.75);
    x.lineTo(s / 2, s * 0.3);
    x.lineTo(s - 4, s * 0.75);
    x.lineTo(s - 10, s * 0.75);
    x.lineTo(s / 2, s * 0.48);
    x.lineTo(10, s * 0.75);
    x.fill();
  });
}

function goalTexture() {
  const cv = document.createElement("canvas");
  cv.width = 64;
  cv.height = 16;
  const x = cv.getContext("2d")!;
  x.fillStyle = "#ff5ab0";
  x.fillRect(0, 0, 64, 16);
  x.fillStyle = "#ffffff";
  x.font = "bold 13px monospace";
  x.textAlign = "center";
  x.textBaseline = "middle";
  x.fillText("GOAL", 32, 9);
  const t = new THREE.CanvasTexture(cv);
  t.magFilter = THREE.NearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Scale a geometry's UVs so textures tile every TILE units.
function tileBoxUVs(geo: THREE.BufferGeometry, w: number, h: number, d: number) {
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  const dims = [
    [d, h],
    [d, h],
    [w, d],
    [w, d],
    [w, h],
    [w, h],
  ];
  for (let f = 0; f < 6; f++) {
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      uv.setXY(i, (uv.getX(i) * dims[f][0]) / TILE, (uv.getY(i) * dims[f][1]) / TILE);
    }
  }
}

function tileCylUVs(geo: THREE.BufferGeometry, r: number, h: number) {
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  const index = geo.index!;
  geo.groups.forEach((g, gi) => {
    const seen = new Set<number>();
    for (let k = g.start; k < g.start + g.count; k++) seen.add(index.getX(k));
    for (const i of seen) {
      if (gi === 0) uv.setXY(i, (uv.getX(i) * Math.PI * 2 * r) / TILE, (uv.getY(i) * h) / TILE);
      else uv.setXY(i, (uv.getX(i) * 2 * r) / TILE, (uv.getY(i) * 2 * r) / TILE);
    }
  });
}

interface FlyView {
  obj: THREE.Group;
  wings: THREE.Mesh[];
  base: THREE.Vector3;
}

interface Pop {
  pts: THREE.Points;
  vel: Float32Array;
  age: number;
}

export class Renderer {
  readonly gl: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(60, 1, 0.1, 900);
  readonly ball: FrogBall;
  private world = -1;
  private palette: Palette = PALETTES[0];
  private sky: THREE.Mesh | null = null;
  private scenery: Scenery | null = null;
  private stage = new THREE.Group();
  private bodyMeshes: THREE.Mesh[] = [];
  private flies: FlyView[] = [];
  private pads: THREE.Mesh[] = [];
  private pops: Pop[] = [];
  private hemi = new THREE.HemisphereLight();
  private sun = new THREE.DirectionalLight();
  private glow = glowTexture();
  private arrow = arrowTexture();
  private materials = new Map<string, THREE.Material[]>();

  constructor(canvas: HTMLCanvasElement) {
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
    this.gl.shadowMap.enabled = true;
    this.gl.shadowMap.type = THREE.BasicShadowMap;
    this.gl.outputColorSpace = THREE.SRGBColorSpace;
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -16;
    sc.right = sc.top = 16;
    sc.near = 1;
    sc.far = 80;
    this.sun.shadow.bias = -0.002;
    this.scene.add(this.hemi, this.sun, this.sun.target, this.stage);
    this.ball = buildFrogBall();
    this.scene.add(this.ball.root);
  }

  resize(width: number, height: number, pixelRatio: number) {
    this.gl.setPixelRatio(pixelRatio);
    this.gl.setSize(width, height, false);
    this.camera.aspect = width / height;
    // Portrait screens get a wider view so the path ahead still fits.
    this.camera.fov = width < height ? 72 : 58;
    this.camera.updateProjectionMatrix();
  }

  private setWorld(world: number, center: THREE.Vector3, radius: number) {
    this.palette = PALETTES[world];
    const p = this.palette;
    if (this.sky) this.scene.remove(this.sky);
    this.sky = makeSky(p);
    this.scene.add(this.sky);
    this.scene.fog = new THREE.Fog(p.fog.color, p.fog.near, p.fog.far);
    this.hemi.color.set(p.light.sky);
    this.hemi.groundColor.set(p.light.ground);
    this.hemi.intensity = p.light.ambient * 1.6;
    this.sun.color.set(p.light.sun);
    this.sun.intensity = p.light.sunIntensity;
    this.ball.setTint(world === 3 || world === 4 ? "#d8c8ff" : "#c8fbff");
    if (this.scenery) this.scene.remove(this.scenery.group);
    this.scenery = SCENERY[world](center, radius);
    this.scene.add(this.scenery.group);
    this.world = world;
  }

  private material(tone: Tone): THREE.Material[] {
    const key = `${this.world}:${tone}`;
    let m = this.materials.get(key);
    if (!m) {
      const t = this.palette.tones[tone];
      const tex = floorTexture(t.top, t.line, tone);
      const top = new THREE.MeshLambertMaterial({ map: tex });
      if (t.glow) {
        top.emissive.set("#ffffff");
        top.emissiveMap = tex;
        top.emissiveIntensity = 0.28;
      }
      const side = new THREE.MeshLambertMaterial({ color: t.side, flatShading: true, emissive: t.side, emissiveIntensity: t.glow ? 0.35 : 0.12 });
      m = [top, side];
      this.materials.set(key, m);
    }
    return m;
  }

  private meshFor(b: Body): THREE.Mesh {
    const d = b.def;
    const tone = d.tone ?? "floor";
    const [top, side] = this.material(tone);
    let mesh: THREE.Mesh;
    if (d.shape === "box") {
      const geo = new THREE.BoxGeometry(d.size[0], d.size[1], d.size[2]);
      tileBoxUVs(geo, d.size[0], d.size[1], d.size[2]);
      const sideMat = tone === "bumper" || tone === "wall" ? top : side;
      mesh = new THREE.Mesh(geo, [sideMat, sideMat, top, side, sideMat, sideMat]);
    } else {
      const geo = new THREE.CylinderGeometry(d.r, d.r, d.h, Math.max(12, Math.round(d.r * 10)));
      tileCylUVs(geo, d.r, d.h);
      const sideMat = tone === "bumper" || tone === "pillar" || tone === "goal" ? top : side;
      mesh = new THREE.Mesh(geo, [sideMat, top, side]);
    }
    mesh.castShadow = tone !== "goal";
    mesh.receiveShadow = true;
    return mesh;
  }

  // Build everything for a new stage (or the same one again after a fall).
  setStage(g: Game) {
    this.stage.clear();
    this.bodyMeshes = [];
    this.flies = [];
    this.pads = [];
    for (const p of this.pops) this.scene.remove(p.pts);
    this.pops = [];

    const box = new THREE.Box3();
    for (const b of g.bodies) box.expandByPoint(new THREE.Vector3(b.base.x, b.base.y, b.base.z));
    const center = box.getCenter(new THREE.Vector3());
    const radius = box.getSize(new THREE.Vector3()).length() / 2;
    if (g.stage.world !== this.world || !this.scenery) this.setWorld(g.stage.world, center, radius);

    for (const b of g.bodies) {
      const mesh = this.meshFor(b);
      mesh.position.set(b.c.x, b.c.y, b.c.z);
      mesh.quaternion.set(b.q.x, b.q.y, b.q.z, b.q.w);
      this.stage.add(mesh);
      this.bodyMeshes.push(mesh);
    }

    // Goal arch and sign over the posts.
    const gf = goalFrame(g.stage);
    const goal = new THREE.Group();
    goal.position.set(gf.at.x, gf.at.y, gf.at.z);
    goal.rotation.y = (g.stage.goal.heading * Math.PI) / 180;
    const arch = new THREE.Mesh(
      new THREE.TorusGeometry(gf.width / 2, 0.2, 6, 20, Math.PI),
      new THREE.MeshLambertMaterial({ color: "#ffffff", emissive: this.palette.tones.goal.line, emissiveIntensity: 0.6, flatShading: true })
    );
    arch.position.y = GOAL_H;
    goal.add(arch);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2, 0.5), new THREE.MeshBasicMaterial({ map: goalTexture(), side: THREE.DoubleSide }));
    sign.position.y = GOAL_H + gf.width / 2 - 0.35;
    goal.add(sign);
    const tape = new THREE.Mesh(
      new THREE.PlaneGeometry(gf.width, GOAL_H),
      new THREE.MeshBasicMaterial({ color: this.palette.tones.goal.line, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false })
    );
    tape.position.y = GOAL_H / 2;
    goal.add(tape);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.6, 1.4, 24), new THREE.MeshBasicMaterial({ map: this.glow, color: "#ffffff", transparent: true, opacity: 0.6, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.03;
    goal.add(ring);
    this.stage.add(goal);

    // Flies.
    const bodyMat = new THREE.MeshLambertMaterial({ color: "#2a2040", flatShading: true });
    const wingMat = new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.8, side: THREE.DoubleSide });
    for (const f of g.flies) {
      const obj = new THREE.Group();
      const s = f.big ? 2 : 1;
      const glow = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: this.glow, color: f.big ? "#ffd84a" : "#fff6a0", transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      glow.scale.setScalar(0.9 * s);
      obj.add(glow);
      const bodyM = new THREE.Mesh(new THREE.IcosahedronGeometry(0.09 * s, 0), f.big ? new THREE.MeshLambertMaterial({ color: "#ffb020", emissive: "#ff8a00", emissiveIntensity: 0.6, flatShading: true }) : bodyMat);
      bodyM.scale.set(1, 0.8, 1.5);
      obj.add(bodyM);
      const wings: THREE.Mesh[] = [];
      for (const side of [-1, 1]) {
        const w = new THREE.Mesh(new THREE.PlaneGeometry(0.16 * s, 0.1 * s), wingMat);
        w.position.set(side * 0.09 * s, 0.05 * s, 0);
        wings.push(w);
        obj.add(w);
      }
      obj.position.set(f.at.x, f.at.y, f.at.z);
      obj.visible = !f.taken;
      this.stage.add(obj);
      this.flies.push({ obj, wings, base: new THREE.Vector3(f.at.x, f.at.y, f.at.z) });
    }

    for (const pad of g.stage.pads ?? []) {
      const [w, d] = pad.size ?? [2.4, 2.4];
      const tex = this.arrow.clone();
      tex.repeat.set(1, d / 1.2);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ map: tex }));
      m.rotation.set(-Math.PI / 2, 0, (pad.heading * Math.PI) / 180);
      m.position.set(pad.at[0], pad.at[1] + 0.02, pad.at[2]);
      this.stage.add(m);
      this.pads.push(m);
    }
  }

  // A little burst of sparkles where a fly was eaten.
  pop(at: THREE.Vector3, big: boolean) {
    const n = big ? 40 : 14;
    const pos = new Float32Array(n * 3);
    const vel = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos.set([at.x, at.y, at.z], i * 3);
      const a = Math.random() * Math.PI * 2;
      const u = Math.random() * 2 - 1;
      const sp = 2 + Math.random() * (big ? 5 : 3);
      vel.set([Math.cos(a) * Math.sqrt(1 - u * u) * sp, u * sp + 1.5, Math.sin(a) * Math.sqrt(1 - u * u) * sp], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ map: this.glow, color: big ? "#ffd84a" : "#fff6a0", size: 0.35, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    pts.frustumCulled = false;
    this.scene.add(pts);
    this.pops.push({ pts, vel, age: 0 });
  }

  // Move everything to where the sim says it is.
  sync(g: Game, t: number, dt: number) {
    g.bodies.forEach((b, i) => {
      const m = this.bodyMeshes[i];
      if (b.moving) {
        m.position.set(b.c.x, b.c.y, b.c.z);
        m.quaternion.set(b.q.x, b.q.y, b.q.z, b.q.w);
      }
      if (b.def.bumper || b.def.spring) {
        const k = g.t - b.hitAt;
        const wob = k < 0.4 ? Math.sin(k * 40) * (0.4 - k) * 0.5 : 0;
        if (b.def.spring) m.scale.set(1 + wob * 0.3, 1 - wob, 1 + wob * 0.3);
        else m.scale.set(1 + wob, 1, 1 + wob);
      }
    });
    g.flies.forEach((f, i) => {
      const v = this.flies[i];
      if (!v) return;
      v.obj.visible = !f.taken;
      if (f.taken) return;
      v.obj.position.y = v.base.y + Math.sin(t * 2 + i) * 0.12;
      v.obj.rotation.y = t * 1.5 + i;
      const flap = Math.sin(t * 40 + i) * 0.8;
      v.wings[0].rotation.z = flap;
      v.wings[1].rotation.z = -flap;
    });
    for (const m of this.pads) ((m.material as THREE.MeshBasicMaterial).map as THREE.Texture).offset.y = -t * 1.5;
    for (let i = this.pops.length - 1; i >= 0; i--) {
      const p = this.pops[i];
      p.age += dt;
      const pos = p.pts.geometry.attributes.position as THREE.BufferAttribute;
      for (let k = 0; k < pos.count; k++) {
        p.vel[k * 3 + 1] -= 9 * dt;
        pos.setXYZ(k, pos.getX(k) + p.vel[k * 3] * dt, pos.getY(k) + p.vel[k * 3 + 1] * dt, pos.getZ(k) + p.vel[k * 3 + 2] * dt);
      }
      pos.needsUpdate = true;
      (p.pts.material as THREE.PointsMaterial).opacity = Math.max(0, 1 - p.age / 0.7);
      if (p.age > 0.7) {
        this.scene.remove(p.pts);
        this.pops.splice(i, 1);
      }
    }
    this.ball.root.position.set(g.p.x, g.p.y, g.p.z);
    this.ball.update(dt, t, new THREE.Vector3(g.v.x - g.groundVel.x, g.v.y, g.v.z - g.groundVel.z), g.grounded);
    this.scenery?.update(t);
  }

  render(t: number) {
    const cam = this.camera;
    if (this.sky) {
      this.sky.position.copy(cam.position);
      (this.sky.material as THREE.ShaderMaterial).uniforms.uTime.value = t;
    }
    // The sun's shadow follows the ball.
    const b = this.ball.root.position;
    const dir = new THREE.Vector3(...this.palette.sun.dir).normalize();
    if (dir.y < 0.5) dir.y = 0.5 + dir.y;
    dir.normalize();
    this.sun.position.copy(b).addScaledVector(dir, 40);
    this.sun.target.position.copy(b);
    this.gl.render(this.scene, cam);
  }

  dispose() {
    this.gl.dispose();
  }
}
