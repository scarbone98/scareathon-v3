-- Picto Box: the arcade's community camera. Signed-in players take a toy-camera
-- photo and it hangs on the shared wall for a day. The picture itself (a small
-- filtered JPEG, a few dozen KB) is stored here and served by
-- /picto-box/photos/:id.jpg; rows older than a day are never shown and are
-- purged whenever someone posts.

CREATE TABLE IF NOT EXISTS public.picto_box_photos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
    username TEXT,                          -- as it was when the photo was taken
    style TEXT NOT NULL DEFAULT 'sepia',
    image BYTEA NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS picto_box_photos_created_at_idx ON public.picto_box_photos (created_at DESC);
CREATE INDEX IF NOT EXISTS picto_box_photos_user_created_idx ON public.picto_box_photos (user_id, created_at DESC);

-- Only the server (service role) touches it.
ALTER TABLE public.picto_box_photos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.picto_box_photos FROM anon, authenticated;
