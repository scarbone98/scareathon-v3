-- Ghost Ridge: the PS1-style snowboarding run built into the site at /ghost-ridge.
-- Score submissions look the game up by name, so it needs a games row before its
-- arcade leaderboard can take scores.
--
-- The live games table is the old Strapi schema: no display_name column and no
-- unique constraint on name, so this checks for an existing row instead of using
-- ON CONFLICT. published_at is set so GET /games lists it.

UPDATE public.games
SET is_active = TRUE,
    url = '/ghost-ridge',
    updated_at = NOW()
WHERE name = 'Ghost Ridge';

INSERT INTO public.games (name, description, is_active, url, created_at, updated_at, published_at)
SELECT
    'Ghost Ridge',
    'Snowboard down a haunted mountain against the clock, landing tricks off the kickers.',
    TRUE,
    '/ghost-ridge',
    NOW(),
    NOW(),
    NOW()
WHERE NOT EXISTS (SELECT 1 FROM public.games WHERE name = 'Ghost Ridge');
