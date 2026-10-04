-- Kart-o'-Lantern: the Godot Halloween kart racer (hosted on GitHub Pages, played in
-- the arcade's iframe). Score submissions look the game up by name, so it needs a
-- games row before its arcade leaderboard can take scores (player 1's points over a
-- Grand Prix, 0..60).
--
-- The live games table is the old Strapi schema: no display_name column and no
-- unique constraint on name, so this checks for an existing row instead of using
-- ON CONFLICT. published_at is set so GET /games lists it.

UPDATE public.games
SET is_active = TRUE,
    url = 'https://perhapsjohn.github.io/KartOLantern/',
    updated_at = NOW()
WHERE name = 'Kart-o''-Lantern';

INSERT INTO public.games (name, description, is_active, url, created_at, updated_at, published_at)
SELECT
    'Kart-o''-Lantern',
    'A Halloween kart racer: monsters and cryptids on haunted tracks, four-race Grand Prix cups, 1-4 players on one screen or online by race code.',
    TRUE,
    'https://perhapsjohn.github.io/KartOLantern/',
    NOW(),
    NOW(),
    NOW()
WHERE NOT EXISTS (SELECT 1 FROM public.games WHERE name = 'Kart-o''-Lantern');
