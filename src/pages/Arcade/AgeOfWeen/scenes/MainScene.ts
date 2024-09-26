import Phaser from "phaser";
import { Player } from "../entities/Player";
import { Enemy } from "../entities/Enemy";
import { Minion } from "../entities/Minion";
import { UIManager } from "../ui/UIManager";

export default class MainScene extends Phaser.Scene {
  private player!: Player;
  // @ts-ignore
  private enemy!: Enemy;
  private playerBase!: Phaser.GameObjects.Sprite;
  private enemyBase!: Phaser.GameObjects.Sprite;
  private uiManager!: UIManager;
  private friendlyMinions: Minion[] = [];
  private enemyMinions: Minion[] = [];
  private lastGoldUpdateTime: number = 0;
  private isLeftClicking: boolean = false;
  private isRightClicking: boolean = false;

  constructor() {
    super("MainScene");
  }

  create() {
    this.setupWorld();
    this.createEntities();
    this.setupUI();
    this.setupEnemySpawning();
    this.setupInput();
    this.setupCollisions();
  }

  private setupWorld() {
    const worldWidth = 1600;
    const worldHeight = 600;
    this.cameras.main.setBounds(0, 0, worldWidth, worldHeight);
    this.cameras.main.setZoom(1);
    this.physics.world.setBounds(0, 0, worldWidth, worldHeight);

    this.add
      .tileSprite(0, 0, worldWidth, worldHeight, "background")
      .setOrigin(0, 0)
      .setScrollFactor(1);
  }

  private createEntities() {
    const worldWidth = this.cameras.main.getBounds().width;
    this.playerBase = this.add.sprite(100, 550, "player_base").setScale(0.1);
    this.enemyBase = this.add
      .sprite(worldWidth - 100, 550, "enemy_base")
      .setScale(0.1);
    this.player = new Player(this, 200, 500);
    this.enemy = new Enemy(this, worldWidth - 200, 500);
  }

  private setupUI() {
    this.uiManager = new UIManager(this);
  }

  private setupEnemySpawning() {
    this.time.addEvent({
      delay: 5000,
      callback: this.spawnEnemyMinion,
      callbackScope: this,
      loop: true,
    });
  }

  private setupInput() {
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (pointer.leftButtonDown()) {
        this.isLeftClicking = true;
      } else if (pointer.rightButtonDown()) {
        this.isRightClicking = true;
      }
    });

    this.input.on("pointerup", (pointer: Phaser.Input.Pointer) => {
      if (!pointer.leftButtonDown()) {
        this.isLeftClicking = false;
      }
      if (!pointer.rightButtonDown()) {
        this.isRightClicking = false;
      }
    });
  }

  private setupCollisions() {
    this.physics.add.collider(
      this.playerBase,
      this.enemyMinions,
      this
        .handleBaseCollision as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback,
      undefined,
      this
    );
  }

  public spawnFriendlyMinion() {
    if (this.uiManager.getGold() >= 50) {
      const minion = new Minion(
        this,
        this.playerBase.x + 50,
        500,
        "friendly_minion",
        true
      );
      this.friendlyMinions.push(minion);
      this.uiManager.updateGold(-50);
      this.physics.add.collider(
        minion,
        this.enemyMinions,
        this
          .handleMinionCollision as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback,
        undefined,
        this
      );
    }
  }

  private spawnEnemyMinion() {
    const minion = new Minion(
      this,
      this.enemyBase.x - 50,
      500,
      "enemy_minion",
      false
    );
    this.enemyMinions.push(minion);
    this.physics.add.collider(
      minion,
      this.friendlyMinions,
      this
        .handleMinionCollision as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback,
      undefined,
      this
    );
    this.physics.add.collider(
      this.playerBase,
      minion,
      this
        .handleBaseCollision as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback,
      undefined,
      this
    );
  }

  private handleMinionCollision(
    obj1: Phaser.GameObjects.GameObject,
    obj2: Phaser.GameObjects.GameObject
  ) {
    const minion1 = obj1 as Minion;
    const minion2 = obj2 as Minion;

    const isDead1 = minion1.takeDamage(10);
    const isDead2 = minion2.takeDamage(10);

    if (isDead1) this.removeMinion(minion1);
    if (isDead2) this.removeMinion(minion2);
  }

  private removeMinion(minion: Minion) {
    const index = this.friendlyMinions.indexOf(minion);
    if (index > -1) {
      this.friendlyMinions.splice(index, 1);
    } else {
      const enemyIndex = this.enemyMinions.indexOf(minion);
      if (enemyIndex > -1) {
        this.enemyMinions.splice(enemyIndex, 1);
      }
    }
    minion.destroy();
  }

  private handleBaseCollision(
    _base: Phaser.GameObjects.GameObject,
    enemy: Phaser.GameObjects.GameObject
  ) {
    const enemyMinion = enemy as Minion;
    const isGameOver = this.player.takeDamage(5);
    this.removeMinion(enemyMinion);

    if (isGameOver) {
      this.scene.restart();
    }
  }

  update(time: number, _delta: number) {
    this.handleCameraMovement();
    this.moveMinions();
    this.updateGold(time);
  }

  private handleCameraMovement() {
    if (this.isLeftClicking) {
      this.cameras.main.scrollX -= 5;
    } else if (this.isRightClicking) {
      this.cameras.main.scrollX += 5;
    }
  }

  private moveMinions() {
    [...this.friendlyMinions, ...this.enemyMinions].forEach((minion) =>
      minion.move()
    );
  }

  private updateGold(time: number) {
    if (time > this.lastGoldUpdateTime + 1000) {
      this.uiManager.updateGold(1);
      this.lastGoldUpdateTime = time;
    }
  }
}
