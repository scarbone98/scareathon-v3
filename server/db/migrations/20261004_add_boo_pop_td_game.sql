-- Boo Pop TD: the Godot tower defence (hosted on GitHub Pages, played in the arcade's
-- iframe). Score submissions look the game up by name, so it needs a games row
-- before its arcade leaderboard can take scores.
--
-- The live games table is the old Strapi schema: no display_name column and no
-- unique constraint on name, so this checks for an existing row instead of using
-- ON CONFLICT. published_at is set so GET /games lists it.

UPDATE public.games
SET is_active = TRUE,
    url = 'https://perhapsjohn.github.io/BooPopTD/',
    updated_at = NOW()
WHERE name = 'Boo Pop TD';

INSERT INTO public.games (name, description, is_active, url, created_at, updated_at, published_at)
SELECT
    'Boo Pop TD',
    'A Halloween 3D tower defence: candy-coloured sheet ghosts float down a graveyard path, and your spooks pop them before the lanterns go out. Solo, co-op or versus online.',
    TRUE,
    'https://perhapsjohn.github.io/BooPopTD/',
    NOW(),
    NOW(),
    NOW()
WHERE NOT EXISTS (SELECT 1 FROM public.games WHERE name = 'Boo Pop TD');
