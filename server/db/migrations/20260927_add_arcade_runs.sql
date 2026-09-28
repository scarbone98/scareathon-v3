-- Arcade run tickets. The arcade asks /games/startRun for a ticket when a game
-- opens (and gets the next one back with every saved score). /games/submitScore
-- only takes a score with an unused ticket for that player and game, and checks
-- the score could have been earned in the time since the ticket was issued.

CREATE TABLE IF NOT EXISTS public.arcade_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
    game_id INTEGER NOT NULL REFERENCES public.games (id) ON DELETE CASCADE,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS arcade_runs_user_started_idx
    ON public.arcade_runs (user_id, started_at);

-- Only the server (service role) touches it.
ALTER TABLE public.arcade_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.arcade_runs FROM anon, authenticated;
