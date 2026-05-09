import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FaCoins, FaShoppingBag } from "react-icons/fa";
import { fetchWithAuth } from "../../fetchWithAuth";
import LoadingSpinner from "../LoadingSpinner";
import ErrorDisplay from "../ErrorDisplay";
import { AvatarPreview } from "./AvatarPreview";
import type { AvatarItem } from "./types";

type ShopItem = AvatarItem & {
  supplyLimit: number | null;
  mintedCount: number;
  ownedCount: number;
  isSoldOut: boolean;
};

type ShopResponse = {
  data: ShopItem[];
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

function readJson<T>(response: Response) {
  return response.json().then((data) => {
    if (!response.ok) {
      throw new Error(data.error || "Request failed");
    }
    return data as T;
  });
}

export function AvatarShop() {
  const queryClient = useQueryClient();

  const {
    data: shopData,
    isLoading,
    error,
  } = useQuery<ShopResponse>({
    queryKey: ["marketplace", "shop", "items"],
    queryFn: () => fetchWithAuth("/marketplace/shop/items").then(readJson<ShopResponse>),
  });

  const { data: walletData } = useQuery<WalletResponse>({
    queryKey: ["user", "wallet"],
    queryFn: () => fetchWithAuth("/user/wallet?limit=1").then(readJson<WalletResponse>),
  });

  const buyMutation = useMutation({
    mutationFn: (itemId: number) =>
      fetchWithAuth(`/marketplace/shop/items/${itemId}/buy`, {
        method: "POST",
      }).then(readJson<PurchaseResponse>),
    onSuccess: (data) => {
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

  if (isLoading) return <LoadingSpinner />;
  if (error) {
    return <ErrorDisplay message={(error as Error).message || "Failed to load shop"} />;
  }

  const items = shopData?.data || [];
  const coinBalance = walletData?.data.coinBalance || 0;

  return (
    <section className="flex flex-col gap-5 border-t border-red-950/70 pt-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3 text-amber-200">
          <FaShoppingBag className="text-2xl text-red-400" />
          <h2 className="text-2xl text-red-200">Shop</h2>
        </div>
        <div className="inline-flex items-center gap-2 self-start rounded border border-amber-500/60 bg-amber-950/30 px-3 py-2 text-amber-200 sm:self-auto">
          <FaCoins className="text-amber-300" />
          <span className="font-bold text-amber-300">{coinBalance.toLocaleString()}</span>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="rounded border border-red-950/70 bg-black/30 px-4 py-6 text-center text-gray-300">
          No released shop items yet.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => {
            const price = item.basePrice || 0;
            const cannotAfford = coinBalance < price;
            const pendingThisItem =
              buyMutation.isPending && buyMutation.variables === item.id;
            const rarity = item.rarity || "common";
            const rarityClass = rarityStyles[rarity] || rarityStyles.common;

            return (
              <article
                key={item.id}
                className={`flex min-h-80 flex-col gap-3 rounded border bg-black/40 p-4 ${rarityClass}`}
              >
                <div className="flex justify-center">
                  <AvatarPreview layers={[item]} size="sm" />
                </div>

                <div className="flex flex-1 flex-col gap-2 text-center">
                  <div>
                    <h3 className="text-lg font-bold text-white">{item.name}</h3>
                    <div className="mt-1 flex flex-wrap justify-center gap-2 text-xs uppercase tracking-normal">
                      <span className="rounded border border-current px-2 py-1">
                        {item.slot}
                      </span>
                      <span className="rounded border border-current px-2 py-1">
                        {rarity}
                      </span>
                    </div>
                  </div>

                  <div className="mt-auto flex flex-col gap-2 text-sm text-gray-300">
                    <div className="flex items-center justify-center gap-2 text-amber-200">
                      <FaCoins className="text-amber-300" />
                      <span className="font-bold">{price.toLocaleString()}</span>
                    </div>
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

                <button
                  type="button"
                  onClick={() => buyMutation.mutate(item.id)}
                  disabled={pendingThisItem || item.isSoldOut || cannotAfford}
                  className="min-h-11 rounded bg-red-700 px-4 py-2 text-sm font-bold text-white transition hover:bg-red-600 disabled:cursor-not-allowed disabled:bg-gray-800 disabled:text-gray-400"
                >
                  {item.isSoldOut
                    ? "Sold Out"
                    : cannotAfford
                      ? "Need Coins"
                      : pendingThisItem
                        ? "Buying..."
                        : "Buy"}
                </button>
              </article>
            );
          })}
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
