-- Ghauntlet: the Godot Halloween dungeon crawler (hosted on GitHub Pages, played in the
-- arcade's iframe). Score submissions look the game up by name, so it needs a games row
-- before its arcade leaderboard can take scores (an Endless Crypt run's last floor score,
-- 0..500000).
--
-- The live games table is the old Strapi schema: no display_name column and no
-- unique constraint on name, so this checks for an existing row instead of using
-- ON CONFLICT. published_at is set so GET /games lists it.

UPDATE public.games
SET is_active = TRUE,
    url = 'https://perhapsjohn.github.io/Ghauntlet/',
    updated_at = NOW()
WHERE name = 'Ghauntlet';

INSERT INTO public.games (name, description, is_active, url, created_at, updated_at, published_at)
SELECT
    'Ghauntlet',
    'A Halloween dungeon crawler: 1-4 costumed heroes fight through crypts of ghouls, online by room code or with bot friends. Candy is life, and somebody always shoots it.',
    TRUE,
    'https://perhapsjohn.github.io/Ghauntlet/',
    NOW(),
    NOW(),
    NOW()
WHERE NOT EXISTS (SELECT 1 FROM public.games WHERE name = 'Ghauntlet');
