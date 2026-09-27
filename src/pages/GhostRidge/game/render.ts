// Draws Ghost Ridge like a PS1 game: a low-resolution frame with wobbly
// snapped vertices, fog close in, and colour crushed to 15 bits with a
// dither, then scaled up with hard pixels.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { baseAt, centerAt, GATES, halfAt, heightAt, LENGTH, mulberry32, normalAt, START_D, type Course, type ObstacleKind } from "./course";
import { RiderModel } from "./rider";
import { ghostPos, type Game } from "./sim";

const FOG = new THREE.Color("#2b2150");
const PIXELS = 320 * 240; // about a PS1 frame, whatever the screen's shape
const U_MAX = 58;
const COLS = 51;

// Every material snaps its vertices to the pixel grid, the PS1 wobble.
const snap = { value: new THREE.Vector2(160, 120) };
function psx<M extends THREE.Material>(m: M): M {
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uSnap = snap;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform vec2 uSnap;")
      .replace("#include <project_vertex>", "#include <project_vertex>\ngl_Position.xy = floor(gl_Position.xy / gl_Position.w * uSnap + 0.5) / uSnap * gl_Position.w;");
  };
  return m;
}

const lambert = (opts: THREE.MeshLambertMaterialParameters) => psx(new THREE.MeshLambertMaterial(opts));
const basic = (opts: THREE.MeshBasicMaterialParameters) => psx(new THREE.MeshBasicMaterial(opts));

function canvasTexture(w: number, h: number, draw: (x: CanvasRenderingContext2D) => void, repeat = false) {
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  draw(cv.getContext("2d")!);
  const t = new THREE.CanvasTexture(cv);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function colorize(geo: THREE.BufferGeometry, color: (y: number, x: number, z: number) => THREE.Color) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const pos = g.getAttribute("position");
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const c = color(pos.getY(i), pos.getX(i), pos.getZ(i));
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  g.deleteAttribute("uv");
  return g;
}

const C = (hex: string) => new THREE.Color(hex);
const solid = (hex: string) => () => C(hex);

// Low-poly scenery, one merged mesh each, coloured per vertex.
function propGeometry(kind: ObstacleKind) {
  const rnd = mulberry32(kind.length * 97);
  if (kind === "pine") {
    const parts = [colorize(new THREE.CylinderGeometry(0.16, 0.22, 1.4, 5).translate(0, 0.7, 0), solid("#2a1d1a"))];
    const tiers = [
      [1.6, 2.6, 1.1],
      [1.25, 2.2, 2.6],
      [0.85, 1.9, 4.0],
    ];
    for (const [r, h, y] of tiers) {
      parts.push(
        colorize(new THREE.ConeGeometry(r, h, 6).translate(0, y + h / 2, 0), (vy) => {
          const t = (vy - y) / h;
          return t > 0.55 ? C("#dfe7ff") : C("#15302f").lerp(C("#23433d"), rnd());
        })
      );
    }
    return mergeGeometries(parts)!;
  }
  if (kind === "dead") {
    const parts = [colorize(new THREE.CylinderGeometry(0.08, 0.3, 5.5, 5).translate(0, 2.75, 0), solid("#3b3140"))];
    for (let i = 0; i < 5; i++) {
      const len = 1.2 + rnd() * 1.4;
      const b = new THREE.CylinderGeometry(0.04, 0.1, len, 4).translate(0, len / 2, 0);
      b.rotateZ(0.7 + rnd() * 0.6);
      b.rotateY(rnd() * Math.PI * 2);
      b.translate(0, 2 + i * 0.65, 0);
      parts.push(colorize(b, solid("#3b3140")));
    }
    return mergeGeometries(parts)!;
  }
  if (kind === "grave") {
    const slab = new THREE.BoxGeometry(1.3, 1.2, 0.32).translate(0, 0.6, 0);
    const top = new THREE.CylinderGeometry(0.65, 0.65, 0.32, 8, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateY(Math.PI / 2).translate(0, 1.2, 0);
    const col = (y: number) => (y > 1.55 ? C("#e6ecff") : C("#6e7488").lerp(C("#565b6d"), y < 0.3 ? 1 : 0));
    return mergeGeometries([colorize(slab, col), colorize(top, col)])!;
  }
  if (kind === "cross") {
    const col = (y: number) => (y > 1.95 ? C("#e6ecff") : C("#5e6275"));
    return mergeGeometries([
      colorize(new THREE.BoxGeometry(0.3, 2, 0.3).translate(0, 1, 0), col),
      colorize(new THREE.BoxGeometry(1.2, 0.28, 0.3).translate(0, 1.4, 0), col),
    ])!;
  }
  const rock = new THREE.IcosahedronGeometry(1.1, 0).scale(1.3, 0.8, 1.1);
  return colorize(rock, (y) => (y > 0.35 ? C("#e2e9ff") : C("#4a4f63")));
}

function pumpkinTexture() {
  return canvasTexture(64, 32, (x) => {
    x.fillStyle = "#ef7d1a";
    x.fillRect(0, 0, 64, 32);
    x.fillStyle = "#b8540d";
    for (let i = 0; i < 64; i += 8) x.fillRect(i, 0, 2, 32);
    x.fillStyle = "#fff06a";
    const cx = 48;
    x.beginPath();
    x.moveTo(cx - 10, 14);
    x.lineTo(cx - 6, 8);
    x.lineTo(cx - 2, 14);
    x.moveTo(cx + 2, 14);
    x.lineTo(cx + 6, 8);
    x.lineTo(cx + 10, 14);
    x.fill();
    x.beginPath();
    x.moveTo(cx - 11, 18);
    x.lineTo(cx + 11, 18);
    x.lineTo(cx + 7, 24);
    x.lineTo(cx - 7, 24);
    x.fill();
    x.fillStyle = "#ef7d1a";
    x.fillRect(cx - 4, 18, 3, 3);
    x.fillRect(cx + 2, 21, 3, 3);
  });
}

function glowTexture(inner: string) {
  return canvasTexture(16, 16, (x) => {
    const g = x.createRadialGradient(8, 8, 0, 8, 8, 8);
    g.addColorStop(0, inner);
    g.addColorStop(1, "rgba(0,0,0,0)");
    x.fillStyle = g;
    x.fillRect(0, 0, 16, 16);
  });
}

function bannerTexture(text: string, color: string) {
  return canvasTexture(128, 32, (x) => {
    x.fillStyle = "#1a0f2e";
    x.fillRect(0, 0, 128, 32);
    x.fillStyle = color;
    x.fillRect(2, 2, 124, 28);
    x.fillStyle = "#1a0f2e";
    x.fillRect(5, 5, 118, 22);
    x.fillStyle = color;
    x.font = "bold 16px monospace";
    x.textAlign = "center";
    x.textBaseline = "middle";
    x.fillText(text, 64, 17);
  });
}

type Particle = { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number };

export class Renderer {
  readonly gl: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(70, 1, 0.3, 1000);
  readonly rider: RiderModel;
  private target: THREE.WebGLRenderTarget;
  private post: { scene: THREE.Scene; camera: THREE.OrthographicCamera; mat: THREE.ShaderMaterial };
  private sky = new THREE.Group();
  private candy!: THREE.InstancedMesh;
  private candyShown: boolean[] = [];
  private ghosts: THREE.Group[] = [];
  private snow!: THREE.Points;
  private spray!: THREE.Points;
  private particles: Particle[] = [];
  private riderUp = new THREE.Vector3(0, 1, 0);
  private disposables: { dispose(): void }[] = [];

  constructor(canvas: HTMLCanvasElement, private course: Course) {
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
    this.gl.setPixelRatio(1);
    this.target = new THREE.WebGLRenderTarget(320, 240, { type: THREE.HalfFloatType, magFilter: THREE.NearestFilter, minFilter: THREE.NearestFilter });
    this.post = this.makePost();
    this.scene.background = FOG;
    this.scene.fog = new THREE.Fog(FOG, 30, 190);

    const hemi = new THREE.HemisphereLight("#9aa6ff", "#2b1d45", 1.6);
    const moon = new THREE.DirectionalLight("#dfe6ff", 1.7);
    moon.position.set(-0.5, 0.8, -0.4);
    this.scene.add(hemi, moon);

    this.buildSky();
    this.buildTerrain();
    this.buildProps();
    this.buildPumpkins();
    this.buildCandy();
    this.buildGhosts();
    this.buildGates();
    this.buildSnow();
    this.buildSpray();

    this.rider = new RiderModel(
      // A touch of glow so the rider reads against the night.
      (c) => lambert({ color: c, emissive: new THREE.Color(c).multiplyScalar(0.35) }),
      (t) => basic({ map: t })
    );
    this.scene.add(this.rider.root);
  }

  private makePost() {
    const mat = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: this.target.texture } },
      vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
      fragmentShader: `
        uniform sampler2D tDiffuse;
        varying vec2 vUv;
        float bayer(vec2 p) {
          int x = int(mod(p.x, 4.0));
          int y = int(mod(p.y, 4.0));
          int i = x + y * 4;
          float m[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
          return m[i] / 16.0 - 0.5;
        }
        void main() {
          vec4 c = linearToOutputTexel(vec4(texture2D(tDiffuse, vUv).rgb, 1.0));
          vec3 o = c.rgb + bayer(gl_FragCoord.xy) / 31.0;
          o = floor(o * 31.0 + 0.5) / 31.0;
          gl_FragColor = vec4(o, 1.0);
        }`,
      depthTest: false,
      depthWrite: false,
    });
    const scene = new THREE.Scene();
    scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));
    return { scene, camera: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), mat };
  }

  resize(width: number, height: number) {
    const scale = Math.sqrt(PIXELS / Math.max(1, width * height));
    const w = Math.max(64, Math.round(width * scale));
    const h = Math.max(48, Math.round(height * scale));
    this.gl.setSize(w, h, false);
    this.target.setSize(w, h);
    snap.value.set(w / 2, h / 2);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // ---------- the world ----------

  private buildSky() {
    const sky = new THREE.SphereGeometry(800, 16, 10);
    const pos = sky.getAttribute("position");
    const col = new Float32Array(pos.count * 3);
    const top = C("#05040f");
    const mid = C("#150f33");
    for (let i = 0; i < pos.count; i++) {
      const t = pos.getY(i) / 800;
      const c = t < 0.05 ? FOG.clone() : t < 0.35 ? FOG.clone().lerp(mid, (t - 0.05) / 0.3) : mid.clone().lerp(top, (t - 0.35) / 0.65);
      col.set([c.r, c.g, c.b], i * 3);
    }
    sky.setAttribute("color", new THREE.BufferAttribute(col, 3));
    const skyMesh = new THREE.Mesh(sky, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
    skyMesh.renderOrder = -10;

    const rnd = mulberry32(7);
    const stars = new Float32Array(500 * 3);
    for (let i = 0; i < 500; i++) {
      const a = rnd() * Math.PI * 2;
      const e = 0.12 + rnd() * 1.3;
      stars.set([Math.cos(a) * Math.cos(e) * 700, Math.sin(e) * 700, Math.sin(a) * Math.cos(e) * 700], i * 3);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute("position", new THREE.BufferAttribute(stars, 3));
    const starPts = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: "#c9d2ff", size: 1, sizeAttenuation: false, fog: false, depthWrite: false }));
    starPts.renderOrder = -9;

    const moonTex = canvasTexture(64, 64, (x) => {
      const g = x.createRadialGradient(32, 32, 10, 32, 32, 32);
      g.addColorStop(0, "rgba(220,230,255,0.55)");
      g.addColorStop(1, "rgba(120,110,255,0)");
      x.fillStyle = g;
      x.fillRect(0, 0, 64, 64);
      x.fillStyle = "#f4f1ff";
      x.beginPath();
      x.arc(32, 32, 13, 0, Math.PI * 2);
      x.fill();
      x.fillStyle = "#cfcbe8";
      for (const [cx, cy, r] of [
        [27, 28, 3],
        [36, 36, 4],
        [34, 25, 2],
      ])
        x.fillRect(cx - r / 2, cy - r / 2, r, r);
    });
    const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: moonTex, fog: false, depthWrite: false }));
    moon.position.set(-260, 330, -560);
    moon.scale.setScalar(220);
    moon.renderOrder = -8;

    // A ring of jagged mountains on the horizon.
    const ridgeTex = canvasTexture(
      512,
      64,
      (x) => {
        const r = mulberry32(3);
        x.clearRect(0, 0, 512, 64);
        for (const [color, base, amp] of [
          ["#231a44", 34, 26],
          ["#1b1436", 46, 16],
        ] as const) {
          x.fillStyle = color;
          x.beginPath();
          x.moveTo(0, 64);
          let y: number = base;
          for (let px = 0; px <= 512; px += 8) {
            y = Math.max(4, Math.min(62, y + (r() - 0.5) * amp * 0.7));
            if (px === 512) y = base;
            x.lineTo(px, y);
          }
          x.lineTo(512, 64);
          x.fill();
        }
      },
      true
    );
    ridgeTex.repeat.set(3, 1);
    const ridge = new THREE.Mesh(
      new THREE.CylinderGeometry(650, 650, 200, 48, 1, true),
      new THREE.MeshBasicMaterial({ map: ridgeTex, transparent: true, side: THREE.BackSide, fog: false, depthWrite: false })
    );
    ridge.position.y = -40;
    ridge.renderOrder = -7;
    this.sky.add(skyMesh, starPts, moon, ridge);
    this.scene.add(this.sky);
  }

  private buildTerrain() {
    const c = this.course;
    // Rows every 2m, plus extra rows over each kicker so the lip is exact.
    const ds = new Set<number>();
    for (let d = START_D - 110; d < LENGTH + 300; d += 2) ds.add(d);
    for (const k of c.kickers) {
      for (let t = 0; t <= 1.0001; t += 0.125) ds.add(k.d + k.len * t);
      ds.add(k.d + k.len + 0.75);
      ds.add(k.d + k.len + 1.5);
    }
    const rows = [...ds].sort((a, b) => a - b);
    const snowTex = canvasTexture(
      32,
      32,
      (x) => {
        const r = mulberry32(11);
        x.fillStyle = "#e9eeff";
        x.fillRect(0, 0, 32, 32);
        for (let i = 0; i < 90; i++) {
          x.fillStyle = r() < 0.5 ? "#d3dcf5" : "#f7f9ff";
          x.fillRect(Math.floor(r() * 32), Math.floor(r() * 32), 1 + Math.floor(r() * 2), 1);
        }
      },
      true
    );
    const mat = lambert({ map: snowTex, vertexColors: true });
    this.disposables.push(mat, snowTex);
    const rnd = mulberry32(5);
    const snowC = C("#dfe6ff");
    const trackC = C("#f1f4ff");
    const bankC = C("#a9b3e0");
    const rockC = C("#4b4766");
    const lipC = C("#ff8a1f");
    const rampC = C("#b9d4ff");
    const n = { x: 0, y: 1, z: 0 };
    const CHUNK = 48;
    for (let r0 = 0; r0 < rows.length - 1; r0 += CHUNK) {
      const r1 = Math.min(rows.length - 1, r0 + CHUNK);
      const count = (r1 - r0 + 1) * COLS;
      const pos = new Float32Array(count * 3);
      const col = new Float32Array(count * 3);
      const uv = new Float32Array(count * 2);
      let i = 0;
      for (let r = r0; r <= r1; r++) {
        const d = rows[r];
        const cx = centerAt(c, d);
        const hw = halfAt(c, d);
        const lip = c.kickers.some((k) => Math.abs(d - (k.d + k.len)) < 0.01);
        for (let j = 0; j < COLS; j++) {
          const u = -U_MAX + (j / (COLS - 1)) * U_MAX * 2;
          const x = cx + u;
          const z = -d;
          const y = heightAt(c, x, z);
          pos.set([x, y, z], i * 3);
          uv.set([x / 7, z / 7], i * 2);
          normalAt(c, x, z, n);
          const a = Math.abs(u);
          const col3 = a < hw ? snowC.clone().lerp(trackC, 1 - a / hw) : snowC.clone().lerp(bankC, Math.min(1, (a - hw) / 14));
          if (n.y < 0.72) col3.lerp(rockC, Math.min(1, (0.72 - n.y) * 3));
          const kick = y - (baseAt(c, d) + (a < hw ? (a / hw) ** 2 * 1.4 : 99));
          if (kick > 0.25) col3.lerp(rampC, Math.min(1, kick / 2));
          if (lip && kick > 0.5) col3.copy(lipC);
          col3.multiplyScalar(0.94 + rnd() * 0.08);
          col.set([col3.r, col3.g, col3.b], i * 3);
          i++;
        }
      }
      const idx: number[] = [];
      for (let r = 0; r < r1 - r0; r++) {
        for (let j = 0; j < COLS - 1; j++) {
          const a = r * COLS + j;
          const b = a + COLS;
          idx.push(a, a + 1, b, b, a + 1, b + 1);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
      geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      geo.computeBoundingSphere();
      this.scene.add(new THREE.Mesh(geo, mat));
      this.disposables.push(geo);
    }
  }

  private buildProps() {
    const c = this.course;
    const kinds: ObstacleKind[] = ["pine", "dead", "grave", "cross", "rock"];
    const mat = lambert({ vertexColors: true });
    this.disposables.push(mat);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    for (const kind of kinds) {
      const list = c.obstacles.filter((o) => o.kind === kind);
      const geo = propGeometry(kind);
      const mesh = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((o, i) => {
        q.setFromAxisAngle(up, o.rot);
        // Graves lean a little.
        if (kind === "grave" || kind === "cross") q.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.sin(o.rot * 3) * 0.12, 0, Math.cos(o.rot * 5) * 0.1)));
        m.compose(new THREE.Vector3(o.x, heightAt(c, o.x, o.z) - 0.4 * o.s, o.z), q, new THREE.Vector3(o.s, o.s, o.s));
        mesh.setMatrixAt(i, m);
      });
      mesh.computeBoundingSphere();
      this.scene.add(mesh);
      this.disposables.push(geo);
    }
  }

  private buildPumpkins() {
    const c = this.course;
    const tex = pumpkinTexture();
    const geo = new THREE.SphereGeometry(0.6, 8, 6).scale(1, 0.8, 1).translate(0, 0.45, 0);
    const mat = basic({ map: tex });
    const mesh = new THREE.InstancedMesh(geo, mat, c.pumpkins.length);
    const m = new THREE.Matrix4();
    const glow = new Float32Array(c.pumpkins.length * 3);
    c.pumpkins.forEach((p, i) => {
      m.makeRotationY(p.rot);
      m.setPosition(p.x, p.y, p.z);
      mesh.setMatrixAt(i, m);
      glow.set([p.x, p.y + 0.6, p.z], i * 3);
    });
    const glowGeo = new THREE.BufferGeometry();
    glowGeo.setAttribute("position", new THREE.BufferAttribute(glow, 3));
    const glowPts = new THREE.Points(
      glowGeo,
      new THREE.PointsMaterial({ map: glowTexture("rgba(255,150,40,0.7)"), size: 5, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    this.scene.add(mesh, glowPts);
    this.disposables.push(geo, mat, tex, glowGeo);
  }

  private buildCandy() {
    const c = this.course;
    const geo = new THREE.ConeGeometry(0.34, 0.75, 6).rotateX(Math.PI);
    const cg = colorize(geo, (y) => (y > 0.12 ? C("#ffd21f") : y > -0.15 ? C("#ff7a12") : C("#fff6e0")));
    this.candy = new THREE.InstancedMesh(cg, basic({ vertexColors: true }), c.candy.length);
    this.candyShown = c.candy.map(() => true);
    this.scene.add(this.candy);
    this.disposables.push(cg);
  }

  private buildGhosts() {
    const pts: THREE.Vector2[] = [];
    for (const [r, y] of [
      [0.001, 2.1],
      [0.45, 2.02],
      [0.72, 1.7],
      [0.8, 1.2],
      [0.86, 0.6],
      [1.0, 0.0],
    ])
      pts.push(new THREE.Vector2(r, y));
    const geo = new THREE.LatheGeometry(pts, 10);
    const pos = geo.getAttribute("position");
    for (let i = 0; i < pos.count; i++) {
      if (pos.getY(i) < 0.01) pos.setY(i, Math.sin(Math.atan2(pos.getZ(i), pos.getX(i)) * 5) * 0.2);
    }
    geo.computeVertexNormals();
    const mat = basic({ color: "#d9f4ff", transparent: true, opacity: 0.82, side: THREE.DoubleSide });
    const eyeMat = basic({ color: "#120a24" });
    const eyeGeo = new THREE.BoxGeometry(0.18, 0.3, 0.1);
    const glow = glowTexture("rgba(150,230,255,0.6)");
    for (let i = 0; i < this.course.ghosts.length; i++) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(geo, mat);
      const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
      eyeL.position.set(-0.25, 1.55, -0.76);
      const eyeR = eyeL.clone();
      eyeR.position.x = 0.25;
      const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.22, 0.1), eyeMat);
      mouth.position.set(0, 1.1, -0.84);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      halo.scale.setScalar(5);
      halo.position.y = 1.1;
      g.add(body, eyeL, eyeR, mouth, halo);
      g.position.y = -1.1;
      const holder = new THREE.Group();
      holder.add(g);
      this.ghosts.push(holder);
      this.scene.add(holder);
    }
    this.disposables.push(geo, mat, eyeMat, eyeGeo, glow);
  }

  private buildGates() {
    const c = this.course;
    const pillar = lambert({ color: "#4b4560" });
    const pillarGeo = new THREE.BoxGeometry(1.2, 7, 1.2).translate(0, 3.5, 0);
    const capGeo = new THREE.BoxGeometry(1.6, 0.4, 1.6).translate(0, 7.2, 0);
    const lampGeo = new THREE.SphereGeometry(0.5, 8, 6).scale(1, 0.8, 1).translate(0, 7.8, 0);
    const lampTex = pumpkinTexture();
    const lampMat = basic({ map: lampTex });
    const gates: [number, string, string][] = [
      [START_D + 14, "GHOST RIDGE", "#c88cff"],
      ...GATES.map((d): [number, string, string] => [d, "CHECKPOINT", "#ffcf4a"]),
      [LENGTH, "FINISH", "#7dffb0"],
    ];
    for (const [d, text, color] of gates) {
      const cx = centerAt(c, d);
      const hw = halfAt(c, d) + 1.5;
      const group = new THREE.Group();
      let lowest = Infinity;
      for (const side of [-1, 1]) {
        const x = cx + side * hw;
        const y = heightAt(c, x, -d);
        lowest = Math.min(lowest, y);
        const p = new THREE.Mesh(pillarGeo, pillar);
        p.position.set(x, y - 0.5, -d);
        const cap = new THREE.Mesh(capGeo, pillar);
        cap.position.copy(p.position);
        const lamp = new THREE.Mesh(lampGeo, lampMat);
        lamp.position.copy(p.position);
        group.add(p, cap, lamp);
      }
      const tex = bannerTexture(text, color);
      // Two faces, so it reads the right way round from both sides.
      const bannerGeo = new THREE.PlaneGeometry(hw * 2, 3);
      const bannerMat = basic({ map: tex });
      for (const turn of [0, Math.PI]) {
        const banner = new THREE.Mesh(bannerGeo, bannerMat);
        banner.position.set(cx, Math.max(heightAt(c, cx, -d) + 8, lowest + 6), -d);
        banner.rotation.y = turn;
        group.add(banner);
      }
      this.scene.add(group);
      this.disposables.push(tex);
    }
    this.disposables.push(pillar, pillarGeo, capGeo, lampGeo, lampMat, lampTex);
  }

  private buildSnow() {
    const count = 900;
    const pos = new Float32Array(count * 3);
    const r = mulberry32(21);
    for (let i = 0; i < count; i++) pos.set([r() * 80 - 40, r() * 40 - 10, r() * 80 - 40], i * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    this.snow = new THREE.Points(geo, new THREE.PointsMaterial({ color: "#eef2ff", size: 1.5, sizeAttenuation: false, fog: true }));
    this.snow.frustumCulled = false;
    this.scene.add(this.snow);
  }

  private buildSpray() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(300 * 3), 3));
    this.spray = new THREE.Points(geo, new THREE.PointsMaterial({ color: "#ffffff", size: 2, sizeAttenuation: false }));
    this.spray.frustumCulled = false;
    this.scene.add(this.spray);
  }

  // Kick up snow from the board.
  burst(g: Game, count: number, power: number) {
    for (let i = 0; i < count && this.particles.length < 300; i++) {
      const a = Math.random() * Math.PI * 2;
      this.particles.push({
        x: g.p.x + (Math.random() - 0.5) * 0.8,
        y: g.p.y + 0.1,
        z: g.p.z + (Math.random() - 0.5) * 0.8,
        vx: g.v.x * 0.3 + Math.cos(a) * power,
        vy: 2 + Math.random() * power,
        vz: g.v.z * 0.3 + Math.sin(a) * power,
        life: 0.4 + Math.random() * 0.4,
      });
    }
  }

  // ---------- each frame ----------

  sync(g: Game, dt: number, time: number) {
    // The sky and snowfall travel with the camera.
    this.sky.position.copy(this.camera.position);

    // Rider.
    const r = this.rider;
    r.root.position.set(g.p.x, g.p.y, g.p.z);
    const n = g.onGround && g.crashT <= 0 ? normalAt(this.course, g.p.x, g.p.z) : { x: 0, y: 1, z: 0 };
    this.riderUp.lerp(new THREE.Vector3(n.x, n.y, n.z), 1 - Math.exp(-12 * dt)).normalize();
    const yaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -g.heading);
    const tilt = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), this.riderUp);
    r.root.quaternion.copy(tilt.multiply(yaw));

    // Carving spray, rooster-tail style.
    if (g.onGround && g.crashT <= 0 && g.carve > 0.25 && Math.random() < g.carve * 1.5) this.burst(g, 2, 2 + g.carve * 3);
    if (g.boosting && Math.random() < 0.6) this.burst(g, 1, 1);

    const sp = this.spray.geometry.getAttribute("position") as THREE.BufferAttribute;
    let k = 0;
    this.particles = this.particles.filter((p) => (p.life -= dt) > 0);
    for (const p of this.particles) {
      p.vy -= 14 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      sp.setXYZ(k++, p.x, p.y, p.z);
    }
    for (let i = k; i < 300; i++) sp.setXYZ(i, 0, -9999, 0);
    sp.needsUpdate = true;

    // Snowfall, wrapped around the camera.
    const cam = this.camera.position;
    const snowPos = this.snow.geometry.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < snowPos.count; i++) {
      let y = snowPos.getY(i) - (3 + (i % 5)) * dt;
      let x = snowPos.getX(i) + Math.sin(time * 0.7 + i) * 0.8 * dt - g.v.x * dt * 0.1;
      let z = snowPos.getZ(i);
      x = ((((x - cam.x + 40) % 80) + 80) % 80) + cam.x - 40;
      y = ((((y - cam.y + 15) % 40) + 40) % 40) + cam.y - 15;
      z = ((((z - cam.z + 40) % 80) + 80) % 80) + cam.z - 40;
      snowPos.setXYZ(i, x, y, z);
    }
    snowPos.needsUpdate = true;

    // Candy spins; eaten candy is gone.
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const one = new THREE.Vector3(1, 1, 1);
    const zero = new THREE.Vector3(0, 0, 0);
    const d = -g.p.z;
    this.course.candy.forEach((c, i) => {
      const near = Math.abs(-c.z - d) < 220;
      const shown = !g.candyTaken[i] && near;
      if (!shown && !this.candyShown[i]) return;
      this.candyShown[i] = shown;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), time * 3 + i);
      m.compose(new THREE.Vector3(c.x, c.y + Math.sin(time * 3 + i) * 0.15, c.z), q, shown ? one : zero);
      this.candy.setMatrixAt(i, m);
    });
    this.candy.instanceMatrix.needsUpdate = true;
    this.candy.computeBoundingSphere();

    this.course.ghosts.forEach((gh, i) => {
      const holder = this.ghosts[i];
      const near = Math.abs(gh.d - d) < 240;
      holder.visible = near;
      if (!near) return;
      const pos = ghostPos(g, gh);
      holder.position.set(pos.x, pos.y, pos.z);
      // Face uphill toward riders, swaying.
      holder.rotation.set(0, Math.PI + Math.sin(time * 1.3 + i) * 0.4 + pos.facing * 0.3, Math.sin(time * 2 + i) * 0.1);
    });
  }

  render() {
    this.gl.setRenderTarget(this.target);
    this.gl.render(this.scene, this.camera);
    this.gl.setRenderTarget(null);
    this.gl.render(this.post.scene, this.post.camera);
  }

  dispose() {
    for (const d of this.disposables) d.dispose();
    this.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      mesh.geometry?.dispose?.();
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose?.();
    });
    this.target.dispose();
    this.post.mat.dispose();
    this.gl.dispose();
  }
}
