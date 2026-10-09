ALTER TABLE public.users ADD COLUMN IF NOT EXISTS age_confirmed_at TIMESTAMPTZ;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS content_restricted_at TIMESTAMPTZ;
CREATE TABLE IF NOT EXISTS public.content_reports (
    id BIGSERIAL PRIMARY KEY,
    reporter_id UUID NOT NULL REFERENCES public.users(id),
    target_type TEXT NOT NULL CHECK (target_type IN ('post', 'lounge_chat', 'monster_chat', 'photo', 'listing')),
    target_id TEXT NOT NULL,
    target_user_id UUID REFERENCES public.users(id),
    reason TEXT NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 1000),
    snapshot JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'dismissed', 'removed')),
    reviewed_by UUID REFERENCES public.users(id),
    reviewed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS content_reports_queue ON public.content_reports(status, created_at);
CREATE TABLE IF NOT EXISTS public.user_blocks (
    blocker_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    blocked_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (blocker_id, blocked_id),
    CHECK (blocker_id <> blocked_id)
);
-- Only the API DB role can access moderation records. No direct Supabase client writes.
ALTER TABLE public.content_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;
-- Supabase riders may update their profile, but moderation/confirmation fields are API-owned.
CREATE OR REPLACE FUNCTION public.station_protect_compliance_fields() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF current_user IN ('anon', 'authenticated') THEN
        IF TG_OP = 'INSERT' THEN
            IF NEW.age_confirmed_at IS NOT NULL OR NEW.content_restricted_at IS NOT NULL THEN
                RAISE EXCEPTION 'Compliance fields are managed by the station API';
            END IF;
        ELSIF NEW.age_confirmed_at IS DISTINCT FROM OLD.age_confirmed_at
           OR NEW.content_restricted_at IS DISTINCT FROM OLD.content_restricted_at THEN
            RAISE EXCEPTION 'Compliance fields are managed by the station API';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS station_protect_compliance_fields ON public.users;
CREATE TRIGGER station_protect_compliance_fields BEFORE INSERT OR UPDATE ON public.users
FOR EACH ROW EXECUTE FUNCTION public.station_protect_compliance_fields();
