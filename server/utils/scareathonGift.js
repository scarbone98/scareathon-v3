import { AVATAR_ART_VERSION } from './avatarV2.js';

// A gift to celebrate the Scareathon: every player finds one in their inbox, a wrapped present
// from the item shop (common, uncommon or rare: nothing epic or legendary, nothing with a
// limited run, and nothing they already own). Which item is settled when it's sent, a
// different one for each player; opening it (claiming the reward, as any inbox reward) puts
// it in their locker.
//
// Run by the server at start, and harmless to run again: a player who already has theirs is
// passed over, so each start only sends to whoever has joined since. Sends stop after the
// event; gifts already sent can still be opened.
export const SCAREATHON_GIFT_CAMPAIGN = 'scareathon-2026-gift';
const SENDS_UNTIL = '2026-11-08';
const SUBJECT = 'A gift for the Scareathon';
const BODY = [
    'Happy Scareathon!',
    '',
    'Thirty-one nights of films, a whole arcade, and you turned up for it. Here is a little something from the item shop, on the house.',
    '',
    'Go on. Open it.',
].join('\n');

const quote = (text) => `'${text.replace(/'/g, "''")}'`;

export const SCAREATHON_GIFT_SQL = `
    -- (one start at a time, so two servers coming up together can't both send)
    SELECT pg_advisory_xact_lock(hashtext(${quote(SCAREATHON_GIFT_CAMPAIGN)}));

    WITH picks AS (
        SELECT u.id AS user_id, gift.id AS item_id
        FROM public.users u
        CROSS JOIN LATERAL (
            SELECT ai.id
            FROM public.avatar_items ai
            WHERE ai.art_version = ${AVATAR_ART_VERSION}
              AND ai.release_status = 'released'
              AND ai.base_price > 0
              AND ai.is_default = FALSE
              AND ai.category <> 'background'
              AND ai.rarity IN ('common', 'uncommon', 'rare')
              AND ai.metadata->>'supplyLimit' IS NULL
              AND NOT EXISTS (
                  SELECT 1 FROM public.user_item_instances owned
                  WHERE owned.user_id = u.id AND owned.item_id = ai.id
              )
            -- (as good as random, and a different order for every player)
            ORDER BY md5(ai.id::text || u.id::text || ${quote(SCAREATHON_GIFT_CAMPAIGN)})
            LIMIT 1
        ) gift
        WHERE now() < ${quote(SENDS_UNTIL)}::timestamptz
          AND NOT EXISTS (
              SELECT 1 FROM public.inbox_rewards sent
              WHERE sent.recipient_user_id = u.id
                AND sent.metadata->>'campaign' = ${quote(SCAREATHON_GIFT_CAMPAIGN)}
          )
    ), conversations AS (
        INSERT INTO public.inbox_conversations (conversation_type, created_by_user_id, subject, replies_enabled, metadata)
        SELECT 'admin_dm', NULL, ${quote(SUBJECT)}, FALSE,
               jsonb_build_object('source', 'scareathon_gift', 'campaign', ${quote(SCAREATHON_GIFT_CAMPAIGN)}, 'userId', picks.user_id)
        FROM picks
        RETURNING id, (metadata->>'userId')::uuid AS user_id
    ), participants AS (
        INSERT INTO public.inbox_participants (conversation_id, user_id, participant_role, read_at)
        SELECT id, user_id, 'member', NULL FROM conversations
    ), messages AS (
        INSERT INTO public.inbox_messages (conversation_id, sender_user_id, sender_type, body, metadata)
        -- (kind: gift is what has the inbox wrap it up, rather than show a plain reward)
        SELECT id, NULL, 'system', ${quote(BODY)}, jsonb_build_object('kind', 'gift', 'campaign', ${quote(SCAREATHON_GIFT_CAMPAIGN)})
        FROM conversations
        RETURNING id, conversation_id
    )
    INSERT INTO public.inbox_rewards (conversation_id, message_id, recipient_user_id, coin_amount, item_id, item_quantity, metadata, status)
    SELECT conversations.id, messages.id, conversations.user_id, NULL, picks.item_id, 1,
           jsonb_build_object('source', 'scareathon_gift', 'campaign', ${quote(SCAREATHON_GIFT_CAMPAIGN)}), 'pending'
    FROM conversations
    JOIN messages ON messages.conversation_id = conversations.id
    JOIN picks ON picks.user_id = conversations.user_id;
`;
