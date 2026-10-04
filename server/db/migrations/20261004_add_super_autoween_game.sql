-- Super Autoween: a spooky creature auto-battler (Godot web build, perhapsJohn's GitHub Pages).
-- Score submissions look the game up by name, so it needs a games row before its
-- arcade leaderboard can take scores. Score = battles won in a run (0-10).
--
-- The live games table is the old Strapi schema: no display_name column and no
-- unique constraint on name, so this checks for an existing row instead of using
-- ON CONFLICT. published_at is set so GET /games lists it.

UPDATE public.games
SET is_active = TRUE,
    url = 'https://perhapsjohn.github.io/SuperAutoween/',
    updated_at = NOW()
WHERE name = 'Super Autoween';

INSERT INTO public.games (name, description, is_active, url, created_at, updated_at, published_at)
SELECT
    'Super Autoween',
    'Build a crew of creepy critters in the shop and watch them battle other players'' crews.',
    TRUE,
    'https://perhapsjohn.github.io/SuperAutoween/',
    NOW(),
    NOW(),
    NOW()
WHERE NOT EXISTS (SELECT 1 FROM public.games WHERE name = 'Super Autoween');
