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
  FaSearch,
} from "react-icons/fa";
import { fetchWithAuth } from "../../fetchWithAuth";
import TicketIcon from "../TicketIcon";
import LoadingSpinner from "../LoadingSpinner";
import ErrorDisplay from "../ErrorDisplay";
import { itemFitsBody } from "./compose";
import { CATEGORY_LABELS, lookFromAvatar, lookWithItem } from "./look";
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

const classifications = [
  { value: "", label: "All categories" },
  ...Object.entries(CATEGORY_LABELS)
    .filter(([value]) => value !== "background") // (they come with banners)
    .map(([value, label]) => ({ value, label })),
];

const rarities = [
  { value: "", label: "All rarities" },
  { value: "common", label: "Common" },
  { value: "uncommon", label: "Uncommon" },
  { value: "rare", label: "Rare" },
  { value: "epic", label: "Epic" },
  { value: "legendary", label: "Legendary" },
];

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
  icon: string;
  price: number;
  owned: boolean;
  previewing: boolean;
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
};

export function AvatarShop({ onPreviewLookChange, focusName, extraItems = [] }: AvatarShopProps) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState(focusName ?? "");
  const [debouncedSearch, setDebouncedSearch] = useState(focusName ?? "");
  const focused = useRef(false);
  const [classification, setClassification] = useState("");
  const [rarityFilter, setRarityFilter] = useState("");
  const [page, setPage] = useState(1);
  const [previewItem, setPreviewItem] = useState<ShopItem | null>(null);

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

  // The extra wares' categories go in the filter after the avatar items' own
  const extraCategories = [...new Map(extraItems.map((item) => [item.category, item.categoryLabel])).entries()];
  const extraOnly = extraCategories.some(([value]) => value === classification);
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
      queryClient.invalidateQueries({ queryKey: ["marketplace", "shop", "items"] });
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

  useEffect(() => {
    onPreviewLookChange?.(previewLook);
  }, [onPreviewLookChange, previewLook]);
  useEffect(() => () => onPreviewLookChange?.(null), [onPreviewLookChange]);

  return (
    <section className="shop">
      <div className="shop-filters">
        <label className="shop-search">
          <span className="sr-only">Search shop items</span>
          <FaSearch aria-hidden="true" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search items"
          />
        </label>

        <label>
          <span className="sr-only">Classification</span>
          <select value={classification} onChange={(event) => setClassification(event.target.value)}>
            {classifications.map((option) => (
              <option key={option.value || "all"} value={option.value}>
                {option.label}
              </option>
            ))}
            {extraCategories.map(([value, label]) => (
              <option key={value} value={value}>
                {label}s
              </option>
            ))}
          </select>
        </label>

        <label>
          <span className="sr-only">Rarity</span>
          <select value={rarityFilter} onChange={(event) => setRarityFilter(event.target.value)}>
            {rarities.map((option) => (
              <option key={option.value || "all"} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {isInitialLoading ? (
        <div className="shop-state">
          <LoadingSpinner />
        </div>
      ) : error && !shopData && !extraOnly ? (
        <ErrorDisplay message={(error as Error).message || "Failed to load shop"} />
      ) : items.length === 0 && shownExtras.length === 0 ? (
        <div className="shop-state">Nothing matches those filters.</div>
      ) : (
        <div className={`shop-grid ${isFetching ? "is-refreshing" : ""}`}>
          {shownExtras.map((item) => {
            const cannotAfford = Boolean(item.action.buy) && coinBalance < item.price;
            return (
              <article key={item.id} className={`shop-item rarity-common ${item.previewing ? "is-previewing" : ""}`}>
                <div className="shop-item-art">
                  <img className="shop-item-icon" src={item.icon} alt="" draggable={false} style={{ imageRendering: "pixelated" }} />
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
                  <button
                    type="button"
                    onClick={item.onPreview}
                    className={`shop-button is-secondary ${item.previewing ? "is-active" : ""}`}
                    aria-pressed={item.previewing}
                  >
                    {item.previewing ? "Hide" : "Try on"}
                  </button>
                  <button type="button" onClick={item.action.onClick} disabled={item.action.disabled || cannotAfford} className="shop-button">
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
          {items.map((item) => {
            const price = item.basePrice || 0;
            const cannotAfford = coinBalance < price;
            const pendingThisItem =
              buyMutation.isPending && buyMutation.variables === item.id;
            const rarity = item.rarity || "common";
            const isPreviewing = previewItem?.id === item.id;
            const fits = item.category === "body" || itemFitsBody(item, wornBody?.itemKey);
            const supplyLeft =
              item.supplyLimit !== null ? Math.max(item.supplyLimit - item.mintedCount, 0) : null;

            return (
              <article key={item.id} id={`shop-item-${item.id}`} className={`shop-item rarity-${rarity} ${isPreviewing ? "is-previewing" : ""}`}>
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
                {!fits && wornBody && <p className="shop-item-fit">Doesn&apos;t show on your {wornBody.name}</p>}

                <div className="shop-item-price">
                  <TicketIcon className="h-4 w-6" perforation="#0d131b" />
                  {price.toLocaleString()}
                  {cannotAfford && !item.isSoldOut && (
                    <span className="shop-item-short">Need {(price - coinBalance).toLocaleString()} more</span>
                  )}
                </div>

                <div className="shop-item-actions">
                  <button
                    type="button"
                    onClick={() => setPreviewItem(isPreviewing ? null : item)}
                    className={`shop-button is-secondary ${isPreviewing ? "is-active" : ""}`}
                    aria-pressed={isPreviewing}
                  >
                    {isPreviewing ? "Hide" : "Try on"}
                  </button>
                  <button
                    type="button"
                    onClick={() => buyMutation.mutate(item.id)}
                    disabled={pendingThisItem || item.isSoldOut || cannotAfford}
                    className="shop-button"
                  >
                    {item.isSoldOut ? "Sold out" : pendingThisItem ? "Buying…" : "Buy"}
                  </button>
                </div>
              </article>
            );
          })}
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
    </section>
  );
}
