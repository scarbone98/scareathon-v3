-- Mystery Crypt: the Mystery Dungeon-style crawl built into the site at /mystery-crypt.
-- Score submissions look the game up by name, so it needs a games row before its
-- arcade leaderboard can take scores.
--
-- The live games table is the old Strapi schema: no display_name column and no
-- unique constraint on name, so this checks for an existing row instead of using
-- ON CONFLICT. published_at is set so GET /games lists it.

UPDATE public.games
SET is_active = TRUE,
    url = '/mystery-crypt',
    updated_at = NOW()
WHERE name = 'Mystery Crypt';

INSERT INTO public.games (name, description, is_active, url, created_at, updated_at, published_at)
SELECT
    'Mystery Crypt',
    'Explore a new crypt every floor, one step at a time, and recruit the monsters you beat.',
    TRUE,
    '/mystery-crypt',
    NOW(),
    NOW(),
    NOW()
WHERE NOT EXISTS (SELECT 1 FROM public.games WHERE name = 'Mystery Crypt');
