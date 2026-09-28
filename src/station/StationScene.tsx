import { useEffect, useRef } from "react";
import {
  AdditiveBlending,
  Box3,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  Color,
  Float32BufferAttribute,
  FogExp2,
  Group,
  HemisphereLight,
  InstancedMesh,
  Material,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  Points,
  PointsMaterial,
  Raycaster,
  RepeatWrapping,
  Scene,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Texture,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import gsap from "gsap";
import { isLightweightDevice } from "../pages/Arcade/cabinetParts.ts";
import { STOPS, type StopId } from "./stops.ts";

// The Wayside Station scene: an abandoned platform with train tracks running past it,
// a station building behind, and one object per page of the site. The camera moves
// between fixed stops (see stops.ts); dragging only looks around a little.

type Props = {
  selected: StopId;
  onSelect: (id: StopId) => void;
};

const WALL_Z = -2.2;
const UP = new Vector3(0, 1, 0);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// A small canvas painter for signs, flyers and textures
function paint(width: number, height: number, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (ctx) draw(ctx, width, height);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

function signTexture(text: string, fg: string, bg: string, font = "700 96px Georgia, serif") {
  return paint(512, 128, (ctx, w, h) => {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = fg;
    ctx.lineWidth = 6;
    ctx.strokeRect(8, 8, w - 16, h - 16);
    ctx.fillStyle = fg;
    ctx.font = font;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, w / 2, h / 2 + 4, w - 40);
  });
}

function glowTexture() {
  return paint(128, 128, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, "rgba(255,190,110,0.9)");
    g.addColorStop(0.4, "rgba(255,150,60,0.35)");
    g.addColorStop(1, "rgba(255,120,40,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
}

function speckle(base: string, dots: string[], count: number, size: number) {
  return paint(256, 256, (ctx, w, h) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < count; i += 1) {
      ctx.fillStyle = dots[i % dots.length];
      ctx.fillRect(Math.random() * w, Math.random() * h, size, size);
    }
  });
}

function brickTexture() {
  const texture = paint(256, 256, (ctx, w, h) => {
    ctx.fillStyle = "#1a1512";
    ctx.fillRect(0, 0, w, h);
    const rows = 8;
    const bh = h / rows;
    for (let r = 0; r < rows; r += 1) {
      const bw = w / 4;
      for (let c = -1; c < 5; c += 1) {
        const shade = 34 + Math.floor(Math.random() * 22);
        ctx.fillStyle = `rgb(${shade + 26}, ${shade + 8}, ${shade})`;
        ctx.fillRect(c * bw + (r % 2 ? bw / 2 : 0) + 2, r * bh + 2, bw - 4, bh - 4);
      }
    }
  });
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.repeat.set(24, 3);
  return texture;
}

const standard = (color: string, roughness = 0.9, map?: Texture) =>
  new MeshStandardMaterial({ color, roughness, metalness: 0.05, map });

const box = (w: number, h: number, d: number, material: Material, x = 0, y = 0, z = 0) => {
  const mesh = new Mesh(new BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  return mesh;
};

const plane = (w: number, h: number, material: Material, x = 0, y = 0, z = 0) => {
  const mesh = new Mesh(new PlaneGeometry(w, h), material);
  mesh.position.set(x, y, z);
  return mesh;
};

// A floating name above an object so visitors can find every page at a glance
function label(text: string, y: number) {
  const material = new SpriteMaterial({
    map: signTexture(text, "#ffd9a0", "#120d08", "700 72px Georgia, serif"),
    transparent: true,
    opacity: 0.92,
    fog: false,
    depthWrite: false,
  });
  const sprite = new Sprite(material);
  sprite.scale.set(1.1, 0.28, 1);
  sprite.position.set(0, y, 0);
  return sprite;
}

// An invisible, slightly generous box that catches taps for one object
function hitBox(w: number, h: number, d: number, y: number) {
  const mesh = new Mesh(new BoxGeometry(w, h, d), new MeshBasicMaterial({ visible: false }));
  mesh.position.y = y;
  return mesh;
}

function buildBulletin() {
  const group = new Group();
  group.position.set(-5, 1.65, WALL_Z + 0.15);
  group.add(box(2.5, 1.55, 0.08, standard("#3a2a1c")));
  const cork = plane(2.35, 1.4, standard("#8a6a44", 1, speckle("#8a6a44", ["#755738", "#9c7b52", "#6a4d30"], 900, 3)), 0, 0, 0.045);
  group.add(cork);
  const paper = ["#f2ead2", "#e8d9a8", "#d7c9b0", "#cfd8c8", "#f0d6c0", "#e6e2d8"];
  paper.forEach((color, i) => {
    const note = plane(0.42, 0.55, standard(color, 1), -0.85 + (i % 3) * 0.85, 0.32 - Math.floor(i / 3) * 0.7, 0.06);
    note.rotation.z = ((i * 37) % 11) / 60 - 0.09;
    group.add(note);
  });
  group.add(plane(1.6, 0.25, new MeshBasicMaterial({ map: signTexture("WAYSIDE STATION", "#ffd9a0", "#120d08", "700 64px Georgia, serif") }), 0, 0.98, 0.02));
  group.add(label("BULLETIN", 1.5));
  group.add(hitBox(2.7, 1.9, 0.6, 0.1));
  group.userData.stopId = "bulletin";
  return group;
}

function buildArcade() {
  const group = new Group();
  group.position.set(-2, 0, -1.7);
  const placeholder = new Group();
  placeholder.add(box(0.85, 1.9, 0.8, standard("#2b1a3a"), 0, 0.95, 0));
  placeholder.add(plane(0.6, 0.45, new MeshBasicMaterial({ color: "#5cffb1" }), 0, 1.3, 0.41));
  group.add(placeholder);
  // Reuse the arcade's cabinet model; keep the placeholder if it can't load
  new GLTFLoader().load(
    "/models/ArcadeCabinet.glb",
    (gltf) => {
      const model = gltf.scene;
      const size = new Box3().setFromObject(model).getSize(new Vector3());
      const scale = 1.9 / Math.max(size.y, 0.001);
      model.scale.setScalar(scale);
      const bounds = new Box3().setFromObject(model);
      const center = bounds.getCenter(new Vector3());
      model.position.set(-center.x, -bounds.min.y, -center.z);
      group.remove(placeholder);
      group.add(model);
    },
    undefined,
    () => undefined
  );
  group.add(label("ARCADE", 2.25));
  group.add(hitBox(1.2, 2.2, 1.1, 1.1));
  group.userData.stopId = "arcade";
  return group;
}

function buildEvents() {
  const group = new Group();
  group.position.set(1, 0, -1.0);
  const wood = standard("#4a3524");
  group.add(box(1.7, 0.07, 0.9, wood, 0, 0.82, 0));
  [-0.75, 0.75].forEach((x) => [-0.35, 0.35].forEach((z) => group.add(box(0.07, 0.82, 0.07, wood, x, 0.41, z))));
  const flyers: [string, string, string, number][] = [
    ["SCARE-ATHON", "#ff7a1a", "#1a0d05", -0.5],
    ["COMING SOON", "#2a2f3a", "#9aa4b8", 0.05],
    ["COMING SOON", "#2a2f3a", "#9aa4b8", 0.55],
  ];
  flyers.forEach(([title, bg, fg, x], i) => {
    const material = new MeshBasicMaterial({
      map: paint(256, 340, (ctx, w, h) => {
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = fg;
        ctx.lineWidth = 6;
        ctx.strokeRect(10, 10, w - 20, h - 20);
        ctx.fillStyle = fg;
        ctx.font = "700 44px Georgia, serif";
        ctx.textAlign = "center";
        ctx.fillText(title, w / 2, h / 2, w - 40);
      }),
    });
    const flyer = plane(0.36, 0.48, material, x, 0.86, 0.02);
    flyer.rotation.x = -Math.PI / 2;
    flyer.rotation.z = (i - 1) * 0.25;
    group.add(flyer);
  });
  group.add(label("EVENTS", 1.35));
  group.add(hitBox(1.9, 0.9, 1.1, 0.6));
  group.userData.stopId = "events";
  return group;
}

function buildDepartures() {
  const group = new Group();
  group.position.set(4, 2.8, WALL_Z + 0.2);
  group.add(box(2.7, 1.05, 0.1, standard("#15181f")));
  const face = paint(512, 200, (ctx, w, h) => {
    ctx.fillStyle = "#0a0c10";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#ffb03a";
    ctx.font = "700 30px monospace";
    ctx.fillText("DEPARTURES", 20, 40);
    ctx.font = "26px monospace";
    ctx.fillText("19:31  SCAREBOARD    ON TIME", 20, 88);
    ctx.fillText("22:15  CALENDAR      DELAYED", 20, 128);
    ctx.fillText("23:59  ARCADE        BOARDING", 20, 168);
  });
  group.add(plane(2.55, 0.95, new MeshBasicMaterial({ map: face }), 0, 0, 0.056));
  [-1.1, 1.1].forEach((x) => group.add(box(0.03, 0.9, 0.03, standard("#222"), x, 0.95, 0)));
  group.add(label("DEPARTURES", 0.85));
  group.add(hitBox(2.9, 1.3, 0.6, 0));
  group.userData.stopId = "departures";
  return group;
}

function buildTickets() {
  const group = new Group();
  group.position.set(7, 0, -1.85);
  group.add(box(1.9, 2.5, 0.5, standard("#2a2f3a"), 0, 1.25, 0));
  group.add(plane(1.05, 0.8, new MeshBasicMaterial({ color: "#ffcf80" }), 0, 1.55, 0.26));
  group.add(box(1.3, 0.06, 0.35, standard("#4a3524"), 0, 1.1, 0.38));
  group.add(plane(1.4, 0.35, new MeshBasicMaterial({ map: signTexture("TICKETS", "#ffd9a0", "#120d08", "700 80px Georgia, serif") }), 0, 2.15, 0.26));
  group.add(label("TICKETS", 2.75));
  group.add(hitBox(2.1, 2.7, 0.9, 1.3));
  group.userData.stopId = "tickets";
  return group;
}

export default function StationScene({ selected, onSelect }: Props) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const goRef = useRef<((id: StopId) => void) | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const selectedRef = useRef(selected);
  selectedRef.current = selected;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const lightweight = isLightweightDevice();
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const renderer = new WebGLRenderer({ antialias: !lightweight });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, lightweight ? 1.5 : 2));
    mount.appendChild(renderer.domElement);

    const scene = new Scene();
    const night = new Color("#080b12");
    scene.background = night;
    scene.fog = new FogExp2(night, 0.07);
    const camera = new PerspectiveCamera(60, 1, 0.1, 200);

    // Light: a cold wash and a few warm lamps under the canopy
    scene.add(new HemisphereLight("#8fa0c8", "#241a12", 1.1));
    const lamps: PointLight[] = [];
    [-9, -2, 5, 12].forEach((x, i) => {
      const lamp = new PointLight("#ffb060", 28, 12, 2);
      lamp.position.set(x, 3.6, -0.6);
      scene.add(lamp);
      lamps.push(lamp);
      const bulb = box(0.3, 0.1, 0.3, new MeshBasicMaterial({ color: i === 2 ? "#ffd9a0" : "#ffe2b8" }), x, 3.75, -0.6);
      scene.add(bulb);
    });

    // Platform, building, canopy
    const floorTex = speckle("#4a4a4c", ["#3c3c3e", "#57575a", "#444"], 1400, 2);
    floorTex.wrapS = floorTex.wrapT = RepeatWrapping;
    floorTex.repeat.set(30, 2);
    const platform = box(60, 0.85, 3.4, standard("#555", 0.95, floorTex), 10, -0.425, -0.5);
    scene.add(platform);
    scene.add(box(60, 5, 0.2, standard("#8a7f78", 1, brickTexture()), 10, 2.5, WALL_Z - 0.1));
    scene.add(box(60, 0.12, 4.2, standard("#1c1f26"), 10, 4.1, -0.3));
    for (let x = -8; x <= 32; x += 6) scene.add(box(0.14, 4.1, 0.14, standard("#20232b"), x, 2.05, 1.0));
    const line = plane(60, 0.12, new MeshBasicMaterial({ color: "#c9a227" }), 10, 0.006, 0.95);
    line.rotation.x = -Math.PI / 2;
    scene.add(line);

    // Tracks: gravel bed, two rails, sleepers running off into the fog
    const bed = plane(200, 40, standard("#25221f", 1, speckle("#25221f", ["#302c28", "#1c1a18"], 700, 2)), 10, -0.85, 21);
    bed.rotation.x = -Math.PI / 2;
    scene.add(bed);
    const railMaterial = standard("#6b6f78", 0.5);
    [2.6, 4.035].forEach((z) => scene.add(box(200, 0.15, 0.1, railMaterial, 10, -0.72, z)));
    const sleepers = new InstancedMesh(new BoxGeometry(0.28, 0.12, 2.3), standard("#2e2218"), 260);
    const m = new Matrix4();
    for (let i = 0; i < 260; i += 1) {
      m.makeTranslation(-50 + i * 0.7, -0.79, 3.3);
      sleepers.setMatrixAt(i, m);
    }
    scene.add(sleepers);

    // Stars
    const starPositions: number[] = [];
    for (let i = 0; i < 160; i += 1) {
      const a = Math.random() * Math.PI * 2;
      const e = 0.15 + Math.random() * 1.2;
      starPositions.push(Math.cos(a) * Math.cos(e) * 90, Math.sin(e) * 90, Math.sin(a) * Math.cos(e) * 90);
    }
    const starGeometry = new BufferGeometry();
    starGeometry.setAttribute("position", new Float32BufferAttribute(starPositions, 3));
    scene.add(new Points(starGeometry, new PointsMaterial({ color: "#cfd8ff", size: 1.6, sizeAttenuation: false, fog: false })));

    // A train's headlights now and then, far down the line
    const headlight = new Sprite(new SpriteMaterial({ map: glowTexture(), blending: AdditiveBlending, transparent: true, fog: false, depthWrite: false }));
    headlight.scale.set(2.2, 2.2, 1);
    headlight.visible = false;
    scene.add(headlight);

    // The objects
    const objects = [buildBulletin(), buildArcade(), buildEvents(), buildDepartures(), buildTickets()];
    objects.forEach((o) => scene.add(o));
    const glowMap = glowTexture();
    const glows = objects.map((o) => {
      const sprite = new Sprite(new SpriteMaterial({ map: glowMap, blending: AdditiveBlending, transparent: true, opacity: 0, fog: false, depthWrite: false }));
      sprite.scale.set(2.6, 2.6, 1);
      const stop = STOPS[o.userData.stopId as StopId];
      sprite.position.set(stop.target[0], stop.target[1] - 0.2, WALL_Z + 0.9);
      scene.add(sprite);
      return sprite;
    });

    // Camera: fixed stops, tweened. `pull` backs close-ups off on tall phone screens.
    const view = { px: 0, py: 0, pz: 0, tx: 0, ty: 0, tz: 0 };
    const look = { yaw: 0, pitch: 0 };
    let pull = 1;
    const poseFor = (id: StopId) => {
      const stop = STOPS[id];
      const target = new Vector3(...stop.target);
      const pos = new Vector3(...stop.pos);
      if (id !== "platform") pos.copy(target).add(pos.clone().sub(target).multiplyScalar(pull));
      return { pos, target };
    };
    const goTo = (id: StopId, instant = false) => {
      const { pos, target } = poseFor(id);
      const duration = instant || reduced ? 0 : 0.9;
      gsap.killTweensOf(view);
      gsap.killTweensOf(look);
      gsap.to(view, { px: pos.x, py: pos.y, pz: pos.z, tx: target.x, ty: target.y, tz: target.z, duration, ease: "power2.inOut" });
      gsap.to(look, { yaw: 0, pitch: 0, duration: duration ? 0.6 : 0 });
    };
    goRef.current = (id) => goTo(id);

    const onResize = () => {
      const width = Math.max(mount.clientWidth, 1);
      const height = Math.max(mount.clientHeight, 1);
      renderer.setSize(width, height);
      const aspect = width / height;
      camera.aspect = aspect;
      camera.fov = aspect < 0.8 ? 78 : aspect < 1.2 ? 68 : 60;
      pull = aspect < 0.8 ? 1.5 : aspect < 1.2 ? 1.2 : 1;
      camera.updateProjectionMatrix();
      goTo(selectedRef.current, true);
    };
    const resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(mount);
    onResize();

    // Input: tap an object to go to it, drag to look around a little
    const raycaster = new Raycaster();
    const pointer = new Vector2();
    const canvas = renderer.domElement;
    let down: { x: number; y: number; t: number } | null = null;
    let last = { x: 0, y: 0 };
    let dragging = false;
    const pick = (clientX: number, clientY: number): StopId | null => {
      const rect = canvas.getBoundingClientRect();
      pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(objects, true)[0];
      let node: Object3D | null = hit ? hit.object : null;
      while (node) {
        if (node.userData.stopId) return node.userData.stopId as StopId;
        node = node.parent;
      }
      return null;
    };
    const onPointerDown = (event: PointerEvent) => {
      down = { x: event.clientX, y: event.clientY, t: performance.now() };
      last = { x: event.clientX, y: event.clientY };
      dragging = false;
      canvas.setPointerCapture(event.pointerId);
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!down) {
        canvas.style.cursor = event.pointerType === "mouse" && pick(event.clientX, event.clientY) ? "pointer" : "grab";
        return;
      }
      if (Math.hypot(event.clientX - down.x, event.clientY - down.y) > 6) dragging = true;
      if (dragging) {
        gsap.killTweensOf(look);
        look.yaw = clamp(look.yaw + (event.clientX - last.x) * 0.004, -0.6, 0.6);
        look.pitch = clamp(look.pitch + (event.clientY - last.y) * 0.003, -0.25, 0.25);
      }
      last = { x: event.clientX, y: event.clientY };
    };
    const onPointerUp = (event: PointerEvent) => {
      if (down && !dragging && performance.now() - down.t < 500) {
        const id = pick(event.clientX, event.clientY);
        if (id) onSelectRef.current(id);
        else if (selectedRef.current !== "platform") onSelectRef.current("platform");
      }
      down = null;
      dragging = false;
    };
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);

    // Render loop; paused while the tab is hidden
    let frame = 0;
    const start = performance.now();
    const animate = () => {
      frame = requestAnimationFrame(animate);
      if (document.hidden) return;
      const t = (performance.now() - start) / 1000;
      camera.position.set(view.px, view.py + Math.sin(t * 0.6) * 0.008, view.pz);
      camera.lookAt(view.tx, view.ty, view.tz);
      camera.rotateOnWorldAxis(UP, look.yaw);
      camera.rotateX(look.pitch);

      lamps[2].intensity = 28 * (0.82 + 0.18 * Math.sin(t * 7.3) * Math.sin(t * 2.1 + 1)); // a tired lamp
      const overview = selectedRef.current === "platform";
      glows.forEach((glow, i) => {
        const pulse = 0.35 + 0.2 * Math.sin(t * 1.6 + i);
        glow.material.opacity += ((overview ? pulse : 0) - glow.material.opacity) * 0.1;
      });
      const cycle = (t % 34) / 34; // a train's lights cross the far distance every ~34 s
      headlight.visible = cycle < 0.5;
      if (headlight.visible) headlight.position.set(-70 + cycle * 2 * 150, -0.2, 3.3);

      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      gsap.killTweensOf(view);
      gsap.killTweensOf(look);
      goRef.current = null;
      scene.traverse((object) => {
        const item = object as Mesh;
        item.geometry?.dispose();
        const materials = Array.isArray(item.material) ? item.material : item.material ? [item.material] : [];
        materials.forEach((material) => {
          (material as MeshStandardMaterial).map?.dispose();
          material.dispose();
        });
      });
      renderer.dispose();
      mount.removeChild(canvas);
    };
  }, []);

  useEffect(() => {
    goRef.current?.(selected);
  }, [selected]);

  return <div ref={mountRef} className="absolute inset-0 select-none" style={{ touchAction: "none" }} />;
}
