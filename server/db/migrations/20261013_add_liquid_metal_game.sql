-- Liquid Metal: out of testing and onto the arcade shelf, saving scores.
-- Score submissions look the game up by name, so it needs a games row before its
-- leaderboard (and the weekly challenge) can take scores. Same shape as Wayside Fury's:
-- the live games table has no unique constraint on name, so this checks for a row first.

UPDATE public.games
SET is_active = TRUE,
    updated_at = NOW()
WHERE name = 'Liquid Metal';

INSERT INTO public.games (name, description, is_active, url, created_at, updated_at, published_at)
SELECT
    'Liquid Metal',
    'Mercury, made of liquid metal, on the black sand moon of the Crystaliens. Fight the online arena for mass, or run the ring road.',
    TRUE,
    'https://sclondon.github.io/LiquidMetal/build/index.html',
    NOW(),
    NOW(),
    NOW()
WHERE NOT EXISTS (SELECT 1 FROM public.games WHERE name = 'Liquid Metal');
