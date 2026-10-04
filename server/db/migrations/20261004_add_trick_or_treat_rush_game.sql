-- Trick or Treat Rush: the Godot Halloween party game (hosted on GitHub Pages,
-- played in the arcade's iframe). Score submissions look the game up by name, so
-- it needs a games row before its arcade leaderboard can take scores.
--
-- The live games table is the old Strapi schema: no display_name column and no
-- unique constraint on name, so this checks for an existing row instead of using
-- ON CONFLICT. published_at is set so GET /games lists it.

UPDATE public.games
SET is_active = TRUE,
    url = 'https://perhapsjohn.github.io/TrickOrTreatRush/',
    updated_at = NOW()
WHERE name = 'Trick or Treat Rush';

INSERT INTO public.games (name, description, is_active, url, created_at, updated_at, published_at)
SELECT
    'Trick or Treat Rush',
    'A Halloween push-your-luck party game: race the street for candy with up to four kids, but only candy you bring home counts.',
    TRUE,
    'https://perhapsjohn.github.io/TrickOrTreatRush/',
    NOW(),
    NOW(),
    NOW()
WHERE NOT EXISTS (SELECT 1 FROM public.games WHERE name = 'Trick or Treat Rush');
