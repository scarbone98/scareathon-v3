import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import { fetchWithAuth } from "../../fetchWithAuth";
import { supabase } from "../../supabaseClient";
import {
  avatarCompositeIsCurrent,
  getAvatarCompositePublicUrl,
  uploadAvatarComposite,
} from "./avatarComposite";
import { lookFromAvatar, randomLook } from "./look";
import { loadAvatarManifest } from "./manifest";
import type { AvatarResponse } from "./types";

export function AvatarCompositeEnsurer() {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    let isMounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (isMounted) {
        setSession(data.session);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useQuery({
    queryKey: ["avatar", "ensureComposite", session?.user.id],
    enabled: Boolean(session?.user.id),
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
    queryFn: async () => {
      const userId = session?.user.id;
      if (!userId) return null;

      const response = await fetchWithAuth("/user/avatar");
      let data = (await response.json()) as AvatarResponse & { error?: string };
      if (!response.ok) {
        throw new Error(data.error || "Failed to load avatar");
      }

      // Nobody picks from ready-made looks: a player without a look of their
      // own gets a random kid, which they can change in their locker.
      if (!data.data.profile.lookChosen) {
        const generated = randomLook(data.data.inventory, await loadAvatarManifest());
        if (generated) {
          const saved = await fetchWithAuth("/user/avatar/save", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              profile: generated.profile,
              outfit: generated.outfit.map(({ itemInstanceId, dyes }) => ({ itemInstanceId, dyes })),
            }),
          });
          if (saved.ok) data = await saved.json();
        }
      }

      queryClient.setQueryData(["avatar"], data);

      if (await avatarCompositeIsCurrent(userId, data.data.profile.savedAt)) {
        const compositeUrl = getAvatarCompositePublicUrl(userId, Date.now());
        queryClient.setQueryData(["avatar", "compositeUrl"], compositeUrl);
        return compositeUrl;
      }

      const compositeUrl = await uploadAvatarComposite(lookFromAvatar(data.data), userId);
      if (compositeUrl) {
        queryClient.setQueryData(["avatar", "compositeUrl"], compositeUrl);
      }

      return compositeUrl;
    },
  });

  return null;
}
