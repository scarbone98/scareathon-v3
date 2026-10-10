# Wayside Fury — Opus fix & clean-up pass

You are working in a git worktree of scarbone98/scareathon-v3 (waysidestation.com), on branch `claude/fury-cleanup` off the latest `origin/main`. The game is Wayside Fury (route /wayside-fury): a top-down action RPG with the 8 Bit Evil crew (Joe, Matt, Alex, Jon), with 2D and 3D (`?gfx=3d`) renderers, a tutorial, an overworld with a taxi and roads, chapters, combat, items and co-op. Many AI passes built it, so it has inconsistent layouts, odd placements, duplicated systems and dead code. Your job is to make it feel like one coherent, polished game.

## Hard rules
- Never redraw, recolor or replace the character, creature or vehicle sprites (PR #38 restored the originals). You may reposition and re-place props, and you may add variety only by recombining existing original art.
- Never copy Buu's Fury assets. Buu's Fury is a design reference only.
- Target modern high-res phones and desktops: native DPR, camera zoom, smooth motion.
- Don't touch the agent CLI, auth or anything outside the game except the shared code it truly needs.
- Run every Playwright/Chromium run with `--mute-audio`.

## Loop (do this, don't just read code)
1. Build and run the game locally. Use Playwright to PLAY it in phone portrait (390x844, 2D and 3D) and desktop 2D (1440x900): intro, tutorial, overworld drive and walk, at least one level/interior, combat, menus and HUD. Capture screenshots to `/tmp/opus-shots/` and LOOK at them yourself (read the images). Write findings to `docs/wayside-fury-cleanup-audit.md`, ranked P0 (broken or blocking), P1 (looks wrong or confusing) and P2 (polish).
   Known reports from the owner's playtest: odd tutorial camera angle, mailboxes in random spots, an unreachable middle water road, a badly placed water tower and samey houses (PR #41 attempted fixes, so verify them), plus general "placement looks strange".
2. Fix in batches of related issues. After each batch: re-screenshot the affected screens and confirm visually that it's fixed and nothing regressed, then run `npx eslint` on the changed files, `npx tsc -b`, the unit tests (server: `npm test -- --forceExit` in server/) and the existing wayside-fury Playwright checks for phone 2D/3D plus desktop 2D (skip long desktop 3D runs).
3. When a batch is green, commit it with the `CLEANUP:` prefix, push the branch to origin, and open or update ONE PR to main titled "Wayside Fury: Opus clean-up pass" with before/after screenshot notes. Merge it with `gh pr merge --merge` (the owner pre-approved merging once checks pass), then start the next batch on a fresh branch `claude/fury-cleanup-N` off the new origin/main, with a new PR each time.
4. Code cleanup alongside: remove dead code and duplicated systems left by earlier passes, unify constants for camera, tile size and collision, and add placement-validation tests (props on valid terrain, no overlaps with roads/water/other props, all roads reachable, all interactables reachable).
5. Keep going through P0 → P1 → P2 until the audit is done or about 4 hours have passed. Finish with a summary at the end of the audit doc listing what changed, PR numbers and what's left.

Use `export PATH=/opt/homebrew/bin:$PATH` for gh/node. gh is signed in as szaneer with push access.

## FOCUS (owner, Oct 9 19:31) — this overrides the scope above
Focus only on three things, in this order of attention:
1. **Overworld performance**: profile the overworld in 2D and 3D on phone and desktop (FPS, frame time, draw calls, entity/prop counts, GC churn, per-frame allocations, off-screen culling, texture/atlas use, tick cost of ambient life and taxi AI). Set a target of a steady 60fps on a modern phone in 2D and 3D, measure before and after, and log the numbers in the audit doc.
2. **Overworld layout**: roads, water, bridges, buildings, mailboxes, water tower, props, landmarks and paths should read as a believable, intentional town and countryside. Everything should be reachable or clearly blocked by natural edges. Add the placement-validation tests.
3. **Design**: visual coherence of the overworld and the HUD/UI (lighting, palette consistency, ground and tile transitions, prop grounding and shadows, camera framing, readability on phone portrait). Recombine original art only, and never redraw sprites.
Skip unrelated cleanup such as combat, items, menus or dead code elsewhere, unless it blocks these three.

## MERGE AS YOU GO (owner, Oct 9 20:38)
Keep batches small. As soon as a change verifies (pixel-compare or screenshots, tsc, eslint, the relevant tests), commit it, push, open a PR to main and merge it right away. Then start the next batch on a fresh branch off the new origin/main. Do not hold up a merge for a full 4-hour pass.
