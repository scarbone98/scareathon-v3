# Wayside Fury development speed

## Monster Bash test optimization (2026-10-07)

The engine tests use synchronous ticks, not timers or sleeps. The expensive
work was 1,980 balance fights and a dense odds chart with 16 complete fight
rollouts at every 30-tick checkpoint. Jest's VM global lookups also made the
simulation's repeated `Math` and `Object.keys` calls expensive.

Changes:

- Keep all nine engine tests and every original assertion, including all 132
  ordered roster pairings, best-of-three termination, frame HP bounds, replay
  determinism, seed-dependent winners, probability bounds, finished-fight
  certainty, and state immutability.
- Run eight fixed balance seeds per unordered pairing (528 fights), alternating
  fighter positions. Every monster retains the original strict 40–60% win-rate
  guard. The smaller sample has less statistical precision; the existing
  `npm run balance:monster-bash` remains the extensive balance diagnostic.
- Stop the seed-variation test once both winners have been observed, retaining
  its original 40-seed limit and assertion.
- Exercise odds-series construction at 1,200-tick checkpoints with four
  rollouts each. Assert multiple checkpoints and exact timestamp preservation,
  in addition to the existing start, length, probability and winner assertions.
- Use a Node test environment that creates lexical bindings to the sandbox's
  existing `Math` and `Object`. It substitutes no functions or objects. Jest
  29's `sandboxInjectedGlobals` only affects CommonJS; these tests use native
  ESM. Timers and `Date` remain available to Jest's normal fake-timer support.
- Limit Jest to two workers. Large-pool diagnostic runs passed assertions but
  sometimes emitted Jest's worker-force-exit warning; the final two-worker run
  exited naturally without that warning. This favors reliable shutdown over
  the faster but unsuccessful parallel diagnostics.

No production engine, simulation tick rate, gameplay rules, or timeout was
changed. No test was skipped, and no browser script was run.

Measurements from this checkout, using `/usr/bin/time -p npx jest` in `server/`:

| Measurement | Before | After |
| --- | ---: | ---: |
| Monster Bash engine suite (Jest) | 160.184 s | 14.876 s |
| Whole server suite (Jest) | 166.521 s | 97.158 s |
| Whole command wall time, including npx | 186.05 s | 118.86 s |
| Whole command CPU user / system time | 56.55 / 10.93 s | 26.21 / 7.45 s |
| Suites / tests passing | 39 / 458 | 39 / 458 |
| Natural exit, no force-exit option | exit 0 | exit 0 |

**The under-20-second whole-suite target was not achieved on this machine.**
The engine suite improved by about 91%, but unrelated suites and module/worker
startup remain material costs. A large-pool run with the focused test changes
reported 66.458 s (81.22 s wall), but emitted a worker-force-exit warning and is
not the final accepted verification. A single-worker diagnostic was slower and
was interrupted. Timings are single observations and sensitive to host load;
the baseline briefly overlapped frontend checks, while the final run had no
concurrent check started by this task.

Checks: plain server `npx jest` (all 39 suites / 458 tests; natural exit),
`npx tsc -b`, and targeted ESLint on the three changed JavaScript/CJS files.
The checkout already had pending Jest teardown, npm configuration, Vite,
Railpack and documentation changes. Those existing changes were preserved;
only this optimization's configuration changes and documentation are included
in the prepared commit patch. The sandbox blocked updating Git metadata, which
is outside the writable workspace; no commit or push was made.

This pass changes test resource cleanup, bundling, and Railway build configuration.
Gameplay, assets, rendering resolution, and native device pixel ratio are unchanged.
The target remains modern phones and desktops.

## Server tests

Run commands from `server/`:

```sh
npx jest --detectOpenHandles --forceExit
npx jest
```

`server/.npmrc` enables Node's experimental VM modules for npm-launched commands.
Jest 29 needs this for the server's native ESM tests; no environment prefix is
required for `npx jest`. This setting is scoped to the server directory.

The diagnostic run passed 39 suites / 458 tests in 148.806 seconds and reported
no open handles in this checkout. Existing game loops, heartbeat intervals,
background workers, and retry timers already use `unref()` and/or close hooks.
Socket tests already terminate connections and close their Fastify instances.
There was no reproducible leaking interval to change.

`tests/teardown.js`, registered through `setupFilesAfterEnv`, awaits `pool.end()`
for each test environment that uses the real database pool. It imports the pool
after the tests so `jest.unstable_mockModule` continues to work, and tolerates
database mocks without `end`. A separate-process `globalTeardown` would not own
the pools created inside Jest test environments. Production pool behavior is
unchanged; there is no forced exit in the test configuration.

## Lazy bundles

Wayside Fury's route, its depth renderer, and the station's Three.js scenes
already have dynamic imports. They remain lazy. Vite now resolves Three.js and
Phaser to their published source modules during production builds so Rollup can split the engines rather
than receiving indivisible prebundled files.

Three.js math/constants and shader strings form separate chunks without a
renderer/core cycle. Phaser is split into physics, game objects, renderer,
math/geometry/utilities, input/loading/sound, textures/display, and remaining
engine modules. The transform reproduces Phaser 3.85.2's production
webpack flags: Canvas, WebGL, and sound enabled; debug, experimental, Camera3D,
3D plugin, and Facebook Instant Games disabled. No game feature is removed.
The normal 500 kB warning threshold remains unchanged.
Shared CommonJS helpers have their own chunk so React cannot pull Phaser into
the initial import graph. CommonJS wrapping preserves the engine's require
initialization order. During development Phaser retains its existing prebundled
entry, avoiding source build flags inside Vite's dependency optimizer.

## Railway preview caching

The existing `~/hark-work/fury-railway.sh` archives the chosen git ref and uploads
it for Railpack to build remotely. The committed `railpack.json` travels in that
archive; no script change is required. Its install step runs
`npm ci --prefer-offline`, mounts `/root/.npm`, and keeps install output handling
consistent with Railpack's generated plan. The build step mounts
`/app/node_modules/.vite`. The Vite cache is deliberately scoped to build, since
`npm ci` removes `node_modules` during installation.

Vite's `.vite` cache primarily accelerates dependency optimization in development;
production builds should not be assumed to reuse transformed modules. The npm
cache and unchanged dependency-install layers are the principal remote-build
savings. Railway cache persistence depends on its remote builder. No deployment
was performed, so cold/warm remote timings have not been measured.

Vercel's configuration and build command are unchanged. The Railpack-specific
file is consumed only by Railpack, and the root npm configuration is unchanged.

References: [Railpack configuration](https://railpack.com/config/file/),
[npm install-step override](https://railpack.com/config/recommendations), and
[Node/Vite cache behavior](https://railpack.com/languages/node/).

## Measurements and checks

Local measurements use `/usr/bin/time -p`, installed dependencies, and the same
worktree. The original build used `git show HEAD:vite.config.ts` as a temporary
config, with no source changes. Commands ran at normal priority, without `nice`.
Wall times include npm startup; CPU load and filesystem caches affect results.

| Measurement | Before | After |
| --- | ---: | ---: |
| Vite build wall time | 115.06 s | 199.53 s |
| Vite reported build time | 1m 47s | 2m 40s |
| Vite CPU user / system time | 40.58 / 5.04 s | 49.43 / 7.73 s |
| Transformed modules | 427 | 2,478 |
| Largest Phaser JS chunk | 1,470.87 kB (335.79 kB gzip) | 358.75 kB (84.46 kB gzip) |
| Three.js JS chunk(s) | 614.01 kB (157.19 kB gzip) | 404.53 + 159.84 + 72.68 kB |
| Chunks over 500 kB | 2 | 0 |
| Plain Jest wall time / exit | 200.47 s / exit 0 | 113.64 s / exit 0 |

Source splitting removes the warnings but increases local production-build
cost; this is **not a build-time speedup**. These are single measurements under
changing machine load, not a controlled benchmark. Total Phaser JS is now
1,509.91 kB / 361.63 kB gzip across seven chunks, versus 1,470.87 / 335.79 kB
before. Three.js totals 637.06 kB / 166.54 kB gzip across three chunks, versus
614.01 / 157.19 kB before. More chunks introduce module and compression overhead.
The expected deploy-loop benefit comes from dependency-install caching, which
has not been timed remotely.

The final plain Jest run passed all 39 suites / 458 tests (106.157 seconds
reported by Jest), with no forced exit and no open-handle warning. Both before
and after runs exited naturally; a pool leak was not reproduced. The final run
had no concurrent frontend check, while the before run shared CPU with frontend
checks, so its shorter wall time is not evidence that teardown accelerated the
tests. An intermediate concurrent run hit the existing simulated-fight test's
five-second timeout; it passed on the isolated full-suite rerun without changing
assertions or timeouts.

Passed checks: `npx tsc -b`, `npx eslint .`, plain server `npx jest`, and
`npx vite build`. The changed Vite config also passed a final targeted TypeScript
build and lint check. A manifest check verified that no Phaser or Three.js chunk
is in the initial static import graph and that Wayside Fury remains a dynamic
entry. Every emitted JS chunk is below 500,000 bytes. Importing all three emitted
Three.js chunks in Node passed, checking initialization without a browser.
The chunk-size warning is gone; the existing Browserslist database-age notice
and Node experimental-VM-modules notice remain.

No browser or `scripts/check-wayside-fury*.mjs` was run. Rendering was not visually
tested; no game source, assets, DPR settings, or simulation parameters changed.
