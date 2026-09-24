// Draws a match state with Three.js: a tilted camera over a pixelated 3D
// arena, billboarded sprites for units, and effects driven by engine events.
// It never changes the state; the engine is the only source of truth.
import * as THREE from "three";
import {
  DEPLOY_TICKS,
  HALF_LENGTH,
  HALF_WIDTH,
  RIVER_HALF,
  TICK_RATE,
  getCard,
  type Card,
  type MatchEvent,
  type MatchState,
  type Projectile,
  type Spell,
  type Team,
  type Tower,
  type Unit,
} from "../../../../server/shared/royale/index.js";
import { buildArena, type Arena } from "./arena";
import { HpBar, glowTexture, pixelate, stoneTexture } from "./textures";

export const TEAM_COLOR = ["#ff8a1f", "#b061ff"] as const;
const SIZE_SCALE = 1.75;
const FLY_HEIGHT = 1.7;
const DROP_TICKS = 7;
const TERRY_URL = "/royale/oldmanterry1.png";
const IMP_URL = "/sprites/imp.png";
const CANDLE_URL = "/sprites/candle.png";

export interface ViewOptions {
  pixelSize: number;
  tilt: number;
}

export type Positions = Map<number, { x: number; z: number }>;

const SHADOW_GEO = new THREE.CircleGeometry(1, 14);
const RING_GEO = new THREE.RingGeometry(0.82, 1, 18);

class UnitView {
  sprite: THREE.Sprite;
  tex: THREE.Texture;
  shadow: THREE.Mesh;
  ring: THREE.Mesh;
  hpBar: HpBar;
  width: number;
  height: number;
  animT = Math.random() * 10;
  lungeT = 0;
  lungeX = 0;
  lungeZ = 0;
  flashT = 0;
  x = 0;
  z = 0;
  y = 0;

  constructor(public unit: Unit, public card: Card, sheet: THREE.Texture) {
    const s = card.sprite;
    this.height = s.height * SIZE_SCALE;
    this.width = (this.height * s.frameWidth) / s.frameHeight;
    this.tex = sheet.clone();
    this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex, alphaTest: 0.5 }));
    this.sprite.center.set(0.5, 0);
    this.sprite.scale.set(this.width, this.height, 1);
    const r = unit.radius * (unit.flying ? 0.8 : 1.1);
    this.shadow = new THREE.Mesh(SHADOW_GEO, new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: unit.flying ? 0.25 : 0.4, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.scale.set(r, r * 0.7, 1);
    this.ring = new THREE.Mesh(RING_GEO, new THREE.MeshBasicMaterial({ color: TEAM_COLOR[unit.team], transparent: true, opacity: 0.6, depthWrite: false }));
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.scale.set(r, r * 0.7, 1);
    this.hpBar = new HpBar(TEAM_COLOR[unit.team], Math.max(0.8, this.width * 0.8), 0.14);
    this.hpBar.sprite.visible = false;
  }

  get objects() {
    return [this.sprite, this.shadow, this.ring, this.hpBar.sprite];
  }

  setFrame(frame: number, facing: number) {
    const n = this.card.sprite.frames;
    const flip = !this.card.sprite.front && facing < 0;
    this.tex.repeat.set((flip ? -1 : 1) / n, 1);
    this.tex.offset.set((flip ? frame + 1 : frame) / n, 0);
  }

  dispose() {
    this.sprite.material.dispose();
    (this.shadow.material as THREE.Material).dispose();
    (this.ring.material as THREE.Material).dispose();
    this.tex.dispose();
    this.hpBar.dispose();
  }
}

class TowerView {
  group = new THREE.Group();
  archer: THREE.Sprite;
  archerTex: THREE.Texture;
  hpBar: HpBar;
  topY: number;
  sinkT = -1;
  flashT = 0;
  materials: THREE.MeshLambertMaterial[] = [];

  constructor(public tower: Tower, textures: Map<string, THREE.Texture>, stone: THREE.Texture, capStone: THREE.Texture) {
    const king = tower.tower === "king";
    const size = king ? 3.4 : 2.6;
    const h = king ? 3.0 : 2.5;
    this.topY = h;
    const bodyMat = new THREE.MeshLambertMaterial({ map: stone });
    const capMat = new THREE.MeshLambertMaterial({ map: capStone });
    this.materials.push(bodyMat, capMat);
    const body = new THREE.Mesh(new THREE.BoxGeometry(size, h, size), bodyMat);
    body.position.y = h / 2;
    const cap = new THREE.Mesh(new THREE.BoxGeometry(size + 0.4, 0.35, size + 0.4), capMat);
    cap.position.y = h + 0.17;
    this.group.add(body, cap);
    const crenGeo = new THREE.BoxGeometry(0.5, 0.45, 0.5);
    const e = (size + 0.4) / 2 - 0.25;
    for (const cx of [-e, 0, e])
      for (const cz of [-e, 0, e]) {
        if (cx === 0 && cz === 0) continue;
        const c = new THREE.Mesh(crenGeo, capMat);
        c.position.set(cx, h + 0.57, cz);
        this.group.add(c);
      }
    const bannerMat = new THREE.MeshLambertMaterial({ color: TEAM_COLOR[tower.team], side: THREE.DoubleSide });
    for (const bx of king ? [-0.9, 0.9] : [0]) {
      const banner = new THREE.Mesh(new THREE.PlaneGeometry(king ? 1.1 : 0.8, king ? 1.5 : 1.1), bannerMat);
      banner.position.set(bx, h * 0.62, size / 2 + 0.02);
      this.group.add(banner);
    }
    if (king) {
      const door = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.2), new THREE.MeshBasicMaterial({ color: "#0d0812" }));
      door.position.set(0, 0.6, size / 2 + 0.02);
      this.group.add(door);
    }
    const url = tower.team === 0 ? TERRY_URL : IMP_URL;
    this.archerTex = textures.get(url)!.clone();
    if (tower.team === 1) this.archerTex.repeat.set(1 / 4, 1);
    this.archer = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.archerTex, alphaTest: 0.5 }));
    this.archer.center.set(0.5, 0);
    const scale = king ? 1.35 : 1;
    this.archer.scale.set((tower.team === 0 ? 1.3 : 1.0) * scale, (tower.team === 0 ? 0.93 : 1.0) * scale, 1);
    this.archer.position.y = h + 0.35;
    this.group.add(this.archer);
    const light = new THREE.PointLight("#ff9a4a", 6, 7, 1.4);
    light.position.set(0, h + 1.2, size / 2 + 0.6);
    this.group.add(light);
    this.group.position.set(tower.x, 0, tower.z);
    this.hpBar = new HpBar(TEAM_COLOR[tower.team], king ? 3.0 : 2.4, 0.3);
    this.hpBar.sprite.position.set(tower.x, h + (king ? 2.3 : 2.0), tower.z);
  }
}

class ProjectileView {
  sprite: THREE.Sprite;
  startX: number;
  startZ: number;
  startY: number;
  constructor(p: Projectile, public color: string, startY: number) {
    this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(color), alphaTest: 0.3, fog: false }));
    this.sprite.scale.set(0.5, 0.5, 1);
    this.startX = p.x;
    this.startZ = p.z;
    this.startY = startY;
  }
}

class SpellView {
  sprite: THREE.Sprite;
  marker: THREE.Mesh;
  total: number;
  from: THREE.Vector3;
  constructor(spell: Spell, card: Card, tex: THREE.Texture) {
    this.total = Math.max(1, Math.round((card.travel ?? 1) * TICK_RATE));
    const comet = card.id === "comet";
    this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, alphaTest: 0.4, fog: false }));
    this.sprite.scale.setScalar(comet ? 1.4 : 2.2);
    this.from = new THREE.Vector3(spell.x + (comet ? 3 : 6), comet ? 12 : 18, spell.z - (comet ? 4 : 8));
    this.marker = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 28), new THREE.MeshBasicMaterial({ color: TEAM_COLOR[spell.team], transparent: true, opacity: 0.8, depthWrite: false }));
    this.marker.rotation.x = -Math.PI / 2;
    this.marker.position.set(spell.x, 0.06, spell.z);
    this.marker.scale.setScalar(card.radius ?? 1);
  }
}

type Tween = (dt: number) => boolean;

export function preloadUrls() {
  const urls = new Set<string>([TERRY_URL, IMP_URL, CANDLE_URL]);
  for (const id of ["meteor", "comet"]) urls.add(getCard(id).sprite.url);
  return urls;
}

export class Renderer {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(30, 1, 0.5, 400);
  private baseCamPos = new THREE.Vector3();
  private world = new THREE.Group();
  private view: ViewOptions = { pixelSize: 2, tilt: 55 };
  private textures = new Map<string, THREE.Texture>();
  private arena: Arena | null = null;
  private units = new Map<number, UnitView>();
  private towers = new Map<number, TowerView>();
  private projectiles = new Map<number, ProjectileView>();
  private spells = new Map<number, SpellView>();
  private tweens: Tween[] = [];
  private shake = 0;
  private resize: ResizeObserver;
  private raycaster = new THREE.Raycaster();
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private previewRing: THREE.Mesh;
  private previewGhost: THREE.Sprite;
  private zones: THREE.Mesh[] = [];
  private stoneTex = stoneTexture(1, "#7a7288", "#474055");
  private capTex = stoneTexture(2, "#5f586e", "#35303f");
  ready = false;

  constructor(private host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(1);
    const canvas = this.renderer.domElement;
    Object.assign(canvas.style, { width: "100%", height: "100%", imageRendering: "pixelated", display: "block", touchAction: "none" });
    host.appendChild(canvas);
    this.scene.background = new THREE.Color("#140c22");
    this.scene.fog = new THREE.Fog("#140c22", 45, 95);
    this.scene.add(this.world);

    this.previewRing = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 28), new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.85, depthWrite: false }));
    this.previewRing.rotation.x = -Math.PI / 2;
    this.previewRing.visible = false;
    this.previewGhost = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, opacity: 0.55, depthWrite: false }));
    this.previewGhost.center.set(0.5, 0);
    this.previewGhost.visible = false;
    this.scene.add(this.previewRing, this.previewGhost);

    // Deploy zones: your half, plus a pocket per lane once its enemy princess falls.
    const zoneMat = new THREE.MeshBasicMaterial({ color: TEAM_COLOR[0], transparent: true, opacity: 0.14, depthWrite: false });
    const own = new THREE.Mesh(new THREE.PlaneGeometry(HALF_WIDTH * 2 - 1, HALF_LENGTH - RIVER_HALF - 1), zoneMat);
    own.position.set(0, 0.03, (HALF_LENGTH + RIVER_HALF) / 2);
    const pocketDepth = 7.5 - (RIVER_HALF + 0.5);
    for (const lane of [-1, 1]) {
      const pocket = new THREE.Mesh(new THREE.PlaneGeometry(HALF_WIDTH - 0.5, pocketDepth), zoneMat);
      pocket.position.set((lane * (HALF_WIDTH - 0.5)) / 2, 0.03, -(RIVER_HALF + 0.5 + pocketDepth / 2));
      pocket.userData.lane = lane;
      this.zones.push(pocket);
    }
    this.zones.unshift(own);
    for (const z of this.zones) {
      z.rotation.x = -Math.PI / 2;
      z.visible = false;
      this.scene.add(z);
    }

    this.resize = new ResizeObserver(() => this.applyView());
    this.resize.observe(host);
  }

  async load(cardIds: string[]) {
    const loader = new THREE.TextureLoader();
    const urls = preloadUrls();
    for (const id of cardIds) urls.add(getCard(id).sprite.url);
    await Promise.all(
      [...urls].map(async (url) => {
        if (this.textures.has(url)) return;
        this.textures.set(url, pixelate(await loader.loadAsync(url)));
      }),
    );
    if (!this.arena) this.arena = buildArena(this.world, this.textures.get(CANDLE_URL)!, 6);
    this.applyView();
    this.ready = true;
  }

  dispose() {
    this.resize.disconnect();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }

  get canvas() {
    return this.renderer.domElement;
  }

  setView(v: ViewOptions) {
    this.view = v;
    this.applyView();
  }

  // Clears every match object, keeping the arena, for a rematch.
  reset() {
    for (const v of this.units.values()) {
      this.world.remove(...v.objects);
      v.dispose();
    }
    for (const v of this.towers.values()) this.world.remove(v.group, v.hpBar.sprite);
    for (const v of this.projectiles.values()) this.world.remove(v.sprite);
    for (const v of this.spells.values()) this.world.remove(v.sprite, v.marker);
    this.units.clear();
    this.towers.clear();
    this.projectiles.clear();
    this.spells.clear();
    for (const t of this.tweens) t(1000);
    this.tweens = [];
  }

  // ---------- camera ----------

  private applyView() {
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    if (!w || !h) return;
    const px = this.view.pixelSize;
    this.renderer.setSize(Math.max(1, Math.round(w / px)), Math.max(1, Math.round(h / px)), false);
    const cam = this.camera;
    cam.aspect = w / h;
    cam.updateProjectionMatrix();
    const tilt = THREE.MathUtils.degToRad(this.view.tilt);
    const dir = new THREE.Vector3(0, Math.sin(tilt), Math.cos(tilt));
    const target = new THREE.Vector3(0, 0, 0.6);
    const pts: THREE.Vector3[] = [];
    for (const x of [-HALF_WIDTH - 0.8, HALF_WIDTH + 0.8])
      for (const z of [-HALF_LENGTH - 0.8, HALF_LENGTH + 0.8]) pts.push(new THREE.Vector3(x, 0, z), new THREE.Vector3(x, 1, z));
    pts.push(new THREE.Vector3(0, 5.2, -13.8), new THREE.Vector3(0, 5.2, 13.8));
    let lo = 10;
    let hi = 300;
    for (let i = 0; i < 30; i++) {
      const d = (lo + hi) / 2;
      cam.position.copy(target).addScaledVector(dir, d);
      cam.lookAt(target);
      cam.updateMatrixWorld();
      const fits = pts.every((p) => {
        const v = p.clone().project(cam);
        return Math.abs(v.x) <= 0.98 && Math.abs(v.y) <= 0.98;
      });
      if (fits) hi = d;
      else lo = d;
    }
    cam.position.copy(target).addScaledVector(dir, hi);
    cam.lookAt(target);
    this.baseCamPos.copy(cam.position);
  }

  // ---------- input helpers ----------

  pick(clientX: number, clientY: number): { x: number; z: number } | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return null;
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -(((clientY - rect.top) / rect.height) * 2 - 1));
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(this.groundPlane, hit) ? { x: hit.x, z: hit.z } : null;
  }

  // Shows where a card would land. `pockets` lists lanes (-1/1) whose enemy
  // princess is down, so the zone overlay can show them.
  setPreview(card: Card | null, at: { x: number; z: number } | null, valid: boolean, pockets: number[]) {
    const showZone = !!card && card.type !== "spell";
    this.zones[0].visible = showZone;
    for (const z of this.zones.slice(1)) z.visible = showZone && pockets.includes(z.userData.lane);
    if (!card || !at) {
      this.previewRing.visible = false;
      this.previewGhost.visible = false;
      return;
    }
    const r = card.type === "spell" ? card.radius! : Math.max(0.7, (card.radius ?? 0.5) * 1.6);
    this.previewRing.scale.set(r, r, 1);
    this.previewRing.position.set(at.x, 0.05, at.z);
    (this.previewRing.material as THREE.MeshBasicMaterial).color.set(valid ? "#ffffff" : "#ff3b3b");
    this.previewRing.visible = true;
    if (card.type === "spell") {
      this.previewGhost.visible = false;
      return;
    }
    const sheet = this.textures.get(card.sprite.url);
    const mat = this.previewGhost.material;
    if (sheet && mat.map?.source !== sheet.source) {
      mat.map?.dispose();
      const tex = sheet.clone();
      tex.repeat.set(1 / card.sprite.frames, 1);
      mat.map = tex;
      mat.needsUpdate = true;
    }
    const h = card.sprite.height * SIZE_SCALE;
    this.previewGhost.scale.set((h * card.sprite.frameWidth) / card.sprite.frameHeight, h, 1);
    this.previewGhost.position.set(at.x, card.flying ? FLY_HEIGHT : 0, at.z);
    mat.opacity = valid ? 0.6 : 0.3;
    this.previewGhost.visible = true;
  }

  // ---------- frame ----------

  render(state: MatchState, prev: Positions, alpha: number, events: MatchEvent[], dt: number) {
    if (!this.ready) return;
    for (const e of events) this.handleEvent(state, e);
    this.syncTowers(state, dt);
    this.syncUnits(state, prev, alpha, dt);
    this.syncProjectiles(state, prev, alpha);
    this.syncSpells(state, alpha);

    const running = this.tweens;
    this.tweens = [];
    for (const f of running) if (f(dt)) this.tweens.push(f);
    this.arena?.update(dt);

    this.camera.position.copy(this.baseCamPos);
    if (this.shake > 0.01) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake;
      this.camera.position.y += (Math.random() - 0.5) * this.shake;
      this.shake *= Math.exp(-7 * dt);
    }
    this.renderer.render(this.scene, this.camera);
  }

  private handleEvent(state: MatchState, e: MatchEvent) {
    switch (e.type) {
      case "attack": {
        const u = this.units.get(e.id);
        const target = this.findPos(state, e.targetId);
        if (u && target) {
          const dx = target.x - u.x;
          const dz = target.z - u.z;
          const d = Math.sqrt(dx * dx + dz * dz) || 1;
          u.lungeX = dx / d;
          u.lungeZ = dz / d;
          u.lungeT = 0.22;
        }
        break;
      }
      case "hit": {
        const u = this.units.get(e.id);
        if (u) {
          u.flashT = 0.1;
          this.particles(new THREE.Vector3(u.x, u.y + u.height * 0.5, u.z), "#ffffff", 3, 2.5, 0.25, 4);
        }
        const t = this.towers.get(e.id);
        if (t) {
          t.flashT = 0.08;
          this.particles(new THREE.Vector3(t.tower.x, t.topY * 0.7, t.tower.z + 1), "#8a8298", 2, 2, 0.4, 6);
        }
        break;
      }
      case "impact": {
        const p = this.projectiles.get(e.id);
        this.particles(new THREE.Vector3(e.x, 0.8, e.z), p?.color ?? "#ffffff", 4, 2, 0.3, 2);
        break;
      }
      case "spell": {
        const card = getCard(e.card);
        const at = new THREE.Vector3(e.x, 0, e.z);
        if (card.id === "comet") {
          this.particles(new THREE.Vector3(e.x, 0.4, e.z), "#9fe8ff", 22, 6, 0.6, 8);
          this.particles(new THREE.Vector3(e.x, 0.4, e.z), "#ffffff", 10, 4, 0.4, 6);
          this.ringFx(at, "#9fe8ff", card.radius! * 1.3, 0.35);
          this.shake = Math.max(this.shake, 0.3);
        } else {
          this.explosion(at, card.radius!);
        }
        break;
      }
      case "death": {
        const u = this.units.get(e.id);
        if (!u) break;
        this.units.delete(e.id);
        this.corpse(u);
        const card = getCard(e.card);
        if (card.deathDamage) {
          this.particles(new THREE.Vector3(e.x, 0.5, e.z), "#ff8a1f", 16, 4, 0.5, 8);
          this.ringFx(new THREE.Vector3(e.x, 0, e.z), "#ff8a1f", card.deathRadius!, 0.3);
        }
        break;
      }
      case "tower-down": {
        const t = this.towers.get(e.id);
        if (t && t.sinkT < 0) {
          t.sinkT = 0;
          t.hpBar.sprite.visible = false;
          this.shake = Math.max(this.shake, 0.9);
          for (let i = 0; i < 4; i++) this.particles(new THREE.Vector3(t.tower.x + (Math.random() - 0.5) * 2, 1, t.tower.z + (Math.random() - 0.5) * 2), "#6b6378", 10, 4, 1.2, 6);
        }
        break;
      }
      case "king-awake": {
        for (const t of this.towers.values()) {
          if (t.tower.team === e.team && t.tower.tower === "king") {
            this.particles(new THREE.Vector3(t.tower.x, t.topY + 1, t.tower.z), "#ffcf4a", 14, 3, 0.6, 2);
          }
        }
        break;
      }
      case "ready": {
        const u = this.units.get(e.id);
        if (u) {
          this.particles(new THREE.Vector3(u.x, 0.1, u.z), "#9c8a74", 5, 2, 0.35, 5);
          if ((u.card.hp ?? 0) * (u.card.count ?? 1) > 2000) this.shake = Math.max(this.shake, 0.35);
        }
        break;
      }
      default:
        break;
    }
  }

  private findPos(state: MatchState, id: number) {
    const u = this.units.get(id);
    if (u) return { x: u.x, z: u.z };
    const t = state.towers.find((x) => x.id === id);
    return t ? { x: t.x, z: t.z } : null;
  }

  private syncTowers(state: MatchState, dt: number) {
    for (const tower of state.towers) {
      let view = this.towers.get(tower.id);
      if (!view) {
        view = new TowerView(tower, this.textures, this.stoneTex, this.capTex);
        this.towers.set(tower.id, view);
        this.world.add(view.group, view.hpBar.sprite);
      }
      view.tower = tower;
      view.hpBar.set(tower.hp / tower.maxHp);
      view.hpBar.sprite.visible = !tower.destroyed;
      view.archer.visible = tower.active && !tower.destroyed;
      if (tower.team === 1) view.archerTex.offset.x = (Math.floor(performance.now() / 180) % 4) / 4;
      const flash = view.flashT > 0 ? 1.8 : 1;
      view.flashT -= dt;
      for (const m of view.materials) m.color.setScalar(flash);
      if (view.sinkT >= 0 && view.sinkT < 1) {
        view.sinkT += dt / 0.9;
        view.group.position.y = -Math.min(1, view.sinkT) * (view.topY - 0.5);
        view.group.position.x = tower.x + (view.sinkT < 1 ? (Math.random() - 0.5) * 0.15 : 0);
        if (Math.random() < 0.5) this.particles(new THREE.Vector3(tower.x, 0.4, tower.z + tower.radius), "#6b6378", 2, 2, 0.8, 2);
      }
    }
  }

  private syncUnits(state: MatchState, prev: Positions, alpha: number, dt: number) {
    const seen = new Set<number>();
    for (const unit of state.units) {
      seen.add(unit.id);
      let view = this.units.get(unit.id);
      const card = getCard(unit.card);
      if (!view) {
        const sheet = this.textures.get(card.sprite.url);
        if (!sheet) continue;
        view = new UnitView(unit, card, sheet);
        this.units.set(unit.id, view);
        this.world.add(...view.objects);
      }
      view.unit = unit;
      const p = prev.get(unit.id);
      view.x = p ? p.x + (unit.x - p.x) * alpha : unit.x;
      view.z = p ? p.z + (unit.z - p.z) * alpha : unit.z;

      let y = unit.flying ? FLY_HEIGHT + Math.sin(view.animT * 3) * 0.15 : 0;
      const deploying = unit.deploy > 0;
      if (deploying) {
        const left = unit.deploy - alpha;
        view.sprite.visible = left <= DROP_TICKS;
        const k = Math.max(0, left / DROP_TICKS);
        y += k * k * 5;
        view.ring.visible = true;
        const pulse = 1 - (unit.deploy - alpha) / DEPLOY_TICKS;
        (view.ring.material as THREE.MeshBasicMaterial).opacity = 0.3 + 0.5 * pulse;
      } else {
        view.sprite.visible = true;
        (view.ring.material as THREE.MeshBasicMaterial).opacity = 0.6;
      }

      view.animT += dt;
      const fps = unit.moving ? 5 + (card.speed ?? 1) * 3 : 4;
      view.setFrame(Math.floor(view.animT * fps) % card.sprite.frames, unit.facing);

      let lx = 0;
      let lz = 0;
      let hop = 0;
      if (view.lungeT > 0) {
        view.lungeT -= dt;
        const k = Math.sin((1 - view.lungeT / 0.22) * Math.PI);
        lx = view.lungeX * k * 0.4;
        lz = view.lungeZ * k * 0.4;
        hop = k * 0.12;
      } else if (unit.moving && !unit.flying) {
        hop = Math.abs(Math.sin(view.animT * (6 + (card.speed ?? 1) * 2))) * 0.09;
      }
      view.y = y;
      view.sprite.position.set(view.x + lx, y + hop, view.z + lz);
      view.shadow.position.set(view.x + lx, 0.02, view.z + lz);
      view.ring.position.set(view.x + lx, 0.03, view.z + lz);
      view.hpBar.sprite.position.set(view.x, y + view.height + 0.3, view.z);
      view.hpBar.set(unit.hp / unit.maxHp);
      view.hpBar.sprite.visible = !deploying && (unit.hp < unit.maxHp || card.type === "building");
      if (view.flashT > 0) {
        view.flashT -= dt;
        view.sprite.material.color.setRGB(5, 3, 3);
      } else if (unit.stun > 0) {
        view.sprite.material.color.setRGB(0.6, 0.9, 1.6);
      } else {
        view.sprite.material.color.setRGB(1, 1, 1);
      }
    }
    for (const [id, view] of this.units) {
      if (seen.has(id)) continue;
      this.units.delete(id);
      this.world.remove(...view.objects);
      view.dispose();
    }
  }

  private syncProjectiles(state: MatchState, prev: Positions, alpha: number) {
    const seen = new Set<number>();
    for (const p of state.projectiles) {
      seen.add(p.id);
      let view = this.projectiles.get(p.id);
      if (!view) {
        const color = projectileColor(p);
        const source = this.units.get(p.sourceId);
        const tower = this.towers.get(p.sourceId);
        const startY = source ? source.y + source.height * 0.6 : tower ? tower.topY + 1 : 1;
        view = new ProjectileView(p, color, startY);
        this.projectiles.set(p.id, view);
        this.world.add(view.sprite);
      }
      const pp = prev.get(p.id);
      const x = pp ? pp.x + (p.x - pp.x) * alpha : p.x;
      const z = pp ? pp.z + (p.z - pp.z) * alpha : p.z;
      const total = Math.hypot(p.tx - view.startX, p.tz - view.startZ) || 1;
      const left = Math.hypot(p.tx - x, p.tz - z);
      const k = Math.min(1, Math.max(0, 1 - left / total));
      const target = this.units.get(p.targetId);
      const endY = target ? target.y + target.height * 0.5 : 1.2;
      const y = view.startY + (endY - view.startY) * k + Math.sin(Math.PI * k) * total * 0.12;
      view.sprite.position.set(x, y, z);
    }
    for (const [id, view] of this.projectiles) {
      if (seen.has(id)) continue;
      this.projectiles.delete(id);
      this.world.remove(view.sprite);
      view.sprite.material.dispose();
    }
  }

  private syncSpells(state: MatchState, alpha: number) {
    const seen = new Set<number>();
    for (const spell of state.spells) {
      seen.add(spell.id);
      let view = this.spells.get(spell.id);
      const card = getCard(spell.card);
      if (!view) {
        view = new SpellView(spell, card, this.textures.get(card.sprite.url)!);
        this.spells.set(spell.id, view);
        this.world.add(view.sprite, view.marker);
      }
      const k = Math.min(1, (view.total - spell.ticks + alpha) / view.total);
      view.sprite.position.lerpVectors(view.from, new THREE.Vector3(spell.x, 0.3, spell.z), k * k);
      view.sprite.material.rotation += 0.15;
      if (Math.random() < 0.8) this.particles(view.sprite.position, k < 0.5 ? "#ffcf4a" : card.id === "comet" ? "#9fe8ff" : "#ff6a1a", 1, 1.2, 0.35, 0);
    }
    for (const [id, view] of this.spells) {
      if (seen.has(id)) continue;
      this.spells.delete(id);
      this.world.remove(view.sprite, view.marker);
      view.sprite.material.dispose();
      (view.marker.material as THREE.Material).dispose();
    }
  }

  // ---------- effects ----------

  private corpse(u: UnitView) {
    u.sprite.material.transparent = true;
    u.hpBar.sprite.visible = false;
    const cx = u.x;
    const cz = u.z;
    this.particles(new THREE.Vector3(cx, u.y + u.height * 0.5, cz), "#b8f0ff", 10, 3, 0.6, -1);
    this.particles(new THREE.Vector3(cx, u.y + u.height * 0.5, cz), "#8a0f1f", 6, 3, 0.5, 8);
    let t = 0;
    this.tweens.push((dt) => {
      t += dt;
      const k = Math.min(1, t / 0.45);
      u.sprite.material.opacity = 1 - k;
      u.sprite.position.y += dt * 1.5;
      u.sprite.scale.set(u.width * (1 + k * 0.4), u.height * (1 - k * 0.6), 1);
      (u.shadow.material as THREE.MeshBasicMaterial).opacity = 0.4 * (1 - k);
      (u.ring.material as THREE.MeshBasicMaterial).opacity = 0.6 * (1 - k);
      if (k < 1) return true;
      this.world.remove(...u.objects);
      u.dispose();
      return false;
    });
  }

  private explosion(at: THREE.Vector3, radius: number) {
    this.particles(new THREE.Vector3(at.x, 0.4, at.z), "#ffdd55", 26, 7, 0.7, 12);
    this.particles(new THREE.Vector3(at.x, 0.4, at.z), "#ff5a1a", 26, 5, 0.9, 10);
    this.particles(new THREE.Vector3(at.x, 0.3, at.z), "#4a3a3a", 16, 3, 1.2, 3);
    this.ringFx(at, "#ffb040", radius * 1.4, 0.45);
    const scorch = new THREE.Mesh(SHADOW_GEO, new THREE.MeshBasicMaterial({ color: "#050204", transparent: true, opacity: 0.6, depthWrite: false }));
    scorch.rotation.x = -Math.PI / 2;
    scorch.position.set(at.x, 0.025, at.z);
    scorch.scale.setScalar(radius * 0.8);
    const flash = new THREE.PointLight("#ffaa44", 60, 14, 1.5);
    flash.position.set(at.x, 2, at.z);
    this.world.add(scorch, flash);
    let t = 0;
    this.tweens.push((dt) => {
      t += dt;
      flash.intensity = Math.max(0, 60 * (1 - t / 0.4));
      (scorch.material as THREE.MeshBasicMaterial).opacity = 0.6 * Math.max(0, 1 - t / 4);
      if (t < 4) return true;
      this.world.remove(scorch, flash);
      (scorch.material as THREE.Material).dispose();
      return false;
    });
    this.shake = Math.max(this.shake, 0.6);
  }

  private particles(at: THREE.Vector3, color: string, n: number, speed: number, life: number, gravity: number) {
    for (let i = 0; i < n; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ color, fog: false, transparent: true }));
      const size = 0.12 + Math.random() * 0.12;
      s.scale.set(size, size, 1);
      s.position.copy(at);
      this.world.add(s);
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8 + 0.2, Math.random() - 0.5)
        .normalize()
        .multiplyScalar(speed * (0.4 + Math.random() * 0.6));
      const max = life * (0.6 + Math.random() * 0.6);
      let t = 0;
      this.tweens.push((dt) => {
        t += dt;
        v.y -= gravity * dt;
        s.position.addScaledVector(v, dt);
        if (s.position.y < 0.05) {
          s.position.y = 0.05;
          v.set(v.x * 0.5, 0, v.z * 0.5);
        }
        s.material.opacity = 1 - t / max;
        if (t < max) return true;
        this.world.remove(s);
        s.material.dispose();
        return false;
      });
    }
  }

  private ringFx(at: THREE.Vector3, color: string, radius: number, dur: number) {
    const m = new THREE.Mesh(RING_GEO, new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(at.x, 0.06, at.z);
    this.world.add(m);
    let t = 0;
    this.tweens.push((dt) => {
      t += dt;
      const k = t / dur;
      m.scale.setScalar(0.2 + k * radius);
      (m.material as THREE.MeshBasicMaterial).opacity = 1 - k;
      if (k < 1) return true;
      this.world.remove(m);
      (m.material as THREE.Material).dispose();
      return false;
    });
  }
}

function projectileColor(p: Projectile) {
  if (p.source === "princess" || p.source === "king") return p.team === 0 ? "#ffae42" : "#d18cff";
  switch (p.source) {
    case "skull":
      return "#f3ecd0";
    case "ufo":
      return "#7cff6b";
    case "scarecrow":
      return "#ffb347";
    case "candle":
      return "#ff7a2a";
    case "imp":
      return "#ff5a5a";
    default:
      return "#ffffff";
  }
}

export function openPockets(state: MatchState, team: Team) {
  return state.towers.filter((t) => t.team !== team && t.tower === "princess" && t.destroyed).map((t) => (t.x < 0 ? -1 : 1));
}
