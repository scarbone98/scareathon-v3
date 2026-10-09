# Account control and privacy

Controls live in the station's Settings register (`Belongings.tsx`, `Register`). Password/email changes verify the current password before calling Supabase. Email changes use Supabase's confirmation flow: check both inboxes. The owner must enable secure email change. Global sign-out revokes refresh sessions; ordinary Supabase access JWTs expire normally.

`GET /user/export` downloads uncached JSON with the confirmed email/profile, wallet and all transactions, items/avatar, scores, standings, watches, posts/reactions, photo URLs, listings, inbox conversations/messages/rewards, owned cartridges/banners/songs, saves, and agent key names/timestamps. Passwords and key hashes are excluded.

`DELETE /user/account` requires `confirmation: "DELETE"` and `currentPassword`. The server independently verifies the password against the current Supabase email and checks the returned identity. Agent keys cannot use either route.

One locked SQL transaction erases private account rows, inbox conversations, photos, posts, listings, items, coins, watches and saves. Watched-night counts become anonymous season points before the individual watches are removed. Arcade scores, standings and past CPU match results remain. Linked sheet-era results are anonymized too; unmatched historical names cannot be attributed to an account. The users row becomes a tombstone: `deleted_at`, an ID-only email placeholder, a unique `Deleted rider_…` name, and no avatar/outfit. Leaderboards display **Deleted rider**. Point reasons/source keys are cleared.

Every API auth check rejects tombstones; agent keys are deleted. Closure events revoke lounge/co-op sockets, tickets, reconnectable seats and ephemeral chat, with PostgreSQL notifications between API instances. Supabase restrictive RLS policies also deny direct Storage and existing protected-table access before old JWTs expire. Legacy UUID-only save endpoints reject closed riders.

After commit, the route removes owned Storage files and calls `supabase.auth.admin.deleteUser`, freeing the email. The client clears its session/cache and returns to the station. Remote failures return 202, with access already denied; a restricted durable queue retries cleanup at startup and every minute.

Deployment needs the account migration (run synchronously at API startup), `SUPABASE_URL` or `SUPABASE_PROJECT_REF`, and an API-only `SUPABASE_SERVICE_ROLE_KEY` (legacy `SUPABASE_SERVICE_KEY` accepted). Never expose the service key in Vite. Do not rerun the older orphan-cleanup migration: it predates tombstones.

Terms and Privacy are dated draft station papers requiring owner review and contact details. The keyboard/WebGL directory reuses object contents; native pinch zoom, visible focus, paper focus management, live errors and stronger small-text contrast are included.
