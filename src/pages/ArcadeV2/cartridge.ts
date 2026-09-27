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
import { canvasFont, whenFontReady, type ArcadeFont } from "./arcadeFonts.ts";

// A game cartridge: a plastic shell in the game's colour with a paper label on
// the front showing a still from its attract video and the game's name.

export type CartridgeSize = { width: number; height: number; depth: number };

export type Cartridge = {
  group: Group;
  // Paint a frame from the attract video into the label's picture window.
  setPicture: (source: CanvasImageSource, width: number, height: number) => void;
  setHighlight: (amount: number) => void;
  dispose: () => void;
};

// Cartridges are landscape: height as a fraction of width
export const CARTRIDGE_ASPECT = 0.7;

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
  const labelWidth = width * 0.86;
  const labelGeometry = new PlaneGeometry(labelWidth, labelWidth * (LABEL_HEIGHT / LABEL_WIDTH));
  const labelMesh = new Mesh(labelGeometry, labelMaterial);
  labelMesh.position.set(0, -height * 0.06, depth / 2 + 0.002);
  group.add(labelMesh);

  return {
    group,
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
      shell.geometry.dispose();
      ridgeGeometry.dispose();
      labelGeometry.dispose();
      shellMaterial.dispose();
      labelMaterial.dispose();
      texture.dispose();
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
