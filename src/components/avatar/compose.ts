// Draws an avatar in the browser, the same way scripts/avatar-art/build.mjs
// renders its previews: layers back to front, each item recoloured by exact
// colour swap (skin, hair and eyes for the avatar, dye1/dye2 per item).
import type { AvatarItem, AvatarLook, AvatarManifest } from "./types";

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
  const n = parseInt(hex.slice(1), 16);
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
      const from = manifest.swappable[channel];
      const to = target ? manifest.ramps[target] : undefined;
      if (!from || !to || channel === target) continue;
      from.forEach((hex, shade) => {
        const [r, g, b] = hexToRgb(hex);
        table!.set(rgbKey(r, g, b), hexToRgb(to[shade]));
      });
    }
    swapTables.set(recipe, table);
  }
  return table;
}

// The part of an item for one slot: the build's own fit if it has one,
// otherwise the part both builds share.
export function partFor(item: AvatarItem, slot: string, build: string) {
  return (
    item.parts.find((part) => part.slot === slot && part.build === build) ||
    item.parts.find((part) => part.slot === slot && part.build === null)
  );
}

export function orderedOutfit(look: AvatarLook) {
  // Within a slot, items stack by their order, never by when they were put on.
  return look.outfit
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => a.entry.item.order - b.entry.item.order || a.index - b.index)
    .map(({ entry }) => entry);
}

export async function composeLook(look: AvatarLook, manifest: AvatarManifest) {
  const { width, height } = manifest;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  const scratch = document.createElement("canvas");
  scratch.width = width;
  scratch.height = height;
  const scratchContext = scratch.getContext("2d", { willReadFrequently: true });
  if (!context || !scratchContext) throw new Error("Could not create avatar canvas");
  context.imageSmoothingEnabled = false;

  const hidden = new Set(look.outfit.flatMap(({ item }) => item.hides));
  const outfit = orderedOutfit(look);
  const layers = manifest.slots
    .filter((slot) => !hidden.has(slot))
    .flatMap((slot) =>
      outfit.flatMap((entry) => {
        const part = partFor(entry.item, slot, look.profile.build);
        return part ? [{ entry, src: part.src }] : [];
      })
    );
  const loaded = await Promise.all(layers.map((layer) => loadImage(layer.src)));

  layers.forEach(({ entry }, index) => {
    const table = swapTable(manifest, {
      skin: look.profile.skin,
      hair: look.profile.hair,
      eyes: look.profile.eyes,
      dye1: entry.dyes.dye1 || entry.item.dyes.dye1,
      dye2: entry.dyes.dye2 || entry.item.dyes.dye2,
    });
    scratchContext.clearRect(0, 0, width, height);
    scratchContext.drawImage(loaded[index], 0, 0);
    if (table.size > 0) {
      const pixels = scratchContext.getImageData(0, 0, width, height);
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
    context.drawImage(scratch, 0, 0);
  });

  return canvas;
}
