// The songs' pieces share their hook; hot reload just reloads this file
/* eslint-disable react-refresh/only-export-components */
import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchWithAuth } from "../../fetchWithAuth";
import type { ExtraShopItem } from "../../components/avatar/AvatarShop";
import { FREE_SONGS, SONGS, radio, songNamed, songSleeve, useRadio } from "../radio.ts";
import { pixel, plateButton, serif } from "../style/theme.ts";

// Songs for the radio on the bench: in the item shop they're wares like any other
// (useSongShopItems: Listen plays one, the start of it if it isn't yours), and the radio
// itself, looked at up close, is RadioSet: stop and start, the next song, the one before.

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

// The radio, up close: its dial says what's on, and under it the keys: back, stop or
// start, next; then your songs, any of which a tap puts on
export function RadioSet({ signedIn, onShop }: { signedIn: boolean; onShop: () => void }) {
  useSongs(signedIn);
  const { playing, key, playlist } = useRadio();
  const on = songNamed(key);
  const keyClass =
    "flex h-14 flex-1 items-center justify-center rounded-[4px] border-b-4 border-[#1c110c] bg-[#c9b98f] text-2xl text-[#2a1c14] transition active:translate-y-0.5 active:border-b-2 hover:brightness-110";
  return (
    <div className="mx-auto w-full max-w-md">
      <div className="rounded-[10px] border-4 border-[#3d1a14] bg-[#6b2f26] p-4 shadow-[inset_0_2px_0_rgba(255,255,255,0.12),0_10px_0_rgba(0,0,0,0.35)]">
        {/* The dial: what's playing, a needle that sits where the song is on the band */}
        <div className="relative overflow-hidden rounded-[3px] bg-[#ffcf7a] px-3 py-2 shadow-[inset_0_0_14px_rgba(120,60,0,0.55)]" style={{ opacity: playing ? 1 : 0.7 }}>
          <p className="text-[10px] uppercase tracking-[0.3em] text-[#5a3a12]/80">{playing ? "Now playing" : "Off the air"}</p>
          <p className="truncate text-xl text-[#3a2208]" style={serif} aria-live="polite">
            {on ? on.name : "—"}
          </p>
          <div className="mt-1 flex h-2 items-end justify-between" aria-hidden>
            {Array.from({ length: 25 }, (_, i) => (
              <span key={i} className={`w-px bg-[#5a3a12]/70 ${i % 4 === 0 ? "h-2" : "h-1"}`} />
            ))}
          </div>
          <span
            className="absolute bottom-0 top-0 w-0.5 bg-[#c22a1a] transition-[left] duration-500"
            style={{ left: `${8 + (Math.max(0, playlist.indexOf(key ?? "")) / Math.max(1, playlist.length - 1)) * 84}%` }}
            aria-hidden
          />
        </div>
        <div className="mt-4 flex gap-3" style={pixel}>
          <button type="button" className={keyClass} onClick={() => radio.back()} aria-label="Song before">
            ◂◂
          </button>
          <button type="button" className={keyClass} onClick={() => (playing ? radio.stop() : radio.play())} aria-label={playing ? "Stop" : "Play"}>
            {playing ? "■" : "▶"}
          </button>
          <button type="button" className={keyClass} onClick={() => radio.next()} aria-label="Next song">
            ▸▸
          </button>
        </div>
      </div>
      <p className="mt-5 text-[11px] uppercase tracking-[0.3em] text-[#f2ead2]/55">Your songs</p>
      <ul className="mt-2 space-y-1">
        {SONGS.filter((song) => playlist.includes(song.key)).map((song) => {
          const current = playing && song.key === key;
          return (
            <li key={song.key}>
              <button
                type="button"
                onClick={() => (current ? radio.stop() : radio.play(song.key))}
                className={`flex w-full items-center gap-3 rounded-[3px] px-3 py-2 text-left text-sm transition ${current ? "bg-[#f2c35b] text-[#1a1420]" : "bg-[#f2ead2]/5 text-[#f2ead2] hover:bg-[#f2ead2]/10"}`}
              >
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: song.colour }} aria-hidden />
                <span className="min-w-0 flex-1 truncate">{song.name}</span>
                <span className="text-xs opacity-70">{current ? "playing" : ""}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <button type="button" className={`${plateButton} mt-4`} onClick={onShop}>
        {signedIn ? "More songs at the ticket counter" : "Sign in at the counter for more songs"}
      </button>
    </div>
  );
}
