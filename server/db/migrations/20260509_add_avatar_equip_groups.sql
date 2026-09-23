-- Allows multiple items in the same broad slot when they use different
-- equip groups, while preserving legacy one-item-per-slot behavior.

ALTER TABLE public.avatar_items
ADD COLUMN IF NOT EXISTS equip_group TEXT;

UPDATE public.avatar_items
SET equip_group = slot
WHERE equip_group IS NULL OR btrim(equip_group) = '';

UPDATE public.avatar_items
SET equip_group = CASE
    WHEN is_default = TRUE THEN slot
    WHEN item_key ILIKE '%wing%' THEN 'back'
    WHEN item_key ILIKE '%hat%' THEN 'hat'
    WHEN item_key ILIKE '%pin%' THEN 'pin'
    WHEN item_key ILIKE '%badge%' THEN 'badge'
    ELSE item_key
END
WHERE slot = 'accessory'
  AND equip_group = 'accessory';

ALTER TABLE public.avatar_items
ALTER COLUMN equip_group SET NOT NULL;

ALTER TABLE public.user_avatar
ADD COLUMN IF NOT EXISTS equip_group TEXT;

UPDATE public.user_avatar ua
SET
    equip_group = COALESCE(NULLIF(ai.equip_group, ''), ai.slot),
    slot = ai.slot
FROM public.avatar_items ai
WHERE ai.id = ua.item_id
  AND (
      ua.equip_group IS NULL
      OR ua.equip_group <> COALESCE(NULLIF(ai.equip_group, ''), ai.slot)
      OR ua.slot <> ai.slot
  );

ALTER TABLE public.user_avatar
ALTER COLUMN equip_group SET NOT NULL;

ALTER TABLE public.user_avatar
DROP CONSTRAINT IF EXISTS user_avatar_pkey;

ALTER TABLE public.user_avatar
ADD CONSTRAINT user_avatar_pkey PRIMARY KEY (user_id, equip_group);

CREATE INDEX IF NOT EXISTS idx_avatar_items_slot_group_layer
    ON public.avatar_items (slot, equip_group, layer_order);

CREATE INDEX IF NOT EXISTS idx_user_avatar_user_equip_group
    ON public.user_avatar (user_id, equip_group);

CREATE OR REPLACE FUNCTION public.seed_user_avatar_defaults(target_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    starter_item RECORD;
    starter_instance_id BIGINT;
BEGIN
    PERFORM public.ensure_user_wallet(target_user_id);

    FOR starter_item IN
        SELECT id
        FROM public.avatar_items
        WHERE is_starter = TRUE
    LOOP
        IF NOT EXISTS (
            SELECT 1
            FROM public.user_item_instances
            WHERE user_id = target_user_id
              AND item_id = starter_item.id
        ) THEN
            INSERT INTO public.user_item_instances (user_id, item_id, status, source_type)
            VALUES (target_user_id, starter_item.id, 'owned', 'starter')
            RETURNING id INTO starter_instance_id;
        END IF;
    END LOOP;

    INSERT INTO public.user_avatar (user_id, slot, equip_group, item_id, item_instance_id)
    SELECT DISTINCT ON (avatar_items.equip_group)
        target_user_id,
        avatar_items.slot,
        avatar_items.equip_group,
        avatar_items.id,
        (
            SELECT uii.id
            FROM public.user_item_instances uii
            WHERE uii.user_id = target_user_id
              AND uii.item_id = avatar_items.id
              AND uii.status = 'owned'
            ORDER BY uii.id
            LIMIT 1
        )
    FROM public.avatar_items
    WHERE avatar_items.is_default = TRUE
    ORDER BY avatar_items.equip_group, avatar_items.layer_order, avatar_items.id
    ON CONFLICT (user_id, equip_group) DO NOTHING;
END;
$$;
