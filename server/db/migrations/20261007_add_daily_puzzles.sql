-- Scaredle (/scaredle) and Cross Bones (/cross-bones): the daily word puzzles built into
-- the site, played through /daily-puzzles so answers never reach the page.

-- Games rows, for their arcade leaderboards (the server writes the scores itself).
-- The live games table is the old Strapi schema: no display_name column and no unique
-- constraint on name, so this checks for an existing row instead of using ON CONFLICT.
-- published_at is set so GET /games lists them.
UPDATE public.games SET is_active = TRUE, url = '/scaredle', updated_at = NOW() WHERE name = 'Scaredle';
INSERT INTO public.games (name, description, is_active, url, created_at, updated_at, published_at)
SELECT 'Scaredle', 'Guess the day''s spooky five-letter word in six tries.', TRUE, '/scaredle', NOW(), NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM public.games WHERE name = 'Scaredle');

UPDATE public.games SET is_active = TRUE, url = '/cross-bones', updated_at = NOW() WHERE name = 'Cross Bones';
INSERT INTO public.games (name, description, is_active, url, created_at, updated_at, published_at)
SELECT 'Cross Bones', 'A themed crossword every midnight.', TRUE, '/cross-bones', NOW(), NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM public.games WHERE name = 'Cross Bones');

-- The answers and clues (secret: the repo is public). Filled by npm run upload:daily-puzzles
-- from the gitignored daily-puzzles/ folder; see server/dailyPuzzles/content.js.
CREATE TABLE IF NOT EXISTS public.daily_puzzle_content (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per player per puzzle: the answer (or grid) copied in when they first open it,
-- their guesses or letters so far, and once it's over the score and tickets paid.
CREATE TABLE IF NOT EXISTS public.daily_puzzle_plays (
    user_id UUID NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
    game TEXT NOT NULL CHECK (game IN ('scaredle', 'cross-bones')),
    puzzle INTEGER NOT NULL CHECK (puzzle >= 1),
    secret JSONB NOT NULL,
    state JSONB NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at TIMESTAMPTZ,
    won BOOLEAN,
    score INTEGER,
    tickets INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, game, puzzle)
);

-- Only the server (service role) touches them: never readable from the browser.
ALTER TABLE public.daily_puzzle_content ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.daily_puzzle_content FROM anon, authenticated;
ALTER TABLE public.daily_puzzle_plays ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.daily_puzzle_plays FROM anon, authenticated;
