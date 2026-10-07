# Wayside Fury: build brief, PR 1 (vertical slice)

You're working in the scareathon-v3 repo, which is the Wayside Station site. Before coding, read CLAUDE.md, WAYSIDE_STATION.md, and how Horde Rush is built and wired in:
- src/pages/HordeRush/ (page.tsx, game/controller.ts, game/sim.ts, game/render.ts)
- src/components/AnimatedRoutes.tsx (PAGES)
- src/pages/Arcade/games.tsx (URL const + MachineData entry + listenForPlayerDiedScores)
- server/db/migrations/20260925_add_horde_rush_game.sql and how migrations are listed in server/index.js (runStartupSql)
- server/utils/gameScorePolicies.js
Follow the same patterns. Files on disk are CRLF, so keep their line endings.

## What the game is
"Wayside Fury" is a top-down, real-time action RPG in the style of Dragon Ball Z: Buu's Fury (GBA). The 8 Bit Evil Returns crew are the heroes: Joe, Matt, Alex and Jon. Their sprites already exist in public/royale/*_idle.png, public/royale/ui/*_idle.png, public/mystery-crypt/run_*.png, public/mystery-crypt/portraits/*.png and public/sprites/alex.png. Monsters are in public/sprites/*.png (zombie, pumpkin, ghost, rat, imp, werewolf, scarecrow, swampthing, shadowbeast, ufo, candle, skull) and public/mystery-crypt/bosses/*.png. Check each sheet's frame sizes in code that already uses them (Royale/ui/theme.ts, HordeRush/page.tsx, MysteryCrypt). Reuse these sprites. Draw anything missing (attack frames, ki blasts, the taxi, tiles, the portal, the egg) as pixel art in code or as small PNGs under public/wayside-fury/. Keep total new assets small, and add no audio or video files.

## Story (PR 1 covers the prologue and Chapter 1)
- Backstory card: the crew escaped the 8 Bit Evil realm and celebrated. FIVE YEARS LATER, life is good.
- Prologue cutscene, skippable, with dialogue boxes and portraits:
  1. The crew is at a backyard BBQ. A little banter.
  2. The sky goes dark and the palette shifts. An explosion flashes on the horizon.
  3. A portal tears open where it hit. In silhouette, the true mastermind behind the hordes steps out (placeholder name "The Architect"), carrying a pulsing egg-like vessel that holds a new evil (placeholder "the Creation"), in the spirit of Babidi and Buu's ball.
  4. A suit-up montage: quick cuts of each hero gearing up, then they pile into the taxi.
- The playable part starts here.
- Chapter 1, "The Blast Site":
  - The overworld is a top-down map you cross in the TAXI. It stands in for Buu's Fury's flying: faster movement, no combat, and you pull over at location markers.
  - Locations:
    - Wayside (the hub), with a SHOP (spend candy on healing and stat charms) and a HOME (rest, save, swap who's in the party).
    - The Blast Site dungeon: two or three rooms of enemies, then the Chapter 1 boss (use the shadowbeast or werewolf sprite, scaled up, with 2 attack patterns and a phase change at 50% HP).
    - Other areas shown as locked "taken over" markers for later chapters.
  - Clearing the boss: a short cutscene where the heroes get yanked through a flicker into the 8-BIT REALM. Render it with a crunchier palette and pixel-scale effect. Show one small 8-bit-realm room with a few enemies, then a "TO BE CONTINUED" card and the results screen. The real world and the 8-bit realm alternate between dungeons as the story goes, so make the realm shift a reusable transition and palette mode.

## Combat (the Buu's Fury feel)
- 8-direction movement and a dash (brief i-frames, costs stamina or ki).
- Melee: a 3-hit combo with knockback and hit-stop.
- Ki:
  - Hold to charge.
  - Tap to fire a ki blast projectile.
  - With a full ki bar, a signature beam unique to each hero.
- Guard: reduces damage.
- Tag-swap: switch the active hero instantly from the party (2 playable in PR 1, Joe and Matt; Alex and Jon join later and are shown locked). Each hero has its own HP, and switching has a short cooldown.
- Enemies: grunts (chase plus melee), shooters (keep distance and fire), and the boss. Show damage numbers.
- RPG: XP, levels (stat growth for HP, Ki, Power, Defense) and a level-up flash. Candy drops are the currency.
- Death: a game-over screen with Retry from the last save (HOME) or Quit.

## Platform
- Canvas game at /wayside-fury. The structure mirrors Horde Rush: a page.tsx menu or UI shell in React, and game/ modules split into sim (pure state and update), render and controller (input and loop). Keep the sim deterministic and free of DOM.
- Use a fixed low internal resolution (for example 320x180 or 240x160, GBA-like), scaled up with crisp pixels and letterboxed.
- Keyboard:
  - WASD or arrows to move
  - J to attack
  - K for ki (hold to charge)
  - L to dash
  - Shift to guard
  - Q/E to swap
  - Enter to talk or interact
  - Esc to pause
- Touch: a virtual stick plus buttons, so it plays on phones (availableOnMobile true).
- Save progress (chapter, level, XP, candy, unlocked heroes) in localStorage under a "wayside-fury-save" key.
- Score: when Chapter 1 is cleared, or on death, post `window.parent.postMessage({ type: "PLAYER_DIED", score }, window.location.origin)` as Horde Rush does. Score = enemies defeated, plus bosses × 1000, plus a time bonus, plus a no-death bonus, as an integer.

## Wiring
- Route "/wayside-fury" in AnimatedRoutes PAGES (lazy import).
- Arcade entry in src/pages/Arcade/games.tsx:
  - name "Wayside Fury", earlyAccess true
  - added "Wed 2026-10-07 9:00 AM PDT (UTC-07:00)"
  - cartridge: a fitting color and a Google font, tagline "Five years later, the real evil arrives.", about { released "2026", players "Single player", genre "Action RPG", developer "szaneer" }
  - GameRenderer with desktopAspectRatio 16/9, reservedVerticalSpace GAME_TOOLBAR_HEIGHT, onLoad listenForPlayerDiedScores
  - no videoUrl yet
- Server: a new migration server/db/migrations/20261012_add_wayside_fury_game.sql written the way the Horde Rush one is, listed last in server/index.js runStartupSql. Add a gameScorePolicies entry ['Wayside Fury', { score: { min: 0, max: 10000000, integer: true }, tickets: { from: 100, full: 5000 } }]. Don't add it to the weekly challenge rotations.
- If WAYSIDE_STATION.md lists the in-site games, add Wayside Fury there.

## Done means
- `npx tsc -b` passes and eslint is clean on the new and changed files.
- `cd server && npm test` passes, so update any test that enumerates the score policies or games.
- The game runs: menu -> prologue (skippable) -> taxi overworld -> shop or home -> dungeon -> boss -> realm shift -> 8-bit room -> results, and the score posts.
- Commit on the current branch (wayside-fury) with a clear message. Do NOT push and do NOT touch main.
- At the end, write a short summary of what you built, what's stubbed, and the controls to /tmp/wayside-fury-summary.md.

## Addendum: tickets from progress (Siraj, Oct 7)
- The arcade entry must have `earlyAccess: true`. That's required.
- Players earn arcade tickets AS THEY PLAY, based on areas completed and in-game level. Tickets come from the score sent in PLAYER_DIED (see server/routes/games.js playTicketsFor and the `tickets` scale in gameScorePolicies.js).
- Send a score at every checkpoint (a dungeon or area cleared, a boss beaten, resting at HOME), not only at death.
- Each score is the progress gained since the last score was sent: new areas or bosses cleared × 1000, plus levels gained × 100, plus rooms cleared × 50. So old progress can't be farmed by dying or reloading. Track `lastReported` in the save. Send nothing when nothing is new.
- Set the score policy as tickets { from: 0, full: 1000 }. One area clear is about a full 10-ticket run, a level-up is about 1 ticket, and the server's per-run cap and daily taper do the rest. Score max is 100000.
- Add a test in server/tests for the Wayside Fury policy: an area clear pays about 10 tickets, and a score of 0 pays nothing.

## Addendum: build in milestones and commit each one (Siraj wants to watch it grow)
Build in this order. After EACH milestone, make sure `npx tsc -b` passes, then `git commit` with a message that starts "Wayside Fury: M<n> ...". Hark pushes the branch as you go, so every commit must leave the game loading and playable as far as it has been built.
- M1: Route, arcade entry (earlyAccess), migration, and score policy. A page with a menu and a walkable test room with Joe.
- M2: The combat kit (combo, ki charge, blast, beam, dash, guard), a tag-swap between Joe and Matt, grunt and shooter enemies, and damage numbers.
- M3: The taxi overworld and the Wayside hub with Shop and Home, plus saving.
- M4: The Blast Site dungeon rooms and the boss.
- M5: The prologue cutscene, the realm-shift transition, and the 8-bit realm room plus results.
- M6: Scores at checkpoints that pay tickets from progress, the server test, the touch controls pass, and polish. Then the summary file.

## Addendum: controls on every device (Siraj, Oct 7)
- Mobile is required. It must be fully playable on phones through waysidestation.com, in the arcade's iframe and at /wayside-fury, in portrait and landscape.
  - Add a virtual stick plus Attack, Ki (hold), Dash, Guard and Swap buttons with thumb-sized hit areas, and multi-touch.
  - Mark it availableOnMobile.
  - Taxi, menus, dialogue and the shop all work by touch.
  - Respect safe-area insets.
  - No hover-only UI.
- Desktop controls must be discoverable:
  - A Controls panel on the menu and in the pause screen.
  - A short key-hint strip on screen during the first room or tutorial, which can be dismissed and is remembered in localStorage.
  - Show button prompts in dialogue and at interact points, like "[Enter] Talk".
- Gamepads: support external controllers through the browser Gamepad API (Xbox, PlayStation and Switch Pro on the standard mapping).
  - Left stick or d-pad moves.
  - A/Cross attacks, X/Square is ki (hold), B/Circle dashes, the right trigger or RB guards, LB/RB or Y swap, and Start pauses.
  - Add a dead zone and hot-plugging (gamepadconnected and disconnected).
  - When a pad is in use, the on-screen prompts switch to pad glyphs, and the touch UI hides once a pad or keyboard is used.
  - Make this part of M2 (input layer) and polish it in M6.
