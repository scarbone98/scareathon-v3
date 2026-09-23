import { useEffect, useMemo, useState } from "react";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  FaChevronLeft,
  FaChevronRight,
  FaCoins,
  FaSearch,
} from "react-icons/fa";
import { fetchWithAuth } from "../../fetchWithAuth";
import LoadingSpinner from "../LoadingSpinner";
import ErrorDisplay from "../ErrorDisplay";
import { AvatarPreview } from "./AvatarPreview";
import type { AvatarData, AvatarItem, AvatarResponse } from "./types";
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
  { value: "", label: "All classifications" },
  { value: "body", label: "Body" },
  { value: "pants", label: "Pants" },
  { value: "shirt", label: "Shirt" },
  { value: "shoes", label: "Shoes" },
  { value: "face", label: "Face" },
  { value: "hair", label: "Hair" },
  { value: "accessory", label: "Accessory" },
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

function sortLayers(layers: AvatarItem[]) {
  return [...layers].sort(
    (a, b) =>
      a.layerOrder - b.layerOrder ||
      (a.itemInstanceId || a.id) - (b.itemInstanceId || b.id)
  );
}

function getEquipGroup(item: AvatarItem) {
  return item.equipGroup || item.slot;
}

function previewLayers(avatar: AvatarData | undefined, item: ShopItem | null) {
  if (!avatar) return item ? [item] : [];
  if (!item) return avatar.equipped;
  const equipGroup = getEquipGroup(item);

  return sortLayers([
    ...avatar.equipped.filter((layer) => getEquipGroup(layer) !== equipGroup),
    item,
  ]);
}

type AvatarShopProps = {
  onPreviewLayersChange?: (layers: AvatarItem[] | null) => void;
};

export function AvatarShop({ onPreviewLayersChange }: AvatarShopProps) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
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
    if (classification) params.set("slot", classification);
    if (rarityFilter) params.set("rarity", rarityFilter);
    params.set("page", String(page));
    params.set("limit", "20");
    const query = params.toString();
    return `/marketplace/shop/items?${query}`;
  }, [classification, debouncedSearch, page, rarityFilter]);

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
  });

  const { data: walletData } = useQuery<WalletResponse>({
    queryKey: ["user", "wallet"],
    queryFn: () => fetchWithAuth("/user/wallet?limit=1").then(readJson<WalletResponse>),
  });

  const { data: avatarResponse } = useQuery<AvatarResponse>({
    queryKey: ["avatar"],
    queryFn: () => fetchWithAuth("/user/avatar").then(readJson<AvatarResponse>),
  });

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

  const items = shopData?.data || [];
  const pagination = shopData?.pagination || {
    page,
    limit: 20,
    total: 0,
    pageCount: 1,
  };
  const coinBalance = walletData?.data.coinBalance || 0;
  const isInitialLoading = isLoading && !shopData;
  const previewedLayers = useMemo(
    () => previewLayers(avatarResponse?.data, previewItem),
    [avatarResponse?.data, previewItem]
  );
  const firstItemNumber =
    pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.limit + 1;
  const lastItemNumber = Math.min(
    pagination.page * pagination.limit,
    pagination.total
  );

  useEffect(() => {
    onPreviewLayersChange?.(previewItem ? previewedLayers : null);

    return () => onPreviewLayersChange?.(null);
  }, [onPreviewLayersChange, previewItem, previewedLayers]);

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
      ) : error && !shopData ? (
        <ErrorDisplay message={(error as Error).message || "Failed to load shop"} />
      ) : items.length === 0 ? (
        <div className="shop-state">Nothing matches those filters.</div>
      ) : (
        <div className={`shop-grid ${isFetching ? "is-refreshing" : ""}`}>
          {items.map((item) => {
            const price = item.basePrice || 0;
            const cannotAfford = coinBalance < price;
            const pendingThisItem =
              buyMutation.isPending && buyMutation.variables === item.id;
            const rarity = item.rarity || "common";
            const isPreviewing = previewItem?.id === item.id;
            const equipGroup = getEquipGroup(item);
            const supplyLeft =
              item.supplyLimit !== null ? Math.max(item.supplyLimit - item.mintedCount, 0) : null;

            return (
              <article key={item.id} className={`shop-item rarity-${rarity} ${isPreviewing ? "is-previewing" : ""}`}>
                <div className="shop-item-art">
                  <AvatarPreview layers={previewLayers(avatarResponse?.data, item)} size="sm" />
                  <span className="shop-rarity">{rarity}</span>
                  {item.ownedCount > 0 && (
                    <span className="shop-owned">Owned{item.ownedCount > 1 ? ` ×${item.ownedCount}` : ""}</span>
                  )}
                </div>

                <h3 className="shop-item-name" title={item.name}>{item.name}</h3>
                <p className="shop-item-meta">
                  <span className="shop-item-slot">
                    {item.slot}
                    {equipGroup !== item.slot ? ` · ${equipGroup}` : ""}
                  </span>
                  {supplyLeft !== null && (
                    <span className={supplyLeft <= 5 ? "is-scarce" : ""}>
                      {" · "}
                      {supplyLeft === 0 ? "none left" : `${supplyLeft} of ${item.supplyLimit} left`}
                    </span>
                  )}
                </p>

                <div className="shop-item-price">
                  <FaCoins aria-hidden="true" />
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

      {!isInitialLoading && !error && pagination.total > 0 && (
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
