import { useEffect, useMemo, useState } from "react";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  FaEye,
  FaChevronLeft,
  FaChevronRight,
  FaCoins,
  FaSearch,
  FaShoppingBag,
} from "react-icons/fa";
import { fetchWithAuth } from "../../fetchWithAuth";
import LoadingSpinner from "../LoadingSpinner";
import ErrorDisplay from "../ErrorDisplay";
import { AvatarPreview } from "./AvatarPreview";
import type { AvatarData, AvatarItem, AvatarResponse } from "./types";

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

const rarityStyles: Record<string, string> = {
  common: "border-gray-600 text-gray-200",
  uncommon: "border-green-500 text-green-200",
  rare: "border-blue-500 text-blue-200",
  epic: "border-purple-500 text-purple-200",
  legendary: "border-amber-400 text-amber-200",
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

export function AvatarShop() {
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
  const previewedLayers = previewLayers(avatarResponse?.data, previewItem);
  const firstItemNumber =
    pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.limit + 1;
  const lastItemNumber = Math.min(
    pagination.page * pagination.limit,
    pagination.total
  );

  return (
    <section className="flex flex-col gap-5 border-t border-red-950/70 pt-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3 text-amber-200">
          <FaShoppingBag className="text-2xl text-red-400" />
          <h2 className="text-2xl text-red-200">Shop</h2>
          {isFetching && !isInitialLoading ? (
            <span className="rounded border border-gray-700 px-2 py-1 text-xs text-gray-400">
              Updating
            </span>
          ) : null}
        </div>
        <div className="inline-flex items-center gap-2 self-start rounded border border-amber-500/60 bg-amber-950/30 px-3 py-2 text-amber-200 sm:self-auto">
          <FaCoins className="text-amber-300" />
          <span className="font-bold text-amber-300">{coinBalance.toLocaleString()}</span>
        </div>
      </div>

      <div className="grid gap-3 rounded border border-red-950/70 bg-black/30 p-3 md:grid-cols-[minmax(0,1fr),220px,180px]">
        <label className="relative block">
          <span className="sr-only">Search shop items</span>
          <FaSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search items"
            className="h-11 w-full rounded border border-gray-800 bg-gray-950 py-2 pl-10 pr-3 text-sm text-white outline-none transition placeholder:text-gray-500 focus:border-red-600"
          />
        </label>

        <label>
          <span className="sr-only">Classification</span>
          <select
            value={classification}
            onChange={(event) => setClassification(event.target.value)}
            className="h-11 w-full rounded border border-gray-800 bg-gray-950 px-3 text-sm text-white outline-none transition focus:border-red-600"
          >
            {classifications.map((option) => (
              <option key={option.value || "all"} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span className="sr-only">Rarity</span>
          <select
            value={rarityFilter}
            onChange={(event) => setRarityFilter(event.target.value)}
            className="h-11 w-full rounded border border-gray-800 bg-gray-950 px-3 text-sm text-white outline-none transition focus:border-red-600"
          >
            {rarities.map((option) => (
              <option key={option.value || "all"} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {previewItem && (
        <div className="grid gap-4 rounded border border-red-950/70 bg-black/30 p-3 sm:grid-cols-[112px,minmax(0,1fr),auto] sm:items-center">
          <div className="flex justify-center sm:justify-start">
            <AvatarPreview layers={previewedLayers} size="sm" />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-2 text-center sm:text-left">
            <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
              <FaEye className="text-red-300" />
              <h3 className="text-lg font-bold text-red-100">Previewing</h3>
            </div>
            <p className="truncate text-sm text-gray-400">
              <span className="font-bold text-white">{previewItem.name}</span> as{" "}
              <span className="font-bold text-white">
                {getEquipGroup(previewItem)}
              </span>.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setPreviewItem(null)}
            className="mx-auto min-h-10 rounded border border-gray-700 px-4 py-2 text-sm text-gray-200 transition hover:border-red-700 sm:mx-0"
          >
            Clear
          </button>
        </div>
      )}

      {isInitialLoading ? (
        <div className="flex min-h-80 items-center justify-center rounded border border-red-950/70 bg-black/30">
          <LoadingSpinner />
        </div>
      ) : error && !shopData ? (
        <ErrorDisplay message={(error as Error).message || "Failed to load shop"} />
      ) : items.length === 0 ? (
        <div className="rounded border border-red-950/70 bg-black/30 px-4 py-6 text-center text-gray-300">
          No shop items match.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((item) => {
            const price = item.basePrice || 0;
            const cannotAfford = coinBalance < price;
            const pendingThisItem =
              buyMutation.isPending && buyMutation.variables === item.id;
            const rarity = item.rarity || "common";
            const rarityClass = rarityStyles[rarity] || rarityStyles.common;
            const isPreviewing = previewItem?.id === item.id;
            const equipGroup = getEquipGroup(item);

            return (
              <article
                key={item.id}
                className={`flex flex-col gap-3 rounded border bg-black/40 p-3 sm:grid sm:grid-cols-[80px,minmax(0,1fr),170px] sm:items-center ${rarityClass}`}
              >
                <div className="flex justify-center sm:justify-start">
                  <AvatarPreview layers={[item]} size="xs" />
                </div>

                <div className="flex min-w-0 flex-col gap-2 text-center sm:text-left">
                  <div>
                    <h3 className="truncate text-base font-bold text-white sm:text-lg">
                      {item.name}
                    </h3>
                    <div className="mt-1 flex flex-wrap justify-center gap-2 text-xs uppercase tracking-normal sm:justify-start">
                      <span className="rounded border border-current px-2 py-1">
                        {item.slot}
                      </span>
                      {equipGroup !== item.slot ? (
                        <span className="rounded border border-current px-2 py-1">
                          {equipGroup}
                        </span>
                      ) : null}
                      <span className="rounded border border-current px-2 py-1">
                        {rarity}
                      </span>
                    </div>
                  </div>

                  <div className="text-sm text-gray-300">
                    <div>
                      Owned: {item.ownedCount}
                      {item.supplyLimit ? (
                        <span>
                          {" "}
                          | {item.mintedCount}/{item.supplyLimit}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-stretch sm:justify-center">
                  <div className="flex items-center gap-2 text-amber-200 sm:justify-center">
                    <FaCoins className="text-amber-300" />
                    <span className="font-bold">{price.toLocaleString()}</span>
                  </div>

                  <button
                    type="button"
                    onClick={() => setPreviewItem(isPreviewing ? null : item)}
                    className={`min-h-10 min-w-28 rounded border px-4 py-2 text-sm font-bold transition sm:w-full ${
                      isPreviewing
                        ? "border-amber-400 bg-amber-950/50 text-amber-100"
                        : "border-gray-700 bg-gray-950 text-gray-200 hover:border-red-700"
                    }`}
                  >
                    {isPreviewing ? "Hide" : "Preview"}
                  </button>

                  <button
                    type="button"
                    onClick={() => buyMutation.mutate(item.id)}
                    disabled={pendingThisItem || item.isSoldOut || cannotAfford}
                    className="min-h-10 min-w-28 rounded bg-red-700 px-4 py-2 text-sm font-bold text-white transition hover:bg-red-600 disabled:cursor-not-allowed disabled:bg-gray-800 disabled:text-gray-400 sm:w-full"
                  >
                    {item.isSoldOut
                      ? "Sold Out"
                      : cannotAfford
                        ? "Need Coins"
                        : pendingThisItem
                          ? "Buying..."
                          : "Buy"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {!isInitialLoading && !error && (
        <div className="flex flex-col gap-3 rounded border border-red-950/70 bg-black/30 px-4 py-3 text-sm text-gray-300 sm:flex-row sm:items-center sm:justify-between">
          <span>
            {pagination.total === 0
              ? "0 items"
              : `${firstItemNumber}-${lastItemNumber} of ${pagination.total}`}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(current - 1, 1))}
              disabled={pagination.page <= 1 || isFetching}
              className="inline-flex h-10 w-10 items-center justify-center rounded border border-gray-800 bg-gray-950 text-gray-200 transition hover:border-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Previous page"
            >
              <FaChevronLeft />
            </button>
            <span className="min-w-24 text-center">
              Page {pagination.page} of {pagination.pageCount}
            </span>
            <button
              type="button"
              onClick={() =>
                setPage((current) => Math.min(current + 1, pagination.pageCount))
              }
              disabled={pagination.page >= pagination.pageCount || isFetching}
              className="inline-flex h-10 w-10 items-center justify-center rounded border border-gray-800 bg-gray-950 text-gray-200 transition hover:border-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Next page"
            >
              <FaChevronRight />
            </button>
          </div>
        </div>
      )}

      {buyMutation.error && (
        <div className="rounded border border-red-900 bg-red-950/50 px-4 py-3 text-center text-sm text-red-100">
          {(buyMutation.error as Error).message}
        </div>
      )}
    </section>
  );
}
