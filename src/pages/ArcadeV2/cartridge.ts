import {
  BoxGeometry,
  CanvasTexture,
  Color,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  SRGBColorSpace,
} from "three";

// A game cartridge: a plastic shell in the game's colour with a paper label on
// the front showing the game's name, tagline and a still from its attract video.

export type CartridgeSize = { width: number; height: number; depth: number };

export type Cartridge = {
  group: Group;
  // Paint a frame from the attract video into the label's picture window.
  setPicture: (source: CanvasImageSource, width: number, height: number) => void;
  setHighlight: (amount: number) => void;
  dispose: () => void;
};

const LABEL_WIDTH = 320;
const LABEL_HEIGHT = 380;
const PICTURE = { x: 22, y: 22, width: LABEL_WIDTH - 44, height: 196 };

function paintLabel(
  context: CanvasRenderingContext2D,
  name: string,
  tagline: string,
  color: string,
  picture?: { source: CanvasImageSource; width: number; height: number }
) {
  const { width, height } = context.canvas;
  context.fillStyle = "#16101c";
  context.fillRect(0, 0, width, height);

  // Picture window: the attract video still, or a dim colour wash until it loads
  context.save();
  context.beginPath();
  context.roundRect(PICTURE.x, PICTURE.y, PICTURE.width, PICTURE.height, 10);
  context.clip();
  if (picture) {
    const scale = Math.max(PICTURE.width / picture.width, PICTURE.height / picture.height);
    const w = picture.width * scale;
    const h = picture.height * scale;
    context.drawImage(picture.source, PICTURE.x + (PICTURE.width - w) / 2, PICTURE.y + (PICTURE.height - h) * 0.3, w, h);
  } else {
    const wash = context.createLinearGradient(0, PICTURE.y, 0, PICTURE.y + PICTURE.height);
    wash.addColorStop(0, `${color}66`);
    wash.addColorStop(1, "#0a060e");
    context.fillStyle = wash;
    context.fillRect(PICTURE.x, PICTURE.y, PICTURE.width, PICTURE.height);
  }
  context.restore();
  context.strokeStyle = color;
  context.lineWidth = 4;
  context.beginPath();
  context.roundRect(PICTURE.x, PICTURE.y, PICTURE.width, PICTURE.height, 10);
  context.stroke();

  // Name, shrunk to fit, in the site's spooky display font
  const label = name.replace(/[‘’]/g, "'").toUpperCase();
  let fontSize = 64;
  context.font = `${fontSize}px Zombie, Creepster, cursive`;
  while (context.measureText(label).width > width - 40 && fontSize > 22) {
    fontSize -= 2;
    context.font = `${fontSize}px Zombie, Creepster, cursive`;
  }
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.shadowColor = color;
  context.shadowBlur = 16;
  context.fillStyle = "#fff6ee";
  context.fillText(label, width / 2, 272);
  context.shadowBlur = 0;

  // Tagline, wrapped onto up to two lines
  context.font = "600 21px system-ui, sans-serif";
  context.fillStyle = "rgba(255, 240, 230, 0.75)";
  const words = tagline.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (context.measureText(next).width > width - 44 && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  lines.slice(0, 2).forEach((text, i) => context.fillText(text, width / 2, 322 + i * 26));

  // Coloured stripe along the bottom edge
  context.fillStyle = color;
  context.fillRect(0, height - 12, width, 12);
}

export function createCartridge(
  name: string,
  tagline: string,
  color: string,
  size: CartridgeSize
): Cartridge {
  const group = new Group();
  const { width, height, depth } = size;
  const shellColor = new Color(color);

  const shellMaterial = new MeshStandardMaterial({
    color: shellColor,
    roughness: 0.55,
    metalness: 0.05,
    emissive: shellColor.clone().multiplyScalar(0.18),
  });
  const shell = new Mesh(new BoxGeometry(width, height, depth), shellMaterial);
  group.add(shell);

  // Grip ridges across the top of the shell
  const ridgeGeometry = new BoxGeometry(width * 0.86, height * 0.018, depth * 1.08);
  const ridges: Mesh[] = [];
  for (let i = 0; i < 3; i += 1) {
    const ridge = new Mesh(ridgeGeometry, shellMaterial);
    ridge.position.y = height * (0.44 - i * 0.045);
    group.add(ridge);
    ridges.push(ridge);
  }

  // The paper label on the front
  const canvas = document.createElement("canvas");
  canvas.width = LABEL_WIDTH;
  canvas.height = LABEL_HEIGHT;
  const context = canvas.getContext("2d");
  let picture: { source: CanvasImageSource; width: number; height: number } | undefined;
  const repaint = () => {
    if (context) paintLabel(context, name, tagline, color, picture);
    texture.needsUpdate = true;
  };
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  repaint();
  // The first paint may use a fallback font; repaint once the Zombie web font is ready
  document.fonts?.load("64px Zombie").then(repaint).catch(() => {});

  const labelMaterial = new MeshStandardMaterial({
    map: texture,
    roughness: 0.8,
    emissive: new Color("#ffffff"),
    emissiveMap: texture,
    emissiveIntensity: 0.35,
  });
  const labelWidth = width * 0.84;
  const labelGeometry = new PlaneGeometry(labelWidth, labelWidth * (LABEL_HEIGHT / LABEL_WIDTH));
  const labelMesh = new Mesh(labelGeometry, labelMaterial);
  labelMesh.position.set(0, -height * 0.06, depth / 2 + 0.002);
  group.add(labelMesh);

  return {
    group,
    setPicture: (source, w, h) => {
      // Copy the frame now: the video element is released right after
      const copy = document.createElement("canvas");
      copy.width = PICTURE.width;
      copy.height = PICTURE.height;
      const scale = Math.max(copy.width / w, copy.height / h);
      copy.getContext("2d")?.drawImage(source, (copy.width - w * scale) / 2, (copy.height - h * scale) * 0.3, w * scale, h * scale);
      picture = { source: copy, width: copy.width, height: copy.height };
      repaint();
    },
    setHighlight: (amount) => {
      labelMaterial.emissiveIntensity = 0.35 + amount * 0.45;
      shellMaterial.emissive.copy(shellColor).multiplyScalar(0.18 + amount * 0.35);
    },
    dispose: () => {
      shell.geometry.dispose();
      ridgeGeometry.dispose();
      labelGeometry.dispose();
      shellMaterial.dispose();
      labelMaterial.dispose();
      texture.dispose();
    },
  };
}

// Grab a still from each attract video, one at a time so phones aren't
// downloading a dozen clips at once. Calls onFrame as each one arrives.
export function loadVideoStills(
  videoUrls: (string | undefined)[],
  onFrame: (index: number, video: HTMLVideoElement) => void
) {
  let cancelled = false;
  let current: HTMLVideoElement | null = null;

  const next = (index: number) => {
    if (cancelled || index >= videoUrls.length) return;
    const url = videoUrls[index];
    if (!url) {
      next(index + 1);
      return;
    }
    const video = document.createElement("video");
    current = video;
    video.crossOrigin = "anonymous";
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    const done = () => {
      video.removeAttribute("src");
      video.load();
      next(index + 1);
    };
    video.addEventListener("loadedmetadata", () => {
      video.currentTime = Math.min(2, (video.duration || 4) * 0.25);
    }, { once: true });
    video.addEventListener("seeked", () => {
      if (!cancelled && video.videoWidth) onFrame(index, video);
      done();
    }, { once: true });
    video.addEventListener("error", done, { once: true });
    video.src = url;
  };
  next(0);

  return () => {
    cancelled = true;
    if (current) {
      current.removeAttribute("src");
      current.load();
    }
  };
}
