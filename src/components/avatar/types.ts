export type AvatarSlot = {
  slot: string;
  label: string;
};

export type AvatarItem = {
  id: number;
  itemInstanceId: number;
  itemKey: string;
  name: string;
  slot: string;
  layerOrder: number;
  assetPath: string;
  storageBucket?: string;
  storagePath?: string;
  isDefault: boolean;
  isStarter: boolean;
};

export type AvatarData = {
  slots: AvatarSlot[];
  equipped: AvatarItem[];
  inventory: Record<string, AvatarItem[]>;
};

export type AvatarResponse = {
  data: AvatarData;
};
