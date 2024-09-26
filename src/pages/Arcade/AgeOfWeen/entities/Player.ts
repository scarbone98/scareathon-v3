import Phaser from 'phaser';

export class Player {
  private sprite: Phaser.GameObjects.Sprite;
  private healthBar!: Phaser.GameObjects.Graphics;
  private health: number = 100;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.sprite = scene.add.sprite(x, y, 'player_character').setScale(0.1);
    this.createHealthBar(scene);
  }

  private createHealthBar(scene: Phaser.Scene) {
    this.healthBar = scene.add.graphics();
    this.updateHealthBar();
  }

  public updateHealthBar() {
    this.healthBar.clear();
    this.healthBar.fillStyle(0x2ecc71, 1);
    this.healthBar.fillRect(10, 10, 200 * (this.health / 100), 20);
  }

  public takeDamage(amount: number) {
    this.health = Math.max(0, this.health - amount);
    this.updateHealthBar();
    return this.health <= 0;
  }

  public getHealth(): number {
    return this.health;
  }

  // Add a method to use the sprite
  public getSprite(): Phaser.GameObjects.Sprite {
    return this.sprite;
  }
}