import Phaser from 'phaser';

export default class Enemy extends Phaser.Physics.Arcade.Sprite {
    constructor(config) {
        super(config.scene, config.x, config.y, config.sprite);
        config.scene.add.existing(this);
        config.scene.physics.add.existing(this);
        this.pointAmount = config.pointAmount || 10;
        this.spawnProbability = config.spawnProbability || 0.30;
        this.speed = Phaser.Math.Between(enemySpeed - 20, enemySpeed)|| 10;
        this.health  = config.health || 1;
        this.setScale(config.scale.x || 2, config.scale.y || 2);
        this.play(config.animation);
        this.setInteractive();
        this.on('pointerdown', this.onClick, this);
    }

    onClick() {
        this.destroy();
    }

    update() {
        if (this.body.velocity.x < 0) {
            this.flipX = true;
        } else {
            this.flipX = false;
        }
        this.setDepth(this.y);
        // GAME OVER MAN
        if (!this.body.touching.none) {
            this.scene.start('leaderboard', { score: this.score });
        }
    }

}