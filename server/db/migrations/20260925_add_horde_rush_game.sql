-- Horde Rush: the crowd-runner shooter built into the site at /horde-rush.
-- Score submissions look the game up by name, so it needs a games row before its
-- arcade leaderboard can take scores.
--
-- The live games table is the old Strapi schema: no display_name column and no
-- unique constraint on name, so this checks for an existing row instead of using
-- ON CONFLICT. published_at is set so GET /games lists it.

UPDATE public.games
SET is_active = TRUE,
    url = '/horde-rush',
    updated_at = NOW()
WHERE name = 'Horde Rush';

INSERT INTO public.games (name, description, is_active, url, created_at, updated_at, published_at)
SELECT
    'Horde Rush',
    'Lead the 8 Bit Evil Returns crew down the road, shooting gates to grow your squad and blasting monsters.',
    TRUE,
    '/horde-rush',
    NOW(),
    NOW(),
    NOW()
WHERE NOT EXISTS (SELECT 1 FROM public.games WHERE name = 'Horde Rush');
