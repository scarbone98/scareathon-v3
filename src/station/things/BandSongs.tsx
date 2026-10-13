import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchWithAuth } from "../../fetchWithAuth";
import { radio, type BandSong } from "../radio.ts";

// Tunes made in One Man Band (the arcade cart) for the radio on the bench: yours on one
// frequency, everyone else's newest on another (server/routes/bandSongs.js). The arcade says
// when a new one of yours has gone up (Arcade/games.tsx).

export const BAND_SONG_EVENT = "radio:band-song";

type Sent = { id: number; name: string; song: BandSong };

async function read(response: Response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((body as { error?: string }).error || `HTTP ${response.status}`);
  return (body as { data: Sent[] }).data;
}

export function useBandSongs(signedIn: boolean) {
  const queryClient = useQueryClient();
  const mine = useQuery({ queryKey: ["band-songs", "mine"], queryFn: () => fetchWithAuth("/band-songs/mine").then(read), enabled: signedIn, staleTime: 60 * 1000 });
  const air = useQuery({ queryKey: ["band-songs", "air", signedIn], queryFn: () => fetchWithAuth("/band-songs/air").then(read), staleTime: 5 * 60 * 1000 });
  const yours = signedIn ? mine.data : undefined;
  useEffect(() => {
    radio.setTunes(0, yours ?? []);
  }, [yours]);
  useEffect(() => {
    radio.setTunes(1, air.data ?? []);
  }, [air.data]);
  useEffect(() => {
    const sent = () => void queryClient.invalidateQueries({ queryKey: ["band-songs"] });
    window.addEventListener(BAND_SONG_EVENT, sent);
    return () => window.removeEventListener(BAND_SONG_EVENT, sent);
  }, [queryClient]);
}
