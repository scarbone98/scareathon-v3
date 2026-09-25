-- Community arcade games: players (usually through their AI and the
-- scareathon-arcade-mcp server) submit a hosted HTML5 game plus a manifest.
--
-- A game is one arcade_community_games row; every submit adds an
-- arcade_game_versions row as a draft. The shelf serves the game's
-- live_version_id, so an update stays a draft (and players keep getting the
-- last approved version) until an admin approves it.
--
-- Each community game also gets a games row, made hidden (is_active FALSE,
-- published_at NULL) on first submit, because leaderboards hang off games.id.
-- The first approval makes it visible.

CREATE TABLE IF NOT EXISTS public.arcade_community_games (
    id BIGSERIAL PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    game_id INTEGER NOT NULL UNIQUE REFERENCES public.games (id),
    owner_user_id UUID NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
    -- Fixed after the first submit: the leaderboard and ?game= links use it
    name TEXT NOT NULL,
    -- NULL until a version is approved, and again after an admin unpublishes
    live_version_id BIGINT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_arcade_community_games_owner
    ON public.arcade_community_games (owner_user_id);

CREATE TABLE IF NOT EXISTS public.arcade_game_versions (
    id BIGSERIAL PRIMARY KEY,
    community_game_id BIGINT NOT NULL REFERENCES public.arcade_community_games (id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    url TEXT NOT NULL,
    -- The validated manifest (tagline, colour, aspect ratio, score rule, ...)
    manifest JSONB NOT NULL,
    -- draft: waiting for review. superseded: a newer draft replaced it before
    -- review. approved versions stay approved after a newer one goes live.
    status TEXT NOT NULL DEFAULT 'draft',
    -- Results of the automated checks run on submit
    checks JSONB NOT NULL DEFAULT '[]'::jsonb,
    review_note TEXT,
    reviewed_by UUID REFERENCES public.users (id) ON DELETE SET NULL,
    reviewed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    CONSTRAINT arcade_game_versions_status_check CHECK (
        status IN ('draft', 'approved', 'rejected', 'superseded')
    ),
    UNIQUE (community_game_id, version)
);

-- At most one draft waiting per game
CREATE UNIQUE INDEX IF NOT EXISTS arcade_game_versions_one_draft
    ON public.arcade_game_versions (community_game_id)
    WHERE status = 'draft';

CREATE INDEX IF NOT EXISTS idx_arcade_game_versions_review_queue
    ON public.arcade_game_versions (created_at)
    WHERE status = 'draft';

ALTER TABLE public.arcade_community_games
    DROP CONSTRAINT IF EXISTS arcade_community_games_live_version_fkey;
ALTER TABLE public.arcade_community_games
    ADD CONSTRAINT arcade_community_games_live_version_fkey
    FOREIGN KEY (live_version_id) REFERENCES public.arcade_game_versions (id) ON DELETE SET NULL;

-- Arcade tokens: what the scareathon-arcade-mcp server uses to submit games
-- as a player. Only a SHA-256 of the token is stored; the token itself only
-- ever goes to the MCP server that signed in (see arcade_device_logins).
CREATE TABLE IF NOT EXISTS public.arcade_api_tokens (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    -- Start of the token, so the player can tell tokens apart
    token_prefix TEXT NOT NULL,
    last_used_at TIMESTAMP WITH TIME ZONE,
    revoked_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_arcade_api_tokens_user
    ON public.arcade_api_tokens (user_id)
    WHERE revoked_at IS NULL;

-- Signing an AI's MCP server in, device-code style (like `gh auth login`):
-- the MCP server starts a login and shows the player a link with user_code;
-- the player approves it on the site while signed in; the MCP server, polling
-- with its secret device code, then gets a freshly minted arcade token. The
-- token is minted on that poll, so it's never stored here.
CREATE TABLE IF NOT EXISTS public.arcade_device_logins (
    id BIGSERIAL PRIMARY KEY,
    device_code_hash TEXT NOT NULL UNIQUE,
    user_code TEXT NOT NULL UNIQUE,
    -- What the MCP server says it's running in, e.g. "Claude Code"
    client_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    user_id UUID REFERENCES public.users (id) ON DELETE CASCADE,
    token_id BIGINT REFERENCES public.arcade_api_tokens (id) ON DELETE SET NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    CONSTRAINT arcade_device_logins_status_check CHECK (
        status IN ('pending', 'approved', 'denied', 'completed')
    )
);

CREATE INDEX IF NOT EXISTS idx_arcade_device_logins_expires
    ON public.arcade_device_logins (expires_at);

-- None of these are for the Supabase REST API: with RLS on and no policies,
-- anon/authenticated see nothing. The game server connects as the owner.
ALTER TABLE public.arcade_community_games ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arcade_game_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arcade_api_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arcade_device_logins ENABLE ROW LEVEL SECURITY;
