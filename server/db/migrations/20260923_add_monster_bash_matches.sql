-- Monster Bash: one row per CPU-vs-CPU bout.
--
-- Only what's needed to replay and settle a bout is stored: the fight itself is
-- deterministic from (engine_version, seed, fighters), so frames, events and the
-- odds line are never written here. Rows are ~300 bytes and the server prunes
-- finished bouts after a retention window (MONSTER_BASH_RETENTION_DAYS).

CREATE TABLE IF NOT EXISTS public.monster_bash_matches (
    id BIGSERIAL PRIMARY KEY,
    fighter_left TEXT NOT NULL,
    fighter_right TEXT NOT NULL,
    engine_version INTEGER NOT NULL,
    -- Secret until the bout is over; seed_hash is published up front so anyone
    -- can check afterwards that the fight wasn't swapped.
    seed TEXT NOT NULL,
    seed_hash TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'betting',
    betting_closes_at TIMESTAMP WITH TIME ZONE NOT NULL,
    fight_starts_at TIMESTAMP WITH TIME ZONE NOT NULL,
    finished_at TIMESTAMP WITH TIME ZONE,
    winner SMALLINT,
    duration_ticks INTEGER,
    rounds JSONB,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    CONSTRAINT monster_bash_matches_status_check CHECK (
        status IN ('betting', 'fighting', 'finished', 'cancelled')
    ),
    CONSTRAINT monster_bash_matches_winner_check CHECK (winner IS NULL OR winner IN (0, 1)),
    CONSTRAINT monster_bash_matches_finished_has_winner CHECK (
        status <> 'finished' OR (winner IS NOT NULL AND finished_at IS NOT NULL)
    )
);

-- At most one bout can be open at a time, even if two server processes overlap
-- during a deploy.
CREATE UNIQUE INDEX IF NOT EXISTS monster_bash_matches_one_active
    ON public.monster_bash_matches ((TRUE))
    WHERE status IN ('betting', 'fighting');

-- Recent results feed.
CREATE INDEX IF NOT EXISTS idx_monster_bash_matches_finished
    ON public.monster_bash_matches (finished_at DESC)
    WHERE status = 'finished';

-- Retention pruning walks the oldest rows first.
CREATE INDEX IF NOT EXISTS idx_monster_bash_matches_created
    ON public.monster_bash_matches (created_at);

-- The seed must never be readable through the Supabase REST API. With RLS on
-- and no policies, anon/authenticated roles see nothing; the game server
-- connects directly as the table owner and is unaffected.
ALTER TABLE public.monster_bash_matches ENABLE ROW LEVEL SECURITY;
