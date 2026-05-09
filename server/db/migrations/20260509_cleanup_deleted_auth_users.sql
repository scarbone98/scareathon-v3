-- Cleans up app-owned user data when a Supabase Auth user is deleted.
-- public.users cascades clear avatar rows, item instances, wallets, listings,
-- inbox participant rows, and reward rows. The composite object is stored in
-- Supabase Storage, so remove that explicit storage row before deleting the
-- public user record.

CREATE OR REPLACE FUNCTION public.cleanup_deleted_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    PERFORM set_config('storage.allow_delete_query', 'true', true);

    DELETE FROM storage.objects
    WHERE bucket_id = 'avatar-composites'
      AND name = (OLD.id::text || '.png');

    DELETE FROM public.users
    WHERE id = OLD.id;

    RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_deleted ON auth.users;

CREATE TRIGGER on_auth_user_deleted
AFTER DELETE ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.cleanup_deleted_auth_user();

DO $$
DECLARE
    orphaned_user RECORD;
BEGIN
    PERFORM set_config('storage.allow_delete_query', 'true', true);

    FOR orphaned_user IN
        SELECT users.id
        FROM public.users AS users
        LEFT JOIN auth.users AS auth_users ON auth_users.id = users.id
        WHERE auth_users.id IS NULL
    LOOP
        DELETE FROM storage.objects
        WHERE bucket_id = 'avatar-composites'
          AND name = (orphaned_user.id::text || '.png');

        DELETE FROM public.users
        WHERE id = orphaned_user.id;
    END LOOP;
END;
$$;
