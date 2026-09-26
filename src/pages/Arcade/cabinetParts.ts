// Arcade cabinet pieces shared by /arcade and /arcade-v2: the neon marquee
// sign and the cabinet screen that plays a game's attract video.
import { CanvasTexture, SRGBColorSpace } from "three";

// Phones and tablets: smaller video canvases, no antialiasing, lower pixel ratio
export const isLightweightDevice = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(max-width: 768px), (pointer: coarse)").matches;

// Neon colours cycle across the cabinets so neighbours never match
export const MARQUEE_NEON_COLORS = ["#ff2d55", "#39ff9f", "#2de2ff", "#c86bff", "#ffa31a"];
export const MARQUEE_GLOW = 1.4;

// Paint a game's name as a neon sign: dark backing, a coloured halo, a brighter
// inner glow and a near-white core, like a lit glass tube. `font` is a CSS
// font-weight plus family, e.g. `700 "Cinzel Decorative", Zombie`.
export function drawNeonMarquee(
  canvas: HTMLCanvasElement,
  name: string,
  color: string,
  font = "400 Zombie, Creepster, cursive"
) {
  const [weight, ...family] = font.split(" ");
  const fontAt = (size: number) => `${weight} ${size}px ${family.join(" ")}`;
  const context = canvas.getContext("2d");
  if (!context) return;
  const { width, height } = canvas;

  context.shadowBlur = 0;
  const backing = context.createLinearGradient(0, 0, 0, height);
  backing.addColorStop(0, "#0c0612");
  backing.addColorStop(1, "#030105");
  context.fillStyle = backing;
  context.fillRect(0, 0, width, height);

  const wash = context.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, width * 0.45);
  wash.addColorStop(0, `${color}30`);
  wash.addColorStop(1, `${color}00`);
  context.fillStyle = wash;
  context.fillRect(0, 0, width, height);

  // Thin neon border tube
  context.strokeStyle = color;
  context.lineWidth = 5;
  context.shadowColor = color;
  context.shadowBlur = 24;
  context.strokeRect(22, 22, width - 44, height - 44);

  const label = name.replace(/[\u2018\u2019]/g, "'").toUpperCase();
  let fontSize = 220;
  context.font = fontAt(fontSize);
  // Fit the width, and keep tall fonts inside the tube border
  while (
    (context.measureText(label).width > width * 0.86 || fontSize > height * 0.62) &&
    fontSize > 60
  ) {
    fontSize -= 6;
    context.font = fontAt(fontSize);
  }
  context.textAlign = "center";
  context.textBaseline = "middle";
  const x = width / 2;
  const y = height / 2 + fontSize * 0.04;

  context.fillStyle = color;
  for (const blur of [70, 36, 14]) {
    context.shadowColor = color;
    context.shadowBlur = blur;
    context.fillText(label, x, y);
  }
  context.shadowColor = "#ffffff";
  context.shadowBlur = 6;
  context.fillStyle = "#fff4f8";
  context.globalAlpha = 0.85;
  context.fillText(label, x, y);
  context.globalAlpha = 1;
}

export function createMarqueeTexture(name: string, color: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 2048;
  canvas.height = 340; // about the marquee's 6:1 shape
  drawNeonMarquee(canvas, name, color);

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  // The first paint may use a fallback font; repaint once the Zombie web font is ready
  document.fonts
    ?.load("220px Zombie")
    .then(() => {
      drawNeonMarquee(canvas, name, color);
      texture.needsUpdate = true;
    })
    .catch(() => {});
  return texture;
}

// Brief neon flicker every ~9s, staggered per cabinet
export function marqueeFlicker(time: number, seed: number) {
  const phase = (time + seed * 3.7) % 9;
  if (phase > 0.45) return 1;
  return Math.sin(phase * 70) > 0.2 ? 1 : 0.3;
}

// How much the video is enlarged past "fit the whole frame": trims a little off
// portrait clips' top and bottom so they read larger on the wide cabinet screen.
const SCREEN_VIDEO_ZOOM = 1.15;

export type ScreenVideo = ReturnType<typeof createScreenVideo>;

// The cabinet screen is about 1.88:1. Draw the video inside a canvas with that
// aspect ratio so portrait and 16:9 recordings keep their proportions.
export function createScreenVideo(videoUrl: string, lightweight: boolean) {

  const video = document.createElement("video");
  video.crossOrigin = "anonymous";
  video.src = videoUrl;
  video.loop = true;
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";

  const canvas = document.createElement("canvas");
  // Same ~1.88:1 shape either way; phones show the screen small, so upload far fewer pixels
  canvas.width = lightweight ? 640 : 960;
  canvas.height = lightweight ? 340 : 512;
  const context = canvas.getContext("2d");
  context?.fillRect(0, 0, canvas.width, canvas.height);

  // Tiny canvas used as a cheap, cross-browser blur: shrink the frame, then scale it back up
  const backdrop = document.createElement("canvas");
  backdrop.width = 32;
  backdrop.height = 17;
  const backdropContext = backdrop.getContext("2d");

  const texture = new CanvasTexture(canvas);
  // Preserve the orientation used by the cabinet model's screen UVs.
  texture.flipY = true;
  texture.repeat.set(1, -1);
  texture.offset.set(0, 1);

  let frameRequest: number | undefined;
  let lastTime = -1;
  const drawFrame = () => {
    if (!context || !video.videoWidth || !video.videoHeight) return;

    const fitScale = Math.min(
      canvas.width / video.videoWidth,
      canvas.height / video.videoHeight
    );
    const fillScale = Math.max(
      canvas.width / video.videoWidth,
      canvas.height / video.videoHeight
    );

    // Backdrop: the same footage filling the screen, blurred and dimmed, instead of black bars
    context.fillStyle = "black";
    context.fillRect(0, 0, canvas.width, canvas.height);
    if (backdropContext) {
      const backdropScale = fillScale * (backdrop.width / canvas.width);
      const backdropWidth = video.videoWidth * backdropScale;
      const backdropHeight = video.videoHeight * backdropScale;
      backdropContext.drawImage(
        video,
        (backdrop.width - backdropWidth) / 2,
        (backdrop.height - backdropHeight) / 2,
        backdropWidth,
        backdropHeight
      );
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(backdrop, 0, 0, canvas.width, canvas.height);
      context.fillStyle = "rgba(0, 0, 0, 0.45)";
      context.fillRect(0, 0, canvas.width, canvas.height);
    }

    // Foreground: the whole clip, a little larger than a strict fit but never past filling the screen
    const scale = Math.min(fitScale * SCREEN_VIDEO_ZOOM, fillScale);
    const width = video.videoWidth * scale;
    const height = video.videoHeight * scale;
    // When the zoom overflows vertically, trim mostly from the bottom: titles and logos sit at the top
    const top = height > canvas.height ? (canvas.height - height) * 0.2 : (canvas.height - height) / 2;
    context.drawImage(video, (canvas.width - width) / 2, top, width, height);
    texture.needsUpdate = true;
  };
  video.addEventListener("loadeddata", drawFrame);

  const hasVideoFrameCallback =
    typeof video.requestVideoFrameCallback === "function";
  if (hasVideoFrameCallback) {
    const onFrame: VideoFrameRequestCallback = () => {
      drawFrame();
      frameRequest = video.requestVideoFrameCallback(onFrame);
    };
    frameRequest = video.requestVideoFrameCallback(onFrame);
  }

  // The caller decides when to play(): only one screen should be decoding at a time

  return {
    video,
    texture,
    updateFrame: () => {
      if (!hasVideoFrameCallback && video.currentTime !== lastTime) {
        lastTime = video.currentTime;
        drawFrame();
      }
    },
    dispose: () => {
      if (frameRequest !== undefined) video.cancelVideoFrameCallback(frameRequest);
      video.removeEventListener("loadeddata", drawFrame);
      video.pause();
      video.removeAttribute("src");
      video.load();
      texture.dispose();
    },
  };
}
