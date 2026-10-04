-- 31 Nights: the Godot daily Halloween puzzle (hosted on GitHub Pages, played in
-- the arcade's iframe). Score submissions look the game up by name, so it needs a
-- games row before its arcade leaderboard can take scores.
--
-- The live games table is the old Strapi schema: no display_name column and no
-- unique constraint on name, so this checks for an existing row instead of using
-- ON CONFLICT. published_at is set so GET /games lists it.

UPDATE public.games
SET is_active = TRUE,
    url = 'https://perhapsjohn.github.io/31Nights/',
    updated_at = NOW()
WHERE name = '31 Nights';

INSERT INTO public.games (name, description, is_active, url, created_at, updated_at, published_at)
SELECT
    '31 Nights',
    'A Halloween daily puzzle: one door opens every October night, four quick rounds, double points on Halloween.',
    TRUE,
    'https://perhapsjohn.github.io/31Nights/',
    NOW(),
    NOW(),
    NOW()
WHERE NOT EXISTS (SELECT 1 FROM public.games WHERE name = '31 Nights');
