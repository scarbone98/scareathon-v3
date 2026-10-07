import pool from '../db/mockDB.js';
import { AVATAR_ART_VERSION, avatarItemColumns } from '../utils/avatarV2.js';
import { CAPSULE_CATEGORIES, CAPSULE_MAX_SHOP_PRICE } from './machine.js';

// Reasons pull_capsule refuses a turn; anything else is a real error.
const PULL_REFUSALS = new Set(['insufficient_funds', 'item_unavailable', 'invalid_amount']);

export class PullRefusedError extends Error {
    constructor(code) {
        super(code);
        this.code = code;
    }
}

// All the capsule machine's SQL lives here so the routes can be tested with a fake.
export function createCapsuleRepository(db = pool) {
    return {
        // What the machine is stocked with: the shop's hats and held things
        // (the same items the shop sells, less any with a limited run or a prize's price).
        async listStock() {
            const { rows } = await db.query(
                `SELECT ${avatarItemColumns}
                 FROM avatar_items ai
                 WHERE ai.art_version = $1
                   AND ai.release_status = 'released'
                   AND ai.base_price IS NOT NULL
                   AND ai.base_price > 0
                   AND ai.base_price <= $3
                   AND ai.is_default = FALSE
                   AND ai.metadata->>'supplyLimit' IS NULL
                   AND ai.category = ANY($2::text[])`,
                [AVATAR_ART_VERSION, CAPSULE_CATEGORIES, CAPSULE_MAX_SHOP_PRICE]
            );
            return rows;
        },

        // Takes the tickets and hands the item over, in one transaction.
        async pull({ userId, itemId, price }) {
            try {
                const { rows } = await db.query('SELECT public.pull_capsule($1, $2, $3) AS result', [userId, itemId, price]);
                return { itemInstanceId: Number(rows[0].result.itemInstanceId), balance: Number(rows[0].result.balance) };
            } catch (error) {
                if (PULL_REFUSALS.has(error.message)) throw new PullRefusedError(error.message);
                throw error;
            }
        },
    };
}
