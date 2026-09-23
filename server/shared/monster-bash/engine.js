// Deterministic CPU-vs-CPU fight engine for Monster Bash.
//
// A fight is a plain JSON state advanced one tick at a time by stepFight().
// Everything random comes from the seeded generator stored in the state, so
// the same seed and fighters always replay the same fight, and a state can be
// cloned mid-fight to play out alternative futures (see odds.js).

import { chance, createRng, pickWeighted, randomBetween, randomInt } from './rng.js';
import { getMonster } from './roster.js';

// Bump whenever a change to the engine or roster would make an old seed play
// out differently. Stored bouts are only replayed under the version they ran on.
export const ENGINE_VERSION = 1;
export const TICK_RATE = 30;
export const ARENA_WIDTH = 640;
export const WALL_MARGIN = 16;
export const ROUNDS_TO_WIN = 2;
export const ROUND_TICKS = 45 * TICK_RATE;
export const ROUND_BREAK_TICKS = Math.round(2.5 * TICK_RATE);
export const METER_MAX = 100;
export const CRIT_CHANCE = 0.08;
export const CRIT_MULTIPLIER = 1.5;
export const BLOCK_CHIP = 0.2;
export const SPECIAL_BLOCK_CHIP = 0.5;
// Softens every shove so long-reach monsters can't keep brawlers out forever.
export const KNOCKBACK_SCALE = 0.6;
// Comebacks: a monster on its last legs hits harder.
export const DESPERATION_HP = 0.25;
export const DESPERATION_DAMAGE = 1.2;
// Each monster rolls a hidden form for the night so no matchup is a lock.
export const FORM_RANGE = [0.85, 1.15];
// Each hit in an unbroken combo stuns for less, so fast jabs can't lock a
// slow monster down forever.
export const COMBO_HITSTUN_DECAY = 0.3;
export const MIN_HITSTUN_SCALE = 0.25;

const START_X = [ARENA_WIDTH / 2 - 120, ARENA_WIDTH / 2 + 120];
const PROJECTILE_WIDTH = 12;

export function moveDuration(move) {
    return move.startup + move.active + move.recovery;
}

// How far away a move can be started from and still connect. A dash's `range`
// is its contact distance, so its reach includes the ground it covers.
export function moveReach(move) {
    return move.kind === 'dash' ? move.range + move.speed * move.active : move.range;
}

function createFighter(monsterId, side, form) {
    const monster = getMonster(monsterId);
    return {
        id: monsterId,
        form,
        x: START_X[side],
        hp: monster.stats.maxHp,
        meter: 0,
        state: 'idle',
        stateTicks: 0,
        walkDir: 0,
        decisionTimer: 0,
        move: null,
        cooldowns: {},
        burn: null,
        combo: 0,
        stats: { damageDealt: 0, hits: 0, blocks: 0, dodges: 0, crits: 0, specials: 0 },
    };
}

export function createFight({ seed, fighters }) {
    if (!seed) throw new Error('A fight needs a seed');
    if (!Array.isArray(fighters) || fighters.length !== 2) {
        throw new Error('A fight needs exactly two fighters');
    }

    const rng = createRng(seed);
    const forms = fighters.map(() => Math.round(randomBetween(rng, FORM_RANGE[0], FORM_RANGE[1]) * 1000) / 1000);
    return {
        seed: String(seed),
        tick: 0,
        rng,
        phase: 'fighting',
        phaseTicks: 0,
        round: 1,
        roundTick: 0,
        roundWins: [0, 0],
        rounds: [],
        winner: null,
        fighters: fighters.map((id, side) => createFighter(id, side, forms[side])),
        projectiles: [],
        nextProjectileId: 1,
    };
}

function findMove(monster, moveId) {
    if (monster.special.id === moveId) return monster.special;
    return monster.moves.find((move) => move.id === moveId);
}

function gapBetween(state) {
    const [a, b] = state.fighters;
    const widthA = getMonster(a.id).stats.width;
    const widthB = getMonster(b.id).stats.width;
    return Math.abs(a.x - b.x) - (widthA + widthB) / 2;
}

function directionTo(fighter, target) {
    return target.x >= fighter.x ? 1 : -1;
}

function clampToArena(fighter) {
    const half = getMonster(fighter.id).stats.width / 2;
    const min = WALL_MARGIN + half;
    const max = ARENA_WIDTH - WALL_MARGIN - half;
    fighter.x = Math.min(max, Math.max(min, fighter.x));
}

// Moves a fighter horizontally without passing through the opponent.
function shiftFighter(state, index, dx) {
    const fighter = state.fighters[index];
    const other = state.fighters[1 - index];
    const towardOther = Math.sign(dx) === directionTo(fighter, other);
    if (towardOther) {
        const gap = gapBetween(state);
        const limited = Math.min(Math.abs(dx), Math.max(0, gap));
        fighter.x += Math.sign(dx) * limited;
    } else {
        fighter.x += dx;
    }
    clampToArena(fighter);
}

function addMeter(fighter, amount) {
    fighter.meter = Math.min(METER_MAX, fighter.meter + amount);
}

function canReact(fighter) {
    return fighter.state === 'idle' || fighter.state === 'walk';
}

function startMove(state, index, move, isSpecial, events) {
    const fighter = state.fighters[index];
    const opponent = state.fighters[1 - index];
    fighter.state = 'attack';
    fighter.walkDir = 0;
    fighter.move = { id: move.id, special: isSpecial, elapsed: 0, hitsDone: 0 };
    if (isSpecial) {
        fighter.meter = 0;
        fighter.stats.specials += 1;
    } else {
        fighter.cooldowns[move.id] = moveDuration(move) + move.cooldown;
    }
    events?.push({ type: isSpecial ? 'special' : 'attack', f: index, move: move.id });

    // The opponent sees the wind-up and may put a guard up.
    const opponentStats = getMonster(opponent.id).stats;
    const gap = gapBetween(state);
    const threatened = move.kind === 'projectile' || gap <= moveReach(move) + 20;
    if (threatened && canReact(opponent) && chance(state.rng, opponentStats.blockChance)) {
        const travel = move.kind === 'projectile' ? Math.ceil(gap / move.speed) : 0;
        opponent.state = 'block';
        opponent.walkDir = 0;
        opponent.stateTicks = move.startup + move.active + travel + 4;
        events?.push({ type: 'guard', f: 1 - index });
    }
}

function applyHit(state, attackerIndex, move, isSpecial, events) {
    const attacker = state.fighters[attackerIndex];
    const defenderIndex = 1 - attackerIndex;
    const defender = state.fighters[defenderIndex];
    const defenderStats = getMonster(defender.id).stats;
    if (defender.hp <= 0) return 'miss';

    const blocked = defender.state === 'block';
    const canDodge = defender.state === 'idle' || defender.state === 'walk' || defender.state === 'attack';
    if (!blocked && canDodge && chance(state.rng, defenderStats.evasion)) {
        defender.stats.dodges += 1;
        events?.push({ type: 'dodge', f: defenderIndex, move: move.id });
        return 'dodge';
    }

    let damage = randomInt(state.rng, move.damage[0], move.damage[1]);
    const crit = !blocked && chance(state.rng, CRIT_CHANCE);
    if (crit) damage *= CRIT_MULTIPLIER;
    damage *= attacker.form * (1 - defenderStats.armor);
    if (hpRatio(attacker) <= DESPERATION_HP) damage *= DESPERATION_DAMAGE;
    if (blocked) damage *= isSpecial ? SPECIAL_BLOCK_CHIP : BLOCK_CHIP;
    damage = Math.max(1, Math.round(damage));

    defender.hp -= damage;
    attacker.stats.damageDealt += damage;
    attacker.stats.hits += 1;
    if (crit) attacker.stats.crits += 1;
    if (blocked) defender.stats.blocks += 1;
    if (!isSpecial) addMeter(attacker, damage * 1.2);
    addMeter(defender, damage * 0.9);

    const away = directionTo(attacker, defender);
    const push = (move.knockback * KNOCKBACK_SCALE * (blocked ? 0.4 : 1)) / defenderStats.weight;
    shiftFighter(state, defenderIndex, away * push);

    // Heavy monsters can shrug a hit off and keep doing what they were doing.
    const tanked = !blocked && !isSpecial && chance(state.rng, defenderStats.poise || 0);
    if (!blocked && !tanked) {
        const scale = Math.max(MIN_HITSTUN_SCALE, 1 - COMBO_HITSTUN_DECAY * defender.combo);
        defender.combo += 1;
        defender.state = 'hitstun';
        defender.stateTicks = Math.max(1, Math.round(move.hitstun * scale));
        defender.move = null;
        defender.walkDir = 0;
    }

    if (!blocked) {
        const effects = move.effects || {};
        if (effects.burn) {
            defender.burn = {
                perTick: effects.burn.perSecond / TICK_RATE,
                ticks: effects.burn.seconds * TICK_RATE,
            };
        }
        if (effects.lifesteal) {
            const maxHp = getMonster(attacker.id).stats.maxHp;
            attacker.hp = Math.min(maxHp, attacker.hp + damage * effects.lifesteal);
        }
    }

    events?.push({ type: 'hit', f: attackerIndex, move: move.id, damage, crit, blocked, tanked });
    return 'hit';
}

function spawnProjectile(state, index, move, isSpecial, events) {
    const fighter = state.fighters[index];
    const opponent = state.fighters[1 - index];
    const dir = directionTo(fighter, opponent);
    const half = getMonster(fighter.id).stats.width / 2;
    const projectile = {
        id: state.nextProjectileId++,
        owner: index,
        move: move.id,
        special: isSpecial,
        x: fighter.x + dir * half,
        dir,
        speed: move.speed,
        travelled: 0,
        range: move.range,
    };
    state.projectiles.push(projectile);
    events?.push({ type: 'projectile', id: projectile.id, f: index, move: move.id, x: projectile.x, dir, speed: move.speed });
}

function advanceMove(state, index, events) {
    const fighter = state.fighters[index];
    const monster = getMonster(fighter.id);
    const move = findMove(monster, fighter.move.id);
    const isSpecial = fighter.move.special;
    const { elapsed } = fighter.move;
    const hits = move.hits || 1;
    const activeElapsed = elapsed - move.startup;
    const isActive = activeElapsed >= 0 && activeElapsed < move.active;

    if (isActive) {
        if (move.kind === 'dash') {
            // Charge forward until contact; the dash ends its travel on the hit.
            if (fighter.move.hitsDone === 0) {
                const dir = directionTo(fighter, state.fighters[1 - index]);
                shiftFighter(state, index, dir * move.speed);
                if (gapBetween(state) <= move.range) {
                    fighter.move.hitsDone = 1;
                    applyHit(state, index, move, isSpecial, events);
                }
            }
        } else if (move.kind === 'strike' && hits === 1) {
            if (fighter.move.hitsDone === 0 && gapBetween(state) <= move.range) {
                fighter.move.hitsDone = 1;
                applyHit(state, index, move, isSpecial, events);
            }
        } else {
            // Multi-hit strikes and projectile volleys fire on an even beat
            // across the active window, whether or not the target is there.
            const due = Math.min(hits, Math.floor((activeElapsed * hits) / move.active) + 1);
            while (fighter.move.hitsDone < due) {
                fighter.move.hitsDone += 1;
                if (move.kind === 'projectile') {
                    spawnProjectile(state, index, move, isSpecial, events);
                } else if (gapBetween(state) <= move.range) {
                    applyHit(state, index, move, isSpecial, events);
                }
            }
        }
    }

    fighter.move.elapsed += 1;
    if (fighter.move.elapsed >= moveDuration(move)) {
        fighter.move = null;
        fighter.state = 'idle';
        fighter.decisionTimer = randomInt(state.rng, 1, 4);
    }
}

function moveInRange(move, gap) {
    return gap >= (move.minRange || 0) && gap <= moveReach(move);
}

function decide(state, index, events) {
    const fighter = state.fighters[index];
    const monster = getMonster(fighter.id);
    const { stats } = monster;
    const gap = gapBetween(state);
    fighter.decisionTimer = randomInt(state.rng, stats.reaction[0], stats.reaction[1]);

    if (fighter.meter >= METER_MAX && moveInRange(monster.special, gap)) {
        startMove(state, index, monster.special, true, events);
        return;
    }

    const usable = monster.moves.filter(
        (move) => (fighter.cooldowns[move.id] || 0) <= 0 && moveInRange(move, gap)
    );
    if (usable.length > 0 && chance(state.rng, stats.aggression)) {
        const move = pickWeighted(state.rng, usable, (candidate) => candidate.weight);
        startMove(state, index, move, false, events);
        return;
    }

    const toward = directionTo(fighter, state.fighters[1 - index]);
    const slack = 12;
    if (gap > stats.preferredRange + slack) {
        fighter.walkDir = toward;
    } else if (gap < stats.preferredRange - slack) {
        const half = stats.width / 2;
        const retreat = -toward;
        const cornered = retreat < 0
            ? fighter.x - half <= WALL_MARGIN + 4
            : fighter.x + half >= ARENA_WIDTH - WALL_MARGIN - 4;
        fighter.walkDir = cornered ? toward : retreat;
    } else {
        // Shuffle around at the preferred distance so fights don't stall.
        const roll = randomInt(state.rng, 0, 2);
        fighter.walkDir = roll === 0 ? 0 : roll === 1 ? toward : -toward;
    }
    fighter.state = fighter.walkDir === 0 ? 'idle' : 'walk';
}

function updateFighter(state, index, events) {
    const fighter = state.fighters[index];
    const { stats } = getMonster(fighter.id);

    if (fighter.burn) {
        fighter.hp -= fighter.burn.perTick;
        fighter.burn.ticks -= 1;
        if (fighter.burn.ticks <= 0) fighter.burn = null;
    }
    if (stats.regen > 0 && fighter.hp > 0) {
        fighter.hp = Math.min(stats.maxHp, fighter.hp + stats.regen / TICK_RATE);
    }
    for (const moveId of Object.keys(fighter.cooldowns)) {
        if (fighter.cooldowns[moveId] > 0) fighter.cooldowns[moveId] -= 1;
    }

    switch (fighter.state) {
        case 'hitstun':
        case 'block':
            fighter.stateTicks -= 1;
            if (fighter.stateTicks <= 0) {
                fighter.state = 'idle';
                fighter.combo = 0;
                fighter.decisionTimer = randomInt(state.rng, 1, 5);
            }
            break;
        case 'attack':
            advanceMove(state, index, events);
            break;
        case 'idle':
        case 'walk':
            fighter.decisionTimer -= 1;
            if (fighter.decisionTimer <= 0) decide(state, index, events);
            if (fighter.state === 'walk') shiftFighter(state, index, fighter.walkDir * stats.walkSpeed);
            break;
        default:
            break;
    }
}

function updateProjectiles(state, events) {
    const survivors = [];
    for (const projectile of state.projectiles) {
        projectile.x += projectile.dir * projectile.speed;
        projectile.travelled += projectile.speed;

        const target = state.fighters[1 - projectile.owner];
        const half = getMonster(target.id).stats.width / 2;
        const touching = Math.abs(projectile.x - target.x) <= half + PROJECTILE_WIDTH / 2;

        if (touching && target.hp > 0) {
            const owner = getMonster(state.fighters[projectile.owner].id);
            const result = applyHit(state, projectile.owner, findMove(owner, projectile.move), projectile.special, events);
            // A dodged projectile ends here too; spectators let it sail past.
            events?.push({ type: 'projectileEnd', id: projectile.id, hit: result === 'hit' });
        } else if (projectile.x < 0 || projectile.x > ARENA_WIDTH || projectile.travelled >= projectile.range) {
            events?.push({ type: 'projectileEnd', id: projectile.id, hit: false });
        } else {
            survivors.push(projectile);
        }
    }
    state.projectiles = survivors;
}

function hpRatio(fighter) {
    return fighter.hp / getMonster(fighter.id).stats.maxHp;
}

function endRound(state, winner, reason, events) {
    const loser = state.fighters[1 - winner];
    if (reason === 'ko') loser.state = 'ko';
    state.roundWins[winner] += 1;
    state.rounds.push({ round: state.round, winner, reason, tick: state.tick });
    events?.push({ type: 'roundEnd', round: state.round, winner, reason });

    if (state.roundWins[winner] >= ROUNDS_TO_WIN) {
        state.phase = 'over';
        state.winner = winner;
        events?.push({ type: 'fightEnd', winner });
    } else {
        state.phase = 'break';
        state.phaseTicks = ROUND_BREAK_TICKS;
    }
}

function checkRoundEnd(state, events) {
    const [a, b] = state.fighters;
    const aDown = a.hp <= 0;
    const bDown = b.hp <= 0;

    if (aDown || bDown) {
        let winner;
        if (aDown && bDown) {
            winner = a.hp === b.hp ? (chance(state.rng, 0.5) ? 0 : 1) : a.hp > b.hp ? 0 : 1;
        } else {
            winner = aDown ? 1 : 0;
        }
        endRound(state, winner, 'ko', events);
        return;
    }

    if (state.roundTick >= ROUND_TICKS) {
        const ratioA = hpRatio(a);
        const ratioB = hpRatio(b);
        const winner = ratioA === ratioB ? (chance(state.rng, 0.5) ? 0 : 1) : ratioA > ratioB ? 0 : 1;
        endRound(state, winner, 'time', events);
    }
}

function startNextRound(state, events) {
    state.round += 1;
    state.roundTick = 0;
    state.phase = 'fighting';
    state.projectiles = [];
    state.fighters.forEach((fighter, side) => {
        const fresh = createFighter(fighter.id, side, fighter.form);
        // The round's loser comes back with a full meter; the winner keeps theirs.
        const lostLastRound = state.rounds[state.rounds.length - 1].winner !== side;
        const meter = lostLastRound ? METER_MAX : fighter.meter;
        state.fighters[side] = { ...fresh, meter, stats: fighter.stats };
    });
    events?.push({ type: 'roundStart', round: state.round });
}

// Advances the fight by one tick. Pass an array to collect what happened this
// tick for spectators; pass null when only the outcome matters (odds rollouts).
export function stepFight(state, events = null) {
    if (state.phase === 'over') return state;

    if (state.phase === 'break') {
        state.phaseTicks -= 1;
        if (state.phaseTicks <= 0) startNextRound(state, events);
        state.tick += 1;
        return state;
    }

    if (state.roundTick === 0 && state.round === 1) {
        events?.push({ type: 'roundStart', round: 1 });
    }

    // Alternate who acts first so neither side gets a built-in edge.
    const order = state.tick % 2 === 0 ? [0, 1] : [1, 0];
    for (const index of order) updateFighter(state, index, events);
    updateProjectiles(state, events);

    state.roundTick += 1;
    state.tick += 1;
    checkRoundEnd(state, events);
    return state;
}

export function isFightOver(state) {
    return state.phase === 'over';
}

function fighterPose(fighter) {
    if (fighter.state !== 'attack') return fighter.state;
    const move = findMove(getMonster(fighter.id), fighter.move.id);
    const { elapsed } = fighter.move;
    if (elapsed < move.startup) return 'windup';
    if (elapsed < move.startup + move.active) return 'strike';
    return 'recover';
}

// What a spectator needs to draw one fighter at a moment in time.
export function snapshotFighter(state, index) {
    const fighter = state.fighters[index];
    const opponent = state.fighters[1 - index];
    return {
        x: Math.round(fighter.x * 10) / 10,
        hp: Math.max(0, Math.ceil(fighter.hp)),
        meter: Math.floor(fighter.meter),
        pose: fighterPose(fighter),
        move: fighter.move?.id ?? null,
        facing: directionTo(fighter, opponent),
        burning: fighter.burn !== null,
    };
}

export function snapshotFight(state) {
    return {
        t: state.tick,
        round: state.round,
        roundTick: state.roundTick,
        phase: state.phase,
        fighters: [snapshotFighter(state, 0), snapshotFighter(state, 1)],
    };
}

// Runs a whole fight. `frameEvery` controls how often a snapshot is taken for
// spectators; `checkpointEvery` (0 = off) keeps cloned states for live odds.
export function simulateFight({ seed, fighters }, { frameEvery = 3, checkpointEvery = 0, maxTicks = 20 * ROUND_TICKS } = {}) {
    const state = createFight({ seed, fighters });
    const frames = [];
    const events = [];
    const checkpoints = [];

    while (!isFightOver(state) && state.tick < maxTicks) {
        if (checkpointEvery > 0 && state.tick % checkpointEvery === 0) {
            checkpoints.push({ t: state.tick, state: structuredClone(state) });
        }
        const tick = state.tick;
        const tickEvents = [];
        stepFight(state, tickEvents);
        for (const event of tickEvents) events.push({ t: tick, ...event });
        if (state.tick % frameEvery === 0 || isFightOver(state)) frames.push(snapshotFight(state));
    }

    if (!isFightOver(state)) throw new Error(`Fight ${seed} did not finish within ${maxTicks} ticks`);

    return {
        seed: state.seed,
        fighters: [...fighters],
        winner: state.winner,
        rounds: state.rounds,
        durationTicks: state.tick,
        stats: state.fighters.map((fighter) => fighter.stats),
        frames,
        events,
        checkpoints,
        finalState: state,
    };
}
