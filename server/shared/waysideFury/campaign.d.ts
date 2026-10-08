export const CAMPAIGN_CONTENT_VERSION: 4;
export const COOP_PROTOCOL_VERSION: 6;
export interface CampaignMap { readonly id: string; readonly scene: string; readonly room: number; readonly areaId: string; readonly minProtocol: number }
export const CAMPAIGN_MAPS: readonly CampaignMap[];
export function mapDefinition(id: string): CampaignMap | undefined;
export function legacyMapId(scene: string, room?: number): string | undefined;
export function compatibleMap(scene: string, room: number, mapId?: string, protocol?: number): boolean;
export const CHAPTER_REWARDS: readonly { readonly id: string; readonly receipt: 'areas' | 'rooms'; readonly tickets: number }[];
export function chapterRewardScore(receipt: { areas?: string[]; rooms?: string[] }, before?: { areas?: string[]; rooms?: string[] }): number;
