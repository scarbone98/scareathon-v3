-- Scare Capitalist progress: one save per player (cash, ventures, managers,
-- upgrades, séances, Phantom Investors) as JSON the game reads and writes
-- through /scare-capitalist/save. `revision` goes up on every write so an old
-- tab can't overwrite newer progress.

CREATE TABLE IF NOT EXISTS public.scare_capitalist_saves (
    user_id UUID PRIMARY KEY REFERENCES public.users (id) ON DELETE CASCADE,
    save JSONB NOT NULL,
    revision INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Only the server (service role) touches it.
ALTER TABLE public.scare_capitalist_saves ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.scare_capitalist_saves FROM anon, authenticated;
