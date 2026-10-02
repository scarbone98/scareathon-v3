import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FaSave, FaUndo, FaCheck, FaSearch, FaDiceFive } from "react-icons/fa";
import { Link } from "react-router-dom";
import { fetchWithAuth } from "../../fetchWithAuth";
import LoadingSpinner from "../LoadingSpinner";
import ErrorDisplay from "../ErrorDisplay";
import { uploadAvatarComposite } from "./avatarComposite";
import { itemFitsBody } from "./compose";
import { CATEGORY_LABELS, WARDROBE_TABS, lookFromAvatar, randomLook, wearItem } from "./look";
import { rampSwatch, useAvatarManifest } from "./manifest";
import type { AvatarData, AvatarLook, AvatarManifest, AvatarResponse, DyeChoice, InventoryEntry } from "./types";

type Draft = {
  profile: { skin: string; hair: string; eyes: string };
  outfit: { itemInstanceId: number; dyes: DyeChoice }[];
};

const DYE_LABELS: Record<string, string> = { dye1: "Main colour", dye2: "Trim colour" };

function draftFromAvatar(avatar: AvatarData): Draft {
  const { skin, hair, eyes } = avatar.profile;
  return {
    profile: { skin, hair, eyes },
    outfit: avatar.outfit.map(({ itemInstanceId, dyes }) => ({ itemInstanceId, dyes })),
  };
}

function draftKey(draft: Draft | null) {
  if (!draft) return "";
  const outfit = [...draft.outfit]
    .sort((a, b) => a.itemInstanceId - b.itemInstanceId)
    .map(({ itemInstanceId, dyes }) => [itemInstanceId, dyes.dye1 || "", dyes.dye2 || ""]);
  return JSON.stringify([draft.profile, outfit]);
}

function lookFromDraft(draft: Draft, inventory: Map<number, InventoryEntry>): AvatarLook {
  return {
    profile: draft.profile,
    outfit: draft.outfit.flatMap(({ itemInstanceId, dyes }) => {
      const entry = inventory.get(itemInstanceId);
      return entry ? [{ item: entry.item, dyes }] : [];
    }),
  };
}

async function readAvatarResponse(response: Response) {
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Failed to load avatar");
  }
  return data as AvatarResponse;
}

type SwatchesProps = {
  manifest: AvatarManifest;
  ramps: string[];
  value: string;
  onChange: (ramp: string) => void;
  label: string;
};

function Swatches({ manifest, ramps, value, onChange, label }: SwatchesProps) {
  return (
    <div className="wardrobe-swatches" role="group" aria-label={label}>
      {ramps.map((ramp) => (
        <button
          key={ramp}
          type="button"
          className="wardrobe-swatch"
          style={{ background: rampSwatch(manifest, ramp) }}
          aria-label={`${label}: ${ramp.replace(/_eye$/, "").replace(/_/g, " ")}`}
          aria-pressed={value === ramp}
          onClick={() => onChange(ramp)}
        />
      ))}
    </div>
  );
}

type AvatarEditorProps = {
  onPreviewLookChange?: (look: AvatarLook | null) => void;
  // One more filter ahead of the item categories, showing its own content (the locker's
  // banners), and the filter to start on
  extraTab?: { key: string; label: string; content: ReactNode };
  initialTab?: string;
};

export function AvatarEditor({ onPreviewLookChange, extraTab, initialTab = "all" }: AvatarEditorProps) {
  const queryClient = useQueryClient();
  const { data: manifest, error: manifestError } = useAvatarManifest();
  const [activeTab, setActiveTab] = useState(initialTab);
  // Skin, eyes and hair colour sit behind a button, so your items come first
  const [editingLook, setEditingLook] = useState(false);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const {
    data: avatarResponse,
    isLoading,
    error,
  } = useQuery<AvatarResponse>({
    queryKey: ["avatar"],
    queryFn: () => fetchWithAuth("/user/avatar").then(readAvatarResponse),
  });

  const avatar = avatarResponse?.data;
  const inventory = useMemo(
    () => new Map((avatar?.inventory || []).map((entry) => [entry.itemInstanceId, entry])),
    [avatar]
  );
  const savedDraft = useMemo(() => (avatar ? draftFromAvatar(avatar) : null), [avatar]);
  const savedKey = draftKey(savedDraft);

  useEffect(() => {
    setDraft(savedDraft);
    // Only reset when what's saved actually changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedKey]);

  const look = useMemo(() => (draft ? lookFromDraft(draft, inventory) : null), [draft, inventory]);
  const hasUnsavedChanges = Boolean(draft) && draftKey(draft) !== savedKey;

  // Only unsaved changes count as trying something on.
  useEffect(() => {
    onPreviewLookChange?.(hasUnsavedChanges ? look : null);
  }, [look, hasUnsavedChanges, onPreviewLookChange]);
  useEffect(() => () => onPreviewLookChange?.(null), [onPreviewLookChange]);

  const saveMutation = useMutation({
    mutationFn: async (next: Draft) => {
      const response = await fetchWithAuth("/user/avatar/save", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      return readAvatarResponse(response);
    },
    onSuccess: async (data) => {
      queryClient.setQueryData(["avatar"], data);
      try {
        const compositeUrl = await uploadAvatarComposite(lookFromAvatar(data.data));
        if (compositeUrl) {
          queryClient.setQueryData(["avatar", "compositeUrl"], compositeUrl);
        }
      } catch (uploadError) {
        console.error("Failed to save avatar composite", uploadError);
      }
    },
  });

  if (isLoading || (!manifest && !manifestError)) return <LoadingSpinner />;
  if (error || manifestError) {
    return <ErrorDisplay message={((error || manifestError) as Error).message || "Unknown error"} />;
  }
  if (!avatar || !draft || !manifest || !look) return null;

  const owned = avatar.inventory;
  const body = look.outfit.find(({ item }) => item.category === "body")?.item;
  const tab = WARDROBE_TABS.find((t) => t.key === activeTab) || WARDROBE_TABS[0];
  const onExtra = Boolean(extraTab && activeTab === extraTab.key);
  const filters = extraTab ? [{ key: extraTab.key, label: extraTab.label }, ...WARDROBE_TABS] : WARDROBE_TABS;
  const wearing = new Set(draft.outfit.map((entry) => entry.itemInstanceId));
  const tabItems = owned.filter(
    (entry) => tab.categories.includes(entry.item.category) && entry.item.name.toLowerCase().includes(search.toLowerCase())
  );
  const selected = selectedId !== null && wearing.has(selectedId) ? inventory.get(selectedId) : undefined;
  const selectedDyes = draft.outfit.find((entry) => entry.itemInstanceId === selectedId)?.dyes || {};

  const setProfile = (changes: Partial<Draft["profile"]>) =>
    setDraft((current) => current && { ...current, profile: { ...current.profile, ...changes } });

  const toggleItem = (entry: InventoryEntry) => {
    setDraft((current) => {
      if (!current) return current;
      if (current.outfit.some((worn) => worn.itemInstanceId === entry.itemInstanceId)) {
        // A body can only be swapped for another, never taken off.
        if (entry.item.category === "body") return current;
        return { ...current, outfit: current.outfit.filter((worn) => worn.itemInstanceId !== entry.itemInstanceId) };
      }
      const withItems = current.outfit.flatMap((worn) => {
        const item = inventory.get(worn.itemInstanceId);
        return item ? [{ ...worn, item: item.item }] : [];
      });
      const next = wearItem(withItems, { itemInstanceId: entry.itemInstanceId, dyes: {}, item: entry.item }, manifest.categories);
      return { ...current, outfit: next.map(({ itemInstanceId, dyes }) => ({ itemInstanceId, dyes })) };
    });
    setSelectedId(Object.keys(entry.item.dyes).length > 0 ? entry.itemInstanceId : null);
  };

  const setDye = (itemInstanceId: number, channel: string, ramp: string) =>
    setDraft((current) =>
      current && {
        ...current,
        outfit: current.outfit.map((worn) =>
          worn.itemInstanceId === itemInstanceId ? { ...worn, dyes: { ...worn.dyes, [channel]: ramp } } : worn
        ),
      }
    );

  // Rolls a whole new kid from the free items; nothing is saved until Save.
  const randomize = () => {
    const next = randomLook(owned, manifest);
    if (!next) return;
    setSelectedId(null);
    setDraft({ profile: next.profile, outfit: next.outfit.map(({ itemInstanceId, dyes }) => ({ itemInstanceId, dyes })) });
  };

  return (
    <section className="wardrobe">
      <div className="wardrobe-toolbar">
        <span>
          MY ITEMS <strong>{owned.length}</strong>
        </span>
        <button type="button" className="profile-secondary-button" onClick={() => setEditingLook((on) => !on)} aria-pressed={editingLook}>
          <span>{editingLook ? "Done" : "Edit look"}</span>
        </button>
        <button type="button" className="profile-secondary-button" onClick={randomize} disabled={saveMutation.isPending}>
          <FaDiceFive aria-hidden="true" />
          <span>Randomize</span>
        </button>
        <label className="wardrobe-search">
          <FaSearch aria-hidden="true" />
          <input aria-label="Search wardrobe items" placeholder="Find an item…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
      </div>

      <div className="grid gap-5">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <div className="wardrobe-categories">
            {filters.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setActiveTab(t.key)}
                aria-pressed={activeTab === t.key}
                className={`wardrobe-category ${activeTab === t.key ? "is-active" : ""}`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {editingLook && (
            <div className="wardrobe-body-panel">
              <div>
                <h4>Skin</h4>
                <Swatches manifest={manifest} ramps={manifest.skinTones} value={draft.profile.skin} onChange={(skin) => setProfile({ skin })} label="Skin tone" />
              </div>
              <div>
                <h4>Eyes</h4>
                <Swatches manifest={manifest} ramps={manifest.eyeColors} value={draft.profile.eyes} onChange={(eyes) => setProfile({ eyes })} label="Eye colour" />
              </div>
              <div>
                <h4>Hair colour</h4>
                <Swatches manifest={manifest} ramps={manifest.hairColors} value={draft.profile.hair} onChange={(hair) => setProfile({ hair })} label="Hair colour" />
              </div>
            </div>
          )}

          {onExtra && extraTab?.content}

          {!onExtra && <div className="wardrobe-grid">
            {tabItems.map((entry) => {
              const isEquipped = wearing.has(entry.itemInstanceId);
              const fits = entry.item.category === "body" || itemFitsBody(entry.item, body?.itemKey);
              return (
                <button
                  key={entry.itemInstanceId}
                  type="button"
                  onClick={() => toggleItem(entry)}
                  disabled={saveMutation.isPending}
                  aria-pressed={isEquipped}
                  className={`wardrobe-item ${isEquipped ? "is-equipped" : ""} ${fits ? "" : "is-unfitted"}`}
                >
                  <span className="wardrobe-item-status">
                    {isEquipped ? <><FaCheck /> Wearing</> : CATEGORY_LABELS[entry.item.category] || "Try on"}
                  </span>
                  <img className="wardrobe-icon" src={entry.item.icon} alt="" draggable={false} />
                  <span className="text-sm leading-tight">{entry.item.name}</span>
                  {!fits && body && <span className="wardrobe-item-note">Doesn't show on {body.name}</span>}
                </button>
              );
            })}
          </div>}

          {!onExtra && tab.key !== "body" && tabItems.length === 0 && (
            <div className="wardrobe-empty">
              <p>{search ? "No items match that search." : "Something new belongs here."}</p>
              {search ? (
                <button className="profile-secondary-button" onClick={() => setSearch("")}>Clear search</button>
              ) : (
                <Link className="profile-secondary-button" to="/profile/shop">Explore the item shop</Link>
              )}
            </div>
          )}

          {!onExtra && selected && (
            <div className="wardrobe-dye-panel">
              <h4>Colours for {selected.item.name}</h4>
              {Object.keys(selected.item.dyes).map((channel) => (
                <div key={channel}>
                  <span>{DYE_LABELS[channel] || channel}</span>
                  <Swatches
                    manifest={manifest}
                    ramps={manifest.dyeColors}
                    value={selectedDyes[channel as keyof DyeChoice] || selected.item.dyes[channel as keyof DyeChoice] || ""}
                    onChange={(ramp) => setDye(selected.itemInstanceId, channel, ramp)}
                    label={`${selected.item.name} ${DYE_LABELS[channel] || channel}`}
                  />
                </div>
              ))}
            </div>
          )}

          {saveMutation.error && (
            <div className="text-center text-sm text-red-400 lg:text-left">{(saveMutation.error as Error).message}</div>
          )}

          <div className="wardrobe-save-bar">
            <p role="status">{hasUnsavedChanges ? "Looking good! Save to keep this outfit." : "Your outfit is saved."}</p>
            <button
              type="button"
              onClick={() => saveMutation.mutate(draft)}
              disabled={!hasUnsavedChanges || saveMutation.isPending}
              className="profile-primary-button"
            >
              <FaSave />
              <span>{saveMutation.isPending ? "Saving…" : "Save outfit"}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setDraft(savedDraft);
                setSelectedId(null);
              }}
              disabled={!hasUnsavedChanges || saveMutation.isPending}
              className="profile-secondary-button"
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
