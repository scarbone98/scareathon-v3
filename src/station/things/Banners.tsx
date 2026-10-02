// The shelf shares its backdrop hook; hot reload just reloads this file
/* eslint-disable react-refresh/only-export-components */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchWithAuth } from "../../fetchWithAuth";
import { DEFAULT_BANNER, backdropStyle, bannerStyle } from "../banners.ts";
import { serif } from "../style/theme.ts";
import TicketIcon from "../../components/TicketIcon";

// Scoreboard banners on a shelf: in the item shop you buy them (and put one up), at your
// locker you choose which of yours is up. The banner is what your place, avatar, name
// and points sit on, on the Scareboard.

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

// The banner you have up, as the backdrop you stand in front of (the empty one, if none)
export function useBackdrop() {
  const { data } = useQuery({ queryKey: ["banners"], queryFn: () => fetchWithAuth("/banners").then(readBanners) });
  return backdropStyle(data?.equipped ?? DEFAULT_BANNER);
}

export function BannerShelf({ mode }: { mode: "shop" | "locker" }) {
  const queryClient = useQueryClient();
  const { data, error } = useQuery({ queryKey: ["banners"], queryFn: () => fetchWithAuth("/banners").then(readBanners) });
  const settle = (next: BannerState) => {
    queryClient.setQueryData(["banners"], next);
    // (the scoreboard and your ticket count)
    void queryClient.invalidateQueries({ queryKey: ["looks"] });
    void queryClient.invalidateQueries({ queryKey: ["home-v2", "summary"] });
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
  if (error) return null;
  if (!data) return null;
  const shown = mode === "shop" ? data.catalog : data.catalog.filter((banner) => data.owned.includes(banner.key));
  const problem = (buy.error ?? equip.error) as Error | null;
  return (
    // (at the locker it's one of the wardrobe's filters, so it needs no rule of its own)
    <section className={mode === "shop" ? "mt-6 border-t border-[#f2ead2]/15 pt-4" : ""}>
      <p className="text-[11px] uppercase tracking-[0.3em] text-[#f2ead2]/55">Scoreboard banners</p>
      <p className="mt-1 text-sm text-stone-400" style={serif}>
        {mode === "shop" ? "Your place, your face and your points sit on it, up on the Scareboard, and it's the backdrop behind you." : "The one behind your name on the Scareboard, and behind you."}
      </p>
      {mode === "locker" && shown.length === 0 && <p className="mt-2 text-sm text-stone-400">Just the empty one so far: more are sold at the ticket counter.</p>}
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {mode === "locker" && (
          // Everyone's: the empty banner, up until another is (choosing it clears the choice)
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
        )}
        {shown.map((banner) => {
          const owned = data.owned.includes(banner.key);
          const up = data.equipped === banner.key;
          return (
            <div key={banner.key} className={`flex h-12 items-center justify-between gap-2 rounded-[2px] px-3 ring-2 ${up ? "ring-amber-300" : "ring-transparent"}`} style={bannerStyle(banner.key)}>
              <span className="rounded-[2px] bg-black/55 px-1.5 text-sm text-[#f2ead2]">{banner.name}</span>
              {up ? (
                <span className="rounded-[2px] bg-black/55 px-1.5 text-xs uppercase tracking-wider text-amber-300">Up</span>
              ) : owned ? (
                <button type="button" className="rounded-[2px] bg-black/70 px-2 py-1 text-xs text-[#f2ead2] hover:bg-black/85" disabled={equip.isPending} onClick={() => equip.mutate(banner.key)}>
                  Put up
                </button>
              ) : (
                <button type="button" className="flex items-center gap-1 rounded-[2px] bg-black/70 px-2 py-1 text-xs text-amber-200 hover:bg-black/85" disabled={buy.isPending} onClick={() => buy.mutate(banner.key)}>
                  {banner.price} <TicketIcon className="h-3.5 w-5" />
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
