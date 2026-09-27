import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  FogExp2,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NearestFilter,
  PlaneGeometry,
  PointLight,
  Points,
  PointsMaterial,
  RepeatWrapping,
  SphereGeometry,
  type Scene,
  SRGBColorSpace,
  type Texture,
  Vector3,
} from "three";

// The room the cabinet stands in: a cramped, hidden 70s tech den, the cabinet
// pushed up against its back wall. Walnut-panelled walls with a 70s stripe
// band, brown shag carpet, a low drop ceiling with a bare bulb, a window onto
// the night, stacks of old TVs glowing with static, colour bars and a
// terminal crammed in beside the cabinet, shelves of tapes, and dust hanging
// in the warm light. Built cheap: painted textures, a few boxes, instanced
// tapes, no shadows.

const STRIPES = ["#f2b33d", "#e8772e", "#c9452c", "#7b3a1e"];
const FOG = new Color("#0b0706");
const WALL_Z = -0.6; // right behind the cabinet
const ROOM_WIDTH = 5.2;
const ROOM_DEPTH = 6;
const ROOM_HEIGHT = 2.9;

export type CassetteRoom = {
  update: (time: number) => void;
  dispose: () => void;
};

function canvasTexture(width: number, height: number, paint: (context: CanvasRenderingContext2D) => void, srgb = true) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (context) paint(context);
  const texture = new CanvasTexture(canvas);
  if (srgb) texture.colorSpace = SRGBColorSpace;
  return texture;
}

function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

// Walnut panelling, grooved every so often, with the stripe band across it.
// One tile is 2 units wide and the room's full height; it repeats sideways.
function wallTexture() {
  const pxPerUnit = 128;
  const width = 2 * pxPerUnit;
  const height = ROOM_HEIGHT * pxPerUnit;
  const texture = canvasTexture(width, height, (context) => {
    const random = seeded(11);
    context.fillStyle = "#2a1810";
    context.fillRect(0, 0, width, height);
    // Wood grain: long wavering streaks
    for (let i = 0; i < 260; i += 1) {
      const x = random() * width;
      context.strokeStyle = random() > 0.5 ? "rgba(70, 40, 22, 0.35)" : "rgba(12, 6, 3, 0.35)";
      context.lineWidth = 0.5 + random() * 2;
      context.beginPath();
      context.moveTo(x, 0);
      for (let y = 0; y <= height; y += 40) context.lineTo(x + Math.sin(y * 0.01 + i) * 3, y);
      context.stroke();
    }
    // Grooves between the boards
    const boards = 4;
    for (let b = 0; b < boards; b += 1) {
      const x = (b * width) / boards;
      context.fillStyle = "#0c0604";
      context.fillRect(x, 0, 3, height);
      context.fillStyle = "rgba(90, 55, 30, 0.35)";
      context.fillRect(x + 3, 0, 1, height);
    }
    // The stripe band at about shoulder height, and a dark skirting board
    const bandTop = height - 1.62 * pxPerUnit;
    [14, 11, 9, 7].reduce((y, thickness, i) => {
      context.fillStyle = STRIPES[i];
      context.fillRect(0, y, width, thickness);
      return y + thickness + 4;
    }, bandTop);
    context.fillStyle = "#120a07";
    context.fillRect(0, height - 0.14 * pxPerUnit, width, 0.14 * pxPerUnit);
  });
  texture.wrapS = RepeatWrapping;
  texture.repeat.set(ROOM_WIDTH / 2, 1);
  texture.anisotropy = 4;
  return texture;
}

// Brown shag carpet with a big 70s ring pattern
function carpetTexture() {
  const size = 512;
  const texture = canvasTexture(size, size, (context) => {
    const random = seeded(3);
    context.fillStyle = "#2b170d";
    context.fillRect(0, 0, size, size);
    const rings = ["#3a1f10", "#4a2812", "#5c3314", "#3a1f10"];
    for (const [cx, cy] of [[0, 0], [size, 0], [0, size], [size, size], [size / 2, size / 2]]) {
      rings.forEach((color, i) => {
        context.strokeStyle = color;
        context.lineWidth = 22;
        context.beginPath();
        context.arc(cx, cy, 70 + i * 34, 0, Math.PI * 2);
        context.stroke();
      });
    }
    // Pile: thousands of tiny flecks
    for (let i = 0; i < 9000; i += 1) {
      context.fillStyle = random() > 0.5 ? "rgba(0, 0, 0, 0.25)" : "rgba(120, 70, 35, 0.18)";
      context.fillRect(random() * size, random() * size, 2, 2);
    }
  });
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.repeat.set(7, 4);
  texture.anisotropy = 4;
  return texture;
}

// TV pictures ---------------------------------------------------------------------------
function colourBars() {
  return canvasTexture(128, 96, (context) => {
    ["#c0c0c0", "#c0c000", "#00c0c0", "#00c000", "#c000c0", "#c00000", "#0000c0"].forEach((color, i, all) => {
      context.fillStyle = color;
      context.fillRect((i * 128) / all.length, 0, 128 / all.length + 1, 64);
    });
    context.fillStyle = "#101010";
    context.fillRect(0, 64, 128, 32);
    context.fillStyle = "#e8e8e8";
    context.font = "700 11px ui-monospace, monospace";
    context.textAlign = "center";
    context.fillText("SA-86  CH 03", 64, 84);
  });
}

function staticNoise() {
  const texture = canvasTexture(128, 128, (context) => {
    const image = context.createImageData(128, 128);
    for (let i = 0; i < image.data.length; i += 4) {
      const v = Math.random() * 220;
      image.data[i] = image.data[i + 1] = image.data[i + 2] = v;
      image.data[i + 3] = 255;
    }
    context.putImageData(image, 0, 0);
  });
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.repeat.set(0.5, 0.5);
  texture.magFilter = NearestFilter;
  return texture;
}

const TERMINAL_LINES = ["SA-86 BIOS v1.3", "MEM 64K OK", "TAPE DRIVE.. OK", "SCANNER..... OK", "", "LOAD \"*\",8,1", "READY."];
function terminal() {
  const canvas = document.createElement("canvas");
  canvas.width = 160;
  canvas.height = 120;
  const context = canvas.getContext("2d")!;
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const paint = (cursor: boolean) => {
    context.fillStyle = "#031a08";
    context.fillRect(0, 0, 160, 120);
    context.fillStyle = "#39ff6a";
    context.font = "700 11px ui-monospace, Menlo, Consolas, monospace";
    TERMINAL_LINES.forEach((line, i) => context.fillText(line, 8, 16 + i * 14));
    if (cursor) context.fillRect(8, 16 + TERMINAL_LINES.length * 14 - 10, 7, 11);
    texture.needsUpdate = true;
  };
  paint(true);
  return { texture, paint };
}

// The night outside the window: deep blue haze, stars, a hazy moon over a treeline
function nightSky() {
  return canvasTexture(256, 208, (context) => {
    const random = seeded(5);
    const sky = context.createLinearGradient(0, 0, 0, 208);
    sky.addColorStop(0, "#03040c");
    sky.addColorStop(0.6, "#0d1230");
    sky.addColorStop(1, "#1c1638");
    context.fillStyle = sky;
    context.fillRect(0, 0, 256, 208);
    for (let i = 0; i < 70; i += 1) {
      context.fillStyle = `rgba(255, 255, 255, ${0.3 + random() * 0.6})`;
      const size = random() < 0.15 ? 2 : 1;
      context.fillRect(random() * 256, random() * 150, size, size);
    }
    const halo = context.createRadialGradient(178, 52, 4, 178, 52, 50);
    halo.addColorStop(0, "rgba(220, 225, 255, 0.35)");
    halo.addColorStop(1, "rgba(220, 225, 255, 0)");
    context.fillStyle = halo;
    context.fillRect(0, 0, 256, 208);
    context.fillStyle = "#eef0ff";
    context.beginPath();
    context.arc(178, 52, 13, 0, Math.PI * 2);
    context.fill();
    // Pine tops along the bottom
    context.fillStyle = "#020306";
    context.beginPath();
    context.moveTo(0, 208);
    for (let x = 0; x <= 256; x += 8) {
      context.lineTo(x, 196 - random() * 8);
      context.lineTo(x + 4, 160 + random() * 30);
    }
    context.lineTo(256, 208);
    context.fill();
  });
}

// A drop ceiling: dark tiles in a grid
function ceilingTexture() {
  const texture = canvasTexture(128, 128, (context) => {
    context.fillStyle = "#2a2522";
    context.fillRect(0, 0, 128, 128);
    const random = seeded(17);
    for (let i = 0; i < 900; i += 1) {
      context.fillStyle = random() > 0.5 ? "rgba(0, 0, 0, 0.25)" : "rgba(255, 240, 220, 0.05)";
      context.fillRect(random() * 128, random() * 128, 1.5, 1.5);
    }
    context.fillStyle = "#0f0c0b";
    context.fillRect(0, 0, 128, 4);
    context.fillRect(0, 0, 4, 128);
  });
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.repeat.set(ROOM_WIDTH / 0.6, ROOM_DEPTH / 0.6);
  return texture;
}

function softDot() {
  return canvasTexture(64, 64, (context) => {
    const dot = context.createRadialGradient(32, 32, 0, 32, 32, 32);
    dot.addColorStop(0, "rgba(255,255,255,1)");
    dot.addColorStop(0.4, "rgba(255,255,255,0.4)");
    dot.addColorStop(1, "rgba(255,255,255,0)");
    context.fillStyle = dot;
    context.fillRect(0, 0, 64, 64);
  });
}

export function createCassetteRoom(scene: Scene): CassetteRoom {
  const disposables: { dispose: () => void }[] = [];
  const track = <T extends { dispose: () => void }>(item: T) => {
    disposables.push(item);
    return item;
  };
  const room = new Group();
  scene.add(room);
  const previousBackground = scene.background;
  const previousFog = scene.fog;
  scene.background = FOG;
  scene.fog = new FogExp2(FOG.getHex(), 0.06);

  // Walls, floor and a low drop ceiling, close in round the cabinet
  const panelling = track(new MeshStandardMaterial({ map: track(wallTexture()), roughness: 0.75, color: new Color("#3a2e28") }));
  const wall = new Mesh(track(new PlaneGeometry(ROOM_WIDTH, ROOM_HEIGHT)), panelling);
  wall.position.set(0, ROOM_HEIGHT / 2, WALL_Z);
  room.add(wall);
  const sideGeometry = track(new PlaneGeometry(ROOM_DEPTH, ROOM_HEIGHT));
  [-1, 1].forEach((side) => {
    const sideWall = new Mesh(sideGeometry, panelling);
    sideWall.rotation.y = (-side * Math.PI) / 2;
    sideWall.position.set((side * ROOM_WIDTH) / 2, ROOM_HEIGHT / 2, WALL_Z + ROOM_DEPTH / 2);
    room.add(sideWall);
  });
  const floor = new Mesh(
    track(new PlaneGeometry(ROOM_WIDTH, ROOM_DEPTH)),
    track(new MeshStandardMaterial({ map: track(carpetTexture()), roughness: 1, color: new Color("#5a473b") }))
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, -0.005, WALL_Z + ROOM_DEPTH / 2);
  room.add(floor);
  const ceiling = new Mesh(
    track(new PlaneGeometry(ROOM_WIDTH, ROOM_DEPTH)),
    track(new MeshStandardMaterial({ map: track(ceilingTexture()), roughness: 0.9 }))
  );
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(0, ROOM_HEIGHT, WALL_Z + ROOM_DEPTH / 2);
  room.add(ceiling);

  // A bare bulb hanging on its flex, swaying a touch
  const bulb = new Group();
  bulb.position.set(0.3, ROOM_HEIGHT, WALL_Z + 2.4); // over the player, just out of frame
  const flex = new Mesh(track(new BoxGeometry(0.008, 0.42, 0.008)), track(new MeshStandardMaterial({ color: new Color("#111111") })));
  flex.position.y = -0.21;
  bulb.add(flex);
  const glass = new Mesh(track(new SphereGeometry(0.045, 16, 12)), track(new MeshBasicMaterial({ color: new Color("#ffd9a0") })));
  glass.position.y = -0.46;
  bulb.add(glass);
  const bulbLight = new PointLight("#ffb56b", 1.1, 4);
  bulbLight.position.y = -0.5;
  bulb.add(bulbLight);
  room.add(bulb);

  // A window onto the night, above the left-hand TVs
  const windowWidth = 0.72;
  const windowHeight = 0.58;
  const windowAt = new Vector3(-1.22, 1.72, WALL_Z);
  const sky = new Mesh(track(new PlaneGeometry(windowWidth, windowHeight)), track(new MeshBasicMaterial({ map: track(nightSky()) })));
  sky.position.set(windowAt.x, windowAt.y, WALL_Z + 0.004);
  room.add(sky);
  const frameWood = track(new MeshStandardMaterial({ color: new Color("#26170d"), roughness: 0.6 }));
  const bar = 0.045;
  const frameDepth = 0.06;
  const frame = (w: number, h: number, x: number, y: number, z = WALL_Z + frameDepth / 2) => {
    const piece = new Mesh(track(new BoxGeometry(w, h, frameDepth)), frameWood);
    piece.position.set(windowAt.x + x, windowAt.y + y, z);
    room.add(piece);
  };
  frame(windowWidth + bar * 2, bar, 0, windowHeight / 2 + bar / 2);
  frame(windowWidth + bar * 2, bar, 0, -windowHeight / 2 - bar / 2);
  frame(bar, windowHeight, -windowWidth / 2 - bar / 2, 0);
  frame(bar, windowHeight, windowWidth / 2 + bar / 2, 0);
  // Mullions, and a sill
  frame(bar * 0.45, windowHeight, 0, 0);
  frame(windowWidth, bar * 0.45, 0, 0);
  frame(windowWidth + bar * 3.4, bar * 0.7, 0, -windowHeight / 2 - bar * 1.2, WALL_Z + 0.07);
  const moonlight = new PointLight("#8ea8ff", 0.7, 3);
  moonlight.position.set(windowAt.x, windowAt.y, WALL_Z + 0.5);
  room.add(moonlight);

  // A pool of warm light on the carpet round the cabinet
  const dot = track(softDot());
  const pool = new Mesh(
    track(new PlaneGeometry(4.5, 3)),
    track(new MeshBasicMaterial({ map: dot, color: new Color("#ff9a4a"), transparent: true, opacity: 0.22, blending: AdditiveBlending, depthWrite: false }))
  );
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(0, 0.002, 0.4);
  room.add(pool);

  // Stacks of TVs either side: beige plastic and woodgrain, their pictures glowing
  const beige = track(new MeshStandardMaterial({ color: new Color("#524a3d"), roughness: 0.6 }));
  const walnut = track(new MeshStandardMaterial({ color: new Color("#2e1b10"), roughness: 0.55 }));
  const bezel = track(new MeshStandardMaterial({ color: new Color("#1a1614"), roughness: 0.4 }));
  const noise = track(staticNoise());
  const bars = track(colourBars());
  const screen = terminal();
  track(screen.texture);
  const pictures: Texture[] = [noise, bars, screen.texture];
  type Tv = { x: number; y: number; z: number; w: number; h: number; d: number; body: MeshStandardMaterial; picture: number; turn: number };
  const TV = 0.6; // the sets' scale against the cabinet
  const tvs: Tv[] = [
    // Left stack, crammed in beside the cabinet
    { x: -1.0, y: 0, z: -0.3, w: 0.95, h: 0.72, d: 0.7, body: walnut, picture: 1, turn: 0.22 },
    { x: -0.98, y: 0.72, z: -0.32, w: 0.78, h: 0.6, d: 0.6, body: beige, picture: 0, turn: 0.18 },
    { x: -1.02, y: 1.32, z: -0.34, w: 0.6, h: 0.46, d: 0.5, body: beige, picture: 2, turn: 0.3 },
    // Right stack
    { x: 1.02, y: 0, z: -0.3, w: 0.9, h: 0.68, d: 0.68, body: beige, picture: 0, turn: -0.22 },
    { x: 1.0, y: 0.68, z: -0.32, w: 0.72, h: 0.56, d: 0.58, body: walnut, picture: 2, turn: -0.18 },
  ].map((tv) => ({ ...tv, y: tv.y * TV, w: tv.w * TV, h: tv.h * TV, d: tv.d * TV }));
  const pictureMaterials = pictures.map((map) => track(new MeshBasicMaterial({ map, color: new Color("#6a6a6a") })));
  tvs.forEach((tv) => {
    const set = new Group();
    set.position.set(tv.x, tv.y + tv.h / 2, tv.z);
    set.rotation.y = tv.turn;
    set.add(new Mesh(track(new BoxGeometry(tv.w, tv.h, tv.d)), tv.body));
    const face = new Mesh(track(new BoxGeometry(tv.w * 0.8, tv.h * 0.78, 0.02)), bezel);
    face.position.set(-tv.w * 0.06, 0, tv.d / 2);
    set.add(face);
    const picture = new Mesh(track(new PlaneGeometry(tv.w * 0.66, tv.h * 0.62)), pictureMaterials[tv.picture]);
    picture.position.set(-tv.w * 0.06, 0, tv.d / 2 + 0.012);
    set.add(picture);
    // A column of knobs beside the screen
    for (let k = 0; k < 2; k += 1) {
      const knob = new Mesh(track(new BoxGeometry(tv.w * 0.07, tv.w * 0.07, 0.04)), bezel);
      knob.position.set(tv.w * 0.4, tv.h * (0.15 - k * 0.3), tv.d / 2 + 0.01);
      set.add(knob);
    }
    room.add(set);
  });

  // Shelves of tapes against the wall, left and right of the TVs
  const shelfWood = track(new MeshStandardMaterial({ color: new Color("#24150d"), roughness: 0.7 }));
  const tapeGeometry = track(new BoxGeometry(0.028, 0.105, 0.07));
  const random = seeded(29);
  const tapeColors = ["#e8772e", "#f2b33d", "#c9452c", "#eadcc0", "#1d1b20", "#6b8f71", "#2f5d8a", "#7b3a1e", "#d8d0bf"];
  // Into the corners
  [-2.1, 2.1].forEach((x) => {
    const unit = new Group();
    unit.position.set(x, 0, WALL_Z + 0.17);
    const width = 0.9;
    const rows = 4;
    const pitch = 0.36;
    for (let r = 0; r <= rows; r += 1) {
      const plank = new Mesh(track(new BoxGeometry(width, 0.025, 0.3)), shelfWood);
      plank.position.set(0, 0.3 + r * pitch, 0);
      unit.add(plank);
    }
    [-1, 1].forEach((side) => {
      const upright = new Mesh(track(new BoxGeometry(0.03, rows * pitch + 0.33, 0.3)), shelfWood);
      upright.position.set((side * width) / 2, (rows * pitch + 0.33) / 2, 0);
      unit.add(upright);
    });
    const perRow = 38;
    const tapes = new InstancedMesh(tapeGeometry, track(new MeshStandardMaterial({ roughness: 0.5, color: new Color("#6b6b6b") })), rows * perRow);
    const matrix = new Matrix4();
    let n = 0;
    for (let r = 0; r < rows; r += 1) {
      let cursor = -width / 2 + 0.04;
      while (cursor < width / 2 - 0.05 && n < rows * perRow) {
        // Now and then a gap, or a tape leaning
        if (random() < 0.06) {
          cursor += 0.06;
          continue;
        }
        const lean = random() < 0.05 ? 0.25 : 0;
        matrix.makeRotationZ(lean).setPosition(cursor, 0.3 + r * pitch + 0.065, 0.02);
        tapes.setMatrixAt(n, matrix);
        tapes.setColorAt(n, new Color(tapeColors[Math.floor(random() * tapeColors.length)]));
        n += 1;
        cursor += 0.031;
      }
    }
    tapes.count = n;
    unit.add(tapes);
    room.add(unit);
  });

  const tvLight = new PointLight("#7fd6ff", 0.35, 2.5);
  tvLight.position.set(-0.9, 0.6, 0.1);
  room.add(tvLight);

  // Dust hanging in the light
  const moteCount = 160;
  const motes = new Float32Array(moteCount * 3);
  for (let i = 0; i < moteCount; i += 1) {
    motes[i * 3] = (random() - 0.5) * (ROOM_WIDTH - 0.4);
    motes[i * 3 + 1] = random() * ROOM_HEIGHT;
    motes[i * 3 + 2] = WALL_Z + random() * 3;
  }
  const moteGeometry = track(new BufferGeometry());
  moteGeometry.setAttribute("position", new BufferAttribute(motes, 3));
  const dust = new Points(
    moteGeometry,
    track(new PointsMaterial({ map: dot, color: new Color("#ffcf99"), size: 0.035, transparent: true, opacity: 0.3, depthWrite: false, blending: AdditiveBlending }))
  );
  room.add(dust);

  let lastNoise = 0;
  let lastCursor = 0;
  const origin = new Vector3();
  return {
    update(time) {
      // Static jumps about; the terminal's cursor blinks
      if (time - lastNoise > 0.05) {
        lastNoise = time;
        noise.offset.set(Math.random(), Math.random());
      }
      const cursorOn = Math.floor(time * 2) % 2 === 0;
      if (Math.floor(time * 2) !== lastCursor) {
        lastCursor = Math.floor(time * 2);
        screen.paint(cursorOn);
      }
      bulb.rotation.z = Math.sin(time * 0.7) * 0.03;
      // Dust drifts slowly
      dust.position.copy(origin).set(Math.sin(time * 0.05) * 0.2, Math.sin(time * 0.08) * 0.1, 0);
    },
    dispose() {
      scene.remove(room);
      scene.background = previousBackground;
      scene.fog = previousFog;
      disposables.forEach((item) => item.dispose());
    },
  };
}
