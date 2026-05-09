import { supabase } from "../../supabaseClient";
import type { AvatarItem } from "./types";

export const AVATAR_COMPOSITE_BUCKET = "avatar-composites";

const COMPOSITE_SIZE = 256;

function sortLayers(layers: AvatarItem[]) {
  return [...layers].sort(
    (a, b) => a.layerOrder - b.layerOrder || a.id - b.id
  );
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load avatar layer: ${src}`));
    image.src = src;
  });
}

export function getAvatarCompositePublicUrl(userId: string, version?: number) {
  const { data } = supabase.storage
    .from(AVATAR_COMPOSITE_BUCKET)
    .getPublicUrl(`${userId}.png`);

  return version ? `${data.publicUrl}?v=${version}` : data.publicUrl;
}

export async function avatarCompositeExists(userId: string) {
  try {
    const response = await fetch(getAvatarCompositePublicUrl(userId), {
      method: "HEAD",
      cache: "no-store",
    });

    return response.ok;
  } catch {
    return false;
  }
}

export async function uploadAvatarComposite(layers: AvatarItem[], userId?: string) {
  let targetUserId = userId;

  if (!targetUserId) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    targetUserId = session?.user.id;
  }

  if (!targetUserId) {
    return null;
  }

  const canvas = document.createElement("canvas");
  canvas.width = COMPOSITE_SIZE;
  canvas.height = COMPOSITE_SIZE;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Could not create avatar composite canvas");
  }

  context.imageSmoothingEnabled = false;
  context.clearRect(0, 0, COMPOSITE_SIZE, COMPOSITE_SIZE);

  for (const layer of sortLayers(layers)) {
    const image = await loadImage(layer.assetPath);
    context.drawImage(image, 0, 0, COMPOSITE_SIZE, COMPOSITE_SIZE);
  }

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => {
      if (result) {
        resolve(result);
      } else {
        reject(new Error("Could not export avatar composite"));
      }
    }, "image/png");
  });

  const { error: uploadError } = await supabase.storage
    .from(AVATAR_COMPOSITE_BUCKET)
    .upload(`${targetUserId}.png`, blob, {
      cacheControl: "60",
      contentType: "image/png",
      upsert: true,
    });

  if (uploadError) {
    throw uploadError;
  }

  return getAvatarCompositePublicUrl(targetUserId, Date.now());
}
