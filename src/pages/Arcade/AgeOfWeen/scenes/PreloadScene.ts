import Phaser from "phaser";

export default class PreloadScene extends Phaser.Scene {
  constructor() {
    super("PreloadScene");
  }

  preload() {
    // Load assets here
    this.load.image("background", "/ageofween/background.webp");
    this.load.image("player_base", "/ageofween/player_base.webp");
    this.load.image("enemy_base", "/ageofween/enemy_base.webp");
    this.load.image("player_character", "/ageofween/player.webp");
    this.load.image("enemy_character", "/ageofween/enemy.webp");
    this.load.image("friendly_minion", "/ageofween/friendly_minion.webp");
    this.load.image("enemy_minion", "/ageofween/enemy_minion.webp");
  }

  create() {
    this.scene.start("MainScene");
  }
}
