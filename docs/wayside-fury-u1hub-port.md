# Update 1 hub port

Source: `origin/wayside-fury-update1`, read with `git show` and adapted without merging the old branch. Arena and quests live in `src/pages/WaysideFury/u1/hub`; their shared contracts live in `server/shared/waysideFury/u1*.js`.

The tournament uses `u5-arena` (protocol 6), host-authoritative waves, separate solo/co-op Arcade boards, and the existing submission validation, rate limit, payout lock, 50-ticket run cap, daily taper and 1,000-ticket daily backstop. Explicit arena policies start paying above 1,500 points and reach ten tickets at 15,000 points. Database reward rules cannot override arena caps. Campaign reward IDs are unchanged. Apply `server/db/migrations/20261013_add_wayside_fury_arena_games.sql` to register the boards; no migration was applied during this port.

Seven NPC requests offer personal hunt, boss, clear and candy-delivery objectives. The board is beside Wayside Station and the log is in Pause. Accept and claim require meeting the named NPC. Fetch candy is consumed once; claimed receipts, pending chip grants and earned cosmetic choices persist. Combat-room clears support the current Blast, Realm, Woods, Moon and City maps. Arena fights advance hunts without dropping campaign candy or XP. Temporary arena healing is excluded from saves and personal vitals are restored after the run.

## Parallel integration hooks

- ITEMS: call `registerHubChipGrant` from `u1/hub/rewardAdapter.ts`. Return true when a grant succeeds **or was already granted**. Pending chip rewards remain in the save until acknowledged; the old `game/u1/items/integrations.ts` already uses this interface.
- ITEMS: register the per-player unfound relic targets through `registerRelicRadarTargets` from `u1/minimap/relicRadar.ts`. Targets should carry `mapId` to distinguish current chapter rooms.
- MINIMAP: TODO remains in `relicRadarLayer`. Add this layer to the minimap's **relic-radar mode** selector; call `available`, `enabled`, `toggle`, `reading` and `draw` under the minimap's world-coordinate transform. No separate radar HUD was added. The radar is picked up beside the south hub footpath. Existing hidden collectibles are already supplied to this layer.
- Save merges: keep `sanitizeHubState(raw.u1?.hub)` in the server save boundary and the `u1.hub` snapshot/restore hooks alongside the other ports' additive U1 fields. Version-four and older saves default to empty hub progress.

## Verification

Run `npx tsc -b`, ESLint on changed files, `npm run check:wayside-fury`, and the arena, hub-quests, relic-radar, u1hub-integration, co-op-sim, co-op-rewards, interiors-coop, context-attack-unit and cloud checks. Run `cd server && npx jest --forceExit` for the server changes. `check-wayside-fury-u1hub-browser.mjs` uses `--mute-audio`, port 5229, portrait DPR3 and desktop DPR2; screenshots go to `/tmp/fury-u1hub-shots`. Set `PLAYWRIGHT_MODULE` and optionally `PLAYWRIGHT_CHANNEL` for an external browser installation.
