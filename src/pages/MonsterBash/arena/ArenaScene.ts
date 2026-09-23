import Phaser from "phaser";
import {
  MONSTERS,
  ROUND_TICKS,
  TICK_RATE,
  createFight,
  getMonster,
  snapshotFight,
  type FightEvent,
  type FightFrame,
  type FighterSide,
  type FighterSnapshot,
  type Monster,
} from "../../../../shared/monster-bash/index.js";
import type { LiveMatch, MatchStore } from "../matchStore";
import { SIDE_COLOR_NUMBERS } from "../theme";

export const ARENA_VIEW_WIDTH = 640;
export const ARENA_VIEW_HEIGHT = 360;

const GROUND_Y = 326;
const BANNER_FONT = "Zombie, Impact, sans-serif";
const UI_FONT = "ui-monospace, Menlo, monospace";
const HEALTH_BAR = { y: 14, width: 250, height: 12, inset: 16 };
const METER_BAR = { y: 344, width: 120, height: 5, inset: 16 };
// Events older than this when we reach them (e.g. after a hidden tab) are
// applied silently instead of replaying a burst of effects.
const STALE_EVENT_TICKS = TICK_RATE;
const BURN_COLOR = 0xff8a1f;

type FighterView = {
  side: FighterSide;
  monster: Monster;
  sprite: Phaser.GameObjects.Sprite;
  shadow: Phaser.GameObjects.Ellipse;
  displayHp: number;
  trailHp: number;
  trailHoldUntil: number;
};

type ProjectileView = {
  orb: Phaser.GameObjects.Arc;
  glow: Phaser.GameObjects.Arc;
  t0: number;
  x0: number;
  dir: number;
  speed: number;
};

function lerp(a: number, b: number, alpha: number) {
  return a + (b - a) * alpha;
}

function spriteKey(monsterId: string) {
  return `mb-${monsterId}`;
}

export class ArenaScene extends Phaser.Scene {
  private store: MatchStore;
  private matchId: string | null = null;
  private fighters: FighterView[] = [];
  private projectiles = new Map<number, ProjectileView>();
  private startFrame: FightFrame | null = null;
  private frameCursor = 0;
  private eventCursor = 0;
  private roundWins: [number, number] = [0, 0];

  private hud!: Phaser.GameObjects.Graphics;
  private timerText!: Phaser.GameObjects.Text;
  private banner!: Phaser.GameObjects.Text;
  private subBanner!: Phaser.GameObjects.Text;
  private overlay!: Phaser.GameObjects.Rectangle;
  private bannerTimer: Phaser.Time.TimerEvent | null = null;

  constructor(store: MatchStore) {
    super("monster-bash-arena");
    this.store = store;
  }

  preload() {
    this.load.image("mb-graveyard", "/images/grave_bg.png");
    this.load.image("mb-blood", "/sprites/blood.png");
    this.load.image("mb-shine", "/sprites/shine.png");
    for (const monster of MONSTERS) {
      this.load.spritesheet(spriteKey(monster.id), monster.sprite.url, {
        frameWidth: monster.sprite.frameWidth,
        frameHeight: monster.sprite.frameHeight,
      });
    }
  }

  create() {
    this.drawStage();

    for (const monster of MONSTERS) {
      const key = `${spriteKey(monster.id)}-loop`;
      if (this.anims.exists(key)) continue;
      this.anims.create({
        key,
        frames: this.anims.generateFrameNumbers(spriteKey(monster.id), {
          start: 0,
          end: monster.sprite.frames - 1,
        }),
        frameRate: 10,
        repeat: -1,
      });
    }

    this.hud = this.add.graphics().setDepth(50);
    this.timerText = this.add
      .text(ARENA_VIEW_WIDTH / 2, HEALTH_BAR.y + HEALTH_BAR.height / 2, "", {
        fontFamily: UI_FONT,
        fontSize: "18px",
        fontStyle: "bold",
        color: "#ffe9a8",
        resolution: 2,
      })
      .setOrigin(0.5)
      .setDepth(51);

    this.overlay = this.add
      .rectangle(0, 0, ARENA_VIEW_WIDTH, ARENA_VIEW_HEIGHT, 0x05020a, 0.55)
      .setOrigin(0)
      .setDepth(60)
      .setVisible(false);
    this.banner = this.add
      .text(ARENA_VIEW_WIDTH / 2, ARENA_VIEW_HEIGHT / 2 - 14, "", {
        fontFamily: BANNER_FONT,
        fontSize: "46px",
        color: "#ffffff",
        stroke: "#12051c",
        strokeThickness: 8,
        align: "center",
        resolution: 2,
      })
      .setOrigin(0.5)
      .setDepth(70);
    this.subBanner = this.add
      .text(ARENA_VIEW_WIDTH / 2, ARENA_VIEW_HEIGHT / 2 + 26, "", {
        fontFamily: UI_FONT,
        fontSize: "13px",
        color: "#e9dcff",
        align: "center",
        resolution: 2,
      })
      .setOrigin(0.5)
      .setDepth(70);
  }

  update() {
    const match = this.store.match;
    if (!match) {
      this.showStatic("MONSTER BASH", "Summoning the next bout...");
      return;
    }
    if (match.id !== this.matchId) this.setupMatch(match);

    const now = Date.now();
    const tick = this.store.playbackTick(now);
    const phase = this.store.phase(now);

    if (phase === "intro") {
      this.renderFrame(this.startFrame!, this.startFrame!, 0, tick);
      this.renderHud(this.startFrame!);
      const [left, right] = this.fighters.map((view) => view.monster.name.toUpperCase());
      const seconds = Math.max(1, Math.ceil(-tick / TICK_RATE));
      this.showStatic(`${left}\nVS\n${right}`, `Fight starts in ${seconds}`);
      return;
    }

    this.processEvents(match.events, tick);
    const [a, b, alpha] = this.sampleFrames(match.frames, tick);
    this.renderFrame(a, b, alpha, tick);
    this.updateProjectiles(tick);
    this.renderHud(a);

    if (phase === "result" && match.result) {
      const winner = this.fighters[match.result.winner].monster.name.toUpperCase();
      this.showStatic(`${winner}\nWINS!`, "Next bout coming up...");
    } else if (this.overlay.visible && !this.bannerTimer) {
      this.clearBanner();
    }
  }

  // --- stage -------------------------------------------------------------

  private drawStage() {
    const sky = this.add.graphics();
    sky.fillGradientStyle(0x0b0617, 0x0b0617, 0x3b1030, 0x3b1030, 1);
    sky.fillRect(0, 0, ARENA_VIEW_WIDTH, ARENA_VIEW_HEIGHT);

    const stars = this.add.graphics();
    const rng = new Phaser.Math.RandomDataGenerator(["monster-bash-stars"]);
    for (let i = 0; i < 70; i++) {
      stars.fillStyle(0xffffff, rng.realInRange(0.15, 0.7));
      stars.fillRect(rng.between(0, ARENA_VIEW_WIDTH), rng.between(40, 230), 1, 1);
    }

    const moonX = 500;
    const moonY = 92;
    this.add.circle(moonX, moonY, 58, 0xffe7b0, 0.06);
    this.add.circle(moonX, moonY, 44, 0xffe7b0, 0.1);
    this.add.circle(moonX, moonY, 32, 0xf6e7c1, 1);
    this.add.circle(moonX + 9, moonY - 7, 6, 0xe2cfa2, 1);
    this.add.circle(moonX - 11, moonY + 9, 4, 0xe2cfa2, 1);

    this.add
      .image(0, ARENA_VIEW_HEIGHT, "mb-graveyard")
      .setOrigin(0, 1)
      .setDisplaySize(ARENA_VIEW_WIDTH, ARENA_VIEW_HEIGHT)
      .setAlpha(0.95);

    // A low pool of moonlight on the ground so dark sprites don't vanish.
    this.add.ellipse(ARENA_VIEW_WIDTH / 2, GROUND_Y + 6, 620, 46, 0x7a55b8, 0.22);
    this.add.ellipse(ARENA_VIEW_WIDTH / 2, GROUND_Y + 4, 420, 24, 0xb89cff, 0.12);
  }

  // --- match lifecycle ---------------------------------------------------

  private setupMatch(match: LiveMatch) {
    this.fighters.forEach((view) => {
      view.sprite.destroy();
      view.shadow.destroy();
    });
    this.projectiles.forEach((projectile) => this.destroyProjectile(projectile));
    this.projectiles.clear();

    this.matchId = match.id;
    this.frameCursor = 0;
    this.eventCursor = 0;
    this.roundWins = [0, 0];
    this.startFrame = snapshotFight(createFight({ seed: "intro", fighters: match.fighters }));

    this.fighters = match.fighters.map((monsterId, index) => {
      const side = index as FighterSide;
      const monster = getMonster(monsterId);
      const shadow = this.add.ellipse(0, GROUND_Y, monster.stats.width, 8, 0x000000, 0.45).setDepth(9);
      const sprite = this.add
        .sprite(0, GROUND_Y, spriteKey(monsterId))
        .setOrigin(0.5, 1)
        .setScale(monster.sprite.scale)
        .setDepth(10 + side);
      sprite.play(`${spriteKey(monsterId)}-loop`);
      return {
        side,
        monster,
        sprite,
        shadow,
        displayHp: monster.stats.maxHp,
        trailHp: monster.stats.maxHp,
        trailHoldUntil: 0,
      };
    });
    this.clearBanner();
  }

  // Finds the two snapshots around `tick` so movement can be interpolated.
  private sampleFrames(frames: FightFrame[], tick: number): [FightFrame, FightFrame, number] {
    if (frames.length === 0 || frames[0].t > tick) {
      return [this.startFrame!, frames[0] ?? this.startFrame!, 0];
    }
    if (this.frameCursor >= frames.length || frames[this.frameCursor].t > tick) this.frameCursor = 0;
    while (this.frameCursor + 1 < frames.length && frames[this.frameCursor + 1].t <= tick) {
      this.frameCursor += 1;
    }
    const a = frames[this.frameCursor];
    const b = frames[this.frameCursor + 1] ?? a;
    // Never glide fighters back to their corners between rounds.
    if (b === a || b.round !== a.round) return [a, a, 0];
    return [a, b, Phaser.Math.Clamp((tick - a.t) / (b.t - a.t), 0, 1)];
  }

  // --- fighters ----------------------------------------------------------

  private renderFrame(a: FightFrame, b: FightFrame, alpha: number, tick: number) {
    this.fighters.forEach((view) => {
      const from = a.fighters[view.side];
      const to = b.fighters[view.side];
      this.renderFighter(view, from, lerp(from.x, to.x, alpha), tick);
    });
  }

  private renderFighter(view: FighterView, snap: FighterSnapshot, x: number, tick: number) {
    const { sprite, shadow, monster } = view;
    const facing = snap.facing;
    let dx = 0;
    let dy = 0;
    let angle = 0;
    let tint: number | null = null;
    let timeScale = 1;
    let squash = 1;

    switch (snap.pose) {
      case "idle":
        timeScale = 0.45;
        dy = Math.sin(tick / 6 + view.side) * 1.2;
        break;
      case "walk":
        timeScale = 1.3;
        break;
      case "windup":
        dx = -5 * facing;
        tint = 0xfff0c8;
        timeScale = 0.2;
        squash = 0.92;
        break;
      case "strike":
        dx = 12 * facing;
        squash = 1.12;
        timeScale = 2;
        break;
      case "recover":
        dx = 4 * facing;
        timeScale = 0.6;
        break;
      case "hitstun":
        dx = -3 * facing + (Math.floor(tick) % 2 === 0 ? 2 : -2);
        tint = Math.floor(tick / 2) % 2 === 0 ? 0xff4a4a : 0xffffff;
        timeScale = 0;
        break;
      case "block":
        dx = -2 * facing;
        tint = 0x9fb8ff;
        timeScale = 0;
        squash = 0.9;
        break;
      case "ko":
        angle = -80 * facing;
        tint = 0x8a7f99;
        timeScale = 0;
        break;
    }
    if (snap.burning && Math.floor(tick / 4) % 2 === 0 && tint === null) tint = 0xffb070;

    const scale = monster.sprite.scale;
    sprite.setFlipX(facing < 0);
    sprite.setPosition(x + dx, GROUND_Y + dy);
    sprite.setScale(scale * squash, scale * (2 - squash));
    sprite.setAngle(angle);
    sprite.anims.timeScale = timeScale;
    if (tint === null) sprite.clearTint();
    else sprite.setTint(tint);
    shadow.setPosition(x, GROUND_Y + 1);

    if (snap.burning && Math.random() < 0.25) {
      this.spark(x + Phaser.Math.Between(-10, 10), GROUND_Y - this.fighterHeight(view) * Math.random(), BURN_COLOR);
    }
  }

  private fighterHeight(view: FighterView) {
    return view.monster.sprite.frameHeight * view.monster.sprite.scale;
  }

  private fighterTop(view: FighterView) {
    return view.sprite.y - this.fighterHeight(view);
  }

  // --- events ------------------------------------------------------------

  private processEvents(events: FightEvent[], tick: number) {
    while (this.eventCursor < events.length && events[this.eventCursor].t <= tick) {
      const event = events[this.eventCursor++];
      if (event.type === "roundEnd") this.roundWins[event.winner] += 1;
      if (tick - event.t > STALE_EVENT_TICKS) continue;
      this.playEvent(event);
    }
  }

  private playEvent(event: FightEvent) {
    switch (event.type) {
      case "roundStart":
        this.flashBanner(`ROUND ${event.round}`, "#ffe9a8", 900, () =>
          this.flashBanner("FIGHT!", "#ff5a3c", 700)
        );
        break;
      case "roundEnd":
        this.flashBanner(event.reason === "ko" ? "K.O.!" : "TIME!", "#ff3b3b", 1800);
        if (event.reason === "ko") this.cameras.main.shake(260, 0.012);
        break;
      case "attack": {
        const view = this.fighters[event.f];
        const move = this.findMove(view.monster, event.move);
        this.floatText(view.sprite.x, this.fighterTop(view) - 6, move?.name ?? "", "#e9dcff", 10, 0.75);
        break;
      }
      case "special": {
        const view = this.fighters[event.f];
        const move = this.findMove(view.monster, event.move);
        const color = Phaser.Display.Color.IntegerToColor(SIDE_COLOR_NUMBERS[event.f]);
        this.cameras.main.flash(180, color.red, color.green, color.blue);
        this.flashBanner(`${move?.name.toUpperCase() ?? "SPECIAL"}!`, "#ffd23f", 1100, undefined, 30);
        break;
      }
      case "hit":
        this.playHit(event);
        break;
      case "dodge": {
        const view = this.fighters[event.f];
        this.floatText(view.sprite.x, this.fighterTop(view) - 4, "DODGE", "#9ff5ff", 12);
        this.afterimage(view);
        break;
      }
      case "projectile":
        this.spawnProjectile(event);
        break;
      case "projectileEnd": {
        const projectile = this.projectiles.get(event.id);
        if (!projectile) break;
        this.projectiles.delete(event.id);
        if (event.hit) {
          this.burst(projectile.orb.x, projectile.orb.y, "mb-shine", 6);
          this.destroyProjectile(projectile);
        } else {
          this.tweens.add({
            targets: [projectile.orb, projectile.glow],
            alpha: 0,
            x: `+=${projectile.dir * 40}`,
            duration: 300,
            onComplete: () => this.destroyProjectile(projectile),
          });
        }
        break;
      }
      default:
        break;
    }
  }

  private playHit(event: Extract<FightEvent, { type: "hit" }>) {
    const defender = this.fighters[1 - event.f];
    const x = defender.sprite.x;
    const y = defender.sprite.y - this.fighterHeight(defender) * 0.6;

    if (event.blocked) {
      this.floatText(x, y - 10, `BLOCK -${event.damage}`, "#b9c6ff", 11);
      this.burst(x - 8 * (defender.sprite.flipX ? -1 : 1), y, "mb-shine", 5);
      return;
    }

    const isSpecial = this.fighters[event.f].monster.special.id === event.move;
    this.floatText(
      x,
      y - 10,
      event.crit ? `CRIT -${event.damage}` : `-${event.damage}`,
      event.crit ? "#ffd23f" : "#ffffff",
      event.crit ? 16 : 13
    );
    if (event.tanked) this.floatText(x, y + 8, "TANKED", "#c4b5a0", 9);
    this.burst(x, y, "mb-blood", event.crit || isSpecial ? 12 : 6);
    if (isSpecial) this.cameras.main.shake(220, 0.014);
    else if (event.crit) this.cameras.main.shake(120, 0.006);
  }

  private findMove(monster: Monster, moveId: string) {
    if (monster.special.id === moveId) return monster.special;
    return monster.moves.find((move) => move.id === moveId);
  }

  // --- projectiles -------------------------------------------------------

  private spawnProjectile(event: Extract<FightEvent, { type: "projectile" }>) {
    const owner = this.fighters[event.f];
    const move = this.findMove(owner.monster, event.move);
    const color = move?.effects?.burn ? BURN_COLOR : SIDE_COLOR_NUMBERS[event.f];
    const y = GROUND_Y - Math.min(this.fighterHeight(owner) * 0.55, 60);
    const glow = this.add.circle(event.x, y, 9, color, 0.35).setDepth(20);
    const orb = this.add.circle(event.x, y, 4, 0xffffff, 1).setStrokeStyle(2, color).setDepth(21);
    this.projectiles.set(event.id, { orb, glow, t0: event.t, x0: event.x, dir: event.dir, speed: event.speed });
  }

  private updateProjectiles(tick: number) {
    this.projectiles.forEach((projectile) => {
      const x = projectile.x0 + projectile.dir * projectile.speed * (tick - projectile.t0);
      projectile.orb.x = x;
      projectile.glow.x = x;
      projectile.glow.setScale(1 + Math.sin(tick) * 0.15);
    });
  }

  private destroyProjectile(projectile: ProjectileView) {
    projectile.orb.destroy();
    projectile.glow.destroy();
  }

  // --- effects -----------------------------------------------------------

  private floatText(x: number, y: number, text: string, color: string, size: number, alpha = 1) {
    if (!text) return;
    const label = this.add
      .text(x, y, text, {
        fontFamily: UI_FONT,
        fontSize: `${size}px`,
        fontStyle: "bold",
        color,
        stroke: "#12051c",
        strokeThickness: 3,
        resolution: 2,
      })
      .setOrigin(0.5, 1)
      .setAlpha(alpha)
      .setDepth(40);
    this.tweens.add({
      targets: label,
      y: y - 22,
      alpha: 0,
      duration: 800,
      ease: "Cubic.easeOut",
      onComplete: () => label.destroy(),
    });
  }

  private burst(x: number, y: number, texture: string, count: number) {
    for (let i = 0; i < count; i++) {
      const particle = this.add.image(x, y, texture).setDepth(30).setScale(Phaser.Math.FloatBetween(0.6, 1.3));
      this.tweens.add({
        targets: particle,
        x: x + Phaser.Math.Between(-28, 28),
        y: y + Phaser.Math.Between(-26, 18),
        alpha: 0,
        duration: Phaser.Math.Between(300, 550),
        onComplete: () => particle.destroy(),
      });
    }
  }

  private spark(x: number, y: number, color: number) {
    const dot = this.add.rectangle(x, y, 2, 2, color).setDepth(25);
    this.tweens.add({
      targets: dot,
      y: y - 14,
      alpha: 0,
      duration: 450,
      onComplete: () => dot.destroy(),
    });
  }

  private afterimage(view: FighterView) {
    const ghost = this.add
      .sprite(view.sprite.x, view.sprite.y, view.sprite.texture.key, view.sprite.frame.name)
      .setOrigin(0.5, 1)
      .setScale(view.sprite.scaleX, view.sprite.scaleY)
      .setFlipX(view.sprite.flipX)
      .setTint(0x9ff5ff)
      .setAlpha(0.5)
      .setDepth(8);
    this.tweens.add({
      targets: ghost,
      x: ghost.x - 16 * (view.sprite.flipX ? -1 : 1),
      alpha: 0,
      duration: 350,
      onComplete: () => ghost.destroy(),
    });
  }

  // --- banners -----------------------------------------------------------

  private flashBanner(text: string, color: string, durationMs: number, then?: () => void, size = 46) {
    this.bannerTimer?.remove(false);
    this.overlay.setVisible(false);
    this.subBanner.setText("");
    this.banner.setText(text).setColor(color).setFontSize(size).setScale(1.4).setAlpha(1);
    this.tweens.add({ targets: this.banner, scale: 1, duration: 180, ease: "Back.easeOut" });
    this.bannerTimer = this.time.delayedCall(durationMs, () => {
      this.bannerTimer = null;
      this.banner.setText("");
      then?.();
    });
  }

  private showStatic(text: string, sub: string) {
    this.bannerTimer?.remove(false);
    this.bannerTimer = null;
    this.overlay.setVisible(true);
    this.banner.setText(text).setColor("#ffffff").setFontSize(38).setScale(1).setAlpha(1);
    this.subBanner.setText(sub).setY(ARENA_VIEW_HEIGHT / 2 + (text.includes("\n") ? 70 : 26));
  }

  private clearBanner() {
    this.overlay.setVisible(false);
    this.banner.setText("");
    this.subBanner.setText("");
  }

  // --- HUD ---------------------------------------------------------------

  private renderHud(frame: FightFrame) {
    const g = this.hud;
    const now = this.time.now;
    g.clear();

    this.fighters.forEach((view) => {
      const snap = frame.fighters[view.side];
      const maxHp = view.monster.stats.maxHp;
      if (snap.hp < view.displayHp) view.trailHoldUntil = now + 450;
      view.displayHp = snap.hp;
      if (view.trailHp < snap.hp) view.trailHp = snap.hp;
      else if (now > view.trailHoldUntil) view.trailHp = Math.max(snap.hp, view.trailHp - maxHp * 0.012);

      const { y, width, height, inset } = HEALTH_BAR;
      const x = view.side === 0 ? inset : ARENA_VIEW_WIDTH - inset - width;
      const fill = (hp: number) => Math.max(0, Math.min(1, hp / maxHp)) * width;
      // Bars drain toward the outer edge, fighting-game style.
      const place = (w: number) => (view.side === 0 ? x : x + width - w);

      g.fillStyle(0x12051c, 0.9).fillRect(x - 2, y - 2, width + 4, height + 4);
      g.fillStyle(0x3a1020, 1).fillRect(x, y, width, height);
      g.fillStyle(0xffffff, 0.85).fillRect(place(fill(view.trailHp)), y, fill(view.trailHp), height);
      const hpColor = snap.hp / maxHp > 0.25 ? SIDE_COLOR_NUMBERS[view.side] : 0xff2d2d;
      g.fillStyle(hpColor, 1).fillRect(place(fill(snap.hp)), y, fill(snap.hp), height);
      g.fillStyle(0xffffff, 0.18).fillRect(x, y, width, 3);

      // Round win pips sit under the bar, next to the timer. Names live in the
      // matchup card above the arena, where they stay readable on phones.
      for (let pip = 0; pip < 2; pip++) {
        const px = view.side === 0 ? x + width - 8 - pip * 14 : x + 8 + pip * 14;
        const won = this.roundWins[view.side] > pip;
        g.fillStyle(won ? 0xffd23f : 0x2a1638, 1).fillCircle(px, y + height + 10, 4);
        g.lineStyle(1, 0xffd23f, 0.8).strokeCircle(px, y + height + 10, 4);
      }

      const meter = METER_BAR;
      const mx = view.side === 0 ? meter.inset : ARENA_VIEW_WIDTH - meter.inset - meter.width;
      const mw = (snap.meter / 100) * meter.width;
      const full = snap.meter >= 100;
      g.fillStyle(0x12051c, 0.9).fillRect(mx - 1, meter.y - 1, meter.width + 2, meter.height + 2);
      g.fillStyle(full && Math.floor(now / 150) % 2 === 0 ? 0xffffff : 0xffd23f, 1).fillRect(
        view.side === 0 ? mx : mx + meter.width - mw,
        meter.y,
        mw,
        meter.height
      );
    });

    const secondsLeft = Math.max(0, Math.ceil((ROUND_TICKS - frame.roundTick) / TICK_RATE));
    this.timerText.setText(String(secondsLeft));
  }
}
