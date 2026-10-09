-- Keep public results after account closure; never cascade them from auth.users.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
DO $$ DECLARE constraint_name text; BEGIN
  FOR constraint_name IN SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.users'::regclass AND confrelid = 'auth.users'::regclass
  LOOP EXECUTE format('ALTER TABLE public.users DROP CONSTRAINT %I', constraint_name); END LOOP;
END $$;

-- Link sheet-era results where their name identifies an existing account. Unlinked
-- historical names cannot be attributed to a rider and remain standalone history.
ALTER TABLE public.scareathon_history ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.scareathon_winners ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES public.users(id) ON DELETE SET NULL;
UPDATE public.scareathon_history h SET user_id = u.id FROM public.users u WHERE h.user_id IS NULL AND h.name = u.username;
UPDATE public.scareathon_winners w SET user_id = u.id FROM public.users u WHERE w.user_id IS NULL AND w.name = u.username;

-- Durable retry queue: Storage and Auth are remote APIs, outside the SQL transaction.
CREATE TABLE IF NOT EXISTS public.account_deletion_jobs (
  user_id uuid PRIMARY KEY REFERENCES public.users(id),
  storage_files jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.account_deletion_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.account_deletion_jobs FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.cleanup_deleted_auth_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- The account route has already erased private data. Retain its tombstone/results.
  IF EXISTS (SELECT 1 FROM public.users WHERE id = OLD.id AND deleted_at IS NOT NULL) THEN
    RETURN OLD;
  END IF;
  -- Preserve the old cleanup for accounts removed outside the account-control flow.
  PERFORM set_config('storage.allow_delete_query', 'true', true);
  DELETE FROM storage.objects WHERE bucket_id = 'avatar-composites' AND name = OLD.id::text || '.png';
  DELETE FROM public.users WHERE id = OLD.id;
  RETURN OLD;
END $$;

-- Email changes are confirmed by Supabase before this trigger copies the new email.
CREATE OR REPLACE FUNCTION public.sync_station_email()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.users SET email = NEW.email WHERE id = NEW.id AND deleted_at IS NULL;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS station_email_changed ON auth.users;
CREATE TRIGGER station_email_changed AFTER UPDATE OF email ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.sync_station_email();

CREATE OR REPLACE FUNCTION public.notify_station_account_closed()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    PERFORM pg_notify('station_account_closed', NEW.id::text);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS station_account_closed ON public.users;
CREATE TRIGGER station_account_closed AFTER UPDATE OF deleted_at ON public.users
FOR EACH ROW EXECUTE FUNCTION public.notify_station_account_closed();

-- Supabase access JWTs can remain cryptographically valid until expiry. Restrictive
-- policies also deny direct Storage/app-table access for a closed account during that gap.
CREATE OR REPLACE FUNCTION public.station_account_active(rider_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.users WHERE id = rider_id AND deleted_at IS NULL);
$$;
DROP POLICY IF EXISTS station_active_account ON storage.objects;
CREATE POLICY station_active_account ON storage.objects AS RESTRICTIVE
FOR ALL TO authenticated
USING (public.station_account_active(auth.uid()))
WITH CHECK (public.station_account_active(auth.uid()));
DO $$ DECLARE protected_table record; BEGIN
  FOR protected_table IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS station_active_account ON public.%I', protected_table.relname);
    EXECUTE format('CREATE POLICY station_active_account ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (public.station_account_active(auth.uid())) WITH CHECK (public.station_account_active(auth.uid()))', protected_table.relname);
  END LOOP;
END $$;
