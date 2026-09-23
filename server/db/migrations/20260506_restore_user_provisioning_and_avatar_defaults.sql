-- Restores Supabase Auth -> public.users provisioning and seeds the first
-- avatar/inventory foundation for Gaia-style layered avatars.

CREATE TABLE IF NOT EXISTS public.avatar_items (
    id SERIAL PRIMARY KEY,
    item_key TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    slot TEXT NOT NULL,
    layer_order INTEGER NOT NULL,
    asset_path TEXT NOT NULL,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_inventory (
    user_id UUID NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
    item_id INTEGER NOT NULL REFERENCES public.avatar_items (id) ON DELETE CASCADE,
    acquired_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, item_id)
);

CREATE TABLE IF NOT EXISTS public.user_avatar (
    user_id UUID NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
    slot TEXT NOT NULL,
    item_id INTEGER NOT NULL REFERENCES public.avatar_items (id),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, slot)
);

CREATE UNIQUE INDEX IF NOT EXISTS users_username_key
    ON public.users (username);

CREATE INDEX IF NOT EXISTS idx_avatar_items_slot_layer
    ON public.avatar_items (slot, layer_order);

CREATE INDEX IF NOT EXISTS idx_user_avatar_user_layer
    ON public.user_avatar (user_id, slot);

INSERT INTO public.avatar_items (item_key, name, slot, layer_order, asset_path, is_default)
VALUES
    ('default_body', 'Default Body', 'body', 10, '/avatar/body/default.png', TRUE),
    ('default_pants', 'Default Pants', 'pants', 30, '/avatar/pants/default.png', TRUE),
    ('default_shirt', 'Default Shirt', 'shirt', 40, '/avatar/shirts/default.png', TRUE),
    ('default_shoes', 'Default Shoes', 'shoes', 50, '/avatar/shoes/default.png', TRUE),
    ('default_face', 'Default Face', 'face', 60, '/avatar/faces/default.png', TRUE),
    ('default_hair', 'Default Hair', 'hair', 70, '/avatar/hair/default.png', TRUE),
    ('default_accessory_none', 'No Accessory', 'accessory', 80, '/avatar/accessories/none.png', TRUE)
ON CONFLICT (item_key) DO UPDATE SET
    name = EXCLUDED.name,
    slot = EXCLUDED.slot,
    layer_order = EXCLUDED.layer_order,
    asset_path = EXCLUDED.asset_path,
    is_default = EXCLUDED.is_default;

CREATE OR REPLACE FUNCTION public.generate_spooky_username()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    spooky_adjectives TEXT[] := ARRAY[
        'Ghostly', 'Haunted', 'Creepy', 'Spooky', 'Eerie', 'Shadowy', 'Cursed', 'Wicked',
        'Sinister', 'Frightful', 'Macabre', 'Ominous', 'Grim', 'Morbid', 'Terrifying',
        'Dreadful', 'Vile', 'Bloodcurdling', 'Ghastly', 'Menacing', 'Nightmarish',
        'Mysterious', 'Horrifying', 'Chilling', 'Dark'
    ];
    spooky_nouns TEXT[] := ARRAY[
        'Phantom', 'Skeleton', 'Wraith', 'Goblin', 'Ghoul', 'Specter', 'Banshee', 'Zombie',
        'Vampire', 'Werewolf', 'Demon', 'Witch', 'Poltergeist', 'Shade', 'Beast',
        'Nightstalker', 'Cryptkeeper', 'Mummy', 'Revenant', 'Warlock', 'Lich',
        'Necromancer', 'Gorgon', 'Ogre', 'Troll'
    ];
    candidate TEXT;
    attempt INTEGER;
BEGIN
    FOR attempt IN 1..100 LOOP
        candidate :=
            spooky_adjectives[1 + floor(random() * array_length(spooky_adjectives, 1))::INTEGER] ||
            spooky_nouns[1 + floor(random() * array_length(spooky_nouns, 1))::INTEGER] ||
            floor(random() * 1000)::INTEGER::TEXT;

        IF NOT EXISTS (SELECT 1 FROM public.users WHERE username = candidate) THEN
            RETURN candidate;
        END IF;
    END LOOP;

    LOOP
        candidate := 'SpookyUser' || left(replace(gen_random_uuid()::TEXT, '-', ''), 8);
        IF NOT EXISTS (SELECT 1 FROM public.users WHERE username = candidate) THEN
            RETURN candidate;
        END IF;
    END LOOP;
END;
$$;

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
    WHERE avatar_items.is_default = TRUE
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

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.users (id, email, username)
    VALUES (NEW.id, NEW.email, public.generate_spooky_username())
    ON CONFLICT (id) DO UPDATE SET
        email = COALESCE(EXCLUDED.email, public.users.email),
        username = COALESCE(public.users.username, public.generate_spooky_username());

    PERFORM public.seed_user_avatar_defaults(NEW.id);

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_auth_user();

DO $$
DECLARE
    auth_user RECORD;
    user_without_username RECORD;
BEGIN
    FOR auth_user IN
        SELECT auth_users.id, auth_users.email
        FROM auth.users AS auth_users
        LEFT JOIN public.users AS users ON users.id = auth_users.id
        WHERE users.id IS NULL
    LOOP
        INSERT INTO public.users (id, email, username)
        VALUES (auth_user.id, auth_user.email, public.generate_spooky_username())
        ON CONFLICT (id) DO NOTHING;
    END LOOP;

    FOR user_without_username IN
        SELECT id
        FROM public.users
        WHERE username IS NULL
    LOOP
        UPDATE public.users
        SET username = public.generate_spooky_username()
        WHERE id = user_without_username.id;
    END LOOP;
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
