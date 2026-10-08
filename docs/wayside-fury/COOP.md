# Wayside Fury co-op

Co-op is drop-in for up to four signed-in players. Open **Co-op → Host** in the
title or pause menu, copy the four-character code, and share it. **Join** accepts
that code; controller code entry supplies four letter steppers. Hosting players
also appear on the Station board and in Wayside Lounge presence with a Join
button. Presence counts reserved reconnect seats when advertising capacity.
`/wayside-fury?coop=CODE` joins once the account and avatar are ready.

## Transport and membership

- `POST /wayside-fury/coop/ticket` requires the existing verified account JWT and
  issues a single-use, 60-second ticket. The user must exist in the account table.
- Connect `WS /wayside-fury/coop/ws`, send `{type:"auth",ticket}`, and wait for
  `{type:"ready",userId,name}`. An unauthenticated socket closes after ten seconds.
- Send `{type:"create"}` or `{type:"join",code}`. The response is
  `{type:"room",code,seat,hostSeat,token,status:"playing",players}`. Each player has
  `seat`, `userId`, `name`, `connected`, and its latest cosmetic appearance.
- Seats are stable integers 0–3. Codes omit ambiguous letters/numbers.
  Disconnected seats are reserved for `RECONNECT_MS = 20000`. Authenticate a new
  socket and send `{type:"rejoin",code,token}`; the token is bound to the account.
  Opening the seat in another tab closes the old socket with code 4000.
- `{type:"leave"}` releases the seat immediately. On host expiry or explicit
  leave, the next connected seat becomes host. The server broadcasts `host`,
  updated `room` messages, and the cached world snapshot. No simulation runs on
  the server. Rooms disappear when no seats remain.
- Authenticated `GET /wayside-fury/coop/hosting` returns server-owned hosting
  presence. Lounge subscribes to that registry; Station polls it every three seconds.

## Gameplay messages

All relays receive server-owned `seat`, `userId`, and `name`; client identity
fields are discarded. JSON frames are capped at 65,536 bytes, with a cap of 90
messages per socket per second, including malformed messages. Excess traffic
closes with code 4008. Shapes, finite numbers, array lengths, nesting, scenes,
hero IDs, projectile/enemy fields, and cosmetic keys are validated.

| Message | Sender → recipient | Payload |
| --- | --- | --- |
| `hero` | Every player → peers | `hero` contains position, facing, active hero stats, animation timers, guard, down status, scene and room; `input` contains movement and button states. Optional `appearance` contains palette names and local avatar catalog item keys/dyes. |
| `input` | Guest → host | Standalone `input` update; normal client embeds this in `hero`. |
| `state` | Host → guests | `state` contains enemies, enemy projectiles, scene/room, realm/story transition, world clears, spawn accounting, RNG seed and next entity ID. |
| `hit` | Guest → host | `enemyId`, `attackId`, `damage`, `dx`, `dy`, `force`, `scene`, `room`. Host deduplicates attack/target pairs and applies damage. |
| `damage` | Host → target | `targetSeat`, already reduced `damage`, `sourceX`, `sourceY`. Host applies guard/defense, invulnerability, and party damage scaling. |
| `revive` | Host → target | `targetSeat`; restores 40% HP with a brief invulnerability window. |
| `reward` | Host → target | `targetSeat`, `reward:{id,kind,xp,candy,areas?,bosses?,rooms?,chapter?,healHp?,healKi?,power?,ward?}`. `kind` is `kill` or `checkpoint`. |
| `ping` | Player → server | `t`; server replies `pong` with the client time and server time. |

Heroes and world snapshots send at 20 Hz. Guests predict their own movement and
attacks but never run enemy AI, spawn, roll drops, clear areas or advance the
world. Remote actors use a 100 ms interpolation buffer. Cosmetic strips are
composed once per changed look through `composeLook`, including body-specific
rigs, wings and companions. Names remain crisp HTML labels.

The host targets the nearest living hero and handles all enemy/projectile
damage. Migration restores world authority, authored HP baselines, RNG/entity
IDs, and already-created extra spawns. A finishing hit keeps zero-HP enemy
entries until the next simulation step awards the encounter clear, so migration
in that frame preserves both story credit and paid-kill deduplication. World completion state stays separate
from a newly promoted player's personal story sheet.

## Fairness and persistence

For `n` connected players, normal enemy HP is multiplied by `1 + .6(n-1)`, boss
HP by `1 + .75(n-1)`, damage by `1 + .1(n-1)`, and each encounter adds one grunt
per extra player. Live membership changes preserve HP percentages. Extra-spawn
accounting prevents repeated join/leave from generating more drops.

Guest combat levels clamp to area bands (training/hub 1–3; Blast Site grows from
1–3 to 4–6; side trails 2–5; realm 6–9). Permanent XP and level remain personal,
and cloud snapshots restore personal stat values while preserving HP/Ki ratios.
At zero HP a player is downed. A living teammate must hold Interact within 32
world units for two seconds. Touch shows a hold-to-revive button; keyboard uses
Enter and a standard controller uses A/Cross. The party wipes only when all
connected players are down.

Every kill grants each player XP and their own candy roll. Caches also grant
personal candy, tonics, Ki supplies and depot Power equipment; supplies never
revive a downed player. The host caches the completed world before distributing
rewards, so migration cannot resurrect a paid enemy. Checkpoints grant new
room/boss/area clears to guests who still need them; completed areas instead
grant bonus XP. Reward IDs are saved as bounded `coopRewards` receipts and travel with the
character sheet selected during cloud reconciliation. Each
account uses its own PR2 revisioned cloud save and existing `PLAYER_DIED` ticket
flow: progress deltas are paid only after the account save succeeds, and
`lastReported` prevents replay/device changes from paying old milestones again.

## Local verification

Run `npm --prefix server test -- --runInBand`, `npx tsc -b`, focused eslint, and
`node scripts/check-wayside-fury-coop-sim.mjs` and
`node scripts/check-wayside-fury-coop-rewards.mjs`. The browser check uses the real
Fastify room/save routes, two isolated signed-in contexts, and a loopback memory
database at DPR 3; it never contacts real accounts or saves:

```sh
VITE_BASE_URL=http://127.0.0.1:3000 \
VITE_SUPABASE_URL=https://wayside-fury-local.supabase.co \
VITE_SUPABASE_ANON_KEY=wayside-fury-local-test \
npm run dev -- --host 127.0.0.1 --port 5185 --strictPort

FURY_BASE_URL=http://127.0.0.1:5185 \
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs \
node scripts/check-wayside-fury-coop.mjs
```

The fixture refuses production mode. The optional server `/coop/dev-ticket`
route exists only with `WAYSIDE_FURY_DEV_AUTH=true` and `NODE_ENV != production`,
and only accepts `dev-*` identities. Production always requires account auth.
Portrait/landscape screenshots are written to `/tmp/fury-coop-390x844.png` and
`/tmp/fury-coop-844x390.png`. The existing viewport script covers the other phone,
desktop and iframe sizes.
