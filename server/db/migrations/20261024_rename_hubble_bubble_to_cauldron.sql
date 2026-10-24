-- Hubble Bubble is now called Cauldron. Score submissions look the game up by name, so the games
-- row takes the new name and its leaderboard rows keep pointing at the same id (as Scary Capitalist's
-- rename did). Run at startup in place of 20261021_add_hubble_bubble_game.sql, which would otherwise
-- put a second 'Hubble Bubble' row back: this renames the old row if it's there, and makes the row if
-- neither is. The live games table has no unique constraint on name, so each step checks first.

UPDATE public.games
SET name = 'Cauldron',
    description = 'Granny Grumblewart''s potion shop: brew what the customers order, stir it till it poofs, and get marked on dose, heat and stir.',
    updated_at = NOW()
WHERE name = 'Hubble Bubble'
  AND NOT EXISTS (SELECT 1 FROM public.games WHERE name = 'Cauldron');

INSERT INTO public.games (name, description, is_active, url, created_at, updated_at, published_at)
SELECT
    'Cauldron',
    'Granny Grumblewart''s potion shop: brew what the customers order, stir it till it poofs, and get marked on dose, heat and stir.',
    TRUE,
    'https://sclondon.github.io/HubbleBubble/build/index.html',
    NOW(),
    NOW(),
    NOW()
WHERE NOT EXISTS (SELECT 1 FROM public.games WHERE name = 'Cauldron');

UPDATE public.games
SET is_active = TRUE,
    updated_at = NOW()
WHERE name = 'Cauldron';
