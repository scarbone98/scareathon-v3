import { useEffect, useMemo, useState, useRef } from "react";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  FaChevronLeft,
  FaChevronRight,
} from "react-icons/fa";
import { fetchWithAuth } from "../../fetchWithAuth";
import TicketIcon from "../TicketIcon";
import LoadingSpinner from "../LoadingSpinner";
import ErrorDisplay from "../ErrorDisplay";
import { itemFitsBody } from "./compose";
import { CATEGORY_LABELS, gameOf, lookFromAvatar, lookWithItem } from "./look";
import { EMPTY_SHELVES, type ShopFilters } from "./shopFilters";
import { useAvatarManifest } from "./manifest";
import type { AvatarItem, AvatarLook, AvatarResponse } from "./types";
import "../../styles/shop.css";

type ShopItem = AvatarItem & {
  supplyLimit: number | null;
  mintedCount: number;
  ownedCount: number;
  isSoldOut: boolean;
};

type ShopResponse = {
  data: ShopItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pageCount: number;
  };
};

type WalletResponse = {
  data: {
    coinBalance: number;
  };
};

type PurchaseResponse = {
  data: {
    item: ShopItem;
    itemInstanceId: number;
    coinBalance: number;
  };
};

function readJson<T>(response: Response) {
  return response.json().then((data) => {
    if (!response.ok) {
      throw new Error(data.error || "Request failed");
    }
    return data as T;
  });
}

// Wares that aren't avatar items (the station's scoreboard banners), sold from the same
// grid: a category of their own in the filter, and with the rest under "All categories"
export type ExtraShopItem = {
  id: string;
  name: string;
  category: string;
  categoryLabel: string;
  // (in the category menu)
  categoryPlural: string;
  icon: string;
  price: number;
  owned: boolean;
  previewing: boolean;
  // (what its Show button says instead: a song's is Listen)
  previewLabel?: string;
  // (nothing to show or hear: no Show button. An arcade cartridge)
  noPreview?: boolean;
  onPreview: () => void;
  // (buy: it costs tickets, so it waits until you can afford it)
  action: { label: string; disabled: boolean; buy?: boolean; onClick?: () => void };
  error?: Error | null;
};

type AvatarShopProps = {
  onPreviewLookChange?: (look: AvatarLook | null) => void;
  // Open on this item (by name): searched for, tried on, and scrolled to (the adverts
  // over the ticket window link here)
  focusName?: string;
  extraItems?: ExtraShopItem[];
  // Search, category and rarity: kept (and laid out) by whoever holds the shop
  filters: ShopFilters;
  // Something's just been tried on (Show, turned on): the station's shopkeeper has a word
  // about it. (short: it costs more than you have)
  onTryOn?: (item: { name: string; category: string; rarity?: string; price: number; owned: boolean; short: boolean }) => void;
};

export function AvatarShop({ onPreviewLookChange, focusName, extraItems = [], filters, onTryOn }: AvatarShopProps) {
  const queryClient = useQueryClient();
  const { search, classification, rarity: rarityFilter } = filters;
  const [debouncedSearch, setDebouncedSearch] = useState(search.trim());
  const focused = useRef(false);
  const [page, setPage] = useState(1);
  const [previewItem, setPreviewItem] = useState<ShopItem | null>(null);
  // Buy asks first: what you're about to buy, and the purchase to make if you say yes
  const [confirming, setConfirming] = useState<{ name: string; price: number; icon: string; swatch?: boolean; buy: () => void } | null>(null);
  useEffect(() => {
    if (!confirming) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setConfirming(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [confirming]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, 300);

    return () => window.clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [classification, debouncedSearch, rarityFilter]);

  const shopQuery = useMemo(() => {
    const params = new URLSearchParams();
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (classification) params.set("category", classification);
    if (rarityFilter) params.set("rarity", rarityFilter);
    params.set("page", String(page));
    params.set("limit", "20");
    const query = params.toString();
    return `/marketplace/shop/items?${query}`;
  }, [classification, debouncedSearch, page, rarityFilter]);

  // A tab with nothing on its shelf yet (in-game items, games): it says so
  const emptyShelf = EMPTY_SHELVES.find((shelf) => shelf.value === classification);
  // The extra wares' categories go in the filter after the avatar items' own
  // (an empty shelf, likewise, has no avatar items to ask the server for)
  const extraOnly = Boolean(emptyShelf) || extraItems.some((item) => item.category === classification);
  // Shown with the first page of everything, or on their own; they have no rarity
  const shownExtras =
    rarityFilter || (classification && !extraOnly) || (!extraOnly && page !== 1)
      ? []
      : extraItems.filter(
          (item) =>
            (!extraOnly || item.category === classification) &&
            (!debouncedSearch || item.name.toLowerCase().includes(debouncedSearch.toLowerCase()))
        );

  const {
    data: shopData,
    isLoading,
    isFetching,
    error,
  } = useQuery<ShopResponse>({
    queryKey: [
      "marketplace",
      "shop",
      "items",
      { search: debouncedSearch, classification, rarityFilter, page },
    ],
    queryFn: () => fetchWithAuth(shopQuery).then(readJson<ShopResponse>),
    placeholderData: keepPreviousData,
    enabled: !extraOnly,
  });

  const { data: featuredData } = useQuery<{ data: ShopItem[] }>({
    queryKey: ["marketplace", "shop", "featured"],
    queryFn: () => fetchWithAuth("/marketplace/shop/featured").then(readJson<{ data: ShopItem[] }>),
    staleTime: 5 * 60 * 1000,
  });
  // Just in: a few of the latest round of wares, above the featured ones
  const { data: newData } = useQuery<{ data: ShopItem[] }>({
    queryKey: ["marketplace", "shop", "new"],
    queryFn: () => fetchWithAuth("/marketplace/shop/new").then(readJson<{ data: ShopItem[] }>),
    staleTime: 5 * 60 * 1000,
  });
  const unfiltered = !debouncedSearch && !classification && !rarityFilter && page === 1;
  const justIn = unfiltered ? newData?.data ?? [] : [];
  // (nothing's on both shelves)
  const featured = unfiltered ? (featuredData?.data ?? []).filter((item) => !justIn.some((fresh) => fresh.id === item.id)) : [];

  const { data: walletData } = useQuery<WalletResponse>({
    queryKey: ["user", "wallet"],
    queryFn: () => fetchWithAuth("/user/wallet?limit=1").then(readJson<WalletResponse>),
  });

  const { data: avatarResponse } = useQuery<AvatarResponse>({
    queryKey: ["avatar"],
    queryFn: () => fetchWithAuth("/user/avatar").then(readJson<AvatarResponse>),
  });

  const { data: manifest } = useAvatarManifest();

  const buyMutation = useMutation({
    mutationFn: (itemId: number) =>
      fetchWithAuth(`/marketplace/shop/items/${itemId}/buy`, {
        method: "POST",
      }).then(readJson<PurchaseResponse>),
    onSuccess: (data) => {
      setPreviewItem((current) =>
        current?.id === data.data.item.id ? null : current
      );
      queryClient.setQueryData<WalletResponse>(["user", "wallet"], (current) => ({
        data: {
          ...(current?.data || {}),
          coinBalance: data.data.coinBalance,
        },
      }));
      queryClient.invalidateQueries({ queryKey: ["marketplace", "shop"] });
      queryClient.invalidateQueries({ queryKey: ["avatar"] });
      queryClient.invalidateQueries({ queryKey: ["avatar", "ensureComposite"] });
    },
  });

  const items = extraOnly ? [] : shopData?.data || [];
  // Once the item it was opened on turns up: try it on, and bring it into view
  useEffect(() => {
    if (!focusName || focused.current) return;
    const match = (shopData?.data || []).find((item) => item.name.toLowerCase() === focusName.toLowerCase());
    if (!match) return;
    focused.current = true;
    setPreviewItem(match);
    window.requestAnimationFrame(() => document.getElementById(`shop-item-${match.id}`)?.scrollIntoView({ block: "center", behavior: "smooth" }));
  }, [focusName, shopData]);
  const pagination = shopData?.pagination || {
    page,
    limit: 20,
    total: 0,
    pageCount: 1,
  };
  const coinBalance = walletData?.data.coinBalance || 0;
  const wornBody = avatarResponse?.data.outfit.find(({ item }) => item.category === "body")?.item;
  const isInitialLoading = !extraOnly && isLoading && !shopData;
  const previewLook = useMemo(() => {
    const avatar = avatarResponse?.data;
    if (!avatar || !manifest || !previewItem) return null;
    return lookWithItem(lookFromAvatar(avatar), previewItem, manifest.categories);
  }, [avatarResponse?.data, manifest, previewItem]);
  const firstItemNumber =
    pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.limit + 1;
  const lastItemNumber = Math.min(
    pagination.page * pagination.limit,
    pagination.total
  );

  // One avatar item's card, in the grid, among today's featured or the new arrivals
  const itemCard = (item: ShopItem, anchor = true) => {
  const price = item.basePrice || 0;
  const cannotAfford = coinBalance < price;
  const pendingThisItem =
    buyMutation.isPending && buyMutation.variables === item.id;
  const rarity = item.rarity || "common";
  const isPreviewing = previewItem?.id === item.id;
  // Yours already: greyed, and not for sale to you again
  const owned = item.ownedCount > 0;
  const fits = item.category === "body" || itemFitsBody(item, wornBody?.itemKey);
  const supplyLeft =
    item.supplyLimit !== null ? Math.max(item.supplyLimit - item.mintedCount, 0) : null;

  return (
    <article key={item.id} id={anchor ? `shop-item-${item.id}` : undefined} className={`shop-item rarity-${rarity} ${isPreviewing ? "is-previewing" : ""} ${owned ? "is-owned" : ""}`}>
      <div className="shop-item-art">
        <img className="shop-item-icon" src={item.icon} alt="" draggable={false} />
        <span className="shop-rarity">{rarity}</span>
        {item.ownedCount > 0 && (
          <span className="shop-owned">Owned{item.ownedCount > 1 ? ` ×${item.ownedCount}` : ""}</span>
        )}
      </div>

      <h3 className="shop-item-name" title={item.name}>{item.name}</h3>
      <p className="shop-item-meta">
        <span className="shop-item-slot">{CATEGORY_LABELS[item.category] || item.category}</span>
        {supplyLeft !== null && (
          <span className={supplyLeft <= 5 ? "is-scarce" : ""}>
            {" · "}
            {supplyLeft === 0 ? "none left" : `${supplyLeft} of ${item.supplyLimit} left`}
          </span>
        )}
      </p>
      {gameOf(item) && <p className="shop-item-game">From {gameOf(item)}</p>}
      {!fits && wornBody && <p className="shop-item-fit">Doesn&apos;t show on your {wornBody.name}</p>}

      <div className="shop-item-price">
        <TicketIcon className="h-4 w-6" perforation="#0d131b" />
        {price.toLocaleString()}
        {cannotAfford && !item.isSoldOut && !owned && (
          <span className="shop-item-short">Need {(price - coinBalance).toLocaleString()} more</span>
        )}
      </div>

      <div className="shop-item-actions">
        <button
          type="button"
          onClick={() => {
            setPreviewItem(isPreviewing ? null : item);
            if (!isPreviewing) onTryOn?.({ name: item.name, category: item.category, rarity, price, owned, short: cannotAfford });
          }}
          className={`shop-button is-secondary ${isPreviewing ? "is-active" : ""}`}
          aria-pressed={isPreviewing}
        >
          Show
        </button>
        {!owned && (
          <button
            type="button"
            onClick={() => setConfirming({ name: item.name, price, icon: item.icon, buy: () => buyMutation.mutate(item.id) })}
            disabled={pendingThisItem || item.isSoldOut || cannotAfford}
            className="shop-button"
          >
            {item.isSoldOut ? "Sold out" : pendingThisItem ? "Buying…" : "Buy"}
          </button>
        )}
      </div>
    </article>
  );
  };

  useEffect(() => {
    onPreviewLookChange?.(previewLook);
  }, [onPreviewLookChange, previewLook]);
  useEffect(() => () => onPreviewLookChange?.(null), [onPreviewLookChange]);

  return (
    <section className="shop">
      {justIn.length > 0 && (
        <div className="shop-featured shop-new">
          <p className="shop-featured-title">New</p>
          <div className="shop-grid">{justIn.map((item) => itemCard(item, false))}</div>
        </div>
      )}
      {featured.length > 0 && (
        <div className="shop-featured">
          <p className="shop-featured-title">Featured today</p>
          <div className="shop-grid">{featured.map((item) => itemCard(item, false))}</div>
        </div>
      )}
      {isInitialLoading ? (
        <div className="shop-state">
          <LoadingSpinner />
        </div>
      ) : error && !shopData && !extraOnly ? (
        <ErrorDisplay message={(error as Error).message || "Failed to load shop"} />
      ) : items.length === 0 && shownExtras.length === 0 ? (
        <div className="shop-state">{emptyShelf ? emptyShelf.soon : "Nothing matches those filters."}</div>
      ) : (
        <div className={`shop-grid ${isFetching ? "is-refreshing" : ""}`}>
          {shownExtras.map((item) => {
            const cannotAfford = Boolean(item.action.buy) && coinBalance < item.price;
            return (
              <article key={item.id} className={`shop-item rarity-common ${item.previewing ? "is-previewing" : ""} ${item.owned ? "is-owned" : ""}`}>
                <div className="shop-item-art">
                  <img className="shop-item-icon shop-item-swatch" src={item.icon} alt="" draggable={false} />
                  {item.owned && <span className="shop-owned">Owned</span>}
                </div>

                <h3 className="shop-item-name" title={item.name}>{item.name}</h3>
                <p className="shop-item-meta">
                  <span className="shop-item-slot">{item.categoryLabel}</span>
                </p>

                <div className="shop-item-price">
                  <TicketIcon className="h-4 w-6" perforation="#0d131b" />
                  {item.price.toLocaleString()}
                  {cannotAfford && <span className="shop-item-short">Need {(item.price - coinBalance).toLocaleString()} more</span>}
                </div>

                <div className="shop-item-actions">
                  {!item.noPreview && (
                    <button
                      type="button"
                      onClick={() => {
                        item.onPreview();
                        if (!item.previewing) onTryOn?.({ name: item.name, category: item.category, price: item.price, owned: item.owned, short: cannotAfford });
                      }}
                      className={`shop-button is-secondary ${item.previewing ? "is-active" : ""}`}
                      aria-pressed={item.previewing}
                    >
                      {item.previewLabel ?? "Show"}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      const { onClick } = item.action;
                      // (only a purchase asks first: putting a banner up is free)
                      if (item.action.buy && onClick) setConfirming({ name: item.name, price: item.price, icon: item.icon, swatch: true, buy: onClick });
                      else onClick?.();
                    }}
                    disabled={item.action.disabled || cannotAfford}
                    className="shop-button"
                  >
                    {item.action.label}
                  </button>
                </div>
                {item.error && (
                  <p className="shop-error" role="alert">
                    {item.error.message}
                  </p>
                )}
              </article>
            );
          })}
          {items.map((item) => itemCard(item))}
        </div>
      )}

      {!extraOnly && !isInitialLoading && !error && pagination.total > 0 && (
        <div className="shop-pager">
          <span>
            {firstItemNumber}–{lastItemNumber} of {pagination.total}
          </span>
          <div>
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(current - 1, 1))}
              disabled={pagination.page <= 1 || isFetching}
              aria-label="Previous page"
            >
              <FaChevronLeft />
            </button>
            <span>
              Page {pagination.page} of {pagination.pageCount}
            </span>
            <button
              type="button"
              onClick={() => setPage((current) => Math.min(current + 1, pagination.pageCount))}
              disabled={pagination.page >= pagination.pageCount || isFetching}
              aria-label="Next page"
            >
              <FaChevronRight />
            </button>
          </div>
        </div>
      )}

      {buyMutation.error && (
        <p className="shop-error" role="alert">
          {(buyMutation.error as Error).message}
        </p>
      )}

      {confirming && (
        <div className="shop-confirm-backdrop" onClick={() => setConfirming(null)}>
          <div className="shop-confirm" role="alertdialog" aria-modal="true" aria-label={`Buy ${confirming.name}?`} onClick={(event) => event.stopPropagation()}>
            <img className={`shop-item-icon ${confirming.swatch ? "shop-item-swatch" : ""}`} src={confirming.icon} alt="" draggable={false} />
            <p className="shop-confirm-title">Buy {confirming.name}?</p>
            <p className="shop-item-price">
              <TicketIcon className="h-4 w-6" perforation="#0d131b" />
              {confirming.price.toLocaleString()}
              <span className="shop-confirm-left">leaves you {(coinBalance - confirming.price).toLocaleString()}</span>
            </p>
            <div className="shop-item-actions">
              <button type="button" className="shop-button is-secondary" onClick={() => setConfirming(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="shop-button"
                autoFocus
                onClick={() => {
                  confirming.buy();
                  setConfirming(null);
                }}
              >
                Buy
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
