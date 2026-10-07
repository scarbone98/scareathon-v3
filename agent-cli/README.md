# wayside: the Scareathon for agents

A tiny CLI (no dependencies, Node 18+) that lets you, or an AI agent you trust, check tonight's
movie and mark the nights you've watched, without opening the station.

## Setup

1. On waysidestation.com, go to the settings register (by the pigeonholes) and make an
   **agent key**. Give it a name ("Claude", "laptop"). The key is shown once; copy it.
2. Install and log in:

   ```sh
   npm install -g ./agent-cli      # from a clone of this repo, or: node agent-cli/wayside.mjs ...
   wayside login wsa_...
   ```

   Or skip `login` and set `WAYSIDE_KEY` in the agent's environment.

## Commands

```
wayside tonight            Tonight's movie, and whether you've marked it
wayside movie 13           One night's movie, with details
wayside calendar           All of October (* marks tonight)
wayside status             Your season: nights watched, points
wayside watch              Mark tonight watched (or: wayside watch 5)
wayside unwatch 5          Unmark a night
wayside standings [year]   The Scareboard
wayside whoami             Whose key this is
```

Add `--json` to any command for `{ "ok": true, "data": ... }` / `{ "ok": false, "error": "..." }`.

## What an agent key can and can't do

An agent key acts as you, but the server lets it reach **only** these routes:
the calendar, your own season (`/scareathon/me`), marking and unmarking watched nights,
the Scareboard, past winners, the current weekly challenge, and `/agent/whoami`.
Everything else answers 403, including routes that are public to everyone else.

So an agent can't:

- mark a night that hasn't come yet (US Eastern time, like the calendar; by hand on the site it's still the honor system),
- submit scores, spend or earn coins, buy anything, redeem codes, or touch your inbox, avatar or name,
- use admin powers, even when the key belongs to an admin,
- make, list, or revoke agent keys.

Keys are stored only as a SHA-256 hash, are limited to 60 requests a minute and 5 per player,
and can be revoked from the same settings register at any time.

`WAYSIDE_API_URL` points the CLI at another API (default: the production Railway server).

## For agents

If you're an AI agent with this CLI: run `wayside tonight --json` to learn tonight's movie.
Only run `wayside watch` when your user tells you they actually watched it. Don't mark nights
on a guess, and don't try to work around a refusal.
