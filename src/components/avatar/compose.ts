// Draws an avatar in the browser, the same way scripts/pixel-avatar/catalog.mjs
// renders its previews: layers back to front, each part placed by its anchor
// on the body's rig for that frame, and recoloured by exact colour swap
// (skin, hair and eyes for the avatar, dye1/dye2 per item).
import type { AvatarItem, AvatarLook, AvatarManifest, AvatarRig } from "./types";

const images = new Map<string, Promise<HTMLImageElement>>();

function loadImage(src: string) {
  let image = images.get(src);
  if (!image) {
    image = new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => {
        images.delete(src);
        reject(new Error(`Failed to load avatar layer: ${src}`));
      };
      img.src = src;
    });
    images.set(src, image);
  }
  return image;
}

const rgbKey = (r: number, g: number, b: number) => (r << 16) | (g << 8) | b;

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// Swap tables are small and reused a lot, so cache them by their recipe.
const swapTables = new Map<string, Map<number, [number, number, number]>>();

function swapTable(manifest: AvatarManifest, swaps: Record<string, string | undefined>) {
  const recipe = JSON.stringify(swaps);
  let table = swapTables.get(recipe);
  if (!table) {
    table = new Map();
    for (const [channel, target] of Object.entries(swaps)) {
      const fromRamp = manifest.defaults[channel as keyof AvatarManifest["defaults"]];
      const from = manifest.ramps[fromRamp];
      const to = target ? manifest.ramps[target] : undefined;
      if (!from || !to || target === fromRamp) continue;
      from.forEach((hex, shade) => {
        const [r, g, b] = hexToRgb(hex);
        table!.set(rgbKey(r, g, b), hexToRgb(to[shade]));
      });
    }
    swapTables.set(recipe, table);
  }
  return table;
}

// The body the look is wearing, which decides the rig and what fits.
export function bodyOf(look: AvatarLook) {
  return look.outfit.find(({ item }) => item.category === "body")?.item;
}

export function rigOf(look: AvatarLook, manifest: AvatarManifest): AvatarRig {
  const body = bodyOf(look);
  return (body && manifest.bases[body.itemKey]) || { frames: 1, fps: 1, anchors: {} };
}

// Whether any of an item's parts is drawn on this body.
export function itemFitsBody(item: AvatarItem, bodyKey: string | undefined) {
  return !bodyKey || item.parts.some((part) => !part.fits || part.fits.includes(bodyKey));
}

export function orderedOutfit(look: AvatarLook) {
  // Within a slot, items stack by their order, never by when they were put on.
  return look.outfit
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => a.entry.item.order - b.entry.item.order || a.index - b.index)
    .map(({ entry }) => entry);
}

// Draws every frame of a look side by side: frame f at x = f * manifest.width.
export async function composeLook(look: AvatarLook, manifest: AvatarManifest) {
  const { width, height } = manifest;
  const rig = rigOf(look, manifest);
  const bodyKey = bodyOf(look)?.itemKey;
  const canvas = document.createElement("canvas");
  canvas.width = width * rig.frames;
  canvas.height = height;
  const context = canvas.getContext("2d");
  const scratch = document.createElement("canvas");
  const scratchContext = scratch.getContext("2d", { willReadFrequently: true });
  if (!context || !scratchContext) throw new Error("Could not create avatar canvas");
  context.imageSmoothingEnabled = false;

  const hidden = new Set(look.outfit.flatMap(({ item }) => item.hides));
  const outfit = orderedOutfit(look);
  const layers = manifest.slots
    .filter((slot) => !hidden.has(slot))
    .flatMap((slot) =>
      outfit.flatMap((entry) =>
        entry.item.parts
          // (background items aren't drawn: the banner you have up is your background)
          .filter((part) => part.slot !== "background")
          .filter((part) => part.slot === slot && (!bodyKey || !part.fits || part.fits.includes(bodyKey)))
          // a body without the part's anchor (a ghost has no legs) skips it
          .filter((part) => !bodyKey || rig.anchors[part.anchor])
          .map((part) => ({ entry, part }))
      )
    );
  const loaded = await Promise.all(layers.map(({ part }) => loadImage(part.src)));

  layers.forEach(({ entry, part }, index) => {
    const table = swapTable(manifest, {
      skin: look.profile.skin,
      hair: look.profile.hair,
      eyes: look.profile.eyes,
      dye1: entry.dyes.dye1 || entry.item.dyes.dye1,
      dye2: entry.dyes.dye2 || entry.item.dyes.dye2,
    });
    // Recolour the part's whole strip once, then place each frame.
    const image = loaded[index];
    scratch.width = image.naturalWidth;
    scratch.height = image.naturalHeight;
    scratchContext.clearRect(0, 0, scratch.width, scratch.height);
    scratchContext.drawImage(image, 0, 0);
    if (table.size > 0) {
      const pixels = scratchContext.getImageData(0, 0, scratch.width, scratch.height);
      const data = pixels.data;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] === 0) continue;
        const swapped = table.get(rgbKey(data[i], data[i + 1], data[i + 2]));
        if (swapped) {
          data[i] = swapped[0];
          data[i + 1] = swapped[1];
          data[i + 2] = swapped[2];
        }
      }
      scratchContext.putImageData(pixels, 0, 0);
    }
    for (let frame = 0; frame < rig.frames; frame++) {
      const [dx, dy] = rig.anchors[part.anchor]?.[frame] || [0, 0];
      const source = (frame % part.frames) * part.w;
      context.save();
      // Keep each frame's drawing inside its own cell of the strip.
      context.beginPath();
      context.rect(frame * width, 0, width, height);
      context.clip();
      context.drawImage(scratch, source, 0, part.w, part.h, frame * width + part.x + dx, part.y + dy, part.w, part.h);
      context.restore();
    }
  });

  return { canvas, frames: rig.frames, fps: rig.fps };
}

// The kid's head centre in frame 0; other bodies move it by their head anchor.
const HEAD_CENTRE: [number, number] = [16, 29];
export const PORTRAIT_SIZE = 24;

// A square head-and-shoulders crop of frame 0, scaled up (the saved
// composite the nav bar shows).
export async function composePortrait(look: AvatarLook, manifest: AvatarManifest, scale = 1) {
  const { canvas: strip } = await composeLook(look, manifest);
  const [dx, dy] = rigOf(look, manifest).anchors.head?.[0] || [0, 0];
  const clamp = (value: number, max: number) => Math.max(0, Math.min(max - PORTRAIT_SIZE, value));
  const left = clamp(HEAD_CENTRE[0] + dx - PORTRAIT_SIZE / 2, manifest.width);
  const top = clamp(HEAD_CENTRE[1] + dy - PORTRAIT_SIZE / 2 + 2, manifest.height);
  const canvas = document.createElement("canvas");
  canvas.width = PORTRAIT_SIZE * scale;
  canvas.height = PORTRAIT_SIZE * scale;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not create avatar canvas");
  context.imageSmoothingEnabled = false;
  context.drawImage(strip, left, top, PORTRAIT_SIZE, PORTRAIT_SIZE, 0, 0, canvas.width, canvas.height);
  return canvas;
}
