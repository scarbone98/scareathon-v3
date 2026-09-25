-- WirtWare now has 19 microgames, so drop the game count from its description.

UPDATE public.games
SET description = 'Tiny games a few seconds each, faster and faster. How many can you win?',
    updated_at = NOW()
WHERE name = 'WirtWare';
