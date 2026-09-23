import {
  AdditiveBlending,
  AmbientLight,
  Box3,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  DoubleSide,
  FogExp2,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Points,
  PointsMaterial,
  RepeatWrapping,
  Scene,
  SRGBColorSpace,
} from "three";

// Spooky backdrop for the arcade carousel, built to stay cheap: no extra lights or
// shadows, a handful of flat meshes, one Points cloud, and textures painted once.

const FOG_COLOR = new Color("#1d0d27");

function canvasTexture(width: number, height: number, paint: (context: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (context) paint(context);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

// Night sky: purple haze toward the horizon and a hazy moon, painted once
function skyTexture() {
  return canvasTexture(1024, 512, (context) => {
    const sky = context.createLinearGradient(0, 0, 0, 512);
    sky.addColorStop(0, "#05030a");
    sky.addColorStop(0.55, "#140a22");
    sky.addColorStop(0.8, "#26102e");
    sky.addColorStop(1, "#0a050e");
    context.fillStyle = sky;
    context.fillRect(0, 0, 1024, 512);

    const moonX = 790;
    const moonY = 120;
    const halo = context.createRadialGradient(moonX, moonY, 4, moonX, moonY, 110);
    halo.addColorStop(0, "rgba(214, 196, 255, 0.22)");
    halo.addColorStop(1, "rgba(214, 196, 255, 0)");
    context.fillStyle = halo;
    context.fillRect(0, 0, 1024, 512);
    context.fillStyle = "rgba(236, 228, 255, 0.55)";
    context.beginPath();
    context.arc(moonX, moonY, 11, 0, Math.PI * 2);
    context.fill();

    // A few faint stars
    for (let i = 0; i < 90; i += 1) {
      const x = (i * 197.3) % 1024;
      const y = (i * 71.9) % 300;
      context.fillStyle = `rgba(255, 255, 255, ${0.15 + ((i * 13) % 10) / 30})`;
      context.fillRect(x, y, 1.5, 1.5);
    }
  });
}

// Dark flagstones with a vignette, tiled across the floor disc
function floorTexture() {
  const texture = canvasTexture(512, 512, (context) => {
    context.fillStyle = "#0d0a10";
    context.fillRect(0, 0, 512, 512);
    const tile = 128;
    for (let ty = 0; ty < 4; ty += 1) {
      for (let tx = 0; tx < 4; tx += 1) {
        const shade = 16 + ((tx * 7 + ty * 13) % 9);
        context.fillStyle = `rgb(${shade}, ${shade - 3}, ${shade + 4})`;
        context.fillRect(tx * tile + 3, ty * tile + 3, tile - 6, tile - 6);
      }
    }
  });
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(28, 28);
  return texture;
}

function softDotTexture() {
  return canvasTexture(64, 64, (context) => {
    const dot = context.createRadialGradient(32, 32, 0, 32, 32, 32);
    dot.addColorStop(0, "rgba(255,255,255,1)");
    dot.addColorStop(0.4, "rgba(255,255,255,0.45)");
    dot.addColorStop(1, "rgba(255,255,255,0)");
    context.fillStyle = dot;
    context.fillRect(0, 0, 64, 64);
  });
}

// Soft lumpy fog, deterministic so it looks the same on every visit
function mistTexture() {
  return canvasTexture(512, 512, (context) => {
    for (let i = 0; i < 26; i += 1) {
      const x = (i * 131) % 512;
      const y = (i * 227) % 512;
      const r = 70 + ((i * 37) % 90);
      const puff = context.createRadialGradient(x, y, 0, x, y, r);
      puff.addColorStop(0, "rgba(150, 110, 200, 0.18)");
      puff.addColorStop(1, "rgba(150, 110, 200, 0)");
      context.fillStyle = puff;
      context.fillRect(0, 0, 512, 512);
    }
  });
}

export type ArcadeAmbience = {
  update: (time: number, delta: number) => void;
  dispose: () => void;
};

export function createArcadeAmbience({
  scene,
  ambientLight,
  machines,
  neonColors,
  glowLevel,
}: {
  scene: Scene;
  ambientLight: AmbientLight;
  machines: Group[];
  neonColors: string[];
  // Current brightness of each cabinet's neon sign (0..1), so floor glow flickers with it
  glowLevel: (index: number, time: number) => number;
}): ArcadeAmbience {
  const disposables: { dispose: () => void }[] = [];
  const track = <T extends { dispose: () => void }>(item: T) => {
    disposables.push(item);
    return item;
  };
  const isSmallScreen = window.matchMedia("(max-width: 768px)").matches;

  const sky = track(skyTexture());
  const previousBackground = scene.background;
  const previousFog = scene.fog;
  scene.background = sky;
  scene.fog = new FogExp2(FOG_COLOR.getHex(), 0.06);

  const floorY = machines.length > 0 ? new Box3().setFromObject(machines[0]).min.y : 0;
  const added: Mesh[] = [];

  const floor = new Mesh(
    track(new CircleGeometry(45, 48)),
    // The scene's key light is tuned for the cabinets, so tint the floor well down to keep it dark stone
    track(new MeshStandardMaterial({ map: track(floorTexture()), color: new Color("#2a2233"), roughness: 0.95, metalness: 0 }))
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = floorY - 0.01;
  scene.add(floor);
  added.push(floor);

  // Neon light spilling onto the floor in front of each cabinet
  const dot = track(softDotTexture());
  const poolGeometry = track(new PlaneGeometry(3.4, 2.4));
  const pools = machines.map((_, index) => {
    const material = track(
      new MeshBasicMaterial({
        map: dot,
        color: new Color(neonColors[index % neonColors.length]),
        transparent: true,
        opacity: 0.5,
        blending: AdditiveBlending,
        depthWrite: false,
        fog: false,
      })
    );
    const pool = new Mesh(poolGeometry, material);
    pool.rotation.x = -Math.PI / 2;
    pool.position.y = floorY + 0.005;
    scene.add(pool);
    added.push(pool);
    return pool;
  });

  // Slow drifting ground mist
  const mist = track(mistTexture());
  const mistLayers = [0.12, 0.35, 0.6].map((height, index) => {
    const layer = new Mesh(
      track(new CircleGeometry(13, 32)),
      track(
        new MeshBasicMaterial({
          map: mist,
          transparent: true,
          opacity: 0.35 - index * 0.08,
          depthWrite: false,
          side: DoubleSide,
          fog: false,
        })
      )
    );
    layer.rotation.x = -Math.PI / 2;
    layer.position.y = floorY + height;
    scene.add(layer);
    added.push(layer);
    return layer;
  });

  // Embers drifting upward; positions are nudged on the CPU (a few hundred numbers per frame)
  const emberCount = isSmallScreen ? 60 : 120;
  const emberPositions = new Float32Array(emberCount * 3);
  const emberSpeeds = new Float32Array(emberCount);
  for (let i = 0; i < emberCount; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const distance = 2.5 + Math.random() * 8;
    emberPositions[i * 3] = Math.sin(angle) * distance;
    emberPositions[i * 3 + 1] = floorY + Math.random() * 5;
    emberPositions[i * 3 + 2] = Math.cos(angle) * distance;
    emberSpeeds[i] = 0.15 + Math.random() * 0.35;
  }
  const emberGeometry = track(new BufferGeometry());
  emberGeometry.setAttribute("position", new BufferAttribute(emberPositions, 3));
  const embers = new Points(
    emberGeometry,
    track(
      new PointsMaterial({
        map: dot,
        color: new Color("#ff9a4d"),
        size: 0.07,
        transparent: true,
        opacity: 0.8,
        blending: AdditiveBlending,
        depthWrite: false,
      })
    )
  );
  scene.add(embers);

  // Distant lightning every 15-25s: a quick double flash of the ambient light
  const baseAmbient = ambientLight.intensity;
  let nextLightning = 6 + Math.random() * 8;

  const update = (time: number, delta: number) => {
    machines.forEach((machine, index) => {
      const pool = pools[index];
      const outward = 1 + 0.7 / 5; // just in front of the cabinet, which faces away from the centre
      pool.position.x = machine.position.x * outward;
      pool.position.z = machine.position.z * outward;
      pool.rotation.z = Math.atan2(machine.position.x, machine.position.z);
      (pool.material as MeshBasicMaterial).opacity = 0.5 * glowLevel(index, time);
    });

    mistLayers.forEach((layer, index) => {
      layer.rotation.z = time * (0.012 + index * 0.006) * (index % 2 ? -1 : 1);
    });

    const positions = emberGeometry.getAttribute("position") as BufferAttribute;
    for (let i = 0; i < emberCount; i += 1) {
      let y = positions.getY(i) + emberSpeeds[i] * delta;
      if (y > floorY + 5) y = floorY;
      positions.setY(i, y);
      positions.setX(i, positions.getX(i) + Math.sin(time * 0.8 + i) * 0.002);
    }
    positions.needsUpdate = true;

    if (time > nextLightning) {
      const since = time - nextLightning;
      ambientLight.intensity = since < 0.08 || (since > 0.2 && since < 0.26) ? baseAmbient * 4 : baseAmbient;
      if (since > 0.3) {
        ambientLight.intensity = baseAmbient;
        nextLightning = time + 15 + Math.random() * 10;
      }
    }
  };

  const dispose = () => {
    added.forEach((mesh) => scene.remove(mesh));
    scene.remove(embers);
    scene.background = previousBackground;
    scene.fog = previousFog;
    ambientLight.intensity = baseAmbient;
    disposables.forEach((item) => item.dispose());
  };

  return { update, dispose };
}

