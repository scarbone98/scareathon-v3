-- Mystery Crypt progress: one save per player (heroes' levels, collected
-- monsters, team, candy, stages cleared) as JSON the game reads and writes
-- through /mystery-crypt/save. `revision` goes up on every write so an old
-- tab can't overwrite newer progress.

CREATE TABLE IF NOT EXISTS public.mystery_crypt_saves (
    user_id UUID PRIMARY KEY REFERENCES public.users (id) ON DELETE CASCADE,
    save JSONB NOT NULL,
    revision INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Only the server (service role) touches it.
ALTER TABLE public.mystery_crypt_saves ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mystery_crypt_saves FROM anon, authenticated;
