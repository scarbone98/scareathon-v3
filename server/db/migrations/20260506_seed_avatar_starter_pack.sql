-- Adds the first editable avatar item catalog and separates starter inventory
-- grants from the one equipped default item per slot.

ALTER TABLE public.avatar_items
ADD COLUMN IF NOT EXISTS is_starter BOOLEAN NOT NULL DEFAULT FALSE;

INSERT INTO public.avatar_items (item_key, name, slot, layer_order, asset_path, is_default, is_starter)
VALUES
    ('default_body', 'Default Body', 'body', 10, '/avatar/body/default_body.png', TRUE, TRUE),
    ('pale_body', 'Pale Body', 'body', 10, '/avatar/body/pale_body.png', FALSE, TRUE),
    ('green_zombie_body', 'Zombie Body', 'body', 10, '/avatar/body/green_zombie_body.png', FALSE, TRUE),
    ('default_pants', 'Default Pants', 'pants', 30, '/avatar/pants/default_pants.png', TRUE, TRUE),
    ('ripped_jeans', 'Ripped Jeans', 'pants', 30, '/avatar/pants/ripped_jeans.png', FALSE, TRUE),
    ('dark_trousers', 'Dark Trousers', 'pants', 30, '/avatar/pants/dark_trousers.png', FALSE, TRUE),
    ('default_shirt', 'Default Shirt', 'shirt', 40, '/avatar/shirts/default_shirt.png', TRUE, TRUE),
    ('striped_shirt', 'Striped Shirt', 'shirt', 40, '/avatar/shirts/striped_shirt.png', FALSE, TRUE),
    ('vampire_jacket', 'Vampire Jacket', 'shirt', 40, '/avatar/shirts/vampire_jacket.png', FALSE, TRUE),
    ('scareathon_hoodie', 'Scareathon Hoodie', 'shirt', 40, '/avatar/shirts/scareathon_hoodie.png', FALSE, TRUE),
    ('default_shoes', 'Default Shoes', 'shoes', 50, '/avatar/shoes/default_shoes.png', TRUE, TRUE),
    ('boots', 'Boots', 'shoes', 50, '/avatar/shoes/boots.png', FALSE, TRUE),
    ('sneakers', 'Sneakers', 'shoes', 50, '/avatar/shoes/sneakers.png', FALSE, TRUE),
    ('default_face', 'Default Face', 'face', 60, '/avatar/faces/default_face.png', TRUE, TRUE),
    ('fang_face', 'Fang Face', 'face', 60, '/avatar/faces/fang_face.png', FALSE, TRUE),
    ('sleepy_face', 'Sleepy Face', 'face', 60, '/avatar/faces/sleepy_face.png', FALSE, TRUE),
    ('default_hair', 'Default Hair', 'hair', 70, '/avatar/hair/default_hair.png', TRUE, TRUE),
    ('black_shaggy_hair', 'Black Shaggy Hair', 'hair', 70, '/avatar/hair/black_shaggy_hair.png', FALSE, TRUE),
    ('white_witch_hair', 'White Witch Hair', 'hair', 70, '/avatar/hair/white_witch_hair.png', FALSE, TRUE),
    ('pumpkin_orange_hair', 'Pumpkin Orange Hair', 'hair', 70, '/avatar/hair/pumpkin_orange_hair.png', FALSE, TRUE),
    ('default_accessory_none', 'No Accessory', 'accessory', 80, '/avatar/accessories/default_accessory_none.png', TRUE, TRUE),
    ('bat_wings', 'Bat Wings', 'accessory', 5, '/avatar/accessories/bat_wings.png', FALSE, TRUE),
    ('skull_pin', 'Skull Pin', 'accessory', 75, '/avatar/accessories/skull_pin.png', FALSE, TRUE),
    ('pumpkin_hat', 'Pumpkin Hat', 'accessory', 90, '/avatar/accessories/pumpkin_hat.png', FALSE, TRUE)
ON CONFLICT (item_key) DO UPDATE SET
    name = EXCLUDED.name,
    slot = EXCLUDED.slot,
    layer_order = EXCLUDED.layer_order,
    asset_path = EXCLUDED.asset_path,
    is_default = EXCLUDED.is_default,
    is_starter = EXCLUDED.is_starter;

CREATE OR REPLACE FUNCTION public.seed_user_avatar_defaults(target_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.user_inventory (user_id, item_id)
    SELECT target_user_id, avatar_items.id
    FROM public.avatar_items
    WHERE avatar_items.is_starter = TRUE
    ON CONFLICT (user_id, item_id) DO NOTHING;

    INSERT INTO public.user_avatar (user_id, slot, item_id)
    SELECT DISTINCT ON (avatar_items.slot)
        target_user_id,
        avatar_items.slot,
        avatar_items.id
    FROM public.avatar_items
    WHERE avatar_items.is_default = TRUE
    ORDER BY avatar_items.slot, avatar_items.layer_order, avatar_items.id
    ON CONFLICT (user_id, slot) DO NOTHING;
END;
$$;

DO $$
DECLARE
    provisioned_user RECORD;
BEGIN
    FOR provisioned_user IN SELECT id FROM public.users LOOP
        PERFORM public.seed_user_avatar_defaults(provisioned_user.id);
    END LOOP;
END;
$$;
