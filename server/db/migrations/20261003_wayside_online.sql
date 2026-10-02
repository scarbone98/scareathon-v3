-- Wayside Online, the arcade message board: posts (and replies) and reactions.
-- (Also run at server start-up; see WAYSIDE_ONLINE_SQL in server/routes/waysideOnline.js.)
CREATE TABLE IF NOT EXISTS public.wayside_online_posts (
    id BIGSERIAL PRIMARY KEY,
    board TEXT NOT NULL CHECK (board IN ('general', 'scareathon')),
    parent_id BIGINT REFERENCES public.wayside_online_posts (id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
    body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    removed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS wayside_online_posts_board_idx
    ON public.wayside_online_posts (board, id DESC) WHERE parent_id IS NULL;
CREATE INDEX IF NOT EXISTS wayside_online_posts_parent_idx
    ON public.wayside_online_posts (parent_id, id);
CREATE INDEX IF NOT EXISTS wayside_online_posts_user_idx
    ON public.wayside_online_posts (user_id, created_at DESC);
CREATE TABLE IF NOT EXISTS public.wayside_online_reactions (
    post_id BIGINT NOT NULL REFERENCES public.wayside_online_posts (id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
    emoji TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (post_id, user_id, emoji)
);
