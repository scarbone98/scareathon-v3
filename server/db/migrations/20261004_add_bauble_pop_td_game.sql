-- Bauble Pop TD: the Godot tower defence (hosted on GitHub Pages, played in the arcade's
-- iframe). Score submissions look the game up by name, so it needs a games row
-- before its arcade leaderboard can take scores.
--
-- The live games table is the old Strapi schema: no display_name column and no
-- unique constraint on name, so this checks for an existing row instead of using
-- ON CONFLICT. published_at is set so GET /games lists it.

UPDATE public.games
SET is_active = TRUE,
    url = 'https://perhapsjohn.github.io/BaublePopTD/',
    updated_at = NOW()
WHERE name = 'Bauble Pop TD';

INSERT INTO public.games (name, description, is_active, url, created_at, updated_at, published_at)
SELECT
    'Bauble Pop TD',
    'A Christmas 3D tower defence: glass tree ornaments roll through a snowy village, and your elves crack them before the stockings run dry. Solo, co-op or versus online.',
    TRUE,
    'https://perhapsjohn.github.io/BaublePopTD/',
    NOW(),
    NOW(),
    NOW()
WHERE NOT EXISTS (SELECT 1 FROM public.games WHERE name = 'Bauble Pop TD');
