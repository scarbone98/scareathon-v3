// Local browser checks must opt in explicitly. Production never accepts this.
export function isWaysideFuryDevAuth(env = process.env) {
    return env.WAYSIDE_FURY_DEV_AUTH === 'true' && env.NODE_ENV !== 'production';
}
