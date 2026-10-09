// Training is personal progression, separate from encounters and ticket receipts.
const TRAINING_HERO_IDS = ['you', 'joe', 'matt', 'alex', 'jon'];
const isRecord = value => !!value && typeof value === 'object' && !Array.isArray(value);

export function defaultCombatProgress() {
    return { training: Object.fromEntries(TRAINING_HERO_IDS.map(id => [id, 0])) };
}

export function sanitizeCombatSave(raw) {
    const training = isRecord(raw) && isRecord(raw.training) ? raw.training : {};
    return { training: Object.fromEntries(TRAINING_HERO_IDS.map(id => {
        const tier = training[id];
        return [id, typeof tier === 'number' && Number.isFinite(tier) && Number.isInteger(tier) && tier >= 0 && tier <= 3 ? tier : 0];
    })) };
}

// A stale cloud sheet or HOME retry cannot erase an earned signature tier.
export function mergeCombatProgress(...progress) {
    const merged = defaultCombatProgress();
    for (const raw of progress) {
        const clean = sanitizeCombatSave(raw);
        for (const id of TRAINING_HERO_IDS) merged.training[id] = Math.max(merged.training[id], clean.training[id]);
    }
    return merged;
}
