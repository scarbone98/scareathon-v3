-- Lawn Order: the Godot voxel dog-stealth game (hosted on GitHub Pages, played in the
-- arcade's iframe). Score submissions look the game up by name, so it needs a games row
-- before its arcade leaderboard can take scores (a finished Paper Route's total, 0..100000).
--
-- The live games table is the old Strapi schema: no display_name column and no
-- unique constraint on name, so this checks for an existing row instead of using
-- ON CONFLICT. published_at is set so GET /games lists it.

UPDATE public.games
SET is_active = TRUE,
    url = 'https://perhapsjohn.github.io/LawnOrder/',
    updated_at = NOW()
WHERE name = 'Lawn Order';

INSERT INTO public.games (name, description, is_active, url, created_at, updated_at, published_at)
SELECT
    'Lawn Order',
    'A small dog with a big grudge sneaks into the neighbours'' yards, reviews every lawn on the list and slips out before anyone catches him. Or play the humans and catch the dogs.',
    TRUE,
    'https://perhapsjohn.github.io/LawnOrder/',
    NOW(),
    NOW(),
    NOW()
WHERE NOT EXISTS (SELECT 1 FROM public.games WHERE name = 'Lawn Order');
