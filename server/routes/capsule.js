import { randomInt } from 'node:crypto';
import { CAPSULE_ODDS, CAPSULE_PRICE, pickCapsule } from '../capsule/machine.js';
import { PullRefusedError, createCapsuleRepository } from '../capsule/repository.js';
import { serializeAvatarItemV2 } from '../utils/avatarV2.js';

// Capsules come out by the operating system's generator, not Math.random.
function secureRandom() {
    return randomInt(0, 2 ** 32) / 2 ** 32;
}

const REFUSAL_MESSAGES = {
    insufficient_funds: "You don't have enough tickets for a capsule.",
    item_unavailable: 'That capsule got stuck. Try again.',
    invalid_amount: 'The machine is out of order.',
    machine_empty: 'The machine is empty.',
};

export default async function capsuleRoutes(fastify, { repo = createCapsuleRepository(), rng = secureRandom } = {}) {
    // What a turn costs, the odds on the glass, and how many of each rarity are inside.
    // Anyone can read it (see authRoutes); only a passenger can turn the crank.
    fastify.get('/machine', async (request, reply) => {
        try {
            const stock = await repo.listStock();
            const counts = Object.fromEntries(Object.keys(CAPSULE_ODDS).map((rarity) => [rarity, 0]));
            for (const item of stock) if (item.rarity in counts) counts[item.rarity] += 1;
            return { data: { price: CAPSULE_PRICE, odds: CAPSULE_ODDS, stock: counts } };
        } catch (error) {
            request.log.error({ err: error }, 'Failed to read the capsule machine');
            return reply.code(503).send({ error: 'machine_unavailable', message: 'The machine is out of order.' });
        }
    });

    fastify.post('/pull', async (request, reply) => {
        try {
            const item = pickCapsule(await repo.listStock(), rng);
            if (!item) throw new PullRefusedError('machine_empty');
            const { itemInstanceId, balance } = await repo.pull({ userId: request.user.sub, itemId: item.id, price: CAPSULE_PRICE });
            return reply.code(201).send({ data: { item: serializeAvatarItemV2(item), itemInstanceId, coinBalance: balance, price: CAPSULE_PRICE } });
        } catch (error) {
            if (error instanceof PullRefusedError) {
                return reply.code(409).send({ error: error.code, message: REFUSAL_MESSAGES[error.code] });
            }
            request.log.error({ err: error }, 'Capsule pull failed');
            return reply.code(503).send({ error: 'pull_failed', message: 'The machine jammed. Your tickets are safe; try again.' });
        }
    });
}
