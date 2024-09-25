import Phaser from "phaser";
import { GameObjects } from "phaser";

export default class MainScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Sprite;
  private enemy!: Phaser.GameObjects.Sprite;
  private playerBase!: Phaser.GameObjects.Sprite;
  private enemyBase!: Phaser.GameObjects.Sprite;
  private gold: number = 0;
  private goldText!: Phaser.GameObjects.Text;
  private lastGoldUpdateTime: number = 0;
  private isLeftClicking: boolean = false;
  private isRightClicking: boolean = false;
  private uiContainer!: Phaser.GameObjects.Container;
  private friendlyMinions: Phaser.Physics.Arcade.Sprite[] = [];
  private enemyMinions: Phaser.Physics.Arcade.Sprite[] = [];
  private playerHealthBar!: Phaser.GameObjects.Graphics;
  private playerHealth: number = 100;

  constructor() {
    super("MainScene");
  }

  create() {
    // Set up camera
    this.cameras.main.setBounds(0, 0, 1600, 600);
    this.cameras.main.setZoom(1);

    // Get the width and height of the game world
    const worldWidth = this.cameras.main.getBounds().width;
    const worldHeight = this.cameras.main.getBounds().height;

    // Set up the repeating background
    this.add
      .tileSprite(0, 0, worldWidth, worldHeight, "background")
      .setOrigin(0, 0)
      .setScrollFactor(1);

    // Create player and enemy bases with adjusted scale and position
    this.playerBase = this.add.sprite(100, 550, "player_base").setScale(0.1);

    this.enemyBase = this.add
      .sprite(worldWidth - 100, 550, "enemy_base")
      .setScale(0.1);

    // Create player and enemy characters with adjusted scale and position
    this.player = this.add.sprite(200, 500, "player_character").setScale(0.1);
    this.enemy = this.add
      .sprite(worldWidth - 200, 500, "enemy_character")
      .setScale(0.1);

    // Create UI container
    this.uiContainer = this.add.container(0, 0);
    this.uiContainer.setScrollFactor(0);

    // Add game title to UI container
    this.uiContainer.add(
      this.add
        .text(400, 50, "Age of Ween", { fontSize: "32px", color: "#ff8800" })
        .setOrigin(0.5)
    );

    // Add gold counter to UI container
    this.goldText = this.add.text(10, 10, "Gold: 0", {
      fontSize: "24px",
      color: "#FFD700",
    });
    this.uiContainer.add(this.goldText);

    // Add buttons for spawning units to UI container
    const spawnButton = this.add
      .text(50, 100, "Spawn Friendly Minion", {
        fontSize: "20px",
        color: "#ffffff",
      })
      .setInteractive()
      .on("pointerdown", () => this.spawnFriendlyMinion());
    this.uiContainer.add(spawnButton);

    // Set up enemy spawning timer
    this.time.addEvent({
      delay: 5000, // 5 seconds
      callback: this.spawnEnemyMinion,
      callbackScope: this,
      loop: true,
    });

    // Enable physics
    this.physics.world.setBounds(
      0,
      0,
      this.cameras.main.getBounds().width,
      600
    );

    // Set up mouse input
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

    // Add more game objects and logic here

    this.createHealthBar();

    // Set up collisions between enemy minions and player base
    this.physics.add.collider(
      this.playerBase,
      this.enemyMinions,
      this
        .handleBaseCollision as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback,
      undefined,
      this
    );
  }

  private createHealthBar() {
    this.playerHealthBar = this.add.graphics();
    this.updateHealthBar();
  }

  private updateHealthBar() {
    this.playerHealthBar.clear();
    this.playerHealthBar.fillStyle(0x2ecc71, 1);
    this.playerHealthBar.fillRect(10, 10, 200 * (this.playerHealth / 100), 20);
  }

  private handleMinionCollision(
    object1: Phaser.GameObjects.GameObject,
    object2: Phaser.GameObjects.GameObject
  ) {
    const enemy = object1 as GameObjects.Sprite;
    const friendly = object2 as GameObjects.Sprite;

    // Reduce enemy health
    const currentHealth = enemy.getData("health") as number;
    enemy.setData("health", Math.max(0, currentHealth - 10));

    if (enemy.getData("health") <= 0) {
      enemy.destroy();
    }
  }

  private handleBaseCollision(
    base: Phaser.GameObjects.GameObject,
    enemy: Phaser.GameObjects.GameObject
  ) {
    const enemySprite = enemy as GameObjects.Sprite;
    debugger;
    // Reduce player base health
    this.playerHealth = Math.max(0, this.playerHealth - 5);
    this.updateHealthBar();

    // Destroy the enemy minion
    enemySprite.destroy();

    if (this.playerHealth <= 0) {
      // Game over logic
      this.scene.restart();
    }
  }

  private spawnUnit() {
    // Placeholder function for spawning units
    console.log("Spawning unit");
    // Implement unit spawning logic here
  }

  private spawnFriendlyMinion() {
    if (this.gold >= 50) {
      const minion = this.physics.add
        .sprite(this.playerBase.x + 50, 500, "friendly_minion")
        .setScale(0.1);
      minion.setCollideWorldBounds(true);
      this.friendlyMinions.push(minion);
      this.gold -= 50;
      this.goldText.setText(`Gold: ${this.gold}`);

      // Set up collisions
      this.physics.add.collider(minion, this.enemyMinions);
    }
  }

  private spawnEnemyMinion() {
    const minion = this.physics.add
      .sprite(this.enemyBase.x - 50, 500, "enemy_minion")
      .setScale(0.1);
    minion.setCollideWorldBounds(true);
    this.enemyMinions.push(minion);

    // Set up collisions
    this.physics.add.collider(minion, this.friendlyMinions);

    // Add collision with player base for each enemy minion
    this.physics.add.collider(
      this.playerBase,
      minion,
      this
        .handleBaseCollision as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback,
      undefined,
      this
    );
  }

  update(time: number, delta: number) {
    // Handle camera movement with mouse clicks
    if (this.isLeftClicking) {
      this.cameras.main.scrollX -= 5;
    } else if (this.isRightClicking) {
      this.cameras.main.scrollX += 5;
    }

    // Update game logic here

    // Move minions if not colliding
    this.friendlyMinions.forEach((minion) => {
      if (!minion.body?.touching.right) {
        minion.setVelocityX(50); // Move right
      } else {
        minion.setVelocityX(0); // Stop if touching something on the right
      }
    });

    this.enemyMinions.forEach((minion) => {
      if (!minion.body?.touching.left) {
        minion.setVelocityX(-100); // Move left
      } else {
        minion.setVelocityX(0); // Stop if touching something on the left
      }
    });

    // Update gold every second
    if (time > this.lastGoldUpdateTime + 1000) {
      this.gold += 1;
      this.goldText.setText(`Gold: ${this.gold}`);
      this.lastGoldUpdateTime = time;
    }

    // Check for collisions between enemies and minions
    this.physics.collide(
      this.enemyMinions,
      this.friendlyMinions,
      this
        .handleMinionCollision as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback,
      undefined,
      this
    );
  }
}
