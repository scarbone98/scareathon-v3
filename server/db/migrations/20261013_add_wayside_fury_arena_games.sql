-- Tournament scores use the normal Arcade submit/leaderboard path, with distinct
-- solo and co-op lookup names. The live Strapi games schema has no unique name
-- constraint, so insertion must be idempotent without ON CONFLICT(name).
UPDATE public.games
SET is_active = TRUE,
    url = '/wayside-fury',
    published_at = COALESCE(published_at, NOW()),
    updated_at = NOW()
WHERE name IN ('wayside-fury-arena', 'wayside-fury-arena-coop');

INSERT INTO public.games (name, description, is_active, url, created_at, updated_at, published_at)
SELECT tournament.name, tournament.description, TRUE, '/wayside-fury', NOW(), NOW(), NOW()
FROM (VALUES
    ('wayside-fury-arena', 'Wayside Fury Tournament Arena: endless solo waves with escalating modifiers.'),
    ('wayside-fury-arena-coop', 'Wayside Fury Tournament Arena Co-op: the crew against endless escalating waves.')
) AS tournament(name, description)
WHERE NOT EXISTS (SELECT 1 FROM public.games WHERE name = tournament.name);
