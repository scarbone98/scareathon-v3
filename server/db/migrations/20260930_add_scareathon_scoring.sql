-- The Scareboard moves off the Google sheet. From the 2026 season on, standings come from
-- player accounts: the movies they mark watched on the calendar, plus a ledger of points
-- (weekly challenges are added automatically; admins award or take away movies, weekly
-- and bonus points, and code can award bonus points, e.g. for finding a secret).
-- Seasons before 2026 are copied from the sheet into scareathon_history / scareathon_winners
-- (once, by an admin, through POST /scareathon/admin/import-history) and read from there.

-- A day of the October calendar a player says they watched
CREATE TABLE IF NOT EXISTS public.scareathon_watches (
    user_id UUID NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
    season INTEGER NOT NULL,
    day INTEGER NOT NULL CHECK (day BETWEEN 1 AND 31),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, season, day)
);

-- Every other point: positive or negative, with why and who gave it.
-- source_key makes automatic awards happen once (e.g. 'weekly_challenge:<documentId>').
CREATE TABLE IF NOT EXISTS public.scareathon_points (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
    season INTEGER NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('movies', 'weekly', 'bonus')),
    points INTEGER NOT NULL CHECK (points <> 0),
    reason TEXT NOT NULL DEFAULT '',
    source_key TEXT,
    awarded_by UUID REFERENCES public.users (id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS scareathon_points_season
    ON public.scareathon_points (season, user_id);

CREATE UNIQUE INDEX IF NOT EXISTS scareathon_points_source_once
    ON public.scareathon_points (user_id, season, source_key)
    WHERE source_key IS NOT NULL;

-- Standings of the sheet-era seasons, exactly as the sheet had them
CREATE TABLE IF NOT EXISTS public.scareathon_history (
    season INTEGER NOT NULL,
    name TEXT NOT NULL,
    movies NUMERIC,
    weekly NUMERIC,
    bonus NUMERIC,
    total NUMERIC,
    PRIMARY KEY (season, name)
);

-- Past champions from the sheet. Account seasons' champions are worked out from the standings.
CREATE TABLE IF NOT EXISTS public.scareathon_winners (
    season INTEGER NOT NULL,
    name TEXT NOT NULL,
    PRIMARY KEY (season, name)
);

-- Only the server (service role) touches them.
ALTER TABLE public.scareathon_watches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scareathon_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scareathon_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scareathon_winners ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.scareathon_watches FROM anon, authenticated;
REVOKE ALL ON public.scareathon_points FROM anon, authenticated;
REVOKE ALL ON public.scareathon_history FROM anon, authenticated;
REVOKE ALL ON public.scareathon_winners FROM anon, authenticated;
