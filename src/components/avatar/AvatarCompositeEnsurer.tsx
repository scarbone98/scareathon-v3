import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import { fetchWithAuth } from "../../fetchWithAuth";
import { supabase } from "../../supabaseClient";
import {
  avatarCompositeExists,
  getAvatarCompositePublicUrl,
  uploadAvatarComposite,
} from "./avatarComposite";
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

      if (await avatarCompositeExists(userId)) {
        const compositeUrl = getAvatarCompositePublicUrl(userId, Date.now());
        queryClient.setQueryData(["avatar", "compositeUrl"], compositeUrl);
        return compositeUrl;
      }

      const response = await fetchWithAuth("/user/avatar");
      const data = (await response.json()) as AvatarResponse & { error?: string };
      if (!response.ok) {
        throw new Error(data.error || "Failed to load avatar");
      }

      queryClient.setQueryData(["avatar"], data);

      const compositeUrl = await uploadAvatarComposite(data.data.equipped, userId);
      if (compositeUrl) {
        queryClient.setQueryData(["avatar", "compositeUrl"], compositeUrl);
      }

      return compositeUrl;
    },
  });

  return null;
}
