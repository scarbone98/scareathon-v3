// The Picto Box's look: a cheap toy camera. The picture is shrunk to a tiny
// sensor, pushed through a handful of tones with an ordered dither, darkened
// toward the corners and speckled with grain. "sepia" is the classic picto
// print; "color" is the deluxe box, a few crunchy colours instead of browns.

export type PictoStyle = "sepia" | "color";

export const SENSOR_W = 192;
export const SENSOR_H = 144; // 4:3, like the viewfinder

// Five browns from shadow to paper
const SEPIA: [number, number, number][] = [
  [43, 29, 14],
  [90, 62, 34],
  [143, 106, 62],
  [201, 164, 106],
  [241, 220, 174],
];

// 4x4 Bayer matrix, as offsets in -0.5..0.5
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16 - 0.5);

// Vignette falloff per pixel, worked out once
let vignette: Float32Array | null = null;
function vignetteMap() {
  if (vignette) return vignette;
  vignette = new Float32Array(SENSOR_W * SENSOR_H);
  for (let y = 0; y < SENSOR_H; y += 1) {
    for (let x = 0; x < SENSOR_W; x += 1) {
      const dx = (x / (SENSOR_W - 1)) * 2 - 1;
      const dy = (y / (SENSOR_H - 1)) * 2 - 1;
      const d = Math.min(Math.sqrt(dx * dx * 0.8 + dy * dy) / 1.25, 1);
      vignette[y * SENSOR_W + x] = 1 - 0.6 * Math.pow(d, 2.4);
    }
  }
  return vignette;
}

// Draws `source` (a video frame or image), centre-cropped to 4:3, onto the
// sensor canvas and filters it in place. `mirror` flips it like a selfie.
export function exposeFrame(
  sensor: HTMLCanvasElement,
  source: CanvasImageSource,
  sourceW: number,
  sourceH: number,
  style: PictoStyle,
  mirror: boolean
) {
  const context = sensor.getContext("2d", { willReadFrequently: true });
  if (!context || !sourceW || !sourceH) return;
  const aspect = SENSOR_W / SENSOR_H;
  let cropW = sourceW;
  let cropH = sourceW / aspect;
  if (cropH > sourceH) {
    cropH = sourceH;
    cropW = sourceH * aspect;
  }
  context.save();
  if (mirror) {
    context.translate(SENSOR_W, 0);
    context.scale(-1, 1);
  }
  context.imageSmoothingEnabled = true;
  context.drawImage(source, (sourceW - cropW) / 2, (sourceH - cropH) / 2, cropW, cropH, 0, 0, SENSOR_W, SENSOR_H);
  context.restore();

  const frame = context.getImageData(0, 0, SENSOR_W, SENSOR_H);
  const data = frame.data;
  const vig = vignetteMap();
  for (let y = 0; y < SENSOR_H; y += 1) {
    for (let x = 0; x < SENSOR_W; x += 1) {
      const i = (y * SENSOR_W + x) * 4;
      const v = vig[y * SENSOR_W + x];
      const dither = BAYER[(y & 3) * 4 + (x & 3)];
      const grain = (Math.random() - 0.5) * 0.06;
      if (style === "sepia") {
        let l = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255;
        l = (l - 0.5) * 1.25 + 0.53; // a little extra contrast
        l = l * v + grain;
        const level = Math.min(Math.max(Math.round(l * (SEPIA.length - 1) + dither), 0), SEPIA.length - 1);
        const [r, g, b] = SEPIA[level];
        data[i] = r;
        data[i + 1] = g;
        data[i + 2] = b;
      } else {
        // Warm, punchy, four steps a channel
        const lum = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255;
        for (let c = 0; c < 3; c += 1) {
          let value = data[i + c] / 255;
          value = lum + (value - lum) * 1.35; // saturation
          value = (value - 0.5) * 1.15 + 0.5 + (c === 0 ? 0.04 : c === 2 ? -0.05 : 0);
          value = value * v + grain;
          const level = Math.min(Math.max(Math.round(value * 3 + dither), 0), 3);
          data[i + c] = [18, 92, 170, 246][level];
        }
      }
    }
  }
  context.putImageData(frame, 0, 0);
}

// Copies the sensor onto a bigger canvas with hard pixel edges
export function enlarge(sensor: HTMLCanvasElement, target: HTMLCanvasElement) {
  const context = target.getContext("2d");
  if (!context) return;
  context.imageSmoothingEnabled = false;
  context.drawImage(sensor, 0, 0, target.width, target.height);
}

// The finished print as a JPEG data URL, at twice the sensor size
export function develop(sensor: HTMLCanvasElement) {
  const print = document.createElement("canvas");
  print.width = SENSOR_W * 2;
  print.height = SENSOR_H * 2;
  enlarge(sensor, print);
  return print.toDataURL("image/jpeg", 0.82);
}
