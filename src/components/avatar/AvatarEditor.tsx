import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FaSave, FaUndo } from "react-icons/fa";
import { fetchWithAuth } from "../../fetchWithAuth";
import LoadingSpinner from "../LoadingSpinner";
import ErrorDisplay from "../ErrorDisplay";
import { AvatarPreview } from "./AvatarPreview";
import { uploadAvatarComposite } from "./avatarComposite";
import type { AvatarItem, AvatarResponse } from "./types";

function sortEquipped(layers: AvatarItem[]) {
  return [...layers].sort(
    (a, b) =>
      a.layerOrder - b.layerOrder ||
      (a.itemInstanceId || a.id) - (b.itemInstanceId || b.id)
  );
}

function getEquipGroup(item: AvatarItem) {
  return item.equipGroup || item.slot;
}

function isHiddenAvatarItem(item: AvatarItem) {
  return item.itemKey === "default_accessory_none";
}

function visibleItems(items: AvatarItem[]) {
  return items.filter((item) => !isHiddenAvatarItem(item));
}

function selectionKey(items: AvatarItem[]) {
  return visibleItems(items)
    .map((item) => item.itemInstanceId)
    .filter((id): id is number => typeof id === "number")
    .sort((a, b) => a - b)
    .join(",");
}

function toggleDraftItem(draftEquipped: AvatarItem[], item: AvatarItem) {
  const equipGroup = getEquipGroup(item);
  const isEquipped = draftEquipped.some(
    (layer) => getEquipGroup(layer) === equipGroup && layer.itemInstanceId === item.itemInstanceId
  );

  if (isEquipped) {
    if (item.slot !== "accessory") return draftEquipped;

    return sortEquipped(
      draftEquipped.filter((layer) => getEquipGroup(layer) !== equipGroup)
    );
  }

  return sortEquipped([
    ...draftEquipped.filter((layer) => getEquipGroup(layer) !== equipGroup),
    item,
  ]);
}

async function readAvatarResponse(response: Response) {
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Failed to load avatar");
  }
  return data as AvatarResponse;
}

type AvatarEditorProps = {
  onPreviewLayersChange?: (layers: AvatarItem[] | null) => void;
};

export function AvatarEditor({ onPreviewLayersChange }: AvatarEditorProps) {
  const queryClient = useQueryClient();
  const [activeSlot, setActiveSlot] = useState("body");
  const [draftEquipped, setDraftEquipped] = useState<AvatarItem[]>([]);
  const initialCompositeSavedRef = useRef(false);

  const {
    data: avatarResponse,
    isLoading,
    error,
  } = useQuery<AvatarResponse>({
    queryKey: ["avatar"],
    queryFn: () => fetchWithAuth("/user/avatar").then(readAvatarResponse),
  });

  const avatar = avatarResponse?.data;
  const savedEquipped = useMemo(
    () => visibleItems(avatar?.equipped || []),
    [avatar]
  );
  const activeItems = useMemo(
    () => visibleItems(avatar?.inventory[activeSlot] || []),
    [activeSlot, avatar]
  );
  const savedSelectionKey = useMemo(
    () => selectionKey(savedEquipped),
    [savedEquipped]
  );
  const draftSelectionKey = useMemo(
    () => selectionKey(draftEquipped),
    [draftEquipped]
  );
  const hasUnsavedChanges = draftSelectionKey !== savedSelectionKey;
  const equippedByGroup = useMemo(() => {
    const map = new Map<string, AvatarItem>();
    draftEquipped.forEach((item) => map.set(getEquipGroup(item), item));
    return map;
  }, [draftEquipped]);

  useEffect(() => {
    setDraftEquipped(savedEquipped);
  }, [savedSelectionKey, savedEquipped]);

  useEffect(() => {
    onPreviewLayersChange?.(draftEquipped);

    return () => onPreviewLayersChange?.(null);
  }, [draftEquipped, onPreviewLayersChange]);

  useEffect(() => {
    if (!avatar || initialCompositeSavedRef.current) return;

    initialCompositeSavedRef.current = true;
    uploadAvatarComposite(savedEquipped)
      .then((compositeUrl) => {
        if (compositeUrl) {
          queryClient.setQueryData(["avatar", "compositeUrl"], compositeUrl);
        }
      })
      .catch((error) => {
        console.error("Failed to save avatar composite", error);
      });
  }, [avatar, savedEquipped, queryClient]);

  const saveMutation = useMutation({
    mutationFn: async (items: AvatarItem[]) => {
      const itemInstanceIds = items
        .map((item) => item.itemInstanceId)
        .filter((id): id is number => typeof id === "number");
      const response = await fetchWithAuth("/user/avatar/save", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemInstanceIds }),
      });
      return readAvatarResponse(response);
    },
    onSuccess: async (data) => {
      queryClient.setQueryData(["avatar"], data);
      const equipped = visibleItems(data.data.equipped);
      setDraftEquipped(equipped);

      try {
        const compositeUrl = await uploadAvatarComposite(equipped);
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
    <section className="flex flex-col gap-5">
      <div className="grid gap-5">
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
              const equippedItem = equippedByGroup.get(getEquipGroup(item));
              const isEquipped = equippedItem?.itemInstanceId === item.itemInstanceId;
              const canEquip = typeof item.itemInstanceId === "number";

              return (
                <button
                  key={item.itemInstanceId || item.id}
                  type="button"
                  onClick={() =>
                    canEquip
                      ? setDraftEquipped((current) => toggleDraftItem(current, item))
                      : undefined
                  }
                  disabled={!canEquip || saveMutation.isPending}
                  className={`flex min-h-32 flex-col items-center justify-between gap-2 rounded border p-3 text-center transition ${
                    isEquipped
                      ? "border-orange-500 bg-orange-950/70 text-orange-100"
                      : "border-red-950 bg-black/40 text-gray-200 hover:border-red-700"
                  } disabled:cursor-not-allowed disabled:opacity-60`}
                >
                  <AvatarPreview layers={[item]} size="sm" />
                  <span className="text-sm leading-tight">{item.name}</span>
                </button>
              );
            })}
          </div>

          {saveMutation.error && (
            <div className="text-center text-sm text-red-400 lg:text-left">
              {(saveMutation.error as Error).message}
            </div>
          )}

          <div className="flex flex-wrap justify-center gap-3 lg:justify-start">
            <button
              type="button"
              onClick={() => saveMutation.mutate(draftEquipped)}
              disabled={!hasUnsavedChanges || saveMutation.isPending}
              className="flex items-center gap-2 rounded bg-orange-700 px-4 py-2 text-sm font-bold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:bg-gray-800 disabled:text-gray-400"
            >
              <FaSave />
              <span>{saveMutation.isPending ? "Saving..." : "Save"}</span>
            </button>
            <button
              type="button"
              onClick={() => setDraftEquipped(savedEquipped)}
              disabled={!hasUnsavedChanges || saveMutation.isPending}
              className="flex items-center gap-2 rounded bg-gray-800 px-4 py-2 text-sm text-gray-100 transition hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <FaUndo />
              <span>Discard</span>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
