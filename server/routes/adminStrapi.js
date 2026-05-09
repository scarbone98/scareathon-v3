import pool from '../db/mockDB.js';

const avatarSpriteBucket = process.env.AVATAR_SPRITE_BUCKET || 'avatar-sprites';
const allowedSlots = new Set(['body', 'pants', 'shirt', 'shoes', 'face', 'hair', 'accessory']);
const allowedRarities = new Set(['common', 'uncommon', 'rare', 'epic', 'legendary']);
const allowedReleaseStatuses = new Set(['draft', 'released', 'retired']);
const requiredSpriteSize = 256;
const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function getRequiredEnv(name) {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Missing ${name}`);
    }
    return value;
}

function getHeader(request, name) {
    const value = request.headers[name.toLowerCase()];
    return Array.isArray(value) ? value[0] : value;
}

function verifySyncSecret(request, reply) {
    const expected = process.env.STRAPI_SYNC_SECRET || process.env.SCAREATHON_STRAPI_SYNC_SECRET;
    if (!expected) {
        reply.code(503).send({ error: 'Strapi sync is not configured' });
        return false;
    }

    const actual = getHeader(request, 'x-strapi-sync-secret');
    if (!actual || actual !== expected) {
        reply.code(401).send({ error: 'Unauthorized' });
        return false;
    }

    return true;
}

function buildStrapiUrl(path) {
    const baseUrl = getRequiredEnv('STRAPI_URL').replace(/\/$/, '');
    return `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
}

function getAbsoluteStrapiAssetUrl(asset) {
    if (!asset?.url) return '';
    if (/^https?:\/\//.test(asset.url)) return asset.url;
    return buildStrapiUrl(asset.url);
}

function normalizeItemKey(value) {
    if (typeof value !== 'string') return null;
    const normalized = value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '_');
    return normalized || null;
}

function parseNonnegativeInteger(value) {
    if (value === undefined || value === null || value === '') return null;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 0) return null;
    return parsed;
}

function parsePositiveInteger(value) {
    if (value === undefined || value === null || value === '') return null;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) return null;
    return parsed;
}

function normalizeStrapiItem(item) {
    const itemKey = normalizeItemKey(item?.itemKey);
    const name = typeof item?.name === 'string' ? item.name.trim() : '';
    const slot = typeof item?.slot === 'string' ? item.slot : '';
    const layerOrder = Number(item?.layerOrder);
    const rarity = typeof item?.rarity === 'string' ? item.rarity : 'common';
    const releaseStatus = typeof item?.releaseStatus === 'string' ? item.releaseStatus : 'draft';
    const basePrice = parseNonnegativeInteger(item?.basePrice);
    const supplyLimit = parsePositiveInteger(item?.supplyLimit);
    const asset = item?.asset;
    const assetUrl = getAbsoluteStrapiAssetUrl(asset);
    const assetName = asset?.name || asset?.url || '';

    if (!itemKey) return { error: 'itemKey is required' };
    if (!name) return { error: 'name is required' };
    if (!allowedSlots.has(slot)) return { error: 'slot is invalid' };
    if (!Number.isInteger(layerOrder) || layerOrder < 0) {
        return { error: 'layerOrder must be a nonnegative integer' };
    }
    if (!allowedRarities.has(rarity)) return { error: 'rarity is invalid' };
    if (!allowedReleaseStatuses.has(releaseStatus)) {
        return { error: 'releaseStatus is invalid' };
    }
    if (item?.basePrice !== undefined && item?.basePrice !== null && basePrice === null) {
        return { error: 'basePrice must be a nonnegative integer' };
    }
    if (item?.supplyLimit !== undefined && item?.supplyLimit !== null && supplyLimit === null) {
        return { error: 'supplyLimit must be a positive integer' };
    }
    if (!assetUrl) return { error: 'asset is required' };
    if (!/\.png(?:$|\?)/i.test(assetUrl) && !/\.png$/i.test(assetName)) {
        return { error: 'asset must be a PNG image' };
    }

    return {
        item: {
            itemKey,
            name,
            slot,
            layerOrder,
            rarity,
            releaseStatus,
            basePrice,
            supplyLimit,
            isTradeable: item?.isTradeable !== false,
            isSellable: item?.isSellable !== false,
            assetUrl,
            strapiDocumentId: item.documentId,
            strapiId: item.id,
        },
        error: null,
    };
}

async function fetchStrapiAvatarItem(documentId) {
    const response = await fetch(buildStrapiUrl(`/api/avatar-items/${documentId}?populate=asset`), {
        headers: {
            Authorization: `Bearer ${getRequiredEnv('STRAPI_TOKEN')}`,
        },
    });
    const body = await response.json().catch(() => null);

    if (!response.ok) {
        const message = body?.error?.message || body?.error || `Strapi returned ${response.status}`;
        throw new Error(message);
    }

    return body?.data;
}

async function downloadAsset(assetUrl) {
    const response = await fetch(assetUrl);
    if (!response.ok) {
        throw new Error(`Unable to download avatar asset: ${response.status}`);
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.toLowerCase().includes('image/png')) {
        throw new Error('Avatar asset must be served as image/png');
    }

    const file = Buffer.from(await response.arrayBuffer());
    validatePngDimensions(file);
    return file;
}

function getPngDimensions(file) {
    if (file.length < 24 || !file.subarray(0, 8).equals(pngSignature)) {
        throw new Error('Avatar asset must be a valid PNG image');
    }

    const chunkType = file.subarray(12, 16).toString('ascii');
    if (chunkType !== 'IHDR') {
        throw new Error('Avatar PNG is missing an IHDR header');
    }

    return {
        width: file.readUInt32BE(16),
        height: file.readUInt32BE(20),
    };
}

function validatePngDimensions(file) {
    const { width, height } = getPngDimensions(file);
    if (width !== requiredSpriteSize || height !== requiredSpriteSize) {
        throw new Error(`Avatar asset must be ${requiredSpriteSize}x${requiredSpriteSize}px; received ${width}x${height}px`);
    }
}

async function uploadSpriteToSupabase(storagePath, file) {
    const supabaseUrl = process.env.SUPABASE_URL || (process.env.SUPABASE_PROJECT_REF ? `https://${process.env.SUPABASE_PROJECT_REF}.supabase.co` : '');
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

    if (!supabaseUrl || !serviceKey) return null;

    const normalizedPath = storagePath.replace(/^\/+/, '');
    const response = await fetch(
        `${supabaseUrl.replace(/\/$/, '')}/storage/v1/object/${avatarSpriteBucket}/${normalizedPath}`,
        {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${serviceKey}`,
                apikey: serviceKey,
                'Content-Type': 'image/png',
                'Cache-Control': '31536000',
                'x-upsert': 'true',
            },
            body: file,
        }
    );

    if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`Unable to upload avatar sprite: ${response.status} ${body}`);
    }

    return normalizedPath;
}

async function getExistingAvatarItem(itemKey) {
    const result = await pool.query(`
        SELECT id, asset_path, metadata
        FROM avatar_items
        WHERE item_key = $1
        LIMIT 1
    `, [itemKey]);

    return result.rows[0] || null;
}

async function resolveAssetPath(item, existingItem = null) {
    if (
        existingItem?.asset_path &&
        existingItem?.metadata?.assetUrl === item.assetUrl
    ) {
        return existingItem.asset_path;
    }

    const storagePath = `${item.slot}/${item.itemKey}.png`;
    const file = await downloadAsset(item.assetUrl);
    const uploadedPath = await uploadSpriteToSupabase(storagePath, file);
    return uploadedPath || item.assetUrl;
}

function serializeAvatarItem(row) {
    return {
        id: row.id,
        itemKey: row.item_key,
        name: row.name,
        slot: row.slot,
        layerOrder: row.layer_order,
        assetPath: row.asset_path,
        isDefault: row.is_default,
        isStarter: row.is_starter,
        isTradeable: row.is_tradeable,
        isSellable: row.is_sellable,
        rarity: row.rarity,
        basePrice: row.base_price,
        releaseStatus: row.release_status,
        metadata: row.metadata,
    };
}

async function upsertAvatarItem(item, assetPath) {
    const result = await pool.query(`
        INSERT INTO avatar_items (
            item_key,
            name,
            slot,
            layer_order,
            asset_path,
            is_default,
            is_starter,
            is_tradeable,
            is_sellable,
            rarity,
            base_price,
            release_status,
            metadata
        )
        VALUES ($1, $2, $3, $4, $5, FALSE, FALSE, $6, $7, $8, $9, $10, $11::jsonb)
        ON CONFLICT (item_key)
        DO UPDATE SET
            name = EXCLUDED.name,
            slot = EXCLUDED.slot,
            layer_order = EXCLUDED.layer_order,
            asset_path = EXCLUDED.asset_path,
            is_tradeable = EXCLUDED.is_tradeable,
            is_sellable = EXCLUDED.is_sellable,
            rarity = EXCLUDED.rarity,
            base_price = EXCLUDED.base_price,
            release_status = EXCLUDED.release_status,
            metadata = EXCLUDED.metadata
        RETURNING *
    `, [
        item.itemKey,
        item.name,
        item.slot,
        item.layerOrder,
        assetPath,
        item.isTradeable,
        item.isSellable,
        item.rarity,
        item.basePrice,
        item.releaseStatus,
        JSON.stringify({
            source: 'strapi',
            strapiDocumentId: item.strapiDocumentId,
            strapiId: item.strapiId,
            supplyLimit: item.supplyLimit,
            assetUrl: item.assetUrl,
        }),
    ]);

    return serializeAvatarItem(result.rows[0]);
}

async function routes(fastify) {
    fastify.post('/avatar-items/sync', async (request, reply) => {
        if (!verifySyncSecret(request, reply)) return;

        const { documentId } = request.body || {};
        if (!documentId || typeof documentId !== 'string') {
            return reply.code(400).send({ error: 'documentId is required' });
        }

        try {
            const strapiItem = await fetchStrapiAvatarItem(documentId);
            const { item, error } = normalizeStrapiItem(strapiItem);
            if (error) {
                return reply.code(400).send({ error });
            }

            const existingItem = await getExistingAvatarItem(item.itemKey);
            const assetPath = await resolveAssetPath(item, existingItem);
            const syncedItem = await upsertAvatarItem(item, assetPath);

            return { data: syncedItem };
        } catch (error) {
            fastify.log.error(error);
            return reply.code(500).send({ error: 'An error occurred while syncing the Strapi avatar item' });
        }
    });
}

export default routes;
