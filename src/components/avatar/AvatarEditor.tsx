import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FaSave, FaUndo, FaCheck, FaSearch } from "react-icons/fa";
import { Link } from "react-router-dom";
import { fetchWithAuth } from "../../fetchWithAuth";
import LoadingSpinner from "../LoadingSpinner";
import ErrorDisplay from "../ErrorDisplay";
import { AvatarView } from "./AvatarView";
import { uploadAvatarComposite } from "./avatarComposite";
import { CATEGORY_LABELS, WARDROBE_TABS, lookFromAvatar, wearItem } from "./look";
import { rampSwatch, useAvatarManifest } from "./manifest";
import type {
  AvatarBuild,
  AvatarData,
  AvatarLook,
  AvatarManifest,
  AvatarResponse,
  DyeChoice,
  InventoryEntry,
} from "./types";

type Draft = {
  profile: { build: AvatarBuild; skin: string; hair: string; eyes: string };
  outfit: { itemInstanceId: number; dyes: DyeChoice }[];
};

const BUILD_LABELS: Record<AvatarBuild, string> = { f: "Female", m: "Male" };
const DYE_LABELS: Record<string, string> = { dye1: "Main colour", dye2: "Trim colour" };

function draftFromAvatar(avatar: AvatarData): Draft {
  const { build, skin, hair, eyes } = avatar.profile;
  return {
    profile: { build, skin, hair, eyes },
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
          aria-label={`${label}: ${ramp.replace(/_/g, " ")}`}
          aria-pressed={value === ramp}
          onClick={() => onChange(ramp)}
        />
      ))}
    </div>
  );
}

type AvatarEditorProps = {
  onPreviewLookChange?: (look: AvatarLook | null) => void;
};

export function AvatarEditor({ onPreviewLookChange }: AvatarEditorProps) {
  const queryClient = useQueryClient();
  const { data: manifest, error: manifestError } = useAvatarManifest();
  const [activeTab, setActiveTab] = useState("body");
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

  useEffect(() => {
    onPreviewLookChange?.(look);
  }, [look, onPreviewLookChange]);
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

  const tab = WARDROBE_TABS.find((t) => t.key === activeTab) || WARDROBE_TABS[0];
  const wearing = new Set(draft.outfit.map((entry) => entry.itemInstanceId));
  const tabItems = avatar.inventory.filter(
    (entry) =>
      tab.categories.includes(entry.item.category) &&
      entry.item.category !== "body" &&
      entry.item.name.toLowerCase().includes(search.toLowerCase())
  );
  const selected = selectedId !== null && wearing.has(selectedId) ? inventory.get(selectedId) : undefined;
  const selectedDyes = draft.outfit.find((entry) => entry.itemInstanceId === selectedId)?.dyes || {};

  const setProfile = (changes: Partial<Draft["profile"]>) =>
    setDraft((current) => current && { ...current, profile: { ...current.profile, ...changes } });

  const toggleItem = (entry: InventoryEntry) => {
    setDraft((current) => {
      if (!current) return current;
      if (current.outfit.some((worn) => worn.itemInstanceId === entry.itemInstanceId)) {
        return { ...current, outfit: current.outfit.filter((worn) => worn.itemInstanceId !== entry.itemInstanceId) };
      }
      const withItems = current.outfit.flatMap((worn) => {
        const owned = inventory.get(worn.itemInstanceId);
        return owned ? [{ ...worn, item: owned.item }] : [];
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

  const chooseBuild = (build: AvatarBuild) => saveMutation.mutate({ ...draft, profile: { ...draft.profile, build } });
  // The build picker shows just the body, face and hair so the difference is clear.
  const bareLook = {
    ...look,
    outfit: look.outfit.filter(({ item }) => ["body", "eyes", "mouth", "brows", "face_paint", "hair"].includes(item.category)),
  };

  return (
    <section className="wardrobe">
      {!avatar.profile.buildChosen && (
        <div className="build-chooser" role="dialog" aria-labelledby="build-chooser-title">
          <h3 id="build-chooser-title">Choose your body</h3>
          <p>Hair, faces and accessories fit either one. You can change this later on the Body tab.</p>
          <div className="build-chooser-options">
            {manifest.builds.map((build) => (
              <button
                key={build}
                type="button"
                className="build-chooser-option"
                disabled={saveMutation.isPending}
                onClick={() => chooseBuild(build)}
              >
                <AvatarView look={{ ...bareLook, profile: { ...bareLook.profile, build } }} height={180} label={`${BUILD_LABELS[build]} body`} />
                <span>{BUILD_LABELS[build]}</span>
              </button>
            ))}
          </div>
          {saveMutation.error && <p className="profile-error">{(saveMutation.error as Error).message}</p>}
        </div>
      )}

      <div className="wardrobe-toolbar">
        <span>
          MY ITEMS <strong>{avatar.inventory.length}</strong>
        </span>
        <label className="wardrobe-search">
          <FaSearch aria-hidden="true" />
          <input aria-label="Search wardrobe items" placeholder="Find an item…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
      </div>

      <div className="grid gap-5">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <div className="wardrobe-categories">
            {WARDROBE_TABS.map((t) => (
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

          {tab.key === "body" && (
            <div className="wardrobe-body-panel">
              <div>
                <h4>Body</h4>
                <div className="wardrobe-build-toggle" role="group" aria-label="Body build">
                  {manifest.builds.map((build) => (
                    <button
                      key={build}
                      type="button"
                      aria-pressed={draft.profile.build === build}
                      className={`wardrobe-category ${draft.profile.build === build ? "is-active" : ""}`}
                      onClick={() => setProfile({ build })}
                    >
                      {BUILD_LABELS[build]}
                    </button>
                  ))}
                </div>
              </div>
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

          {tab.key !== "body" && (
            <div className="wardrobe-grid">
              {tabItems.map((entry) => {
                const isEquipped = wearing.has(entry.itemInstanceId);
                return (
                  <button
                    key={entry.itemInstanceId}
                    type="button"
                    onClick={() => toggleItem(entry)}
                    disabled={saveMutation.isPending}
                    aria-pressed={isEquipped}
                    className={`wardrobe-item ${isEquipped ? "is-equipped" : ""}`}
                  >
                    <span className="wardrobe-item-status">{isEquipped ? <><FaCheck /> Wearing</> : CATEGORY_LABELS[entry.item.category] || "Try on"}</span>
                    <img className="wardrobe-icon" src={entry.item.icon} alt="" draggable={false} />
                    <span className="text-sm leading-tight">{entry.item.name}</span>
                  </button>
                );
              })}
            </div>
          )}

          {tab.key !== "body" && tabItems.length === 0 && (
            <div className="wardrobe-empty">
              <p>{search ? "No items match that search." : "Something new belongs here."}</p>
              {search ? (
                <button className="profile-secondary-button" onClick={() => setSearch("")}>Clear search</button>
              ) : (
                <Link className="profile-secondary-button" to="/profile/shop">Explore the item shop</Link>
              )}
            </div>
          )}

          {selected && (
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
