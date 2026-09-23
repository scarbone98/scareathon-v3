-- Adds authenticated in-game inbox conversations, messages, and claimable rewards.

CREATE TABLE IF NOT EXISTS public.inbox_conversations (
    id BIGSERIAL PRIMARY KEY,
    conversation_type TEXT NOT NULL,
    created_by_user_id UUID REFERENCES public.users (id) ON DELETE SET NULL,
    subject TEXT,
    replies_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    CONSTRAINT inbox_conversations_type_check CHECK (
        conversation_type IN ('user_dm', 'admin_dm')
    ),
    CONSTRAINT inbox_conversations_subject_length CHECK (
        subject IS NULL OR char_length(subject) <= 120
    )
);

CREATE INDEX IF NOT EXISTS idx_inbox_conversations_updated
    ON public.inbox_conversations (updated_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS public.inbox_participants (
    id BIGSERIAL PRIMARY KEY,
    conversation_id BIGINT NOT NULL REFERENCES public.inbox_conversations (id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
    participant_role TEXT NOT NULL DEFAULT 'member',
    read_at TIMESTAMP WITH TIME ZONE,
    archived_at TIMESTAMP WITH TIME ZONE,
    deleted_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    CONSTRAINT inbox_participants_role_check CHECK (
        participant_role IN ('member', 'admin')
    ),
    CONSTRAINT inbox_participants_unique_user UNIQUE (conversation_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_inbox_participants_user_visible
    ON public.inbox_participants (user_id, deleted_at, conversation_id);

CREATE INDEX IF NOT EXISTS idx_inbox_participants_conversation
    ON public.inbox_participants (conversation_id);

CREATE TABLE IF NOT EXISTS public.inbox_messages (
    id BIGSERIAL PRIMARY KEY,
    conversation_id BIGINT NOT NULL REFERENCES public.inbox_conversations (id) ON DELETE CASCADE,
    sender_user_id UUID REFERENCES public.users (id) ON DELETE SET NULL,
    sender_type TEXT NOT NULL DEFAULT 'user',
    body TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    CONSTRAINT inbox_messages_sender_type_check CHECK (
        sender_type IN ('user', 'admin', 'system')
    ),
    CONSTRAINT inbox_messages_body_not_blank CHECK (char_length(btrim(body)) > 0),
    CONSTRAINT inbox_messages_body_length CHECK (char_length(body) <= 4000)
);

CREATE INDEX IF NOT EXISTS idx_inbox_messages_conversation_created
    ON public.inbox_messages (conversation_id, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS public.inbox_rewards (
    id BIGSERIAL PRIMARY KEY,
    conversation_id BIGINT NOT NULL REFERENCES public.inbox_conversations (id) ON DELETE CASCADE,
    message_id BIGINT NOT NULL REFERENCES public.inbox_messages (id) ON DELETE CASCADE,
    recipient_user_id UUID NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
    coin_amount BIGINT,
    item_id INTEGER REFERENCES public.avatar_items (id) ON DELETE RESTRICT,
    item_quantity INTEGER,
    status TEXT NOT NULL DEFAULT 'pending',
    granted_item_instance_ids BIGINT[] NOT NULL DEFAULT ARRAY[]::BIGINT[],
    claimed_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    CONSTRAINT inbox_rewards_message_unique UNIQUE (message_id),
    CONSTRAINT inbox_rewards_status_check CHECK (
        status IN ('pending', 'claimed', 'revoked')
    ),
    CONSTRAINT inbox_rewards_coin_positive CHECK (
        coin_amount IS NULL OR coin_amount > 0
    ),
    CONSTRAINT inbox_rewards_item_quantity_positive CHECK (
        item_quantity IS NULL OR item_quantity > 0
    ),
    CONSTRAINT inbox_rewards_item_quantity_pair CHECK (
        (item_id IS NULL AND item_quantity IS NULL)
        OR (item_id IS NOT NULL AND item_quantity IS NOT NULL)
    ),
    CONSTRAINT inbox_rewards_has_reward CHECK (
        COALESCE(coin_amount, 0) > 0 OR item_id IS NOT NULL
    )
);

CREATE INDEX IF NOT EXISTS idx_inbox_rewards_recipient_status
    ON public.inbox_rewards (recipient_user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_inbox_rewards_conversation
    ON public.inbox_rewards (conversation_id);
