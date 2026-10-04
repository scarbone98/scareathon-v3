-- Graveyard Smash 3D: the Godot Halloween platform fighter (hosted on GitHub Pages,
-- played in the arcade's iframe). Score submissions look the game up by name, so it
-- needs a games row before its arcade leaderboard can take scores (one Classic run's
-- score, 0..125500).
--
-- The live games table is the old Strapi schema: no display_name column and no
-- unique constraint on name, so this checks for an existing row instead of using
-- ON CONFLICT. published_at is set so GET /games lists it.

UPDATE public.games
SET is_active = TRUE,
    url = 'https://perhapsjohn.github.io/GraveyardSmash3D/',
    updated_at = NOW()
WHERE name = 'Graveyard Smash 3D';

INSERT INTO public.games (name, description, is_active, url, created_at, updated_at, published_at)
SELECT
    'Graveyard Smash 3D',
    'A Halloween platform fighter: twenty-five monsters on haunted stages, the Trick or Treat Trail, 1-4 players on one screen or online by room code.',
    TRUE,
    'https://perhapsjohn.github.io/GraveyardSmash3D/',
    NOW(),
    NOW(),
    NOW()
WHERE NOT EXISTS (SELECT 1 FROM public.games WHERE name = 'Graveyard Smash 3D');
