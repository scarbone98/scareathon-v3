// Pixel avatar shapes. Items are drawn in pixel-avatar/ and built into
// public/avatar-px/; see pixel-avatar/STYLE.md.

export type DyeChoice = Partial<Record<"dye1" | "dye2", string>>;

// Where a part hangs; the body's rig moves each anchor per frame.
export type AvatarAnchor = "head" | "body" | "ground" | "free";

export type AvatarItemPart = {
  slot: string;
  anchor: AvatarAnchor;
  // canvas position on the kid in frame 0, and the size of one frame
  x: number;
  y: number;
  w: number;
  h: number;
  // frames side by side in src; a look's frame f shows frame f % frames
  frames: number;
  src: string;
  // the bodies this part is drawn on; every body when missing
  fits?: string[];
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
  // false until the player has a look of their own (a generated one at first)
  lookChosen: boolean;
  skin: string;
  hair: string;
  eyes: string;
  savedAt?: string | null;
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
  profile: Pick<AvatarProfile, "skin" | "hair" | "eyes">;
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

// A body's idle loop: frame count, speed, and each anchor's offset per frame.
export type AvatarRig = {
  frames: number;
  fps: number;
  anchors: Partial<Record<AvatarAnchor, [number, number][]>>;
  // How the near arm swings out when something's held (see normalizeHold in
  // scripts/pixel-avatar/lib.mjs)
  hold?: { slots: string[]; clear: [number, number][]; moves: [number, number, number, number][]; unless?: [number, number] };
};

// public/avatar-px/manifest.json
export type AvatarManifest = {
  width: number;
  height: number;
  slots: string[];
  categories: Record<string, number>;
  // the ramp each recolourable channel is drawn in
  defaults: Record<"skin" | "hair" | "eyes" | "dye1" | "dye2", string>;
  skinTones: string[];
  hairColors: string[];
  eyeColors: string[];
  dyeColors: string[];
  ramps: Record<string, string[]>;
  bases: Record<string, AvatarRig>;
};
