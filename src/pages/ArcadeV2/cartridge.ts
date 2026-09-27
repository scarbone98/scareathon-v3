import {
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  Color,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Shape,
  SRGBColorSpace,
} from "three";
import { canvasFont, whenFontReady, type ArcadeFont } from "./arcadeFonts.ts";

// A game cartridge: a plastic shell in the game's colour with a paper label on
// the front showing a still from its attract video and the game's name.

export type CartridgeSize = { width: number; height: number; depth: number };

export type Cartridge = {
  group: Group;
  // Paint a frame from the attract video into the label's picture window.
  setPicture: (source: CanvasImageSource, width: number, height: number) => void;
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

const LABEL_WIDTH = 400;
const LABEL_HEIGHT = 254;
const STRIPE = 10;
const PICTURE = { x: 12, y: 12, width: LABEL_WIDTH - 24, height: 180 };
// The name sits centred in the strip between the picture and the bottom stripe
const TITLE_Y = (PICTURE.y + PICTURE.height + LABEL_HEIGHT - STRIPE) / 2;
const TITLE_MAX = 40;
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
  context.fillStyle = "#16101c";
  context.fillRect(0, 0, width, height);

  // Picture window: the attract video still, or a dim colour wash until it loads
  context.save();
  context.beginPath();
  context.roundRect(PICTURE.x, PICTURE.y, PICTURE.width, PICTURE.height, 10);
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
  context.strokeStyle = color;
  context.lineWidth = 4;
  context.beginPath();
  context.roundRect(PICTURE.x, PICTURE.y, PICTURE.width, PICTURE.height, 10);
  context.stroke();

  // Name, shrunk to fit, in the game's own font
  const label = name.replace(/[‘’]/g, "'").toUpperCase();
  let fontSize = TITLE_MAX;
  context.font = canvasFont(font, fontSize);
  while (context.measureText(label).width > width - 32 && fontSize > 16) {
    fontSize -= 2;
    context.font = canvasFont(font, fontSize);
  }
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.shadowColor = color;
  context.shadowBlur = 16;
  context.fillStyle = "#fff6ee";
  context.fillText(label, width / 2, TITLE_Y);
  context.shadowBlur = 0;

  // Coloured stripe along the bottom edge
  context.fillStyle = color;
  context.fillRect(0, height - STRIPE, width, STRIPE);
}

// The shell, N64/GBA style: the top corners cut off at an angle and a notch in
// each side just above the connector, extruded with softly rounded edges.
// Centred on the origin.
function shellGeometry(width: number, height: number, depth: number) {
  const bevel = depth * 0.12;
  const x = width / 2 - bevel;
  const top = height / 2 - bevel;
  const bottom = -height / 2 + bevel;
  const shoulder = width * 0.09;
  const notchWidth = width * 0.05;
  const notchHeight = height * 0.16;
  const outline = new Shape();
  outline.moveTo(-x + notchWidth, bottom);
  outline.lineTo(x - notchWidth, bottom);
  outline.lineTo(x - notchWidth, bottom + notchHeight);
  outline.lineTo(x, bottom + notchHeight);
  outline.lineTo(x, top - shoulder);
  outline.lineTo(x - shoulder, top);
  outline.lineTo(-x + shoulder, top);
  outline.lineTo(-x, top - shoulder);
  outline.lineTo(-x, bottom + notchHeight);
  outline.lineTo(-x + notchWidth, bottom + notchHeight);
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

  // The shell: a rounded plastic body above an edge connector that goes into the slot
  const connectorHeight = height * 0.1;
  const bodyHeight = height - connectorHeight;
  const bodyBottom = -height / 2 + connectorHeight;
  addPart(shellGeometry(width, bodyHeight, depth), shellMaterial, 0, bodyBottom + bodyHeight / 2, 0);
  addPart(new BoxGeometry(width * 0.78, connectorHeight * 1.2, depth * 0.55), connectorMaterial, 0, bodyBottom - connectorHeight * 0.5, 0);
  // Gold contacts along both faces of the connector
  addPart(new BoxGeometry(width * 0.7, connectorHeight * 0.6, depth * 0.58), goldMaterial, 0, bodyBottom - connectorHeight * 0.55, 0);

  // Grip ridges across the top of the front, above the label
  const labelWidth = width * 0.8;
  const labelHeight = labelWidth * (LABEL_HEIGHT / LABEL_WIDTH);
  const labelY = bodyBottom + width * 0.035 + labelHeight / 2;
  const gripTop = height / 2 - width * 0.025;
  const gripBottom = labelY + labelHeight / 2 + width * 0.02;
  const ridgeGeometry = new BoxGeometry(width * 0.62, width * 0.008, depth * 0.08);
  geometries.push(ridgeGeometry);
  for (let i = 0; i < 3; i += 1) {
    const ridge = new Mesh(ridgeGeometry, trimMaterial);
    ridge.position.set(0, gripBottom + ((gripTop - gripBottom) * (i + 0.5)) / 3, depth / 2 + depth * 0.02);
    group.add(ridge);
  }
  // Ribs down both ends, for fingers to grip
  const ribGeometry = new BoxGeometry(width * 0.02, bodyHeight * 0.5, depth * 0.1);
  geometries.push(ribGeometry);
  [-1, 1].forEach((side) => {
    for (let i = 0; i < 3; i += 1) {
      const rib = new Mesh(ribGeometry, trimMaterial);
      rib.position.set(side * (width / 2 + width * 0.004), bodyBottom + bodyHeight * 0.5, (i - 1) * depth * 0.28);
      group.add(rib);
    }
  });
  // A darker recess the label sits in
  addPart(new PlaneGeometry(labelWidth * 1.05, labelHeight + labelWidth * 0.05), trimMaterial, 0, labelY, depth / 2 + 0.001);

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
    roughness: 0.8,
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
      labelMaterial.emissiveIntensity = 0.35 + amount * 0.45;
      shellMaterial.emissive.copy(shellColor).multiplyScalar(0.18 + amount * 0.35);
    },
    dispose: () => {
      geometries.forEach((geometry) => geometry.dispose());
      [shellMaterial, trimMaterial, connectorMaterial, goldMaterial, labelMaterial, stickerMaterial].forEach((material) =>
        material.dispose()
      );
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
