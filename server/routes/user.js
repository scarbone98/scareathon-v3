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
        equipGroup: row.equip_group || row.slot,
        layerOrder: row.layer_order,
        assetPath: getAvatarAssetUrl(row.asset_path),
        storageBucket: avatarSpriteBucket,
        storagePath: row.asset_path,
        isDefault: row.is_default,
        isStarter: row.is_starter,
    };
}

function isHiddenAvatarItem(row) {
    return row.item_key === 'default_accessory_none';
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

export async function getWalletPayload(userId, { limit = 25, includeTransactions = true } = {}) {
    await pool.query('SELECT public.ensure_user_wallet($1)', [userId]);

    const walletResult = await pool.query(`
        SELECT coin_balance, created_at, updated_at
        FROM user_wallets
        WHERE user_id = $1
    `, [userId]);

    const transactionRows = includeTransactions
        ? (await pool.query(`
            SELECT id, amount, balance_after, transaction_type, source_type, source_id,
                counterparty_user_id, metadata, created_at
            FROM currency_transactions
            WHERE user_id = $1
            ORDER BY created_at DESC, id DESC
            LIMIT $2
        `, [userId, limit])).rows
        : [];

    return {
        coinBalance: Number(walletResult.rows[0]?.coin_balance || 0),
        createdAt: walletResult.rows[0]?.created_at,
        updatedAt: walletResult.rows[0]?.updated_at,
        transactions: transactionRows.map(serializeCurrencyTransaction),
    };
}

async function getAvatarPayload(userId) {
    await pool.query('SELECT public.seed_user_avatar_defaults($1)', [userId]);

    const equippedResult = await pool.query(`
        SELECT ai.id, ua.item_instance_id, ai.item_key, ai.name, ai.slot,
            COALESCE(ai.equip_group, ai.slot) AS equip_group, ai.layer_order,
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
            COALESCE(ai.equip_group, ai.slot) AS equip_group,
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
        if (isHiddenAvatarItem(row)) continue;
        if (!inventory[row.slot]) inventory[row.slot] = [];
        inventory[row.slot].push(serializeAvatarItem(row));
    }

    return {
        slots: avatarSlots,
        equipped: equippedResult.rows
            .filter((row) => !isHiddenAvatarItem(row))
            .map(serializeAvatarItem),
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
            return {
                data: await getWalletPayload(userId, { limit }),
            };
        } catch (error) {
            fastify.log.error(error);
            return reply.code(500).send({ error: 'An error occurred while fetching the wallet' });
        }
    });

    fastify.put('/avatar/save', async (request, reply) => {
        const userId = request.user.sub;
        const itemInstanceIds = Array.isArray(request.body?.itemInstanceIds)
            ? request.body.itemInstanceIds
            : null;

        if (!itemInstanceIds) {
            return reply.code(400).send({ error: 'itemInstanceIds is required' });
        }

        const normalizedItemInstanceIds = [...new Set(itemInstanceIds.map((id) => Number(id)))]
            .filter((id) => Number.isInteger(id) && id > 0);

        if (normalizedItemInstanceIds.length !== itemInstanceIds.length) {
            return reply.code(400).send({ error: 'itemInstanceIds must contain unique positive ids' });
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const itemResult = normalizedItemInstanceIds.length > 0
                ? await client.query(`
                    SELECT
                        ai.id,
                        ai.slot,
                        COALESCE(ai.equip_group, ai.slot) AS equip_group,
                        uii.id AS item_instance_id
                    FROM user_item_instances uii
                    JOIN avatar_items ai ON ai.id = uii.item_id
                    WHERE uii.user_id = $1
                      AND uii.id = ANY($2::bigint[])
                      AND uii.status = 'owned'
                    ORDER BY ai.layer_order ASC, ai.id ASC, uii.id ASC
                `, [userId, normalizedItemInstanceIds])
                : { rows: [], rowCount: 0 };

            if (itemResult.rowCount !== normalizedItemInstanceIds.length) {
                await client.query('ROLLBACK');
                return reply.code(404).send({ error: 'One or more avatar items are not in your inventory' });
            }

            const seenEquipGroups = new Set();
            for (const item of itemResult.rows) {
                if (seenEquipGroups.has(item.equip_group)) {
                    await client.query('ROLLBACK');
                    return reply.code(400).send({ error: 'Only one item per equip group can be saved' });
                }
                seenEquipGroups.add(item.equip_group);
            }

            await client.query('DELETE FROM user_avatar WHERE user_id = $1', [userId]);

            for (const item of itemResult.rows) {
                await client.query(`
                    INSERT INTO user_avatar (
                        user_id,
                        slot,
                        equip_group,
                        item_id,
                        item_instance_id,
                        updated_at
                    )
                    VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
                `, [userId, item.slot, item.equip_group, item.id, item.item_instance_id]);
            }

            await client.query('COMMIT');

            return { data: await getAvatarPayload(userId) };
        } catch (error) {
            await client.query('ROLLBACK').catch(() => {});
            fastify.log.error(error);
            return reply.code(500).send({ error: 'An error occurred while saving the avatar' });
        } finally {
            client.release();
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
