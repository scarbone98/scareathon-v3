import Phaser from 'phaser';

export class Enemy {
  private sprite: Phaser.GameObjects.Sprite;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.sprite = scene.add.sprite(x, y, 'enemy_character').setScale(0.1);
  }
}