-- Hubble Bubble: Granny Grumblewart's potion shop, a secret cart (code POTION) that saves scores.
-- Score submissions look the game up by name, so it needs a games row first. Same shape as
-- Close Encounters': the live games table has no unique constraint on name, so this checks first.

UPDATE public.games
SET is_active = TRUE,
    updated_at = NOW()
WHERE name = 'Hubble Bubble';

INSERT INTO public.games (name, description, is_active, url, created_at, updated_at, published_at)
SELECT
    'Hubble Bubble',
    'Brew the potions the customers order, every step in the right order: ingredients, heat, stirring and the wand, then bottle it.',
    TRUE,
    'https://sclondon.github.io/HubbleBubble/build/index.html',
    NOW(),
    NOW(),
    NOW()
WHERE NOT EXISTS (SELECT 1 FROM public.games WHERE name = 'Hubble Bubble');
