-- Agent keys: a player makes one in Settings and hands it to an AI agent (the wayside CLI),
-- which can then do a small, fixed set of things as that player: read the calendar and
-- tonight's movie, read their season, mark or unmark nights they've watched, read the
-- Scareboard. Nothing else (no scores, coins, shop, inbox, admin). Only a hash of the key
-- is kept; the key itself is shown once, when it's made.
CREATE TABLE IF NOT EXISTS public.agent_tokens (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 40),
    token_hash TEXT NOT NULL UNIQUE,
    hint TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_used_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS agent_tokens_active_by_user
    ON public.agent_tokens (user_id)
    WHERE revoked_at IS NULL;

-- Only the server (service role) touches it.
ALTER TABLE public.agent_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.agent_tokens FROM anon, authenticated;
