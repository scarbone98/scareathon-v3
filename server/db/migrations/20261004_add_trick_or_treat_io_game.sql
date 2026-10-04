-- Trick or Treat .io: a Halloween .io game (Godot web build, perhapsJohn's GitHub Pages).
-- Score submissions look the game up by name, so it needs a games row before its
-- arcade leaderboard can take scores. Score = the night's candy (stash + haul) at midnight.
--
-- The live games table is the old Strapi schema: no display_name column and no
-- unique constraint on name, so this checks for an existing row instead of using
-- ON CONFLICT. published_at is set so GET /games lists it.

UPDATE public.games
SET is_active = TRUE,
    url = 'https://perhapsjohn.github.io/TrickOrTreatIo/',
    updated_at = NOW()
WHERE name = 'Trick or Treat .io';

INSERT INTO public.games (name, description, is_active, url, created_at, updated_at, published_at)
SELECT
    'Trick or Treat .io',
    'Lead a line of trick-or-treaters, grow it with candy, and cut off other gangs so they scatter. Solo or online.',
    TRUE,
    'https://perhapsjohn.github.io/TrickOrTreatIo/',
    NOW(),
    NOW(),
    NOW()
WHERE NOT EXISTS (SELECT 1 FROM public.games WHERE name = 'Trick or Treat .io');
