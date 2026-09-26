import pool from '../db/mockDB.js';
import { avatarRules, serializeAvatarItemV2 } from '../utils/avatarV2.js';

const supabaseUrl = process.env.SUPABASE_URL || (process.env.SUPABASE_PROJECT_REF ? `https://${process.env.SUPABASE_PROJECT_REF}.supabase.co` : '');
const avatarSpriteBucket = process.env.AVATAR_SPRITE_BUCKET || 'avatar-sprites';
const allowedShopCategories = new Set(Object.keys(avatarRules.categories));
const allowedShopRarities = new Set(['common', 'uncommon', 'rare', 'epic', 'legendary']);
const maxShopPageSize = 20;

function getAvatarAssetUrl(assetPath) {
    if (!assetPath) return '';
    if (/^https?:\/\//.test(assetPath) || assetPath.startsWith('/')) return assetPath;
    if (!supabaseUrl) return assetPath;

    const baseUrl = supabaseUrl.replace(/\/$/, '');
    const normalizedPath = assetPath.replace(/^\/+/, '');
    return `${baseUrl}/storage/v1/object/public/${avatarSpriteBucket}/${normalizedPath}`;
}

function parsePositiveInteger(value) {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) return null;
    return parsed;
}

function serializeListing(row) {
    return {
        id: Number(row.id),
        itemInstanceId: Number(row.item_instance_id),
        itemId: row.item_id,
        sellerUserId: row.seller_user_id,
        sellerUsername: row.seller_username,
        buyerUserId: row.buyer_user_id,
        priceAmount: Number(row.price_amount),
        currencyCode: row.currency_code,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        soldAt: row.sold_at,
        canceledAt: row.canceled_at,
        item: {
            ...serializeAvatarItemV2({ ...row, id: row.item_id, name: row.item_name }),
            id: row.item_id,
            itemKey: row.item_key,
            name: row.item_name,
            slot: row.slot,
            equipGroup: row.equip_group || row.slot,
            layerOrder: row.layer_order,
            assetPath: getAvatarAssetUrl(row.asset_path),
            storageBucket: avatarSpriteBucket,
            storagePath: row.asset_path,
            isDefault: row.is_default,
            isStarter: row.is_starter,
            isTradeable: row.is_tradeable,
            isSellable: row.is_sellable,
            rarity: row.rarity,
            basePrice: row.base_price,
            releaseStatus: row.release_status,
            metadata: row.item_metadata,
        },
    };
}

function serializeShopItem(row) {
    return {
        ...serializeAvatarItemV2(row),
        id: row.id,
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
        isTradeable: row.is_tradeable,
        isSellable: row.is_sellable,
        rarity: row.rarity,
        basePrice: row.base_price,
        releaseStatus: row.release_status,
        supplyLimit: row.supply_limit,
        mintedCount: Number(row.minted_count || 0),
        ownedCount: Number(row.owned_count || 0),
        isSoldOut: row.supply_limit !== null && Number(row.minted_count || 0) >= Number(row.supply_limit),
        metadata: row.item_metadata,
    };
}

async function routes(fastify, options) {
    fastify.get('/shop/items', async (request, reply) => {
        const userId = request.user.sub;
        const category = typeof request.query?.category === 'string' && request.query.category.trim()
            ? request.query.category.trim()
            : null;
        const rarity = typeof request.query?.rarity === 'string' && request.query.rarity.trim()
            ? request.query.rarity.trim()
            : null;
        const search = typeof request.query?.search === 'string'
            ? request.query.search.trim().slice(0, 80)
            : '';
        const page = Math.max(parseInt(request.query?.page || '1', 10) || 1, 1);
        const requestedLimit = parseInt(request.query?.limit || String(maxShopPageSize), 10) || maxShopPageSize;
        const limit = Math.min(Math.max(requestedLimit, 1), maxShopPageSize);
        const offset = (page - 1) * limit;

        if (category && !allowedShopCategories.has(category)) {
            return reply.code(400).send({ error: 'Invalid shop category' });
        }
        if (rarity && !allowedShopRarities.has(rarity)) {
            return reply.code(400).send({ error: 'Invalid shop rarity' });
        }

        try {
            const filterValues = [];
            const countFilters = [];
            const itemFilters = [];
            if (category) {
                filterValues.push(category);
                countFilters.push(`ai.category = $${filterValues.length}`);
                itemFilters.push(`ai.category = $${filterValues.length + 1}`);
            }
            if (rarity) {
                filterValues.push(rarity);
                countFilters.push(`ai.rarity = $${filterValues.length}`);
                itemFilters.push(`ai.rarity = $${filterValues.length + 1}`);
            }
            if (search) {
                filterValues.push(`%${search}%`);
                countFilters.push(`(ai.name ILIKE $${filterValues.length} OR ai.item_key ILIKE $${filterValues.length})`);
                itemFilters.push(`(ai.name ILIKE $${filterValues.length + 1} OR ai.item_key ILIKE $${filterValues.length + 1})`);
            }
            const countWhereClause = `
                ai.art_version = 2
                AND ai.release_status = 'released'
                AND ai.base_price IS NOT NULL
                AND ai.base_price > 0
                AND ai.is_default = FALSE
                ${countFilters.map((filter) => `AND ${filter}`).join('\n                ')}
            `;
            const itemWhereClause = `
                ai.art_version = 2
                AND ai.release_status = 'released'
                AND ai.base_price IS NOT NULL
                AND ai.base_price > 0
                AND ai.is_default = FALSE
                ${itemFilters.map((filter) => `AND ${filter}`).join('\n                ')}
            `;

            const countResult = await pool.query(`
                SELECT COUNT(*)::INTEGER AS total
                FROM avatar_items ai
                WHERE ${countWhereClause}
            `, filterValues);
            const total = Number(countResult.rows[0]?.total || 0);

            const itemParams = [userId, ...filterValues, limit, offset];
            const result = await pool.query(`
                SELECT
                    ai.id,
                    ai.item_key,
                    ai.name,
                    ai.slot,
                    ai.equip_group,
                    ai.layer_order,
                    ai.asset_path,
                    ai.is_default,
                    ai.is_starter,
                    ai.is_tradeable,
                    ai.is_sellable,
                    ai.rarity,
                    ai.base_price,
                    ai.release_status,
                    ai.metadata AS item_metadata,
                    ai.category,
                    ai.parts,
                    ai.dyes,
                    ai.hides,
                    ai.occupies,
                    ai.stack_order,
                    CASE
                        WHEN ai.metadata->>'supplyLimit' ~ '^[0-9]+$'
                            THEN (ai.metadata->>'supplyLimit')::INTEGER
                        ELSE NULL
                    END AS supply_limit,
                    COALESCE(minted.count, 0)::INTEGER AS minted_count,
                    COALESCE(owned.count, 0)::INTEGER AS owned_count
                FROM avatar_items ai
                -- Copies in circulation only matter for supply-limited items, so skip the count otherwise
                LEFT JOIN LATERAL (
                    SELECT COUNT(*) AS count
                    FROM user_item_instances uii
                    WHERE uii.item_id = ai.id
                      AND ai.metadata->>'supplyLimit' ~ '^[0-9]+$'
                ) minted ON TRUE
                LEFT JOIN LATERAL (
                    SELECT COUNT(*) AS count
                    FROM user_item_instances uii
                    WHERE uii.item_id = ai.id
                      AND uii.user_id = $1
                      AND uii.status IN ('owned', 'listed', 'locked')
                ) owned ON TRUE
                WHERE ${itemWhereClause}
                ORDER BY ai.category ASC, ai.stack_order ASC, ai.name ASC, ai.id ASC
                LIMIT $${itemParams.length - 1}
                OFFSET $${itemParams.length}
            `, itemParams);

            return {
                data: result.rows.map(serializeShopItem),
                pagination: {
                    page,
                    limit,
                    total,
                    pageCount: Math.max(Math.ceil(total / limit), 1),
                },
            };
        } catch (error) {
            fastify.log.error(error);
            return reply.code(500).send({ error: 'An error occurred while fetching shop items' });
        }
    });

    fastify.post('/shop/items/:id/buy', async (request, reply) => {
        const userId = request.user.sub;
        const itemId = parsePositiveInteger(request.params?.id);

        if (!itemId) {
            return reply.code(400).send({ error: 'Valid item id is required' });
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Lock the item before counting copies: counts taken in the locking statement itself
            // come from before the lock wait, so two buyers could both take the last copy.
            const itemResult = await client.query(`
                SELECT
                    ai.id,
                    ai.item_key,
                    ai.name,
                    ai.slot,
                    ai.equip_group,
                    ai.layer_order,
                    ai.asset_path,
                    ai.is_default,
                    ai.is_starter,
                    ai.is_tradeable,
                    ai.is_sellable,
                    ai.rarity,
                    ai.base_price,
                    ai.release_status,
                    ai.metadata AS item_metadata,
                    ai.category,
                    ai.parts,
                    ai.dyes,
                    ai.hides,
                    ai.occupies,
                    ai.stack_order,
                    CASE
                        WHEN ai.metadata->>'supplyLimit' ~ '^[0-9]+$'
                            THEN (ai.metadata->>'supplyLimit')::INTEGER
                        ELSE NULL
                    END AS supply_limit
                FROM avatar_items ai
                WHERE ai.id = $1
                  AND ai.art_version = 2
                  AND ai.release_status = 'released'
                  AND ai.base_price IS NOT NULL
                  AND ai.base_price > 0
                  AND ai.is_default = FALSE
                FOR UPDATE OF ai
            `, [itemId]);

            if (itemResult.rowCount === 0) {
                await client.query('ROLLBACK');
                return reply.code(404).send({ error: 'Shop item not found' });
            }

            const countsResult = await client.query(`
                SELECT
                    COUNT(*)::INTEGER AS minted_count,
                    (COUNT(*) FILTER (
                        WHERE user_id = $2 AND status IN ('owned', 'listed', 'locked')
                    ))::INTEGER AS owned_count
                FROM user_item_instances
                WHERE item_id = $1
            `, [itemId, userId]);
            itemResult.rows[0] = { ...itemResult.rows[0], ...countsResult.rows[0] };

            const item = itemResult.rows[0];
            if (item.supply_limit !== null && Number(item.minted_count || 0) >= Number(item.supply_limit)) {
                await client.query('ROLLBACK');
                return reply.code(409).send({ error: 'Shop item is sold out' });
            }

            await client.query('SELECT public.ensure_user_wallet($1)', [userId]);

            const walletResult = await client.query(`
                SELECT coin_balance
                FROM user_wallets
                WHERE user_id = $1
                FOR UPDATE
            `, [userId]);
            const coinBalance = Number(walletResult.rows[0]?.coin_balance || 0);
            const priceAmount = Number(item.base_price);

            if (coinBalance < priceAmount) {
                await client.query('ROLLBACK');
                return reply.code(402).send({ error: 'Insufficient funds' });
            }

            const instanceResult = await client.query(`
                INSERT INTO user_item_instances (
                    user_id,
                    item_id,
                    status,
                    source_type,
                    metadata
                )
                VALUES ($1, $2, 'owned', 'shop_purchase', $3::jsonb)
                RETURNING id
            `, [
                userId,
                item.id,
                JSON.stringify({
                    itemId: item.id,
                    itemKey: item.item_key,
                    priceAmount,
                    currencyCode: 'coins',
                }),
            ]);
            const itemInstanceId = Number(instanceResult.rows[0].id);

            const updatedWalletResult = await client.query(`
                UPDATE user_wallets
                SET coin_balance = coin_balance - $2,
                    updated_at = now()
                WHERE user_id = $1
                RETURNING coin_balance
            `, [userId, priceAmount]);
            const balanceAfter = Number(updatedWalletResult.rows[0].coin_balance);

            await client.query(`
                INSERT INTO currency_transactions (
                    user_id,
                    amount,
                    balance_after,
                    transaction_type,
                    source_type,
                    source_id,
                    metadata
                )
                VALUES ($1, $2, $3, 'spend', 'shop_purchase', $4, $5::jsonb)
            `, [
                userId,
                -priceAmount,
                balanceAfter,
                String(itemInstanceId),
                JSON.stringify({
                    itemId: item.id,
                    itemKey: item.item_key,
                    priceAmount,
                    currencyCode: 'coins',
                }),
            ]);

            await client.query('COMMIT');

            return reply.code(201).send({
                data: {
                    item: serializeShopItem({
                        ...item,
                        owned_count: Number(item.owned_count || 0) + 1,
                        minted_count: Number(item.minted_count || 0) + 1,
                    }),
                    itemInstanceId,
                    coinBalance: balanceAfter,
                },
            });
        } catch (error) {
            await client.query('ROLLBACK').catch(() => {});
            fastify.log.error(error);
            return reply.code(500).send({ error: 'An error occurred while buying the shop item' });
        } finally {
            client.release();
        }
    });

    fastify.get('/listings', async (request, reply) => {
        const userId = request.user.sub;
        const status = request.query?.status || 'active';
        const mine = request.query?.mine === 'true';
        const limit = Math.min(Math.max(parseInt(request.query?.limit || '50', 10), 1), 100);
        const offset = Math.max(parseInt(request.query?.offset || '0', 10), 0);

        if (!['active', 'sold', 'canceled', 'expired'].includes(status)) {
            return reply.code(400).send({ error: 'Invalid listing status' });
        }

        try {
            const params = [status, limit, offset];
            let ownerFilter = '';
            if (mine) {
                params.push(userId);
                ownerFilter = `AND ml.seller_user_id = $${params.length}`;
            }

            const result = await pool.query(`
                SELECT
                    ml.id,
                    ml.item_instance_id,
                    ml.item_id,
                    ml.seller_user_id,
                    seller.username AS seller_username,
                    ml.buyer_user_id,
                    ml.price_amount,
                    ml.currency_code,
                    ml.status,
                    ml.created_at,
                    ml.updated_at,
                    ml.sold_at,
                    ml.canceled_at,
                    ai.item_key,
                    ai.name AS item_name,
                    ai.slot,
                    ai.equip_group,
                    ai.layer_order,
                    ai.asset_path,
                    ai.is_default,
                    ai.is_starter,
                    ai.is_tradeable,
                    ai.is_sellable,
                    ai.rarity,
                    ai.base_price,
                    ai.release_status,
                    ai.metadata AS item_metadata,
                    ai.category,
                    ai.parts,
                    ai.dyes,
                    ai.hides,
                    ai.occupies,
                    ai.stack_order
                FROM marketplace_listings ml
                JOIN avatar_items ai ON ai.id = ml.item_id
                JOIN users seller ON seller.id = ml.seller_user_id
                WHERE ml.status = $1
                    ${ownerFilter}
                ORDER BY ml.created_at DESC, ml.id DESC
                LIMIT $2 OFFSET $3
            `, params);

            return { data: result.rows.map(serializeListing) };
        } catch (error) {
            fastify.log.error(error);
            return reply.code(500).send({ error: 'An error occurred while fetching marketplace listings' });
        }
    });

    fastify.post('/listings', async (request, reply) => {
        const userId = request.user.sub;
        const itemInstanceId = parsePositiveInteger(request.body?.itemInstanceId);
        const priceAmount = parsePositiveInteger(request.body?.priceAmount);

        if (!itemInstanceId || !priceAmount) {
            return reply.code(400).send({ error: 'itemInstanceId and positive priceAmount are required' });
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const itemResult = await client.query(`
                SELECT
                    uii.id,
                    uii.user_id,
                    uii.item_id,
                    uii.status,
                    ai.is_tradeable,
                    ai.is_sellable
                FROM user_item_instances uii
                JOIN avatar_items ai ON ai.id = uii.item_id
                WHERE uii.id = $1
                FOR UPDATE
            `, [itemInstanceId]);

            if (itemResult.rowCount === 0) {
                await client.query('ROLLBACK');
                return reply.code(404).send({ error: 'Item instance not found' });
            }

            const item = itemResult.rows[0];
            if (item.user_id !== userId) {
                await client.query('ROLLBACK');
                return reply.code(403).send({ error: 'You do not own this item' });
            }

            if (item.status !== 'owned') {
                await client.query('ROLLBACK');
                return reply.code(409).send({ error: 'Item is not available to list' });
            }

            if (!item.is_tradeable || !item.is_sellable) {
                await client.query('ROLLBACK');
                return reply.code(400).send({ error: 'Item cannot be sold on the marketplace' });
            }

            const equippedResult = await client.query(`
                SELECT 1
                FROM user_outfit_items
                WHERE user_id = $1
                  AND item_instance_id = $2
                LIMIT 1
            `, [userId, itemInstanceId]);

            if (equippedResult.rowCount > 0) {
                await client.query('ROLLBACK');
                return reply.code(409).send({ error: 'Unequip this item before listing it' });
            }

            await client.query(`
                UPDATE user_item_instances
                SET status = 'listed', updated_at = now()
                WHERE id = $1
            `, [itemInstanceId]);

            const listingResult = await client.query(`
                INSERT INTO marketplace_listings (
                    item_instance_id,
                    item_id,
                    seller_user_id,
                    price_amount
                )
                VALUES ($1, $2, $3, $4)
                RETURNING id
            `, [itemInstanceId, item.item_id, userId, priceAmount]);

            await client.query('COMMIT');

            return reply.code(201).send({
                data: {
                    id: Number(listingResult.rows[0].id),
                    itemInstanceId,
                    itemId: item.item_id,
                    priceAmount,
                    status: 'active',
                },
            });
        } catch (error) {
            await client.query('ROLLBACK').catch(() => {});
            fastify.log.error(error);
            return reply.code(500).send({ error: 'An error occurred while creating the marketplace listing' });
        } finally {
            client.release();
        }
    });

    fastify.delete('/listings/:id', async (request, reply) => {
        const userId = request.user.sub;
        const listingId = parsePositiveInteger(request.params?.id);

        if (!listingId) {
            return reply.code(400).send({ error: 'Valid listing id is required' });
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const listingResult = await client.query(`
                SELECT id, item_instance_id, seller_user_id, status
                FROM marketplace_listings
                WHERE id = $1
                FOR UPDATE
            `, [listingId]);

            if (listingResult.rowCount === 0) {
                await client.query('ROLLBACK');
                return reply.code(404).send({ error: 'Listing not found' });
            }

            const listing = listingResult.rows[0];
            if (listing.seller_user_id !== userId) {
                await client.query('ROLLBACK');
                return reply.code(403).send({ error: 'You cannot cancel this listing' });
            }

            if (listing.status !== 'active') {
                await client.query('ROLLBACK');
                return reply.code(409).send({ error: 'Listing is not active' });
            }

            await client.query(`
                UPDATE marketplace_listings
                SET status = 'canceled',
                    canceled_at = now(),
                    updated_at = now()
                WHERE id = $1
            `, [listingId]);

            await client.query(`
                UPDATE user_item_instances
                SET status = 'owned',
                    updated_at = now()
                WHERE id = $1
                  AND user_id = $2
                  AND status = 'listed'
            `, [listing.item_instance_id, userId]);

            await client.query('COMMIT');

            return {
                data: {
                    id: listingId,
                    itemInstanceId: Number(listing.item_instance_id),
                    status: 'canceled',
                },
            };
        } catch (error) {
            await client.query('ROLLBACK').catch(() => {});
            fastify.log.error(error);
            return reply.code(500).send({ error: 'An error occurred while canceling the marketplace listing' });
        } finally {
            client.release();
        }
    });

    fastify.post('/listings/:id/buy', async (request, reply) => {
        const userId = request.user.sub;
        const listingId = parsePositiveInteger(request.params?.id);

        if (!listingId) {
            return reply.code(400).send({ error: 'Valid listing id is required' });
        }

        try {
            const result = await pool.query(`
                SELECT public.purchase_marketplace_listing($1, $2) AS purchase
            `, [userId, listingId]);

            return { data: result.rows[0].purchase };
        } catch (error) {
            fastify.log.error(error);

            if (/own listing/i.test(error.message)) {
                return reply.code(409).send({ error: error.message });
            }
            if (/insufficient funds/i.test(error.message)) {
                return reply.code(402).send({ error: error.message });
            }
            if (/not active|not available/i.test(error.message)) {
                return reply.code(409).send({ error: error.message });
            }

            return reply.code(500).send({ error: 'An error occurred while buying the marketplace listing' });
        }
    });
}

export default routes;
