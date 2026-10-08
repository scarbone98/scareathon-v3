// Optional adapter metadata only. These IDs are not ticket awards and are not
// added to the campaign reward allowlist. A missing adapter does nothing.
export interface OverworldHook { id: string; rewardId?: string; radarAnchorId: string }
export const MAIL_BALLOON_HOOK: Readonly<OverworldHook> = Object.freeze({
  id: 'county-mail-signals', rewardId: 'overworld-mail-signals', radarAnchorId: 'globe-mail-balloon',
});
export const COUNTY_DISCOVERY_HOOKS: readonly Readonly<OverworldHook>[] = Object.freeze([
  { id: 'rain-garden', rewardId: 'overworld-rain-garden', radarAnchorId: 'county-rain-garden' },
  { id: 'reservoir', rewardId: 'overworld-reservoir', radarAnchorId: 'county-reservoir' },
  { id: 'scrap-orchard', rewardId: 'overworld-scrap-orchard', radarAnchorId: 'county-orchard' },
].map(hook => Object.freeze(hook)));
