export interface InteriorDefinition { readonly id: string; readonly name: string; readonly parent: string; readonly x: number; readonly y: number; readonly building: string; readonly theme: string; readonly lore: string }
export const INTERIORS: readonly InteriorDefinition[];
export function interiorDefinition(id: string): InteriorDefinition | undefined;
export function canResumeInterior(id: string, save: { campaignMilestones?: string[]; clearedRooms?: string[] }): boolean;
