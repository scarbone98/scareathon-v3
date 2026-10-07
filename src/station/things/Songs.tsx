import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchWithAuth } from "../../fetchWithAuth";
import type { ExtraShopItem } from "../../components/avatar/AvatarShop";
import { FREE_SONGS, radio, songNamed, songSleeve, useRadio } from "../radio.ts";

// Songs for the radio on the bench: in the item shop they're wares like any other
// (useSongShopItems: Listen plays one, the start of it if it isn't yours); the radio
// itself, its keys and its screen, is in the scene (StationScene).

type SongState = { catalog: { key: string; name: string; price: number }[]; owned: string[] };

async function readSongs(response: Response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((body as { error?: string }).error || `HTTP ${response.status}`);
  return (body as { data: SongState }).data;
}

// What's for sale and what's yours; and the radio is kept to playing yours (signed out,
// or before the answer comes: the songs that are everyone's)
export function useSongs(signedIn: boolean) {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["songs"], queryFn: () => fetchWithAuth("/songs").then(readSongs), enabled: signedIn, staleTime: 5 * 60 * 1000 });
  const owned = signedIn && query.data ? query.data.owned : FREE_SONGS;
  const mine = owned.join();
  useEffect(() => {
    radio.setPlaylist(mine.split(","));
  }, [mine]);
  const buy = useMutation({
    mutationFn: (key: string) => fetchWithAuth(`/songs/${key}/buy`, { method: "POST" }).then(readSongs),
    onSuccess: (next) => {
      queryClient.setQueryData(["songs"], next);
      void queryClient.invalidateQueries({ queryKey: ["home-v2", "summary"] });
      void queryClient.invalidateQueries({ queryKey: ["user", "wallet"] });
    },
  });
  return { ...query, owned, buy };
}

// The songs as the item shop's wares: a record for each, heard with Listen, bought once
export function useSongShopItems(): ExtraShopItem[] {
  const { data, owned, buy } = useSongs(true);
  const now = useRadio();
  if (!data) return [];
  return data.catalog
    .filter((song) => songNamed(song.key))
    .map((song) => {
      const mine = owned.includes(song.key);
      const sampling = now.playing && now.sampling && now.key === song.key;
      return {
        id: `song-${song.key}`,
        name: song.name,
        category: "song",
        categoryLabel: "Song",
        categoryPlural: "Songs",
        icon: songSleeve(song.key),
        price: song.price,
        owned: mine,
        previewing: sampling,
        previewLabel: sampling ? "Stop" : "Listen",
        onPreview: () => (sampling ? radio.stop() : radio.sample(song.key, mine)),
        action: mine
          ? { label: "On your radio", disabled: true }
          : { label: buy.isPending && buy.variables === song.key ? "Buying…" : "Buy", disabled: buy.isPending, buy: true, onClick: () => buy.mutate(song.key) },
        error: (buy.variables === song.key ? buy.error : null) as Error | null,
      };
    });
}
