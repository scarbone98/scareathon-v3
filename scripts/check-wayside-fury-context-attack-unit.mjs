// Pure target/timing/press rules plus simulation integration. Node 24+.
import assert from 'node:assert/strict';
import { interactionPrompt, newContextAttack, resolveContextPress, selectInteractionTarget, updateContextPrompt } from '../src/pages/WaysideFury/game/contextAttack.ts';
import { activeHero, addEnemy, enterScene, idleInput, interact, interactTarget, newGame, step } from '../src/pages/WaysideFury/game/sim.ts';
import { getWorld } from '../src/pages/WaysideFury/game/world.ts';

const candidate = (id, x, y, distance = Math.hypot(x, y), radius = 28) => ({ id, name: id, kind: 'talk', x, y, distance, radius });
const nearest = [candidate('far', 22, 0), candidate('near', 12, 0), candidate('behind', -3, 0), candidate('outside', 30, 0)];
assert.equal(selectInteractionTarget(nearest, 0, 0, 1, 0).id, 'near', 'nearest forward target beats a closer target behind the hero');
assert.equal(selectInteractionTarget(nearest, 0, 0, -1, 0).id, 'behind', 'facing determines priority');
assert.equal(selectInteractionTarget([candidate('outside', 28, 0)], 0, 0, 1, 0), null, 'existing interaction radius stays exclusive');
assert.equal(selectInteractionTarget([candidate('z', 12, 0), candidate('a', 12, 0)], 0, 0, 1, 0).id, 'a', 'equal targets have a stable tie break');
assert.equal(selectInteractionTarget([candidate('behind', -12, 0)], 0, 0, 1, 0).id, 'behind', 'a sole target behind the hero remains usable');

const npc = { id: 'npc', name: 'Talk to Matt', kind: 'talk', x: 10, y: 0 };
const context = newContextAttack(); context.target = npc;
const desired = interactionPrompt(npc, false, false);
updateContextPrompt(context, desired, 0);
updateContextPrompt(context, desired, .119);
assert.equal(context.displayed.action, 'attack', 'a target must persist for 120 ms');
updateContextPrompt(context, desired, .12);
assert.equal(context.displayed.glyph, 'talk');
assert.equal(resolveContextPress(context, false, false, .13), 'interact', 'NPC only resolves to interaction');
assert.equal(resolveContextPress(context, true, false, .13), 'attack', 'a hostile in melee reach takes combat priority');
assert.equal(resolveContextPress(context, true, true, .13), 'interact', 'dialog/taxi/safe context takes interaction priority');
assert.equal(resolveContextPress(context, false, false, .20, { action: 'attack' }), 'attack', 'a press during the grace period retains the attack glyph actually shown');
assert.equal(resolveContextPress(context, false, false, .28, { action: 'attack' }), 'interact', 'the old glyph expires after the 150 ms grace');

const leaving = interactionPrompt(null, false, false);
updateContextPrompt(context, leaving, .3); context.target = null;
assert.equal(resolveContextPress(context, false, false, .32), 'none', 'a vanished target cannot turn a shown talk press into a swing');
updateContextPrompt(context, leaving, .42);
assert.equal(context.displayed.glyph, 'attack');
assert.equal(resolveContextPress(context, false, false, .45, { action: 'interact', targetId: 'npc' }), 'none', 'recently shown talk stays harmless after walking out of range');
assert.equal(resolveContextPress(context, false, false, .58, { action: 'interact', targetId: 'npc' }), 'attack');

const tick = (s, input = {}, frames = 1) => { for (let frame = 0; frame < frames; frame++) step(s, { ...idleInput(), ...input }, 1 / 60); };
const scoutState = () => {
  const s = newGame(); enterScene(s, 'dungeon', 8); s.enemies = [];
  s.x = 152; s.y = 174; s.faceX = 0; s.faceY = -1;
  tick(s, {}, 10); return s;
};
const talking = scoutState();
assert.equal(talking.contextAttack.target.id, 'scout');
assert.equal(talking.contextAttack.displayed.glyph, 'talk');
tick(talking, { attack: true, interact: true });
assert.equal(talking.dialogue.speaker, 'Stranded scout', 'one gamepad A press opens NPC dialogue');
assert.equal(talking.attackTimer, 0, 'the same gamepad press never also swings');
tick(talking, { attack: true, interact: true }, 20);
assert.ok(talking.dialogue, 'holding Attack cannot dismiss newly opened dialogue');
tick(talking);
assert.equal(talking.contextAttack.displayed.glyph, 'next', 'dialogue changes the attack glyph to a chevron');
tick(talking, { attack: true });
assert.equal(talking.dialogue, null, 'Attack advances an open dialogue');
assert.equal(talking.attackTimer, 0, 'dialogue advancement never swings');
tick(talking); talking.x = 200; talking.y = 210; tick(talking, {}, 12);
assert.equal(talking.contextAttack.displayed.glyph, 'attack');
tick(talking, { attack: true });
assert.ok(talking.attackTimer > 0, 'walking away restores the normal attack');

const fighting = scoutState(); fighting.faceX = 1; fighting.faceY = 0;
const enemy = addEnemy(fighting, 'grunt', fighting.x + 18, fighting.y); enemy.cooldown = 100; enemy.speed = 0;
const appliedA = { ...idleInput(), attack: true, interact: true };
step(fighting, appliedA, 1 / 60);
assert.equal(fighting.dialogue, null, 'hostile precedence prevents a gamepad press from talking');
assert.ok(fighting.attackTimer > 0); assert.ok(enemy.hp < enemy.maxHp);
assert.equal(appliedA.interact, false, 'swing precedence clears the applied Interact command');
assert.equal(fighting.previousInput.interact, true, 'physical gamepad Interact remains held for edge detection');
fighting.enemies = [];
tick(fighting, { attack: true, interact: true }, 20);
assert.equal(fighting.dialogue, null, 'a held pad A cannot create a later talk edge when the hostile leaves');

const dedicated = scoutState(); interact(dedicated);
assert.ok(dedicated.dialogue, 'dedicated direct Interact still selects a fresh target');
tick(dedicated); tick(dedicated, { interact: true });
assert.equal(dedicated.dialogue, null, 'dedicated Interact advances dialogue without waiting for Attack hysteresis');
const dedicatedCombat = scoutState(); addEnemy(dedicatedCombat, 'grunt', dedicatedCombat.x + 18, dedicatedCombat.y);
tick(dedicatedCombat, { interact: true });
assert.ok(dedicatedCombat.dialogue, 'dedicated Interact stays available when Attack has combat priority');
assert.equal(dedicatedCombat.attackTimer, 0);

const soloDialogue = scoutState(); interact(soloDialogue);
const soloEnemy = addEnemy(soloDialogue, 'grunt', 320, 192);
soloDialogue.projectiles.push({ id: soloDialogue.nextId++, x: 320, y: 260, vx: 0, vy: 20, radius: 4, damage: 20, ttl: 1, owner: 'enemy', beam: false, hits: [] });
const soloWorld = structuredClone({ enemy: soloEnemy, projectiles: soloDialogue.projectiles, x: soloDialogue.x, y: soloDialogue.y, active: soloDialogue.active });
tick(soloDialogue, { x: 1, y: 1, ki: true, dash: true, swap: true, guard: true }, 20);
assert.deepEqual(soloEnemy, soloWorld.enemy, 'solo dialogue still pauses enemy simulation');
assert.deepEqual(soloDialogue.projectiles, soloWorld.projectiles, 'solo dialogue still pauses projectiles');
assert.equal(soloDialogue.x, soloWorld.x); assert.equal(soloDialogue.y, soloWorld.y); assert.equal(soloDialogue.active, soloWorld.active);
assert.equal(soloDialogue.charge, 0, 'dialogue suppresses local Ki charging');

const safe = newGame(); enterScene(safe, 'hub'); safe.x = 344; safe.y = 270; safe.faceY = -1; safe.faceX = 0;
addEnemy(safe, 'grunt', 344, 258); tick(safe, {}, 10); tick(safe, { attack: true });
assert.equal(safe.dialogue.speaker, 'Alex', 'safe-zone targets interact even with a hostile in reach');

const coop = scoutState(); coop.coop = { role: 'guest', seat: 1, remoteHeroes: [{ seat: 0, userId: 'host', name: 'Host', hero: { ...activeHero(coop) }, x: 400, y: 400, faceX: 1, faceY: 0, moving: false, guard: false, attackTimer: 0, combo: 0, charge: 0, dashTimer: 0, scene: 'dungeon', room: 8 }], appliedHits: [] };
assert.equal(interactTarget(coop).id, 'scout', 'targets use the local player position in co-op');
tick(coop, { attack: true }); assert.ok(coop.dialogue, 'guest NPC dialogue is local');

const intro = newGame(); enterScene(intro, 'prologue'); tick(intro, {}, 10); tick(intro, { attack: true });
assert.equal(intro.cutscene, 1, 'Attack advances story dialogue');
tick(intro, { attack: true }, 20); assert.equal(intro.cutscene, 1, 'held Attack advances just one story beat');

const clearing = newGame(); enterScene(clearing, 'dungeon');
const clearWorld = getWorld(clearing.scene, clearing.room); clearing.x = clearWorld.width - 64; clearing.y = clearWorld.spawn.y;
for (const enemy of clearing.enemies) enemy.hp = 0;
assert.notEqual(interactTarget(clearing)?.id, 'east', 'a lethal hit cannot open an exit before its encounter checkpoint is recorded');
tick(clearing);
assert.ok(clearing.clearedRooms.includes('blast-0'));
assert.equal(interactTarget(clearing).id, 'east', 'the exit opens after enemy removal and clear rewards');

const ki = newGame(); ki.enemies = []; tick(ki, { ki: true }, 140);
assert.ok(ki.charge > 2, 'charging stays unchanged without a target');
tick(ki); assert.ok(ki.projectiles.some(projectile => projectile.beam), 'release still fires the signature');
console.log('Wayside Fury context Attack unit checks passed (selection, timing, combat, dialogue, co-op, dedicated controls and Ki).');

const diner = newGame(); enterScene(diner, 'overworld'); diner.x = 520; diner.y = 405;
interact(diner); assert.equal(diner.overlay, 'diner'); assert.equal(diner.insideDiner, true);
tick(diner, {}, 10); tick(diner, { attack: true });
assert.ok(diner.foundItems.includes('pickup-c1-diner'), 'context Attack finds candy inside the diner');
tick(diner, {}, 10); tick(diner, { attack: true });
assert.equal(diner.overlay, null, 'context Attack leaves the diner after its one-time find');
assert.equal(diner.insideDiner, false);
