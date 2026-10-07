-- Pets cost twice what they did. (they went in at the old prices, and those rows are left alone on
-- conflict, so the new prices are set here.) Run by the server at start; harmless to run again.

UPDATE public.avatar_items AS ai
SET base_price = pet.price
FROM (VALUES
    ('bat_buddy', 500),
    ('black_cat', 600),
    ('bunny', 480),
    ('camp_tent', 560),
    ('dog', 520),
    ('emerald_pinball', 480),
    ('frog', 360),
    ('ghost_pup', 680),
    ('golden_pinball', 680),
    ('hemlock_crow', 520),
    ('imp', 720),
    ('jackalope', 520),
    ('little_bigfoot', 600),
    ('little_ufo', 720),
    ('mini_me', 900),
    ('mothman', 760),
    ('owl', 540),
    ('pumpkin_pal', 900),
    ('raven', 520),
    ('snail', 300),
    ('spider_pal', 440),
    ('tabby_cat', 520),
    ('tlaloc_warrior', 760),
    ('will_o_wisp', 720)
) AS pet (item_key, price)
WHERE ai.item_key = pet.item_key AND ai.art_version = 3 AND ai.category = 'companion';
