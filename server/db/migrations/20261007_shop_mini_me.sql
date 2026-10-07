-- The Mini Me companion: your own avatar, small, beside you (drawn by the site; its art here is its
-- picture in the shop), added if missing. The row from avatar_catalog.sql (made by npm run
-- art:avatar). Run by the server at start; harmless to run again.

INSERT INTO public.avatar_items (
    item_key, name, slot, equip_group, layer_order, asset_path,
    is_default, is_starter, is_tradeable, is_sellable, rarity, base_price, release_status,
    metadata, art_version, category, parts, dyes, hides, occupies, stack_order
)
VALUES
('mini_me', 'Mini Me', 'companion', 'companion', 0, '/avatar-px/items/mini_me/icon.png?v=f985d091d8', false, false, true, true, 'epic', 450, 'released', '{"source":"pixel-avatar"}'::jsonb, 3, 'companion', '[{"slot":"companion","anchor":"free","x":20,"y":35,"w":7,"h":12,"frames":1,"src":"/avatar-px/items/mini_me/0-companion.png?v=667328f1d8"}]'::jsonb, '{"dye1":"orange"}'::jsonb, ARRAY[]::text[], ARRAY[]::text[], 0)
ON CONFLICT (item_key) DO NOTHING;
