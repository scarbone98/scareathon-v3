// The carts' pieces share their hook; hot reload just reloads this file
/* eslint-disable react-refresh/only-export-components */
import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchWithAuth } from "../../fetchWithAuth";
import type { ExtraShopItem } from "../../components/avatar/AvatarShop";
import { unlockCart } from "../../pages/Arcade/unlocks";

// Cartridges sold at the ticket counter ("???", Snow Globe): off the arcade's shelf until
// bought. In the item shop they're wares like any other (useCartShopItems). A cart you own
// goes on the shelf the way a secret one does once its code is typed in (Arcade/unlocks.ts):
// remembered on this device, and put back from your account wherever else you sign in.

type CartState = { catalog: { key: string; name: string; price: number }[]; owned: string[] };

// Each cart's label picture, for the shop
const PICTURES: Record<string, string> = { mystery: "/game-recordings/stills/Mystery.jpg", snow_globe: "/game-recordings/stills/SnowGlobe.jpg" };

async function readCarts(response: Response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((body as { error?: string }).error || `HTTP ${response.status}`);
  return (body as { data: CartState }).data;
}

// What's for sale and what's yours; and yours are put on the arcade's shelf
export function useCarts(signedIn: boolean) {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["carts"], queryFn: () => fetchWithAuth("/carts").then(readCarts), enabled: signedIn, staleTime: 5 * 60 * 1000 });
  const data = query.data;
  useEffect(() => {
    data?.catalog.filter((cart) => data.owned.includes(cart.key)).forEach((cart) => unlockCart(cart.name));
  }, [data]);
  const buy = useMutation({
    mutationFn: (key: string) => fetchWithAuth(`/carts/${key}/buy`, { method: "POST" }).then(readCarts),
    onSuccess: (next) => {
      queryClient.setQueryData(["carts"], next);
      void queryClient.invalidateQueries({ queryKey: ["home-v2", "summary"] });
      void queryClient.invalidateQueries({ queryKey: ["user", "wallet"] });
    },
  });
  return { ...query, buy };
}

// The carts as the item shop's wares: bought once, then on the arcade's shelf
export function useCartShopItems(): ExtraShopItem[] {
  const { data, buy } = useCarts(true);
  if (!data) return [];
  return data.catalog.map((cart) => {
    const mine = data.owned.includes(cart.key);
    return {
      id: `cart-${cart.key}`,
      name: cart.name,
      category: "games",
      categoryLabel: "Arcade cartridge",
      categoryPlural: "Games",
      icon: PICTURES[cart.key] ?? "",
      price: cart.price,
      owned: mine,
      previewing: false,
      // (nothing to try on: it's played at the arcade)
      noPreview: true,
      onPreview: () => undefined,
      action: mine
        ? { label: "In the arcade", disabled: true }
        : { label: buy.isPending && buy.variables === cart.key ? "Buying…" : "Buy", disabled: buy.isPending, buy: true, onClick: () => buy.mutate(cart.key) },
      error: (buy.variables === cart.key ? buy.error : null) as Error | null,
    };
  });
}
