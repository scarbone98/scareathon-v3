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
type PetItem = { key: string; id: string; game: PetGame; name: string; group: string; price: number; pack?: number; keeps?: boolean; blurb?: string };
// (owned: how many of each you have, or -1 for a thing that's kept)
type PetState = { catalog: PetItem[]; owned: Record<string, number> };

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
  return { ...query, buy, used, returned };
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
  // (until the account's been read, nobody knows what the game should have)
  return { stock, known: !signedIn || Boolean(data), use: (id: string) => signedIn && used.mutate(`${game}:${id}`), giveBack: (id: string) => signedIn && returned.mutate(`${game}:${id}`) };
}

// The supplies as the item shop's wares, a shelf for each creature
export function usePetShopItems(): ExtraShopItem[] {
  const { data, buy } = usePetItems(true);
  if (!data) return [];
  return data.catalog.map((item) => {
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
