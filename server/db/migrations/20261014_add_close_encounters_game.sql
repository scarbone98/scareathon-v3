-- Close Encounters: a saucer over farm country, on the arcade shelf and saving scores.
-- Score submissions look the game up by name, so it needs a games row first. Same shape as
-- Liquid Metal's: the live games table has no unique constraint on name, so this checks first.

UPDATE public.games
SET is_active = TRUE,
    updated_at = NOW()
WHERE name = 'Close Encounters';

INSERT INTO public.games (name, description, is_active, url, created_at, updated_at, published_at)
SELECT
    'Close Encounters',
    'Fly a saucer over farm country at night and beam up whatever you can. The more you take, the hotter it gets.',
    TRUE,
    'https://sclondon.github.io/CloseEncounters/build/index.html',
    NOW(),
    NOW(),
    NOW()
WHERE NOT EXISTS (SELECT 1 FROM public.games WHERE name = 'Close Encounters');