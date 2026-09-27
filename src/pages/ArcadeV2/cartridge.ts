import {
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Shape,
  ShapeGeometry,
  SRGBColorSpace,
} from "three";
import { canvasFont, whenFontReady, type ArcadeFont } from "./arcadeFonts.ts";

// A game cartridge crossed with an audio cassette: a plastic shell in the
// game's colour that tapers at the bottom like a cassette, over a gold edge
// connector for the slot. On the front, a cassette-style paper label with the
// game's name in a colour band and a still from its attract video, and below it
// a smoky window onto two tape reels that turn while the game is picked or playing.

export type CartridgeSize = { width: number; height: number; depth: number };

export type Cartridge = {
  group: Group;
  // Paint a frame from the attract video into the label's picture window.
  setPicture: (source: CanvasImageSource, width: number, height: number) => void;
  // 0 on the shelf, 1 picked; also turns the reels, faster the higher it is
  setHighlight: (amount: number) => void;
  // The barcode sticker on the back, in the cartridge's own space (it faces -z)
  sticker: { width: number; height: number; y: number; z: number };
  dispose: () => void;
};

// Cartridges are landscape: height as a fraction of width
export const CARTRIDGE_ASPECT = 0.8;

const STICKER_WIDTH = 256;
const STICKER_HEIGHT = 150;

// The back sticker: white paper, the arcade's name, a barcode and the game's name
function paintSticker(context: CanvasRenderingContext2D, name: string, color: string) {
  const { width, height } = context.canvas;
  context.fillStyle = "#f3efe6";
  context.fillRect(0, 0, width, height);
  context.fillStyle = color;
  context.fillRect(0, 0, width, 16);
  context.fillStyle = "#1a1418";
  context.font = "700 13px system-ui, sans-serif";
  context.textAlign = "left";
  context.textBaseline = "middle";
  context.fillText("SCAREATHON ARCADE", 12, 30);
  // Bars from the name, so every cartridge's code is its own
  let seed = [...name].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) >>> 0, 7);
  let x = 14;
  while (x < width - 18) {
    seed = (seed * 1103515245 + 12345) >>> 0;
    const bar = 1 + (seed % 4);
    const gap = 1 + ((seed >> 8) % 3);
    context.fillRect(x, 44, bar, 64);
    x += bar + gap;
  }
  context.font = "600 12px ui-monospace, monospace";
  context.fillText(name.replace(/[‘’]/g, "'").toUpperCase().slice(0, 28), 12, 124);
  context.fillStyle = "rgba(26, 20, 24, 0.55)";
  context.font = "10px ui-monospace, monospace";
  context.fillText(`SCR-${(seed % 90000) + 10000}  NOT FOR RESALE`, 12, 140);
}

// The label, cassette style: the name in a colour band with three stripes under
// it, the picture, then a line of small print, all on cream paper
const LABEL_WIDTH = 400;
const LABEL_HEIGHT = 245;
const BAND = 46;
const PICTURE = { x: 12, y: BAND + 18, width: LABEL_WIDTH - 24, height: 150 };
const TITLE_MAX = 34;
const PAPER = "#efe6d2";
const INK = "#2a2126";
// Stills are copied at about this size: enough for the label, small to keep
const STILL_MAX = 480;

function paintLabel(
  context: CanvasRenderingContext2D,
  name: string,
  color: string,
  font: ArcadeFont,
  picture?: { source: CanvasImageSource; width: number; height: number }
) {
  const { width, height } = context.canvas;
  context.fillStyle = PAPER;
  context.fillRect(0, 0, width, height);

  // The colour band, and three stripes in its shades under it
  context.fillStyle = color;
  context.fillRect(0, 0, width, BAND);
  const shade = new Color(color);
  [
    [shade.clone().multiplyScalar(0.62), 5],
    [shade.clone().lerp(new Color("#ffffff"), 0.35), 3],
    [shade.clone().multiplyScalar(0.62), 2],
  ].reduce((y, [tone, thickness]) => {
    context.fillStyle = `#${(tone as Color).getHexString()}`;
    context.fillRect(0, y, width, thickness as number);
    return y + (thickness as number) + 2;
  }, BAND + 2);

  // Name, shrunk to fit, in the game's own font
  const label = name.replace(/[‘’]/g, "'").toUpperCase();
  let fontSize = TITLE_MAX;
  context.font = canvasFont(font, fontSize);
  while (context.measureText(label).width > width - 28 && fontSize > 14) {
    fontSize -= 2;
    context.font = canvasFont(font, fontSize);
  }
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.shadowColor = "rgba(0, 0, 0, 0.55)";
  context.shadowBlur = 6;
  context.fillStyle = "#fff8ee";
  context.fillText(label, width / 2, BAND / 2 + 1);
  context.shadowBlur = 0;

  // Picture window: the attract video still, or a dim colour wash until it loads
  context.save();
  context.beginPath();
  context.roundRect(PICTURE.x, PICTURE.y, PICTURE.width, PICTURE.height, 6);
  context.clip();
  if (picture) {
    // Like the cabinet screen: the still blurred behind, then the whole still
    // on top, so portrait games aren't cropped to a thin slice
    const cover = Math.max(PICTURE.width / picture.width, PICTURE.height / picture.height);
    const blur = document.createElement("canvas");
    blur.width = 24;
    blur.height = Math.round((24 * PICTURE.height) / PICTURE.width);
    const blurScale = cover * (blur.width / PICTURE.width);
    blur
      .getContext("2d")
      ?.drawImage(
        picture.source,
        (blur.width - picture.width * blurScale) / 2,
        (blur.height - picture.height * blurScale) / 2,
        picture.width * blurScale,
        picture.height * blurScale
      );
    context.imageSmoothingEnabled = true;
    context.drawImage(blur, PICTURE.x, PICTURE.y, PICTURE.width, PICTURE.height);
    context.fillStyle = "rgba(0, 0, 0, 0.4)";
    context.fillRect(PICTURE.x, PICTURE.y, PICTURE.width, PICTURE.height);
    const fit = Math.min(Math.min(PICTURE.width / picture.width, PICTURE.height / picture.height) * 1.15, cover);
    const w = picture.width * fit;
    const h = picture.height * fit;
    const top = h > PICTURE.height ? (PICTURE.height - h) * 0.2 : (PICTURE.height - h) / 2;
    context.drawImage(picture.source, PICTURE.x + (PICTURE.width - w) / 2, PICTURE.y + top, w, h);
  } else {
    const wash = context.createLinearGradient(0, PICTURE.y, 0, PICTURE.y + PICTURE.height);
    wash.addColorStop(0, `${color}66`);
    wash.addColorStop(1, "#0a060e");
    context.fillStyle = wash;
    context.fillRect(PICTURE.x, PICTURE.y, PICTURE.width, PICTURE.height);
  }
  context.restore();
  context.strokeStyle = INK;
  context.lineWidth = 2;
  context.beginPath();
  context.roundRect(PICTURE.x, PICTURE.y, PICTURE.width, PICTURE.height, 6);
  context.stroke();

  // Small print along the bottom, like a tape's side and length
  const printY = (PICTURE.y + PICTURE.height + height) / 2;
  context.fillStyle = INK;
  context.font = "700 12px ui-monospace, Menlo, Consolas, monospace";
  context.textBaseline = "middle";
  context.textAlign = "left";
  context.fillText("SIDE A", PICTURE.x + 2, printY);
  context.textAlign = "right";
  context.fillText("SCAREATHON · TYPE II", width - PICTURE.x - 2, printY);
}

// The shell's outline, centred on the origin: square top corners softly rounded,
// and the bottom tapering in like a cassette's, extruded with rounded edges.
// `taperHeight` is how far up from the bottom the taper reaches.
function shellGeometry(width: number, height: number, depth: number, taperHeight: number) {
  const bevel = depth * 0.12;
  const x = width / 2 - bevel;
  const top = height / 2 - bevel;
  const bottom = -height / 2 + bevel;
  const taper = width * 0.09;
  const corner = width * 0.045;
  const outline = new Shape();
  outline.moveTo(-x + taper, bottom);
  outline.lineTo(x - taper, bottom);
  outline.lineTo(x, bottom + taperHeight);
  outline.lineTo(x, top - corner);
  outline.quadraticCurveTo(x, top, x - corner, top);
  outline.lineTo(-x + corner, top);
  outline.quadraticCurveTo(-x, top, -x, top - corner);
  outline.lineTo(-x, bottom + taperHeight);
  outline.closePath();
  const core = depth - bevel * 2;
  const geometry = new ExtrudeGeometry(outline, {
    depth: core,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 3,
  });
  geometry.translate(0, 0, -core / 2);
  return geometry;
}

// A tape reel's hub: a white ring with teeth pointing into its middle
function hubCanvas() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const context = canvas.getContext("2d")!;
  const c = 64;
  context.fillStyle = "#f4efe4";
  context.beginPath();
  context.arc(c, c, 60, 0, Math.PI * 2);
  context.fill();
  context.globalCompositeOperation = "destination-out";
  context.beginPath();
  context.arc(c, c, 34, 0, Math.PI * 2);
  context.fill();
  context.globalCompositeOperation = "source-over";
  context.fillStyle = "#f4efe4";
  for (let i = 0; i < 6; i += 1) {
    context.save();
    context.translate(c, c);
    context.rotate((i * Math.PI) / 3);
    context.fillRect(-5, -36, 10, 14);
    context.restore();
  }
  context.strokeStyle = "rgba(40, 30, 30, 0.5)";
  context.lineWidth = 3;
  context.beginPath();
  context.arc(c, c, 59, 0, Math.PI * 2);
  context.stroke();
  return canvas;
}

function roundedRect(width: number, height: number, radius: number) {
  const shape = new Shape();
  const x = width / 2;
  const y = height / 2;
  shape.moveTo(-x + radius, -y);
  shape.lineTo(x - radius, -y);
  shape.quadraticCurveTo(x, -y, x, -y + radius);
  shape.lineTo(x, y - radius);
  shape.quadraticCurveTo(x, y, x - radius, y);
  shape.lineTo(-x + radius, y);
  shape.quadraticCurveTo(-x, y, -x, y - radius);
  shape.lineTo(-x, -y + radius);
  shape.quadraticCurveTo(-x, -y, -x + radius, -y);
  return new ShapeGeometry(shape, 4);
}

export function createCartridge(
  name: string,
  color: string,
  font: ArcadeFont,
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
  const trimMaterial = new MeshStandardMaterial({
    color: shellColor.clone().multiplyScalar(0.45),
    roughness: 0.7,
    emissive: shellColor.clone().multiplyScalar(0.06),
  });
  const connectorMaterial = new MeshStandardMaterial({ color: new Color("#16131b"), roughness: 0.6 });
  const goldMaterial = new MeshStandardMaterial({ color: new Color("#d8a93a"), roughness: 0.3, metalness: 0.9 });
  const geometries: { dispose: () => void }[] = [];
  const addPart = (geometry: BufferGeometry, material: MeshStandardMaterial, x: number, y: number, z: number) => {
    geometries.push(geometry);
    const mesh = new Mesh(geometry, material);
    mesh.position.set(x, y, z);
    group.add(mesh);
    return mesh;
  };

  // The shell: a cassette-shaped plastic body above an edge connector that goes into the slot
  const connectorHeight = height * 0.1;
  const bodyHeight = height - connectorHeight;
  const bodyBottom = -height / 2 + connectorHeight;
  const bodyTop = height / 2;
  const taperHeight = bodyHeight * 0.2;
  const front = depth / 2;
  addPart(shellGeometry(width, bodyHeight, depth, taperHeight), shellMaterial, 0, bodyBottom + bodyHeight / 2, 0);
  addPart(new BoxGeometry(width * 0.62, connectorHeight * 1.2, depth * 0.55), connectorMaterial, 0, bodyBottom - connectorHeight * 0.5, 0);
  // Gold contacts along both faces of the connector
  addPart(new BoxGeometry(width * 0.56, connectorHeight * 0.6, depth * 0.58), goldMaterial, 0, bodyBottom - connectorHeight * 0.55, 0);

  // The label, set in a darker recess, filling the face above the taper
  const labelWidth = width * 0.86;
  const labelTop = bodyTop - width * 0.035;
  const labelBottom = bodyBottom + taperHeight + width * 0.012;
  const labelHeight = labelTop - labelBottom;
  const labelY = (labelTop + labelBottom) / 2;
  addPart(new PlaneGeometry(labelWidth + width * 0.03, labelHeight + width * 0.03), trimMaterial, 0, labelY, front + 0.001);

  // The window onto the tape, in the taper: two reels, each a white hub with tape
  // wound round it, fuller on the left as if partway through
  const windowY = bodyBottom + taperHeight * 0.5;
  const windowHeight = taperHeight * 0.72;
  const reelSpacing = width * 0.13;
  const hubRadius = windowHeight * 0.3;
  const windowMaterial = new MeshStandardMaterial({ color: new Color("#140f15"), roughness: 0.18, metalness: 0.1 });
  const tapeMaterial = new MeshStandardMaterial({ color: new Color("#3b2519"), roughness: 0.35, metalness: 0.2 });
  const hubTexture = new CanvasTexture(hubCanvas());
  hubTexture.colorSpace = SRGBColorSpace;
  const hubMaterial = new MeshStandardMaterial({ map: hubTexture, transparent: true, roughness: 0.5, alphaTest: 0.1 });
  const screwMaterial = new MeshStandardMaterial({ color: new Color("#b9b4ac"), roughness: 0.35, metalness: 0.8 });
  const reelMaterials = [windowMaterial, tapeMaterial, hubMaterial, screwMaterial];
  addPart(roundedRect(width * 0.46, windowHeight, windowHeight * 0.3), windowMaterial, 0, windowY, front + 0.001);
  const hubs = [-1, 1].map((side) => {
    const tape = windowHeight * (side < 0 ? 0.47 : 0.36);
    addPart(new CircleGeometry(tape, 28), tapeMaterial, side * reelSpacing, windowY, front + 0.0015);
    return addPart(new CircleGeometry(hubRadius, 20), hubMaterial, side * reelSpacing, windowY, front + 0.002);
  });
  // Reels turn at a speed set by setHighlight
  let reelAngle = 0;
  let reelTime = performance.now();
  const spinReels = (amount: number) => {
    const now = performance.now();
    reelAngle -= Math.min((now - reelTime) / 1000, 0.1) * amount * 5;
    reelTime = now;
    hubs.forEach((hub) => {
      hub.rotation.z = reelAngle;
    });
  };

  // Screws, like a cassette's: at the top corners and either side of the window
  const screwGeometry = new CylinderGeometry(width * 0.013, width * 0.013, depth * 0.06, 12);
  const screwAt = (x: number, y: number) => {
    addPart(screwGeometry, screwMaterial, x, y, front + depth * 0.01).rotation.x = Math.PI / 2;
  };
  [-1, 1].forEach((side) => {
    screwAt(side * width * 0.458, bodyTop - width * 0.022);
    screwAt(side * width * 0.33, windowY);
  });

  // The paper label on the front
  const canvas = document.createElement("canvas");
  canvas.width = LABEL_WIDTH;
  canvas.height = LABEL_HEIGHT;
  const context = canvas.getContext("2d");
  let picture: { source: CanvasImageSource; width: number; height: number } | undefined;
  const repaint = () => {
    if (context) paintLabel(context, name, color, font, picture);
    texture.needsUpdate = true;
  };
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  repaint();
  // The first paint may use a fallback font; repaint once the game's font is ready
  whenFontReady(font).then(repaint);

  const labelMaterial = new MeshStandardMaterial({
    map: texture,
    roughness: 0.75,
    emissive: new Color("#ffffff"),
    emissiveMap: texture,
    emissiveIntensity: 0.35,
  });
  addPart(new PlaneGeometry(labelWidth, labelHeight), labelMaterial, 0, labelY, depth / 2 + 0.002);

  // A barcode sticker on the back: what the cabinet's scanner reads to preview the game
  const stickerCanvas = document.createElement("canvas");
  stickerCanvas.width = STICKER_WIDTH;
  stickerCanvas.height = STICKER_HEIGHT;
  const stickerContext = stickerCanvas.getContext("2d");
  const stickerTexture = new CanvasTexture(stickerCanvas);
  stickerTexture.colorSpace = SRGBColorSpace;
  stickerTexture.anisotropy = 4;
  if (stickerContext) paintSticker(stickerContext, name, color);
  const stickerMaterial = new MeshStandardMaterial({ map: stickerTexture, roughness: 0.9 });
  const sticker = {
    width: width * 0.62,
    height: width * 0.62 * (STICKER_HEIGHT / STICKER_WIDTH),
    y: bodyBottom + bodyHeight * 0.5,
    z: -depth / 2 - 0.002,
  };
  addPart(new PlaneGeometry(sticker.width, sticker.height), stickerMaterial, 0, sticker.y, sticker.z).rotation.y = Math.PI;

  return {
    group,
    sticker,
    setPicture: (source, w, h) => {
      // Copy the frame now: the video element is released right after
      const copy = document.createElement("canvas");
      const scale = Math.min(1, STILL_MAX / Math.max(w, h));
      copy.width = Math.round(w * scale);
      copy.height = Math.round(h * scale);
      copy.getContext("2d")?.drawImage(source, 0, 0, copy.width, copy.height);
      picture = { source: copy, width: copy.width, height: copy.height };
      repaint();
    },
    setHighlight: (amount) => {
      spinReels(amount);
      labelMaterial.emissiveIntensity = 0.35 + amount * 0.45;
      shellMaterial.emissive.copy(shellColor).multiplyScalar(0.18 + amount * 0.35);
    },
    dispose: () => {
      geometries.forEach((geometry) => geometry.dispose());
      [shellMaterial, trimMaterial, connectorMaterial, goldMaterial, labelMaterial, stickerMaterial, ...reelMaterials].forEach(
        (material) => material.dispose()
      );
      hubTexture.dispose();
      texture.dispose();
      stickerTexture.dispose();
    },
  };
}

// The label still for a video: /game-recordings/Foo.mp4 → /game-recordings/stills/Foo.jpg,
// made by scripts/make-cartridge-stills.mjs (npm run stills:arcade).
export function stillUrlFor(videoUrl: string) {
  const slash = videoUrl.lastIndexOf("/");
  return `${videoUrl.slice(0, slash)}/stills/${videoUrl.slice(slash + 1).replace(/\.mp4$/i, ".jpg")}`;
}

const VIDEO_FALLBACK_TIMEOUT = 8000;

// A picture for each cartridge label. Loads the pre-made stills (small, all at
// once); for any game without one, falls back to grabbing a frame from its
// attract video, one video at a time so phones aren't downloading a dozen clips
// at once. A video that stalls (iOS won't load a video that isn't playing) is
// given up on so it can't hold up the rest. Calls onFrame as each one arrives.
export function loadVideoStills(
  videoUrls: (string | undefined)[],
  onFrame: (index: number, source: CanvasImageSource, width: number, height: number) => void
) {
  let cancelled = false;
  let current: HTMLVideoElement | null = null;
  let timer = 0;
  const images: HTMLImageElement[] = [];
  const needVideo: number[] = [];
  let pending = 0;

  const release = (video: HTMLVideoElement) => {
    video.removeAttribute("src");
    video.load();
  };

  const nextVideo = () => {
    if (cancelled) return;
    const index = needVideo.shift();
    if (index === undefined) return;
    const video = document.createElement("video");
    current = video;
    video.crossOrigin = "anonymous";
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    let finished = false;
    const done = () => {
      if (finished) return;
      finished = true;
      window.clearTimeout(timer);
      release(video);
      nextVideo();
    };
    timer = window.setTimeout(done, VIDEO_FALLBACK_TIMEOUT);
    video.addEventListener("loadedmetadata", () => {
      video.currentTime = Math.min(2, (video.duration || 4) * 0.25);
    }, { once: true });
    video.addEventListener("seeked", () => {
      if (!cancelled && video.videoWidth) onFrame(index, video, video.videoWidth, video.videoHeight);
      done();
    }, { once: true });
    video.addEventListener("error", done, { once: true });
    video.src = videoUrls[index]!;
  };

  // Once every still has loaded or failed, work through the videos that had none
  const settled = () => {
    pending -= 1;
    if (pending === 0) nextVideo();
  };

  videoUrls.forEach((url, index) => {
    if (!url) return;
    pending += 1;
    const image = new Image();
    images.push(image);
    image.decoding = "async";
    image.onload = () => {
      if (!cancelled) onFrame(index, image, image.naturalWidth, image.naturalHeight);
      settled();
    };
    image.onerror = () => {
      needVideo.push(index);
      settled();
    };
    image.src = stillUrlFor(url);
  });

  return () => {
    cancelled = true;
    window.clearTimeout(timer);
    images.forEach((image) => {
      image.onload = image.onerror = null;
    });
    if (current) release(current);
  };
}
