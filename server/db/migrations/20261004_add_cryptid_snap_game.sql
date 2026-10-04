-- Cryptid Snap: the Godot Halloween photo safari (hosted on GitHub Pages, played in
-- the arcade's iframe). Score submissions look the game up by name, so it needs a
-- games row before its arcade leaderboard can take scores.
--
-- The live games table is the old Strapi schema: no display_name column and no
-- unique constraint on name, so this checks for an existing row instead of using
-- ON CONFLICT. published_at is set so GET /games lists it.

UPDATE public.games
SET is_active = TRUE,
    url = 'https://perhapsjohn.github.io/CryptidSnap/',
    updated_at = NOW()
WHERE name = 'Cryptid Snap';

INSERT INTO public.games (name, description, is_active, url, created_at, updated_at, published_at)
SELECT
    'Cryptid Snap',
    'A Halloween photo safari: ride a station wagon down a county road in 1986 and photograph the cryptids for Dr. Marsh. Score: one ride''s report total.',
    TRUE,
    'https://perhapsjohn.github.io/CryptidSnap/',
    NOW(),
    NOW(),
    NOW()
WHERE NOT EXISTS (SELECT 1 FROM public.games WHERE name = 'Cryptid Snap');
