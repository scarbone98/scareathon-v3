// The supplies' pieces share their hook; hot reload just reloads this file
/* eslint-disable react-refresh/only-export-components */
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchWithAuth } from "../../fetchWithAuth";
import type { ExtraShopItem } from "../../components/avatar/AvatarShop";

// Supplies for the two creatures kept at the station: the cryptlin in the cellar under the
// trap door, and the aquarium on top of the lockers. They're bought at the ticket counter (in
// the item shop they're wares like any other: usePetShopItems) and turn up in the games as
// stock (PetFrame hands each game its own). Some are kept for good; the rest are used up in
// the game, and the game says so each time (`used`).

export type PetGame = "cryptlins" | "aquarium";
type PetItem = { key: string; id: string; game: PetGame; name: string; group: string; price: number; pack?: number; keeps?: boolean; prize?: boolean; blurb?: string };
// (owned: how many of each you have, or -1 for a thing that's kept)
// (gift: the parcel with the mysterious egg in it is still waiting in your pigeonhole)
type PetState = { catalog: PetItem[]; owned: Record<string, number>; gift?: boolean };

const SHELVES: Record<PetGame, string> = { cryptlins: "Cryptlin", aquarium: "Aquarium" };

async function readState(response: Response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((body as { error?: string }).error || `HTTP ${response.status}`);
  return (body as { data: PetState }).data;
}

const send = (path: string, key: string) =>
  fetchWithAuth(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key }) }).then(readState);

// Each item's picture, drawn by its game
const pictureOf = (item: PetItem) => `/pets/${item.game}/${item.id.replace(/:/g, "-")}.png`;

export function usePetItems(signedIn: boolean) {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["pet-items"], queryFn: () => fetchWithAuth("/pet-items").then(readState), enabled: signedIn, staleTime: 5 * 60 * 1000 });
  const buy = useMutation({
    mutationFn: (key: string) => send("/pet-items/buy", key),
    onSuccess: (next) => {
      queryClient.setQueryData(["pet-items"], next);
      void queryClient.invalidateQueries({ queryKey: ["home-v2", "summary"] });
      void queryClient.invalidateQueries({ queryKey: ["user", "wallet"] });
    },
  });
  // One used in its game: gone from here at once (the game has already taken it off its own
  // count), and the server's told
  const used = useMutation({
    mutationFn: (key: string) => send("/pet-items/use", key),
    onMutate: (key) => {
      queryClient.setQueryData<PetState>(["pet-items"], (state) =>
        state && state.owned[key] > 0 ? { ...state, owned: { ...state.owned, [key]: state.owned[key] - 1 } } : state
      );
    },
    onSuccess: (next) => queryClient.setQueryData(["pet-items"], next),
    onError: () => void queryClient.invalidateQueries({ queryKey: ["pet-items"] }),
  });
  // One taken back out of its game (an ornament lifted from the tank): in stock again
  const returned = useMutation({
    mutationFn: (key: string) => send("/pet-items/return", key),
    onSuccess: (next) => queryClient.setQueryData(["pet-items"], next),
    onError: () => void queryClient.invalidateQueries({ queryKey: ["pet-items"] }),
  });
  // The parcel in your pigeonhole, opened: the egg's in your stock
  const openGift = useMutation({
    mutationFn: () => fetchWithAuth("/pet-items/gift/open", { method: "POST" }).then(readState),
    onSuccess: (next) => {
      queryClient.setQueryData(["pet-items"], next);
      void queryClient.invalidateQueries({ queryKey: ["home-v2", "summary"] });
      void queryClient.invalidateQueries({ queryKey: ["inbox"] });
    },
  });
  return { ...query, buy, used, returned, openGift };
}

// The parcel everyone finds in their pigeonhole: a mysterious egg. Opening it puts the egg in
// your stock and takes you down the trap door to the cellar, where it's laid.
export function EggParcel({ onOpened }: { onOpened: () => void }) {
  const { data, openGift } = usePetItems(true);
  if (!data?.gift) return null;
  return (
    <div className="mb-4 flex items-center gap-3 border-2 border-[#f2ead2]/40 bg-[#1d2a3a] p-3 shadow-[3px_3px_0_#05070c]">
      <img src="/pets/cryptlins/egg.png" alt="" className="h-16 w-16 shrink-0 [image-rendering:pixelated]" draggable={false} />
      <div className="min-w-0 flex-1">
        <p className="text-lg leading-tight text-[#f2ead2]" style={{ fontFamily: "'IM Fell English', Georgia, serif" }}>A parcel, left in your pigeonhole</p>
        <p className="mt-1 text-xs text-[#f2ead2]/70" style={{ fontFamily: "'Special Elite', 'Courier New', monospace" }}>No stamp and no name. Something in it is warm.</p>
        {openGift.error && <p className="mt-1 text-xs text-[#f2a27a]" role="alert">{(openGift.error as Error).message}</p>}
      </div>
      <button
        type="button"
        disabled={openGift.isPending}
        onClick={() => openGift.mutate(undefined, { onSuccess: onOpened })}
        className="shrink-0 bg-[#efe3c8] px-4 py-2 font-['Pixelify_Sans'] text-[15px] uppercase tracking-[0.08em] text-[#1d2a3a] shadow-[3px_3px_0_rgba(0,0,0,0.6)] transition hover:-translate-y-px hover:bg-[#fff4d8] disabled:opacity-60"
      >
        {openGift.isPending ? "Opening…" : "Open"}
      </button>
    </div>
  );
}

// What one game has: its own ids, and how many of each (-1: kept). Signed out, nothing but
// what the game gives everyone.
export function usePetStock(signedIn: boolean, game: PetGame) {
  const { data, used, returned } = usePetItems(signedIn);
  const owned = signedIn ? data?.owned : undefined;
  const stock = useMemo(() => {
    const mine: Record<string, number> = {};
    const prefix = `${game}:`;
    Object.entries(owned ?? {}).forEach(([key, count]) => {
      if (key.startsWith(prefix)) mine[key.slice(prefix.length)] = count;
    });
    return mine;
  }, [owned, game]);
  // (a visitor with no account has no pigeonhole for a parcel: the cellar lends them an egg)
  const lent = useMemo(() => ({ egg: 1 }), []);
  // (until the account's been read, nobody knows what the game should have)
  return { stock: signedIn ? stock : lent, known: !signedIn || Boolean(data), use: (id: string) => signedIn && used.mutate(`${game}:${id}`), giveBack: (id: string) => signedIn && returned.mutate(`${game}:${id}`) };
}

// The supplies as the item shop's wares, a shelf for each creature
export function usePetShopItems(): ExtraShopItem[] {
  const { data, buy } = usePetItems(true);
  if (!data) return [];
  // (the Friday show's prizes are in the catalogue, but not for sale)
  return data.catalog.filter((item) => !item.prize).map((item) => {
    const have = data.owned[item.key] ?? 0;
    const kept = Boolean(item.keeps) && have !== 0;
    const pack = item.keeps ? 1 : item.pack ?? 1;
    return {
      id: `pet-${item.key}`,
      name: pack > 1 ? `${item.name} (${pack})` : item.name,
      category: item.game,
      categoryLabel: item.group,
      categoryPlural: SHELVES[item.game],
      icon: pictureOf(item),
      square: true,
      price: item.price,
      owned: kept,
      count: !item.keeps && have > 0 ? have : undefined,
      previewing: false,
      // (nothing to try on: it's for the creature)
      noPreview: true,
      onPreview: () => undefined,
      action: kept
        ? { label: item.game === "cryptlins" ? "In the cellar" : "By the tank", disabled: true }
        : { label: buy.isPending && buy.variables === item.key ? "Buying…" : "Buy", disabled: buy.isPending, buy: true, onClick: () => buy.mutate(item.key) },
      error: (buy.variables === item.key ? buy.error : null) as Error | null,
    };
  });
}
