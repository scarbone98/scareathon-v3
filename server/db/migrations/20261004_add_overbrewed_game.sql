-- Overbrewed: the Godot co-op potion kitchen (hosted on GitHub Pages, played in the
-- arcade's iframe). Score submissions look the game up by name, so it needs a games row
-- before its arcade leaderboard can take scores (one Endless Night run's coins, 0..200000).
--
-- The live games table is the old Strapi schema: no display_name column and no
-- unique constraint on name, so this checks for an existing row instead of using
-- ON CONFLICT. published_at is set so GET /games lists it.

UPDATE public.games
SET is_active = TRUE,
    url = 'https://perhapsjohn.github.io/Overbrewed/',
    updated_at = NOW()
WHERE name = 'Overbrewed';

INSERT INTO public.games (name, description, is_active, url, created_at, updated_at, published_at)
SELECT
    'Overbrewed',
    'A Halloween co-op kitchen: 1-4 monsters brew potions for impatient callers, online by room code or with bot helpers, up to 30 brewers in Rush Night.',
    TRUE,
    'https://perhapsjohn.github.io/Overbrewed/',
    NOW(),
    NOW(),
    NOW()
WHERE NOT EXISTS (SELECT 1 FROM public.games WHERE name = 'Overbrewed');
