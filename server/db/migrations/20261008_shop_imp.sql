-- The Imp pet: the imp from the original 8 Bit Evil, its own sprite, added if missing. The row from
-- avatar_catalog.sql (made by npm run art:avatar). Run by the server at start; harmless to run again.

INSERT INTO public.avatar_items (
    item_key, name, slot, equip_group, layer_order, asset_path,
    is_default, is_starter, is_tradeable, is_sellable, rarity, base_price, release_status,
    metadata, art_version, category, parts, dyes, hides, occupies, stack_order
)
VALUES
('imp', 'Imp', 'companion', 'companion', 0, '/avatar-px/items/imp/icon.png?v=1c28b35018', false, false, true, true, 'epic', 360, 'released', '{"source":"pixel-avatar"}'::jsonb, 3, 'companion', '[{"slot":"companion","anchor":"free","x":16,"y":32,"w":16,"h":16,"frames":4,"src":"/avatar-px/items/imp/0-companion.png?v=06ee57d946"}]'::jsonb, '{}'::jsonb, ARRAY[]::text[], ARRAY[]::text[], 0)
ON CONFLICT (item_key) DO NOTHING;
