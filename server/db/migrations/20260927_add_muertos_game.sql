-- Muertos: the Old San Juan zombies game built into the site at /muertos.
-- Score submissions look the game up by name, so it needs a games row before its
-- arcade leaderboard can take scores.
--
-- The live games table is the old Strapi schema: no display_name column and no
-- unique constraint on name, so this checks for an existing row instead of using
-- ON CONFLICT. published_at is set so GET /games lists it.

UPDATE public.games
SET is_active = TRUE,
    url = '/muertos',
    updated_at = NOW()
WHERE name = 'Muertos';

INSERT INTO public.games (name, description, is_active, url, created_at, updated_at, published_at)
SELECT
    'Muertos',
    'Round-based zombie survival in Old San Juan, from Plaza de San José to El Morro.',
    TRUE,
    '/muertos',
    NOW(),
    NOW(),
    NOW()
WHERE NOT EXISTS (SELECT 1 FROM public.games WHERE name = 'Muertos');
