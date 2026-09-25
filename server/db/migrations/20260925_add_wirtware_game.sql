-- WirtWare: rapid-fire WarioWare-style microgames (Godot web build hosted on GitHub Pages).
-- Score submissions look the game up by name, so it needs a games row before its
-- arcade leaderboard can take scores.
--
-- The live games table is the old Strapi schema: no display_name column and no
-- unique constraint on name, so this checks for an existing row instead of using
-- ON CONFLICT. published_at is set so GET /games lists it.

UPDATE public.games
SET is_active = TRUE,
    url = 'https://sclondon.github.io/WirtWare/build/index.html',
    updated_at = NOW()
WHERE name = 'WirtWare';

INSERT INTO public.games (name, description, is_active, url, created_at, updated_at, published_at)
SELECT
    'WirtWare',
    'Thirteen tiny games, a few seconds each, faster and faster. How many can you win?',
    TRUE,
    'https://sclondon.github.io/WirtWare/build/index.html',
    NOW(),
    NOW(),
    NOW()
WHERE NOT EXISTS (SELECT 1 FROM public.games WHERE name = 'WirtWare');
