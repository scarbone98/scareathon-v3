-- The capsule machine on the platform: a turn of the crank costs tickets and
-- gives one avatar item. The server picks the item; this function only takes
-- the tickets and hands the item over, in one transaction, and writes the
-- movement to currency_transactions.

CREATE OR REPLACE FUNCTION public.pull_capsule(
    target_user_id UUID,
    target_item_id INTEGER,
    pull_price BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    item_row public.avatar_items;
    new_balance BIGINT;
    new_instance_id BIGINT;
BEGIN
    IF pull_price IS NULL OR pull_price <= 0 THEN
        RAISE EXCEPTION 'invalid_amount';
    END IF;

    SELECT * INTO item_row
    FROM public.avatar_items
    WHERE id = target_item_id
      AND release_status = 'released';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'item_unavailable';
    END IF;

    PERFORM public.ensure_user_wallet(target_user_id);

    UPDATE public.user_wallets
    SET coin_balance = coin_balance - pull_price,
        updated_at = now()
    WHERE user_id = target_user_id
      AND coin_balance >= pull_price
    RETURNING coin_balance INTO new_balance;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'insufficient_funds';
    END IF;

    new_instance_id := public.grant_item_instance(
        target_user_id,
        target_item_id,
        'capsule',
        NULL,
        jsonb_build_object('itemKey', item_row.item_key, 'priceAmount', pull_price, 'currencyCode', 'coins')
    );

    INSERT INTO public.currency_transactions (
        user_id, amount, balance_after, transaction_type, source_type, source_id, metadata
    )
    VALUES (
        target_user_id,
        -pull_price,
        new_balance,
        'spend',
        'capsule_pull',
        new_instance_id::TEXT,
        jsonb_build_object('itemId', target_item_id, 'itemKey', item_row.item_key, 'rarity', item_row.rarity)
    );

    RETURN jsonb_build_object('itemInstanceId', new_instance_id, 'balance', new_balance);
END;
$$;

-- Only the game server (the owner) calls this.
REVOKE EXECUTE ON FUNCTION public.pull_capsule(UUID, INTEGER, BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pull_capsule(UUID, INTEGER, BIGINT) TO service_role;
