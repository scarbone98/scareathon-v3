import Phaser from 'phaser';

export class Minion extends Phaser.Physics.Arcade.Sprite {
  private health: number = 100;

  constructor(scene: Phaser.Scene, x: number, y: number, texture: string, isFriendly: boolean) {
    super(scene, x, y, texture);
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setScale(0.1);
    this.setCollideWorldBounds(true);
    this.setData('health', this.health);
    this.setData('isFriendly', isFriendly);
  }

  public takeDamage(amount: number) {
    this.health = Math.max(0, this.health - amount);
    this.setData('health', this.health);
    return this.health <= 0;
  }

  public move() {
    const isFriendly = this.getData('isFriendly');
    if (isFriendly) {
      if (!this.body?.touching.right) {
        this.setVelocityX(50);
      } else {
        this.setVelocityX(0);
      }
    } else {
      if (!this.body?.touching.left) {
        this.setVelocityX(-100);
      } else {
        this.setVelocityX(0);
      }
    }
  }
}