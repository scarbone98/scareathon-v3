// The shelf shares its backdrop hook; hot reload just reloads this file
/* eslint-disable react-refresh/only-export-components */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchWithAuth } from "../../fetchWithAuth";
import { DEFAULT_BANNER, backdropStyle, bannerSquare, bannerStyle } from "../banners.ts";
import type { ExtraShopItem } from "../../components/avatar/AvatarShop";

// Scoreboard banners: in the item shop they're wares like any other (useBannerShopItems), at
// your locker you choose which of yours is up (BannerShelf). The banner is what your place,
// avatar, name and points sit on, on the Scareboard, and the backdrop behind you.

type BannerState = {
  catalog: { key: string; name: string; price: number }[];
  owned: string[];
  equipped: string | null;
};

async function readBanners(response: Response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((body as { error?: string }).error || `HTTP ${response.status}`);
  return (body as { data: BannerState }).data;
}

function useBanners() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["banners"], queryFn: () => fetchWithAuth("/banners").then(readBanners) });
  const settle = (next: BannerState) => {
    queryClient.setQueryData(["banners"], next);
    // (the scoreboard and your ticket count)
    void queryClient.invalidateQueries({ queryKey: ["looks"] });
    void queryClient.invalidateQueries({ queryKey: ["home-v2", "summary"] });
    void queryClient.invalidateQueries({ queryKey: ["user", "wallet"] });
  };
  const buy = useMutation({
    mutationFn: (key: string) => fetchWithAuth(`/banners/${key}/buy`, { method: "POST" }).then(readBanners),
    onSuccess: settle,
  });
  const equip = useMutation({
    mutationFn: (key: string | null) =>
      fetchWithAuth("/banners/equipped", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key }) }).then(readBanners),
    onSuccess: settle,
  });
  return { ...query, buy, equip };
}

// The banner you have up (or one being tried on), as the backdrop you stand in front of
// (the empty one, if none)
export function useBackdrop(trying?: string | null) {
  const { data } = useQuery({ queryKey: ["banners"], queryFn: () => fetchWithAuth("/banners").then(readBanners) });
  return backdropStyle(trying ?? data?.equipped ?? DEFAULT_BANNER);
}

// The banners as the item shop's wares: a square cut from each for its icon, tried on behind
// you, bought once (then put up from right there)
export function useBannerShopItems(trying: string | null, onTry: (key: string | null) => void): ExtraShopItem[] {
  const { data, buy, equip } = useBanners();
  if (!data) return [];
  return data.catalog.map((banner) => {
    const owned = data.owned.includes(banner.key);
    const up = data.equipped === banner.key;
    return {
      id: `banner-${banner.key}`,
      name: banner.name,
      category: "banner",
      categoryLabel: "Banner",
      icon: bannerSquare(banner.key) ?? "",
      price: banner.price,
      owned,
      previewing: trying === banner.key,
      onPreview: () => onTry(trying === banner.key ? null : banner.key),
      action: up
        ? { label: "Up", disabled: true }
        : owned
          ? { label: equip.isPending && equip.variables === banner.key ? "Putting up…" : "Put up", disabled: equip.isPending, onClick: () => equip.mutate(banner.key) }
          : { label: buy.isPending && buy.variables === banner.key ? "Buying…" : "Buy", disabled: buy.isPending, buy: true, onClick: () => buy.mutate(banner.key) },
      error: (buy.variables === banner.key ? buy.error : equip.variables === banner.key ? equip.error : null) as Error | null,
    };
  });
}

// At your locker (one of the wardrobe's filters): which of your banners is up
export function BannerShelf() {
  const { data, error, buy, equip } = useBanners();
  if (error || !data) return null;
  const shown = data.catalog.filter((banner) => data.owned.includes(banner.key));
  const problem = (buy.error ?? equip.error) as Error | null;
  return (
    <section>
      <p className="text-[11px] uppercase tracking-[0.3em] text-[#f2ead2]/55">Scoreboard banners</p>
      {shown.length === 0 && <p className="mt-2 text-sm text-stone-400">Just the empty one so far: more are sold at the ticket counter.</p>}
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {/* Everyone's: the empty banner, up until another is (choosing it clears the choice) */}
        <div className={`flex h-12 items-center justify-between gap-2 rounded-[2px] px-3 ring-2 ${data.equipped === null ? "ring-amber-300" : "ring-transparent"}`} style={bannerStyle(DEFAULT_BANNER)}>
          <span className="rounded-[2px] bg-black/55 px-1.5 text-sm text-[#f2ead2]">Empty banner</span>
          {data.equipped === null ? (
            <span className="rounded-[2px] bg-black/55 px-1.5 text-xs uppercase tracking-wider text-amber-300">Up</span>
          ) : (
            <button type="button" className="rounded-[2px] bg-black/70 px-2 py-1 text-xs text-[#f2ead2] hover:bg-black/85" disabled={equip.isPending} onClick={() => equip.mutate(null)}>
              Put up
            </button>
          )}
        </div>
        {shown.map((banner) => {
          const up = data.equipped === banner.key;
          return (
            <div key={banner.key} className={`flex h-12 items-center justify-between gap-2 rounded-[2px] px-3 ring-2 ${up ? "ring-amber-300" : "ring-transparent"}`} style={bannerStyle(banner.key)}>
              <span className="rounded-[2px] bg-black/55 px-1.5 text-sm text-[#f2ead2]">{banner.name}</span>
              {up ? (
                <span className="rounded-[2px] bg-black/55 px-1.5 text-xs uppercase tracking-wider text-amber-300">Up</span>
              ) : (
                <button type="button" className="rounded-[2px] bg-black/70 px-2 py-1 text-xs text-[#f2ead2] hover:bg-black/85" disabled={equip.isPending} onClick={() => equip.mutate(banner.key)}>
                  Put up
                </button>
              )}
            </div>
          );
        })}
      </div>
      {problem && <p className="mt-2 text-sm text-red-300">{problem.message}</p>}
    </section>
  );
}
