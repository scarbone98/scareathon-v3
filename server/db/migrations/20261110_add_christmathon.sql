-- Christmathon: a Christmas film every night from December 1 to 25, scored like the Scareathon.
-- Its watches and points go in the Scareathon's tables with an event id, so a December watch
-- never counts towards that year's October standings. Rows from before this are all 'scareathon'.
-- Safe to run again (the server runs it at every start).

ALTER TABLE public.scareathon_watches ADD COLUMN IF NOT EXISTS event TEXT NOT NULL DEFAULT 'scareathon';
ALTER TABLE public.scareathon_points ADD COLUMN IF NOT EXISTS event TEXT NOT NULL DEFAULT 'scareathon';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'scareathon_watches_event_check' AND conrelid = 'public.scareathon_watches'::regclass
    ) THEN
        ALTER TABLE public.scareathon_watches
            ADD CONSTRAINT scareathon_watches_event_check CHECK (event IN ('scareathon', 'christmathon'));
        ALTER TABLE public.scareathon_points
            ADD CONSTRAINT scareathon_points_event_check CHECK (event IN ('scareathon', 'christmathon'));
    END IF;

    -- A night is watched once per event, not once per year
    IF NOT EXISTS (
        SELECT 1 FROM pg_index i
        JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY (i.indkey)
        WHERE i.indrelid = 'public.scareathon_watches'::regclass AND i.indisprimary AND a.attname = 'event'
    ) THEN
        ALTER TABLE public.scareathon_watches DROP CONSTRAINT scareathon_watches_pkey;
        ALTER TABLE public.scareathon_watches ADD PRIMARY KEY (user_id, event, season, day);
    END IF;
END $$;

-- An automatic award lands once per event
DROP INDEX IF EXISTS public.scareathon_points_source_once;
CREATE UNIQUE INDEX IF NOT EXISTS scareathon_points_event_source_once
    ON public.scareathon_points (user_id, event, season, source_key)
    WHERE source_key IS NOT NULL;

DROP INDEX IF EXISTS public.scareathon_points_season;
CREATE INDEX IF NOT EXISTS scareathon_points_event_season
    ON public.scareathon_points (event, season, user_id);
