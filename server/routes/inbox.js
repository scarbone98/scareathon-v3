import pool from '../db/mockDB.js';

const MAX_BODY_LENGTH = 4000;
const MAX_SUBJECT_LENGTH = 120;
const MAX_BATCH_RECIPIENTS = 50;
const MAX_ITEM_QUANTITY = 50;

export function parseAllowlist(value, { lowercase = false } = {}) {
    if (!value || typeof value !== 'string') return new Set();

    return new Set(
        value
            .split(',')
            .map((entry) => entry.trim())
            .filter(Boolean)
            .map((entry) => (lowercase ? entry.toLowerCase() : entry))
    );
}

export function isAdminUser(user, env = process.env) {
    if (!user) return false;

    const adminUserIds = parseAllowlist(env.ADMIN_USER_IDS);
    const adminEmails = parseAllowlist(env.ADMIN_EMAILS, { lowercase: true });
    const userEmail = typeof user.email === 'string' ? user.email.toLowerCase() : '';

    return adminUserIds.has(user.sub) || (userEmail && adminEmails.has(userEmail));
}

export function normalizeUsernameList(usernames) {
    if (!Array.isArray(usernames)) return [];

    const seen = new Set();
    const normalized = [];

    for (const username of usernames) {
        if (typeof username !== 'string') continue;
        const trimmed = username.trim();
        if (!trimmed) continue;

        const key = trimmed.toLowerCase();
        if (seen.has(key)) continue;

        seen.add(key);
        normalized.push(trimmed);
    }

    return normalized;
}

export function normalizeMessageBody(body) {
    if (typeof body !== 'string') return null;

    const trimmed = body.trim();
    if (!trimmed || trimmed.length > MAX_BODY_LENGTH) return null;

    return trimmed;
}

export function normalizeSubject(subject) {
    if (subject === undefined || subject === null) return null;
    if (typeof subject !== 'string') return null;

    const trimmed = subject.trim();
    if (!trimmed) return null;
    if (trimmed.length > MAX_SUBJECT_LENGTH) return null;

    return trimmed;
}

function parsePositiveInteger(value) {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) return null;
    return parsed;
}

export function normalizeRewardPayload(reward) {
    if (reward === undefined || reward === null) {
        return { reward: null, error: null };
    }

    if (typeof reward !== 'object' || Array.isArray(reward)) {
        return { reward: null, error: 'reward must be an object' };
    }

    const coinAmount = reward.coinAmount === undefined || reward.coinAmount === null
        ? null
        : parsePositiveInteger(reward.coinAmount);
    if (reward.coinAmount !== undefined && reward.coinAmount !== null && !coinAmount) {
        return { reward: null, error: 'reward.coinAmount must be a positive integer' };
    }

    const itemId = reward.itemId === undefined || reward.itemId === null
        ? null
        : parsePositiveInteger(reward.itemId);
    if (reward.itemId !== undefined && reward.itemId !== null && !itemId) {
        return { reward: null, error: 'reward.itemId must be a positive integer' };
    }

    if (!itemId && reward.itemQuantity !== undefined && reward.itemQuantity !== null) {
        return { reward: null, error: 'reward.itemQuantity requires reward.itemId' };
    }

    const itemQuantity = itemId
        ? parsePositiveInteger(reward.itemQuantity ?? 1)
        : null;
    if (itemId && (!itemQuantity || itemQuantity > MAX_ITEM_QUANTITY)) {
        return { reward: null, error: `reward.itemQuantity must be between 1 and ${MAX_ITEM_QUANTITY}` };
    }

    if (!coinAmount && !itemId) {
        return { reward: null, error: 'reward must include coinAmount or itemId' };
    }

    return {
        reward: {
            coinAmount,
            itemId,
            itemQuantity,
        },
        error: null,
    };
}

function serializeReward(row) {
    if (!row) return null;

    return {
        id: Number(row.id),
        conversationId: Number(row.conversation_id),
        messageId: Number(row.message_id),
        recipientUserId: row.recipient_user_id,
        coinAmount: row.coin_amount === null ? null : Number(row.coin_amount),
        itemId: row.item_id,
        itemQuantity: row.item_quantity,
        status: row.status,
        grantedItemInstanceIds: (row.granted_item_instance_ids || []).map(Number),
        claimedAt: row.claimed_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

function serializeMessage(row) {
    return {
        id: Number(row.id),
        conversationId: Number(row.conversation_id),
        senderUserId: row.sender_user_id,
        senderUsername: row.sender_username,
        senderType: row.sender_type,
        body: row.body,
        metadata: row.metadata || {},
        createdAt: row.created_at,
        reward: serializeReward(row.reward),
    };
}

function serializeConversation(row) {
    return {
        id: Number(row.id),
        conversationType: row.conversation_type,
        createdByUserId: row.created_by_user_id,
        subject: row.subject,
        repliesEnabled: row.replies_enabled,
        metadata: row.metadata || {},
        readAt: row.read_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        unreadCount: Number(row.unread_count || 0),
        participants: row.participants || [],
        latestMessage: row.latest_message_id ? {
            id: Number(row.latest_message_id),
            senderUserId: row.latest_sender_user_id,
            senderUsername: row.latest_sender_username,
            senderType: row.latest_sender_type,
            body: row.latest_body,
            createdAt: row.latest_created_at,
        } : null,
        pendingReward: serializeReward(row.pending_reward),
    };
}

function ensureAdmin(request, reply) {
    if (!isAdminUser(request.user)) {
        reply.code(403).send({ error: 'Admin access required' });
        return false;
    }

    return true;
}

async function getVisibleConversation(client, conversationId, userId) {
    const result = await client.query(`
        SELECT c.id, c.replies_enabled
        FROM inbox_conversations c
        JOIN inbox_participants p ON p.conversation_id = c.id
        WHERE c.id = $1
          AND p.user_id = $2
          AND p.deleted_at IS NULL
        LIMIT 1
    `, [conversationId, userId]);

    return result.rows[0] || null;
}

async function createConversationWithMessage(client, {
    conversationType,
    createdByUserId,
    subject,
    repliesEnabled,
    participants,
    senderUserId,
    senderType,
    body,
    metadata = {},
    reward = null,
    rewardRecipientUserId = null,
}) {
    const conversationResult = await client.query(`
        INSERT INTO inbox_conversations (
            conversation_type,
            created_by_user_id,
            subject,
            replies_enabled,
            metadata
        )
        VALUES ($1, $2, $3, $4, $5::jsonb)
        RETURNING id
    `, [
        conversationType,
        createdByUserId,
        subject,
        repliesEnabled,
        JSON.stringify(metadata),
    ]);
    const conversationId = conversationResult.rows[0].id;

    for (const participant of participants) {
        await client.query(`
            INSERT INTO inbox_participants (
                conversation_id,
                user_id,
                participant_role,
                read_at
            )
            VALUES ($1, $2, $3, $4)
        `, [
            conversationId,
            participant.userId,
            participant.role || 'member',
            participant.readAt || null,
        ]);
    }

    const messageResult = await client.query(`
        INSERT INTO inbox_messages (
            conversation_id,
            sender_user_id,
            sender_type,
            body,
            metadata
        )
        VALUES ($1, $2, $3, $4, $5::jsonb)
        RETURNING id
    `, [
        conversationId,
        senderUserId,
        senderType,
        body,
        JSON.stringify(metadata?.message || {}),
    ]);
    const messageId = messageResult.rows[0].id;

    if (reward) {
        await client.query(`
            INSERT INTO inbox_rewards (
                conversation_id,
                message_id,
                recipient_user_id,
                coin_amount,
                item_id,
                item_quantity,
                metadata
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
        `, [
            conversationId,
            messageId,
            rewardRecipientUserId,
            reward.coinAmount,
            reward.itemId,
            reward.itemQuantity,
            JSON.stringify(metadata?.reward || {}),
        ]);
    }

    await client.query(`
        UPDATE inbox_conversations
        SET updated_at = now()
        WHERE id = $1
    `, [conversationId]);

    return { conversationId: Number(conversationId), messageId: Number(messageId) };
}

async function routes(fastify, options) {
    fastify.get('/conversations', async (request, reply) => {
        const userId = request.user.sub;
        const limit = Math.min(Math.max(parseInt(request.query?.limit || '25', 10), 1), 100);
        const offset = Math.max(parseInt(request.query?.offset || '0', 10), 0);

        try {
            const result = await pool.query(`
                SELECT
                    c.id,
                    c.conversation_type,
                    c.created_by_user_id,
                    c.subject,
                    c.replies_enabled,
                    c.metadata,
                    c.created_at,
                    c.updated_at,
                    p.read_at,
                    latest.id AS latest_message_id,
                    latest.sender_user_id AS latest_sender_user_id,
                    latest_sender.username AS latest_sender_username,
                    latest.sender_type AS latest_sender_type,
                    latest.body AS latest_body,
                    latest.created_at AS latest_created_at,
                    unread.unread_count,
                    participants.participants,
                    pending_reward.reward AS pending_reward
                FROM inbox_participants p
                JOIN inbox_conversations c ON c.id = p.conversation_id
                LEFT JOIN LATERAL (
                    SELECT id, sender_user_id, sender_type, body, created_at
                    FROM inbox_messages
                    WHERE conversation_id = c.id
                    ORDER BY created_at DESC, id DESC
                    LIMIT 1
                ) latest ON TRUE
                LEFT JOIN users latest_sender ON latest_sender.id = latest.sender_user_id
                LEFT JOIN LATERAL (
                    SELECT COUNT(*)::INTEGER AS unread_count
                    FROM inbox_messages m
                    WHERE m.conversation_id = c.id
                      AND (p.read_at IS NULL OR m.created_at > p.read_at)
                      AND m.sender_user_id IS DISTINCT FROM $1
                ) unread ON TRUE
                LEFT JOIN LATERAL (
                    SELECT COALESCE(json_agg(json_build_object(
                        'userId', participant_users.id,
                        'username', participant_users.username,
                        'role', participant_rows.participant_role
                    ) ORDER BY participant_users.username), '[]'::json) AS participants
                    FROM inbox_participants participant_rows
                    JOIN users participant_users ON participant_users.id = participant_rows.user_id
                    WHERE participant_rows.conversation_id = c.id
                      AND participant_rows.deleted_at IS NULL
                ) participants ON TRUE
                LEFT JOIN LATERAL (
                    SELECT to_jsonb(reward_rows.*) AS reward
                    FROM inbox_rewards reward_rows
                    WHERE reward_rows.conversation_id = c.id
                      AND reward_rows.recipient_user_id = $1
                      AND reward_rows.status = 'pending'
                    ORDER BY reward_rows.created_at DESC, reward_rows.id DESC
                    LIMIT 1
                ) pending_reward ON TRUE
                WHERE p.user_id = $1
                  AND p.deleted_at IS NULL
                ORDER BY c.updated_at DESC, c.id DESC
                LIMIT $2 OFFSET $3
            `, [userId, limit, offset]);

            return { data: result.rows.map(serializeConversation) };
        } catch (error) {
            fastify.log.error(error);
            return reply.code(500).send({ error: 'An error occurred while fetching inbox conversations' });
        }
    });

    fastify.get('/conversations/:id/messages', async (request, reply) => {
        const userId = request.user.sub;
        const conversationId = parsePositiveInteger(request.params?.id);
        const limit = Math.min(Math.max(parseInt(request.query?.limit || '50', 10), 1), 100);
        const beforeMessageId = request.query?.beforeMessageId
            ? parsePositiveInteger(request.query.beforeMessageId)
            : null;

        if (!conversationId || (request.query?.beforeMessageId && !beforeMessageId)) {
            return reply.code(400).send({ error: 'Valid conversation id and beforeMessageId are required' });
        }

        try {
            const conversation = await getVisibleConversation(pool, conversationId, userId);
            if (!conversation) {
                return reply.code(404).send({ error: 'Conversation not found' });
            }

            const adminCanViewRewards = isAdminUser(request.user);
            const result = await pool.query(`
                SELECT
                    m.id,
                    m.conversation_id,
                    m.sender_user_id,
                    sender.username AS sender_username,
                    m.sender_type,
                    m.body,
                    m.metadata,
                    m.created_at,
                    reward.reward
                FROM inbox_messages m
                LEFT JOIN users sender ON sender.id = m.sender_user_id
                LEFT JOIN LATERAL (
                    SELECT to_jsonb(r.*) AS reward
                    FROM inbox_rewards r
                    WHERE r.message_id = m.id
                      AND (r.recipient_user_id = $2 OR $3::BOOLEAN = TRUE)
                    LIMIT 1
                ) reward ON TRUE
                WHERE m.conversation_id = $1
                  AND ($4::BIGINT IS NULL OR m.id < $4)
                ORDER BY m.id DESC
                LIMIT $5
            `, [conversationId, userId, adminCanViewRewards, beforeMessageId, limit]);

            return { data: result.rows.reverse().map(serializeMessage) };
        } catch (error) {
            fastify.log.error(error);
            return reply.code(500).send({ error: 'An error occurred while fetching inbox messages' });
        }
    });

    fastify.post('/conversations', async (request, reply) => {
        const userId = request.user.sub;
        const recipientUsername = typeof request.body?.recipientUsername === 'string'
            ? request.body.recipientUsername.trim()
            : '';
        const subject = normalizeSubject(request.body?.subject);
        const body = normalizeMessageBody(request.body?.body);

        if (!recipientUsername) {
            return reply.code(400).send({ error: 'recipientUsername is required' });
        }
        if (!body) {
            return reply.code(400).send({ error: `body is required and must be ${MAX_BODY_LENGTH} characters or fewer` });
        }
        if (request.body?.subject !== undefined && request.body?.subject !== null && !subject) {
            return reply.code(400).send({ error: `subject must be ${MAX_SUBJECT_LENGTH} characters or fewer` });
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const recipientResult = await client.query(`
                SELECT id, username
                FROM users
                WHERE username = $1
                LIMIT 1
            `, [recipientUsername]);

            if (recipientResult.rowCount === 0) {
                await client.query('ROLLBACK');
                return reply.code(404).send({ error: 'Recipient not found' });
            }

            const recipient = recipientResult.rows[0];
            if (recipient.id === userId) {
                await client.query('ROLLBACK');
                return reply.code(400).send({ error: 'You cannot message yourself' });
            }

            const created = await createConversationWithMessage(client, {
                conversationType: 'user_dm',
                createdByUserId: userId,
                subject,
                repliesEnabled: true,
                participants: [
                    { userId, role: 'member', readAt: new Date() },
                    { userId: recipient.id, role: 'member', readAt: null },
                ],
                senderUserId: userId,
                senderType: 'user',
                body,
            });

            await client.query('COMMIT');

            return reply.code(201).send({ data: created });
        } catch (error) {
            await client.query('ROLLBACK').catch(() => {});
            fastify.log.error(error);
            return reply.code(500).send({ error: 'An error occurred while creating the inbox conversation' });
        } finally {
            client.release();
        }
    });

    fastify.post('/conversations/:id/messages', async (request, reply) => {
        const userId = request.user.sub;
        const conversationId = parsePositiveInteger(request.params?.id);
        const body = normalizeMessageBody(request.body?.body);

        if (!conversationId) {
            return reply.code(400).send({ error: 'Valid conversation id is required' });
        }
        if (!body) {
            return reply.code(400).send({ error: `body is required and must be ${MAX_BODY_LENGTH} characters or fewer` });
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const conversation = await getVisibleConversation(client, conversationId, userId);
            if (!conversation) {
                await client.query('ROLLBACK');
                return reply.code(404).send({ error: 'Conversation not found' });
            }
            if (!conversation.replies_enabled) {
                await client.query('ROLLBACK');
                return reply.code(403).send({ error: 'Replies are disabled for this conversation' });
            }

            const messageResult = await client.query(`
                INSERT INTO inbox_messages (
                    conversation_id,
                    sender_user_id,
                    sender_type,
                    body
                )
                VALUES ($1, $2, $3, $4)
                RETURNING id, conversation_id, sender_user_id, sender_type, body, metadata, created_at
            `, [
                conversationId,
                userId,
                isAdminUser(request.user) ? 'admin' : 'user',
                body,
            ]);

            await client.query(`
                UPDATE inbox_conversations
                SET updated_at = now()
                WHERE id = $1
            `, [conversationId]);

            await client.query(`
                UPDATE inbox_participants
                SET read_at = now()
                WHERE conversation_id = $1
                  AND user_id = $2
            `, [conversationId, userId]);

            await client.query('COMMIT');

            return reply.code(201).send({ data: serializeMessage(messageResult.rows[0]) });
        } catch (error) {
            await client.query('ROLLBACK').catch(() => {});
            fastify.log.error(error);
            return reply.code(500).send({ error: 'An error occurred while replying to the conversation' });
        } finally {
            client.release();
        }
    });

    fastify.post('/conversations/:id/read', async (request, reply) => {
        const userId = request.user.sub;
        const conversationId = parsePositiveInteger(request.params?.id);

        if (!conversationId) {
            return reply.code(400).send({ error: 'Valid conversation id is required' });
        }

        try {
            const result = await pool.query(`
                UPDATE inbox_participants
                SET read_at = now()
                WHERE conversation_id = $1
                  AND user_id = $2
                  AND deleted_at IS NULL
                RETURNING conversation_id, read_at
            `, [conversationId, userId]);

            if (result.rowCount === 0) {
                return reply.code(404).send({ error: 'Conversation not found' });
            }

            return {
                data: {
                    conversationId,
                    readAt: result.rows[0].read_at,
                },
            };
        } catch (error) {
            fastify.log.error(error);
            return reply.code(500).send({ error: 'An error occurred while marking the conversation read' });
        }
    });

    fastify.post('/admin/conversations', async (request, reply) => {
        if (!ensureAdmin(request, reply)) return;

        const adminUserId = request.user.sub;
        const recipientUsernames = normalizeUsernameList(request.body?.recipientUsernames);
        const subject = normalizeSubject(request.body?.subject);
        const body = normalizeMessageBody(request.body?.body);
        const repliesEnabled = request.body?.repliesEnabled === undefined
            ? false
            : request.body.repliesEnabled === true;
        const { reward, error: rewardError } = normalizeRewardPayload(request.body?.reward);

        if (recipientUsernames.length === 0) {
            return reply.code(400).send({ error: 'recipientUsernames must include at least one username' });
        }
        if (recipientUsernames.length > MAX_BATCH_RECIPIENTS) {
            return reply.code(400).send({ error: `recipientUsernames is limited to ${MAX_BATCH_RECIPIENTS} users` });
        }
        if (!body) {
            return reply.code(400).send({ error: `body is required and must be ${MAX_BODY_LENGTH} characters or fewer` });
        }
        if (request.body?.subject !== undefined && request.body?.subject !== null && !subject) {
            return reply.code(400).send({ error: `subject must be ${MAX_SUBJECT_LENGTH} characters or fewer` });
        }
        if (rewardError) {
            return reply.code(400).send({ error: rewardError });
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            if (reward?.itemId) {
                const itemResult = await client.query('SELECT id FROM avatar_items WHERE id = $1 LIMIT 1', [reward.itemId]);
                if (itemResult.rowCount === 0) {
                    await client.query('ROLLBACK');
                    return reply.code(404).send({ error: 'Reward item not found' });
                }
            }

            const recipientsResult = await client.query(`
                SELECT id, username
                FROM users
                WHERE username = ANY($1::TEXT[])
            `, [recipientUsernames]);

            const recipientsByUsername = new Map(recipientsResult.rows.map((row) => [row.username, row]));
            const missingUsernames = recipientUsernames.filter((username) => !recipientsByUsername.has(username));
            if (missingUsernames.length > 0) {
                await client.query('ROLLBACK');
                return reply.code(404).send({ error: 'One or more recipients were not found', missingUsernames });
            }

            if (recipientsResult.rows.some((recipient) => recipient.id === adminUserId)) {
                await client.query('ROLLBACK');
                return reply.code(400).send({ error: 'Admin reward messages cannot be sent to yourself' });
            }

            const created = [];
            for (const username of recipientUsernames) {
                const recipient = recipientsByUsername.get(username);
                const createdConversation = await createConversationWithMessage(client, {
                    conversationType: 'admin_dm',
                    createdByUserId: adminUserId,
                    subject,
                    repliesEnabled,
                    participants: [
                        { userId: adminUserId, role: 'admin', readAt: new Date() },
                        { userId: recipient.id, role: 'member', readAt: null },
                    ],
                    senderUserId: adminUserId,
                    senderType: 'admin',
                    body,
                    metadata: request.body?.metadata || {},
                    reward,
                    rewardRecipientUserId: recipient.id,
                });

                created.push({
                    ...createdConversation,
                    recipientUserId: recipient.id,
                    recipientUsername: recipient.username,
                });
            }

            await client.query('COMMIT');

            return reply.code(201).send({ data: created });
        } catch (error) {
            await client.query('ROLLBACK').catch(() => {});
            fastify.log.error(error);
            return reply.code(500).send({ error: 'An error occurred while creating admin inbox conversations' });
        } finally {
            client.release();
        }
    });

    fastify.post('/rewards/:id/claim', async (request, reply) => {
        const userId = request.user.sub;
        const rewardId = parsePositiveInteger(request.params?.id);

        if (!rewardId) {
            return reply.code(400).send({ error: 'Valid reward id is required' });
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const rewardResult = await client.query(`
                SELECT *
                FROM inbox_rewards
                WHERE id = $1
                FOR UPDATE
            `, [rewardId]);

            if (rewardResult.rowCount === 0) {
                await client.query('ROLLBACK');
                return reply.code(404).send({ error: 'Reward not found' });
            }

            const reward = rewardResult.rows[0];
            if (reward.recipient_user_id !== userId) {
                await client.query('ROLLBACK');
                return reply.code(403).send({ error: 'You cannot claim this reward' });
            }

            if (reward.status !== 'pending') {
                await client.query('ROLLBACK');
                return reply.code(409).send({ error: 'Reward has already been claimed or is no longer available' });
            }

            let coinBalance = null;
            const rewardSourceId = String(reward.id);
            if (reward.coin_amount) {
                const walletResult = await client.query(`
                    SELECT public.grant_currency($1, $2, $3, $4, $5::jsonb) AS coin_balance
                `, [
                    userId,
                    reward.coin_amount,
                    'inbox_reward',
                    rewardSourceId,
                    JSON.stringify({
                        rewardId: Number(reward.id),
                        conversationId: Number(reward.conversation_id),
                        messageId: Number(reward.message_id),
                    }),
                ]);
                coinBalance = Number(walletResult.rows[0].coin_balance);
            }

            const grantedItemInstanceIds = [];
            if (reward.item_id && reward.item_quantity) {
                for (let index = 0; index < reward.item_quantity; index += 1) {
                    const itemResult = await client.query(`
                        SELECT public.grant_item_instance($1, $2, $3, $4, $5::jsonb) AS item_instance_id
                    `, [
                        userId,
                        reward.item_id,
                        'inbox_reward',
                        rewardSourceId,
                        JSON.stringify({
                            rewardId: Number(reward.id),
                            conversationId: Number(reward.conversation_id),
                            messageId: Number(reward.message_id),
                        }),
                    ]);
                    grantedItemInstanceIds.push(Number(itemResult.rows[0].item_instance_id));
                }
            }

            const updateResult = await client.query(`
                UPDATE inbox_rewards
                SET status = 'claimed',
                    granted_item_instance_ids = $2::BIGINT[],
                    claimed_at = now(),
                    updated_at = now()
                WHERE id = $1
                RETURNING *
            `, [rewardId, grantedItemInstanceIds]);

            await client.query('COMMIT');

            return {
                data: {
                    reward: serializeReward(updateResult.rows[0]),
                    coinBalance,
                },
            };
        } catch (error) {
            await client.query('ROLLBACK').catch(() => {});
            fastify.log.error(error);
            return reply.code(500).send({ error: 'An error occurred while claiming the reward' });
        } finally {
            client.release();
        }
    });
}

export default routes;
