-- These SECURITY DEFINER functions run with owner rights and were callable by
-- anyone holding the public anon key through /rest/v1/rpc/<name>, e.g. to mint
-- coins with grant_currency or buy with someone else's wallet through
-- purchase_marketplace_listing. Only the game server (connecting as the owner,
-- which keeps EXECUTE) and service-role scripts are meant to call them.
--
-- Triggers keep working: Postgres doesn't check EXECUTE when a trigger fires.
-- To undo for one function: GRANT EXECUTE ON FUNCTION ... TO anon, authenticated;

DO $$
DECLARE
    fn TEXT;
BEGIN
    FOREACH fn IN ARRAY ARRAY[
        'public.cleanup_deleted_auth_user()',
        'public.ensure_user_wallet(uuid)',
        'public.generate_spooky_username()',
        'public.grant_currency(uuid, bigint, text, text, jsonb)',
        'public.grant_item_instance(uuid, integer, text, text, jsonb)',
        'public.handle_new_auth_user()',
        'public.purchase_marketplace_listing(uuid, bigint)',
        'public.seed_user_avatar_defaults(uuid)'
    ]
    LOOP
        EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
    END LOOP;
END;
$$;
