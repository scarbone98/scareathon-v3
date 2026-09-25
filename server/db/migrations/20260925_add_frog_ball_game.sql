-- Frog Ball: the Monkey Ball-style tilt game built into the site at /frog-ball.
-- Score submissions look the game up by name, so it needs a games row before its
-- arcade leaderboard can take scores.
--
-- The live games table is the old Strapi schema: no display_name column and no
-- unique constraint on name, so this checks for an existing row instead of using
-- ON CONFLICT. published_at is set so GET /games lists it.

UPDATE public.games
SET is_active = TRUE,
    url = '/frog-ball',
    updated_at = NOW()
WHERE name = 'Frog Ball';

INSERT INTO public.games (name, description, is_active, url, created_at, updated_at, published_at)
SELECT
    'Frog Ball',
    'Tilt the world to roll a frog in a ball through five dream worlds to the goal.',
    TRUE,
    '/frog-ball',
    NOW(),
    NOW(),
    NOW()
WHERE NOT EXISTS (SELECT 1 FROM public.games WHERE name = 'Frog Ball');
