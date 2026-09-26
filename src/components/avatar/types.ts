// Avatar v2 shapes. Items are drawn in avatar-art/ and built into
// public/avatar-v2/; see avatar-art/STYLE.md.

export type AvatarBuild = "f" | "m";

export type DyeChoice = Partial<Record<"dye1" | "dye2", string>>;

export type AvatarItemPart = {
  // a draw layer, or "mask" for a part that erases other items' pixels
  slot: string;
  // null when the part suits both body builds
  build: AvatarBuild | null;
  src: string;
  // for mask parts: the slots whose pixels it erases
  masks?: string[];
};

export type AvatarItem = {
  id: number;
  itemKey: string;
  name: string;
  category: string;
  parts: AvatarItemPart[];
  icon: string;
  // default dye per channel; the channels listed are the ones it can be dyed on
  dyes: DyeChoice;
  hides: string[];
  occupies: string[];
  order: number;
  rarity?: string;
  basePrice?: number | null;
  releaseStatus?: string;
};

export type AvatarProfile = {
  build: AvatarBuild;
  buildChosen: boolean;
  skin: string;
  hair: string;
  eyes: string;
};

export type OutfitEntry = {
  itemInstanceId: number;
  dyes: DyeChoice;
  item: AvatarItem;
};

export type InventoryEntry = {
  itemInstanceId: number;
  item: AvatarItem;
};

// Everything needed to draw an avatar.
export type AvatarLook = {
  profile: Pick<AvatarProfile, "build" | "skin" | "hair" | "eyes">;
  outfit: { item: AvatarItem; dyes: DyeChoice }[];
};

export type AvatarData = {
  profile: AvatarProfile;
  outfit: OutfitEntry[];
  inventory: InventoryEntry[];
};

export type AvatarResponse = {
  data: AvatarData;
};

// public/avatar-v2/manifest.json
export type AvatarManifest = {
  width: number;
  height: number;
  slots: string[];
  categories: Record<string, number>;
  builds: AvatarBuild[];
  swappable: Record<string, string[]>;
  skinTones: string[];
  hairColors: string[];
  eyeColors: string[];
  dyeColors: string[];
  ramps: Record<string, string[]>;
};
