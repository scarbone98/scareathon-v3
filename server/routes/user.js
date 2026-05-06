import pool from '../db/mockDB.js';
import {
    RegExpMatcher,
    TextCensor,
    englishDataset,
    englishRecommendedTransformers,
} from 'obscenity';

const profanityMatcher = new RegExpMatcher({
    ...englishDataset.build(),
    ...englishRecommendedTransformers,
});

const avatarSlots = [
    { slot: 'body', label: 'Body' },
    { slot: 'pants', label: 'Pants' },
    { slot: 'shirt', label: 'Shirt' },
    { slot: 'shoes', label: 'Shoes' },
    { slot: 'face', label: 'Face' },
    { slot: 'hair', label: 'Hair' },
    { slot: 'accessory', label: 'Accessory' },
];

const supabaseUrl = process.env.SUPABASE_URL || (process.env.SUPABASE_PROJECT_REF ? `https://${process.env.SUPABASE_PROJECT_REF}.supabase.co` : '');
const avatarSpriteBucket = process.env.AVATAR_SPRITE_BUCKET || 'avatar-sprites';

function getAvatarAssetUrl(assetPath) {
    if (!assetPath) return '';
    if (/^https?:\/\//.test(assetPath) || assetPath.startsWith('/')) return assetPath;
    if (!supabaseUrl) return assetPath;

    const baseUrl = supabaseUrl.replace(/\/$/, '');
    const normalizedPath = assetPath.replace(/^\/+/, '');
    return `${baseUrl}/storage/v1/object/public/${avatarSpriteBucket}/${normalizedPath}`;
}

function serializeAvatarItem(row) {
    return {
        id: row.id,
        itemInstanceId: Number(row.item_instance_id),
        itemKey: row.item_key,
        name: row.name,
        slot: row.slot,
        layerOrder: row.layer_order,
        assetPath: getAvatarAssetUrl(row.asset_path),
        storageBucket: avatarSpriteBucket,
        storagePath: row.asset_path,
        isDefault: row.is_default,
        isStarter: row.is_starter,
    };
}

function serializeCurrencyTransaction(row) {
    return {
        id: row.id,
        amount: Number(row.amount),
        balanceAfter: Number(row.balance_after),
        transactionType: row.transaction_type,
        sourceType: row.source_type,
        sourceId: row.source_id,
        counterpartyUserId: row.counterparty_user_id,
        metadata: row.metadata,
        createdAt: row.created_at,
    };
}

async function getAvatarPayload(userId) {
    await pool.query('SELECT public.seed_user_avatar_defaults($1)', [userId]);

    const equippedResult = await pool.query(`
        SELECT ai.id, ua.item_instance_id, ai.item_key, ai.name, ai.slot, ai.layer_order,
            ai.asset_path, ai.is_default, ai.is_starter
        FROM user_avatar ua
        JOIN avatar_items ai ON ai.id = ua.item_id
        WHERE ua.user_id = $1
        ORDER BY ai.layer_order ASC, ai.id ASC
    `, [userId]);

    const inventoryResult = await pool.query(`
        SELECT
            ai.id,
            uii.id AS item_instance_id,
            ai.item_key,
            ai.name,
            ai.slot,
            ai.layer_order,
            ai.asset_path,
            ai.is_default,
            ai.is_starter
        FROM user_item_instances uii
        JOIN avatar_items ai ON ai.id = uii.item_id
        WHERE uii.user_id = $1
          AND uii.status = 'owned'
        ORDER BY ai.slot ASC, ai.layer_order ASC, ai.name ASC, uii.id ASC
    `, [userId]);

    const inventory = avatarSlots.reduce((acc, { slot }) => {
        acc[slot] = [];
        return acc;
    }, {});

    for (const row of inventoryResult.rows) {
        if (!inventory[row.slot]) inventory[row.slot] = [];
        inventory[row.slot].push(serializeAvatarItem(row));
    }

    return {
        slots: avatarSlots,
        equipped: equippedResult.rows.map(serializeAvatarItem),
        inventory,
    };
}

export default async function (fastify, options) {

    fastify.get('/', async (request, reply) => {
        const userId = request.user.sub;
        try {
            const result = await pool.query(
                'SELECT * FROM users WHERE id = $1',
                [userId]
            );
            return { data: result.rows[0] };
        } catch (error) {
            fastify.log.error(error);
            return reply.code(500).send({ error: 'An error occurred while fetching the username' });
        }
    });

    fastify.get('/avatar', async (request, reply) => {
        const userId = request.user.sub;
        try {
            return { data: await getAvatarPayload(userId) };
        } catch (error) {
            fastify.log.error(error);
            return reply.code(500).send({ error: 'An error occurred while fetching the avatar' });
        }
    });

    fastify.get('/wallet', async (request, reply) => {
        const userId = request.user.sub;
        const limit = Math.min(Math.max(parseInt(request.query?.limit || '25', 10), 1), 100);

        try {
            await pool.query('SELECT public.ensure_user_wallet($1)', [userId]);

            const walletResult = await pool.query(`
                SELECT coin_balance, created_at, updated_at
                FROM user_wallets
                WHERE user_id = $1
            `, [userId]);

            const transactionResult = await pool.query(`
                SELECT id, amount, balance_after, transaction_type, source_type, source_id,
                    counterparty_user_id, metadata, created_at
                FROM currency_transactions
                WHERE user_id = $1
                ORDER BY created_at DESC, id DESC
                LIMIT $2
            `, [userId, limit]);

            return {
                data: {
                    coinBalance: Number(walletResult.rows[0]?.coin_balance || 0),
                    createdAt: walletResult.rows[0]?.created_at,
                    updatedAt: walletResult.rows[0]?.updated_at,
                    transactions: transactionResult.rows.map(serializeCurrencyTransaction),
                },
            };
        } catch (error) {
            fastify.log.error(error);
            return reply.code(500).send({ error: 'An error occurred while fetching the wallet' });
        }
    });

    fastify.put('/avatar/equip', async (request, reply) => {
        const userId = request.user.sub;
        const { slot, itemInstanceId } = request.body || {};

        if (!slot || !itemInstanceId) {
            return reply.code(400).send({ error: 'Slot and itemInstanceId are required' });
        }

        if (!avatarSlots.some((avatarSlot) => avatarSlot.slot === slot)) {
            return reply.code(400).send({ error: 'Invalid avatar slot' });
        }

        try {
            const itemResult = await pool.query(`
                SELECT ai.id, ai.slot, uii.id AS item_instance_id
                FROM avatar_items ai
                JOIN user_item_instances uii ON uii.item_id = ai.id
                WHERE uii.user_id = $1
                  AND uii.id = $2
                  AND uii.status = 'owned'
                LIMIT 1
            `, [userId, itemInstanceId]);

            if (itemResult.rowCount === 0) {
                return reply.code(404).send({ error: 'Avatar item is not in your inventory' });
            }

            const item = itemResult.rows[0];
            if (item.slot !== slot) {
                return reply.code(400).send({ error: 'Avatar item does not belong to that slot' });
            }

            await pool.query(`
                INSERT INTO user_avatar (user_id, slot, item_id, item_instance_id, updated_at)
                VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
                ON CONFLICT (user_id, slot)
                DO UPDATE SET
                    item_id = EXCLUDED.item_id,
                    item_instance_id = EXCLUDED.item_instance_id,
                    updated_at = CURRENT_TIMESTAMP
            `, [userId, slot, item.id, item.item_instance_id]);

            return { data: await getAvatarPayload(userId) };
        } catch (error) {
            fastify.log.error(error);
            return reply.code(500).send({ error: 'An error occurred while updating the avatar' });
        }
    });

    fastify.post('/avatar/reset', async (request, reply) => {
        const userId = request.user.sub;
        try {
            await pool.query('SELECT public.seed_user_avatar_defaults($1)', [userId]);
            await pool.query(`
                INSERT INTO user_avatar (user_id, slot, item_id, item_instance_id, updated_at)
                SELECT DISTINCT ON (avatar_items.slot)
                    $1,
                    avatar_items.slot,
                    avatar_items.id,
                    (
                        SELECT uii.id
                        FROM user_item_instances uii
                        WHERE uii.user_id = $1
                          AND uii.item_id = avatar_items.id
                          AND uii.status = 'owned'
                        ORDER BY uii.id ASC
                        LIMIT 1
                    ),
                    CURRENT_TIMESTAMP
                FROM avatar_items
                WHERE is_default = TRUE
                ORDER BY avatar_items.slot, avatar_items.layer_order, avatar_items.id
                ON CONFLICT (user_id, slot)
                DO UPDATE SET
                    item_id = EXCLUDED.item_id,
                    item_instance_id = EXCLUDED.item_instance_id,
                    updated_at = CURRENT_TIMESTAMP
            `, [userId]);

            return { data: await getAvatarPayload(userId) };
        } catch (error) {
            fastify.log.error(error);
            return reply.code(500).send({ error: 'An error occurred while resetting the avatar' });
        }
    });

    fastify.put('/updateUsername', async (request, reply) => {
        const userId = request.user.sub;
        const { newUsername } = request.body;

        if (profanityMatcher.hasMatch(newUsername)) {
            return reply.code(400).send({ error: 'Username contains inappropriate language' });
        }

        if (!userId || !newUsername) {
            return reply.code(400).send({ error: 'User ID and new username are required' });
        }

        // Add username validation
        if (!/^[a-zA-Z0-9_]{1,32}$/.test(newUsername)) {
            return reply.code(400).send({ error: 'Username must be 1-32 characters long and contain only letters, numbers, and underscores' });
        }

        try {
            const result = await pool.query(
                'UPDATE users SET username = $1 WHERE id = $2 RETURNING id, username',
                [newUsername, userId]
            );

            if (result.rowCount === 0) {
                return reply.code(404).send({ error: 'User not found' });
            }

            return { data: result.rows[0] };
        } catch (error) {
            fastify.log.error(error);
            if (error.code === '23505') {
                return reply.code(409).send({ error: 'Username is already taken' });
            }
            return reply.code(500).send({ error: 'An error occurred while updating the username' });
        }
    });
}
