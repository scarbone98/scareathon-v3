import { supabase } from "../../supabaseClient";
import { PORTRAIT_SIZE, composePortrait } from "./compose";
import { loadAvatarManifest } from "./manifest";
import type { AvatarLook } from "./types";

const AVATAR_COMPOSITE_BUCKET = "avatar-composites";
// The stored composite is a head-and-shoulders portrait of frame 0, scaled up
// so it stays crisp in the nav bar.
export const AVATAR_COMPOSITE_SCALE = 4;

export function getAvatarCompositePublicUrl(userId: string, version?: number) {
  const { data } = supabase.storage
    .from(AVATAR_COMPOSITE_BUCKET)
    .getPublicUrl(`${userId}.png`);

  return version ? `${data.publicUrl}?v=${version}` : data.publicUrl;
}

// True when the stored composite exists, was drawn by the current avatar
// system and is newer than the last save. Composites from older systems were
// 256x256 or 120x150 full bodies, so the size tells them apart. A save whose upload never finished
// (the tab closed or reloaded mid-upload) leaves an older composite, which the
// timestamp catches. Either way it gets redrawn on the user's next visit.
export async function avatarCompositeIsCurrent(userId: string, savedAt?: string | null) {
  const url = getAvatarCompositePublicUrl(userId, Date.now());

  if (savedAt) {
    const response = await fetch(url, { method: "HEAD" }).catch(() => null);
    const lastModified = Date.parse(response?.headers.get("Last-Modified") || "");
    // Last-Modified has whole seconds; the upload always follows the save.
    if (!response?.ok || !(lastModified >= Math.floor(Date.parse(savedAt) / 1000) * 1000)) {
      return false;
    }
  }

  return new Promise<boolean>((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image.naturalWidth === PORTRAIT_SIZE * AVATAR_COMPOSITE_SCALE &&
        image.naturalHeight === PORTRAIT_SIZE * AVATAR_COMPOSITE_SCALE);
    image.onerror = () => resolve(false);
    image.src = url;
  });
}

export async function uploadAvatarComposite(look: AvatarLook, userId?: string) {
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

  const canvas = await composePortrait(look, await loadAvatarManifest(), AVATAR_COMPOSITE_SCALE);
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
