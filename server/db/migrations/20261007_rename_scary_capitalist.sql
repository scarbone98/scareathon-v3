-- The idle tycoon is called Scary Capitalist, not Scare Capitalist, and lives at
-- /scary-capitalist. Score submissions look the game up by name, so the games row
-- (id 23) takes the new name; its leaderboard rows keep pointing at the same id.
-- The save table, scare_capitalist_saves, keeps its name.

UPDATE public.games
SET name = 'Scary Capitalist',
    url = '/scary-capitalist',
    updated_at = NOW()
WHERE name = 'Scare Capitalist';
