-- Wayside Fury: the crew's action RPG built into the site at /wayside-fury.
-- Score submissions look the game up by name, so it needs a games row before its
-- arcade leaderboard can take scores.
--
-- The live games table is the old Strapi schema: no display_name column and no
-- unique constraint on name, so this checks for an existing row instead of using
-- ON CONFLICT. published_at is set so GET /games lists it.

UPDATE public.games
SET is_active = TRUE,
    url = '/wayside-fury',
    updated_at = NOW()
WHERE name = 'Wayside Fury';

INSERT INTO public.games (name, description, is_active, url, created_at, updated_at, published_at)
SELECT
    'Wayside Fury',
    'Five years later, the real evil arrives. Reunite the 8 Bit Evil Returns crew in a real-time action RPG.',
    TRUE,
    '/wayside-fury',
    NOW(),
    NOW(),
    NOW()
WHERE NOT EXISTS (SELECT 1 FROM public.games WHERE name = 'Wayside Fury');
