-- Adds the backend foundation for avatar marketplace commerce:
-- per-copy ownership, coin wallets, immutable ledgers, listings, and awards.

ALTER TABLE public.avatar_items
ADD COLUMN IF NOT EXISTS is_tradeable BOOLEAN NOT NULL DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS is_sellable BOOLEAN NOT NULL DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS rarity TEXT NOT NULL DEFAULT 'common',
ADD COLUMN IF NOT EXISTS base_price INTEGER,
ADD COLUMN IF NOT EXISTS release_status TEXT NOT NULL DEFAULT 'released',
ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'avatar_items_base_price_nonnegative'
          AND conrelid = 'public.avatar_items'::regclass
    ) THEN
        ALTER TABLE public.avatar_items
        ADD CONSTRAINT avatar_items_base_price_nonnegative
        CHECK (base_price IS NULL OR base_price >= 0) NOT VALID;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'avatar_items_release_status_check'
          AND conrelid = 'public.avatar_items'::regclass
    ) THEN
        ALTER TABLE public.avatar_items
        ADD CONSTRAINT avatar_items_release_status_check
        CHECK (release_status IN ('draft', 'released', 'retired')) NOT VALID;
    END IF;
END;
$$;

UPDATE public.avatar_items
SET is_tradeable = FALSE,
    is_sellable = FALSE
WHERE is_default = TRUE;

CREATE TABLE IF NOT EXISTS public.user_wallets (
    user_id UUID PRIMARY KEY REFERENCES public.users (id) ON DELETE CASCADE,
    coin_balance BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    CONSTRAINT user_wallets_coin_balance_nonnegative CHECK (coin_balance >= 0)
);

CREATE TABLE IF NOT EXISTS public.currency_transactions (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
    amount BIGINT NOT NULL,
    balance_after BIGINT NOT NULL,
    transaction_type TEXT NOT NULL,
    source_type TEXT NOT NULL,
    source_id TEXT,
    counterparty_user_id UUID REFERENCES public.users (id) ON DELETE SET NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    CONSTRAINT currency_transactions_amount_nonzero CHECK (amount <> 0),
    CONSTRAINT currency_transactions_type_check CHECK (
        transaction_type IN ('earn', 'spend', 'grant', 'sale', 'refund', 'adjustment')
    )
);

CREATE INDEX IF NOT EXISTS idx_currency_transactions_user_created
    ON public.currency_transactions (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_currency_transactions_source
    ON public.currency_transactions (source_type, source_id);

CREATE TABLE IF NOT EXISTS public.user_item_instances (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
    item_id INTEGER NOT NULL REFERENCES public.avatar_items (id) ON DELETE RESTRICT,
    status TEXT NOT NULL DEFAULT 'owned',
    source_type TEXT NOT NULL DEFAULT 'starter',
    source_id TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    acquired_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    CONSTRAINT user_item_instances_status_check CHECK (
        status IN ('owned', 'listed', 'locked', 'consumed')
    )
);

CREATE INDEX IF NOT EXISTS idx_user_item_instances_user_status
    ON public.user_item_instances (user_id, status);

CREATE INDEX IF NOT EXISTS idx_user_item_instances_item
    ON public.user_item_instances (item_id);

DO $$
BEGIN
    IF to_regclass('public.user_inventory') IS NOT NULL THEN
        INSERT INTO public.user_item_instances (user_id, item_id, source_type, source_id, acquired_at)
        SELECT ui.user_id, ui.item_id, 'legacy_inventory', NULL, ui.acquired_at
        FROM public.user_inventory ui
        WHERE NOT EXISTS (
            SELECT 1
            FROM public.user_item_instances uii
            WHERE uii.user_id = ui.user_id
              AND uii.item_id = ui.item_id
              AND uii.source_type = 'legacy_inventory'
        );
    END IF;
END;
$$;

INSERT INTO public.user_item_instances (user_id, item_id, source_type, source_id)
SELECT ua.user_id, ua.item_id, 'legacy_equipped', ua.slot
FROM public.user_avatar ua
WHERE NOT EXISTS (
    SELECT 1
    FROM public.user_item_instances uii
    WHERE uii.user_id = ua.user_id
      AND uii.item_id = ua.item_id
);

ALTER TABLE public.user_avatar
ADD COLUMN IF NOT EXISTS item_instance_id BIGINT REFERENCES public.user_item_instances (id);

UPDATE public.user_avatar ua
SET item_instance_id = (
    SELECT uii.id
    FROM public.user_item_instances uii
    WHERE uii.user_id = ua.user_id
      AND uii.item_id = ua.item_id
      AND uii.status = 'owned'
    ORDER BY uii.id
    LIMIT 1
)
WHERE ua.item_instance_id IS NULL;

ALTER TABLE public.user_avatar
ALTER COLUMN item_instance_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS user_avatar_item_instance_key
    ON public.user_avatar (item_instance_id)
    WHERE item_instance_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.marketplace_listings (
    id BIGSERIAL PRIMARY KEY,
    item_instance_id BIGINT NOT NULL REFERENCES public.user_item_instances (id) ON DELETE RESTRICT,
    item_id INTEGER NOT NULL REFERENCES public.avatar_items (id) ON DELETE RESTRICT,
    seller_user_id UUID NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
    buyer_user_id UUID REFERENCES public.users (id) ON DELETE SET NULL,
    price_amount BIGINT NOT NULL,
    currency_code TEXT NOT NULL DEFAULT 'coins',
    status TEXT NOT NULL DEFAULT 'active',
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    sold_at TIMESTAMP WITH TIME ZONE,
    canceled_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT marketplace_listings_price_positive CHECK (price_amount > 0),
    CONSTRAINT marketplace_listings_currency_check CHECK (currency_code = 'coins'),
    CONSTRAINT marketplace_listings_status_check CHECK (
        status IN ('active', 'sold', 'canceled', 'expired')
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS marketplace_listings_active_item_instance_key
    ON public.marketplace_listings (item_instance_id)
    WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_marketplace_listings_active_created
    ON public.marketplace_listings (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_marketplace_listings_seller_status
    ON public.marketplace_listings (seller_user_id, status);

CREATE TABLE IF NOT EXISTS public.arcade_reward_rules (
    id BIGSERIAL PRIMARY KEY,
    game_id INTEGER NOT NULL REFERENCES public.games (id) ON DELETE CASCADE,
    metric_name TEXT NOT NULL,
    reward_type TEXT NOT NULL,
    fixed_amount BIGINT,
    multiplier NUMERIC,
    min_metric_value NUMERIC,
    max_reward BIGINT,
    starts_at TIMESTAMP WITH TIME ZONE,
    ends_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    CONSTRAINT arcade_reward_rules_type_check CHECK (reward_type IN ('fixed', 'multiplier')),
    CONSTRAINT arcade_reward_rules_amounts_check CHECK (
        (fixed_amount IS NULL OR fixed_amount >= 0)
        AND (multiplier IS NULL OR multiplier >= 0)
        AND (max_reward IS NULL OR max_reward >= 0)
    )
);

CREATE INDEX IF NOT EXISTS idx_arcade_reward_rules_lookup
    ON public.arcade_reward_rules (game_id, metric_name, is_active);

CREATE TABLE IF NOT EXISTS public.item_awards (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
    item_id INTEGER NOT NULL REFERENCES public.avatar_items (id) ON DELETE RESTRICT,
    item_instance_id BIGINT REFERENCES public.user_item_instances (id) ON DELETE SET NULL,
    game_id INTEGER REFERENCES public.games (id) ON DELETE SET NULL,
    metric_name TEXT,
    award_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    reason TEXT,
    eligible_from TIMESTAMP WITH TIME ZONE,
    eligible_until TIMESTAMP WITH TIME ZONE,
    awarded_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    CONSTRAINT item_awards_type_check CHECK (
        award_type IN ('weekly_top_score', 'event', 'admin', 'arcade_milestone')
    ),
    CONSTRAINT item_awards_status_check CHECK (status IN ('pending', 'granted', 'revoked'))
);

CREATE INDEX IF NOT EXISTS idx_item_awards_user_status
    ON public.item_awards (user_id, status);

CREATE INDEX IF NOT EXISTS idx_item_awards_game_metric
    ON public.item_awards (game_id, metric_name);

INSERT INTO public.user_wallets (user_id)
SELECT id
FROM public.users
ON CONFLICT (user_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.ensure_user_wallet(target_user_id UUID)
RETURNS public.user_wallets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    wallet public.user_wallets;
BEGIN
    INSERT INTO public.user_wallets (user_id)
    VALUES (target_user_id)
    ON CONFLICT (user_id) DO NOTHING;

    SELECT *
    INTO wallet
    FROM public.user_wallets
    WHERE user_id = target_user_id;

    RETURN wallet;
END;
$$;

CREATE OR REPLACE FUNCTION public.grant_currency(
    target_user_id UUID,
    grant_amount BIGINT,
    grant_source_type TEXT,
    grant_source_id TEXT DEFAULT NULL,
    grant_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    new_balance BIGINT;
BEGIN
    IF grant_amount <= 0 THEN
        RAISE EXCEPTION 'grant_amount must be positive';
    END IF;

    PERFORM public.ensure_user_wallet(target_user_id);

    UPDATE public.user_wallets
    SET coin_balance = coin_balance + grant_amount,
        updated_at = now()
    WHERE user_id = target_user_id
    RETURNING coin_balance INTO new_balance;

    INSERT INTO public.currency_transactions (
        user_id,
        amount,
        balance_after,
        transaction_type,
        source_type,
        source_id,
        metadata
    )
    VALUES (
        target_user_id,
        grant_amount,
        new_balance,
        'earn',
        grant_source_type,
        grant_source_id,
        grant_metadata
    );

    RETURN new_balance;
END;
$$;

CREATE OR REPLACE FUNCTION public.grant_item_instance(
    target_user_id UUID,
    target_item_id INTEGER,
    grant_source_type TEXT,
    grant_source_id TEXT DEFAULT NULL,
    grant_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    new_instance_id BIGINT;
BEGIN
    INSERT INTO public.user_item_instances (
        user_id,
        item_id,
        status,
        source_type,
        source_id,
        metadata
    )
    VALUES (
        target_user_id,
        target_item_id,
        'owned',
        grant_source_type,
        grant_source_id,
        grant_metadata
    )
    RETURNING id INTO new_instance_id;

    RETURN new_instance_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.purchase_marketplace_listing(
    buyer_id UUID,
    target_listing_id BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    listing_record public.marketplace_listings;
    buyer_balance BIGINT;
    seller_balance BIGINT;
BEGIN
    SELECT *
    INTO listing_record
    FROM public.marketplace_listings
    WHERE id = target_listing_id
    FOR UPDATE;

    IF NOT FOUND OR listing_record.status <> 'active' THEN
        RAISE EXCEPTION 'Listing is not active';
    END IF;

    IF listing_record.seller_user_id = buyer_id THEN
        RAISE EXCEPTION 'Cannot buy your own listing';
    END IF;

    PERFORM public.ensure_user_wallet(buyer_id);
    PERFORM public.ensure_user_wallet(listing_record.seller_user_id);

    PERFORM 1
    FROM public.user_item_instances
    WHERE id = listing_record.item_instance_id
      AND user_id = listing_record.seller_user_id
      AND status = 'listed'
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Listed item is no longer available';
    END IF;

    SELECT coin_balance
    INTO buyer_balance
    FROM public.user_wallets
    WHERE user_id = buyer_id
    FOR UPDATE;

    IF buyer_balance < listing_record.price_amount THEN
        RAISE EXCEPTION 'Insufficient funds';
    END IF;

    UPDATE public.user_wallets
    SET coin_balance = coin_balance - listing_record.price_amount,
        updated_at = now()
    WHERE user_id = buyer_id
    RETURNING coin_balance INTO buyer_balance;

    UPDATE public.user_wallets
    SET coin_balance = coin_balance + listing_record.price_amount,
        updated_at = now()
    WHERE user_id = listing_record.seller_user_id
    RETURNING coin_balance INTO seller_balance;

    UPDATE public.user_item_instances
    SET user_id = buyer_id,
        status = 'owned',
        updated_at = now()
    WHERE id = listing_record.item_instance_id;

    UPDATE public.marketplace_listings
    SET status = 'sold',
        buyer_user_id = buyer_id,
        sold_at = now(),
        updated_at = now()
    WHERE id = target_listing_id;

    INSERT INTO public.currency_transactions (
        user_id,
        amount,
        balance_after,
        transaction_type,
        source_type,
        source_id,
        counterparty_user_id
    )
    VALUES
        (
            buyer_id,
            -listing_record.price_amount,
            buyer_balance,
            'spend',
            'marketplace_purchase',
            target_listing_id::text,
            listing_record.seller_user_id
        ),
        (
            listing_record.seller_user_id,
            listing_record.price_amount,
            seller_balance,
            'sale',
            'marketplace_sale',
            target_listing_id::text,
            buyer_id
        );

    RETURN jsonb_build_object(
        'listingId', target_listing_id,
        'itemInstanceId', listing_record.item_instance_id,
        'itemId', listing_record.item_id,
        'priceAmount', listing_record.price_amount,
        'sellerUserId', listing_record.seller_user_id,
        'buyerUserId', buyer_id,
        'buyerBalance', buyer_balance,
        'sellerBalance', seller_balance
    );
END;
$$;

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

    INSERT INTO public.user_avatar (user_id, slot, item_id, item_instance_id)
    SELECT DISTINCT ON (avatar_items.slot)
        target_user_id,
        avatar_items.slot,
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
    ORDER BY avatar_items.slot, avatar_items.layer_order, avatar_items.id
    ON CONFLICT (user_id, slot) DO NOTHING;
END;
$$;

DROP TABLE IF EXISTS public.user_inventory;
