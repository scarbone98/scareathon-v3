-- Wayside Fury character sheets: one revisioned cloud save per account.
CREATE TABLE IF NOT EXISTS public.wayside_fury_saves (
    user_id UUID PRIMARY KEY REFERENCES public.users (id) ON DELETE CASCADE,
    save JSONB NOT NULL,
    revision INTEGER NOT NULL DEFAULT 1,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Saves are accessed through the authenticated server, never directly by clients.
ALTER TABLE public.wayside_fury_saves ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.wayside_fury_saves FROM anon, authenticated;
