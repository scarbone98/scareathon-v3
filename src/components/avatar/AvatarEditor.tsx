import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FaUndo } from "react-icons/fa";
import { fetchWithAuth } from "../../fetchWithAuth";
import LoadingSpinner from "../LoadingSpinner";
import ErrorDisplay from "../ErrorDisplay";
import { AvatarPreview } from "./AvatarPreview";
import { uploadAvatarComposite } from "./avatarComposite";
import type { AvatarData, AvatarItem, AvatarResponse } from "./types";

function sortEquipped(layers: AvatarItem[]) {
  return [...layers].sort(
    (a, b) =>
      a.layerOrder - b.layerOrder ||
      (a.itemInstanceId || a.id) - (b.itemInstanceId || b.id)
  );
}

function replaceEquippedItem(data: AvatarData, slot: string, item: AvatarItem) {
  const equipped = data.equipped.filter((layer) => layer.slot !== slot);
  equipped.push(item);
  return {
    ...data,
    equipped: sortEquipped(equipped),
  };
}

export function AvatarEditor() {
  const queryClient = useQueryClient();
  const [activeSlot, setActiveSlot] = useState("body");
  const initialCompositeSavedRef = useRef(false);

  const {
    data: avatarResponse,
    isLoading,
    error,
  } = useQuery<AvatarResponse>({
    queryKey: ["avatar"],
    queryFn: () => fetchWithAuth("/user/avatar").then((res) => res.json()),
  });

  const avatar = avatarResponse?.data;
  const activeItems = avatar?.inventory[activeSlot] || [];
  const equippedBySlot = useMemo(() => {
    const map = new Map<string, AvatarItem>();
    avatar?.equipped.forEach((item) => map.set(item.slot, item));
    return map;
  }, [avatar]);

  useEffect(() => {
    if (!avatar || initialCompositeSavedRef.current) return;

    initialCompositeSavedRef.current = true;
    uploadAvatarComposite(avatar.equipped)
      .then((compositeUrl) => {
        if (compositeUrl) {
          queryClient.setQueryData(["avatar", "compositeUrl"], compositeUrl);
        }
      })
      .catch((error) => {
        console.error("Failed to save avatar composite", error);
      });
  }, [avatar, queryClient]);

  const equipMutation = useMutation({
    mutationFn: async ({
      slot,
      itemInstanceId,
    }: {
      slot: string;
      itemInstanceId: number;
    }) => {
      const response = await fetchWithAuth("/user/avatar/equip", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slot, itemInstanceId }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to update avatar");
      }
      return data as AvatarResponse;
    },
    onMutate: async ({ slot, itemInstanceId }) => {
      await queryClient.cancelQueries({ queryKey: ["avatar"] });
      const previous = queryClient.getQueryData<AvatarResponse>(["avatar"]);
      const item = previous?.data.inventory[slot]?.find(
        (inventoryItem) => inventoryItem.itemInstanceId === itemInstanceId
      );

      if (previous && item) {
        queryClient.setQueryData<AvatarResponse>(["avatar"], {
          data: replaceEquippedItem(previous.data, slot, item),
        });
      }

      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["avatar"], context.previous);
      }
    },
    onSuccess: async (data) => {
      queryClient.setQueryData(["avatar"], data);
      try {
        const compositeUrl = await uploadAvatarComposite(data.data.equipped);
        if (compositeUrl) {
          queryClient.setQueryData(["avatar", "compositeUrl"], compositeUrl);
        }
      } catch (error) {
        console.error("Failed to save avatar composite", error);
      }
    },
  });

  const resetMutation = useMutation({
    mutationFn: async () => {
      const response = await fetchWithAuth("/user/avatar/reset", {
        method: "POST",
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to reset avatar");
      }
      return data as AvatarResponse;
    },
    onSuccess: async (data) => {
      queryClient.setQueryData(["avatar"], data);
      try {
        const compositeUrl = await uploadAvatarComposite(data.data.equipped);
        if (compositeUrl) {
          queryClient.setQueryData(["avatar", "compositeUrl"], compositeUrl);
        }
      } catch (error) {
        console.error("Failed to save avatar composite", error);
      }
    },
  });

  if (isLoading) return <LoadingSpinner />;
  if (error) {
    return <ErrorDisplay message={(error as Error).message || "Unknown error"} />;
  }
  if (!avatar) return null;

  return (
    <section className="flex flex-col gap-5 border-t border-red-950/70 pt-5">
      <div className="flex flex-col items-center gap-5 lg:flex-row lg:items-start">
        <AvatarPreview layers={avatar.equipped} />

        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <div className="flex flex-wrap justify-center gap-2 lg:justify-start">
            {avatar.slots.map((slot) => (
              <button
                key={slot.slot}
                type="button"
                onClick={() => setActiveSlot(slot.slot)}
                className={`rounded border px-3 py-2 text-sm transition ${
                  activeSlot === slot.slot
                    ? "border-orange-500 bg-orange-700 text-white"
                    : "border-red-950 bg-gray-900 text-gray-300 hover:border-red-700"
                }`}
              >
                {slot.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {activeItems.map((item) => {
              const equippedItem = equippedBySlot.get(activeSlot);
              const isEquipped = equippedItem?.itemInstanceId === item.itemInstanceId;

              return (
                <button
                  key={item.itemInstanceId}
                  type="button"
                  onClick={() =>
                    equipMutation.mutate({
                      slot: activeSlot,
                      itemInstanceId: item.itemInstanceId,
                    })
                  }
                  disabled={equipMutation.isPending && !isEquipped}
                  className={`flex min-h-32 flex-col items-center justify-between gap-2 rounded border p-3 text-center transition ${
                    isEquipped
                      ? "border-orange-500 bg-orange-950/70 text-orange-100"
                      : "border-red-950 bg-black/40 text-gray-200 hover:border-red-700"
                  }`}
                >
                  <AvatarPreview layers={[item]} size="sm" />
                  <span className="text-sm leading-tight">{item.name}</span>
                </button>
              );
            })}
          </div>

          {(equipMutation.error || resetMutation.error) && (
            <div className="text-center text-sm text-red-400 lg:text-left">
              {((equipMutation.error || resetMutation.error) as Error).message}
            </div>
          )}

          <div className="flex justify-center lg:justify-start">
            <button
              type="button"
              onClick={() => resetMutation.mutate()}
              disabled={resetMutation.isPending}
              className="flex items-center gap-2 rounded bg-gray-800 px-4 py-2 text-sm text-gray-100 transition hover:bg-gray-700 disabled:opacity-60"
            >
              <FaUndo />
              <span>Reset</span>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
