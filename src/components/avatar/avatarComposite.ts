import { supabase } from "../../supabaseClient";
import { composeLook } from "./compose";
import { loadAvatarManifest } from "./manifest";
import type { AvatarLook } from "./types";

const AVATAR_COMPOSITE_BUCKET = "avatar-composites";

export function getAvatarCompositePublicUrl(userId: string, version?: number) {
  const { data } = supabase.storage
    .from(AVATAR_COMPOSITE_BUCKET)
    .getPublicUrl(`${userId}.png`);

  return version ? `${data.publicUrl}?v=${version}` : data.publicUrl;
}

// True when the stored composite exists and was drawn by the current avatar
// system. Composites from the old system were 256x256, so the size tells them
// apart and they get redrawn on the user's next visit.
export async function avatarCompositeIsCurrent(userId: string) {
  const manifest = await loadAvatarManifest();
  return new Promise<boolean>((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image.naturalWidth === manifest.width && image.naturalHeight === manifest.height);
    image.onerror = () => resolve(false);
    image.src = getAvatarCompositePublicUrl(userId, Date.now());
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

  const canvas = await composeLook(look, await loadAvatarManifest());
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
