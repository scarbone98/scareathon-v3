import Phaser from 'phaser'

export default class Game extends Phaser.Scene {

    constructor() {
        super('game');
        //time score
        this.timecount = 0;
        this.startTime = 0;
        this.currentTime = 0;
        this.beginning = true;

        //level
        this.level = 1;
        this.difficulty = 1000000;
        this.EnemySpawnAmount = 2;

        //enemy chance of appearing
        this.general_Probability = 1;
        this.zombie_Probability = this.general_Probability;
        this.werewolf_Probability = this.general_Probability / 10;
        this.skull_Probability = this.general_Probability / 7;
        this.shadowbeast_Probability = this.general_Probability / 12;
        this.rat_Probability = this.general_Probability / 3;
        this.pumpkin_Probability = this.general_Probability / 5;
        this.ufo_Probability = this.general_Probability / 750;
        this.ghost_Probability = this.general_Probability / 4;
        this.swampthing_Probability = this.general_Probability / 12;
        this.scarecrow_Probability = this.general_Probability / 7;
        this.imp_Probability = this.general_Probability / 20;
        this.candle_Probability = this.general_Probability / 8;

        //collecatble chance of appearing
        this.candycorn_prob = 0.05;
        this.bubblegum_prob = 0.025;
        this.chocolatebar_prob = 0.020;
    }

    destroySprite(sprite) {
        sprite.destroy();
    }

    spawnCollecatble(sprite, animation, imageScale, enemyHealth, value) {
        const { height, width } = this.cameras.main;

        var spawnX = Phaser.Math.Between(40, width - 40);
        var spawnY = Phaser.Math.Between(40, height - 40);

        var collectable = this.physics.add.sprite(spawnX, spawnY, sprite);
        collectable.setScale(imageScale, imageScale);
        collectable.play(animation);
        collectable.setDepth(spawnY)

        collectable.setInteractive({ cursor: 'url(assets/cursor2.cur), pointer' });

        var health = enemyHealth;
        this.collectables.push({ collectable, health, imageScale, value });
    }

    spawnEnemy(sprite, animation, imageScale, enemySpeed, enemyHealth, enemyValue) {
        const { height, width } = this.cameras.main;

        var spawnX = 0;
        var spawnY = 0;
        var offset = 30;

        var side = Math.random();
        if (side < 0.25) {
            //top
            spawnX = Phaser.Math.Between(0, width);
            spawnY = 0 - offset;
        }
        else if (side < 0.5) {
            //right
            spawnX = width + offset;
            spawnY = Phaser.Math.Between(0, height);
        }
        else if (side < 0.75) {
            //bottom
            spawnX = Phaser.Math.Between(0, width);
            spawnY = height + offset;
        }
        else {
            //left
            spawnX = 0 - offset;
            spawnY = Phaser.Math.Between(0, height);
        }

        //if (spawnX > 0 && spawnX < width && spawnY > 0 && spawnY < height) return;

        const centerX = width / 2;
        const centerY = height / 2;

        var frame = Phaser.Math.Between(1, 6);
        var enemy = this.physics.add.sprite(spawnX, spawnY, sprite, frame);
        enemy.setScale(imageScale, imageScale);
        enemy.play(animation);
        enemy.setOrigin(0.5, 1)

        enemy.setInteractive({ cursor: 'url(assets/cursor2.cur), pointer' });

        var health = enemyHealth;
        var speed = Phaser.Math.Between(enemySpeed - 20, enemySpeed);
        this.physics.moveTo(enemy, centerX, centerY, speed);
        this.physics.add.collider(this.player, enemy);
        var follow = 0;
        this.enemies.push({ enemy, follow, speed, health, imageScale, enemyValue });
    }

    loadAnims() {
        this.anims.create({
            key: 'alexScared',
            frames: this.anims.generateFrameNumbers('alex', { end: 7 }),
            frameRate: 18,
            repeat: -1
        });

        //enemy animations
        this.anims.create({
            key: 'walk',
            frames: this.anims.generateFrameNumbers('zombie-1', { end: 7 }),
            frameRate: 12,
            repeat: -1
        });
        this.anims.create({
            key: 'skullWalk',
            frames: this.anims.generateFrameNumbers('eyeball-sprite', { end: 6 }),
            frameRate: 12,
            repeat: -1
        });
        this.anims.create({
            key: 'werewolfWalk',
            frames: this.anims.generateFrameNumbers('werewolf-sprite', { end: 7 }),
            frameRate: 12,
            repeat: -1
        });
        this.anims.create({
            key: 'shadowbeastwalk',
            frames: this.anims.generateFrameNumbers('shadowbeast-sprite', { end: 6 }),
            frameRate: 12,
            repeat: -1
        });
        this.anims.create({
            key: 'ratwalk',
            frames: this.anims.generateFrameNumbers('rat-sprite', { end: 6 }),
            frameRate: 12,
            repeat: -1
        });
        this.anims.create({
            key: 'ghostwalk',
            frames: this.anims.generateFrameNumbers('ghost-sprite', { end: 6 }),
            frameRate: 12,
            repeat: -1
        });
        this.anims.create({
            key: 'pumpkinwalk',
            frames: this.anims.generateFrameNumbers('pumpkin-sprite', { end: 6 }),
            frameRate: 12,
            repeat: -1
        });
        this.anims.create({
            key: 'ufowalk',
            frames: this.anims.generateFrameNumbers('ufo-sprite', { end: 6 }),
            frameRate: 12,
            repeat: -1
        });
        this.anims.create({
            key: 'swampthingwalk',
            frames: this.anims.generateFrameNumbers('swampthing-sprite', { end: 6 }),
            frameRate: 6,
            repeat: -1
        });
        this.anims.create({
            key: 'scarecrowwalk',
            frames: this.anims.generateFrameNumbers('scarecrow-sprite', { end: 6 }),
            frameRate: 12,
            repeat: -1
        });
        this.anims.create({
            key: 'impwalk',
            frames: this.anims.generateFrameNumbers('imp-sprite', { end: 4 }),
            frameRate: 12,
            repeat: -1
        });
        this.anims.create({
            key: 'candlewalk',
            frames: this.anims.generateFrameNumbers('candle-sprite', { end: 6 }),
            frameRate: 12,
            repeat: -1
        });

        // Other Animations
        this.anims.create({
            key: 'float_candycorn',
            frames: this.anims.generateFrameNumbers('candycorn-sprite', { end: 6 }),
            frameRate: 12,
            repeat: -1
        });

        this.anims.create({
            key: 'float_bubblegum',
            frames: this.anims.generateFrameNumbers('bubblegum-sprite', { end: 6 }),
            frameRate: 12,
            repeat: -1
        });

        this.anims.create({
            key: 'float_chocolatebar',
            frames: this.anims.generateFrameNumbers('chocolatebar-sprite', { end: 5 }),
            frameRate: 12,
            repeat: -1
        });
    }

    init() {
        const { height, width } = this.cameras.main;

        this.physics.world.setFPS(60)

        //set bg
        var bg = this.add.image(512, 256, 'background');
        bg.setOrigin(0, 0);
        bg.x = 0;
        bg.y = 0;
        bg.setScale(2, 2);

        //set bg frame
        var bgFrame = this.add.image(512, 256, 'framebg');
        bgFrame.setOrigin(0, 0);
        bgFrame.x = 0;
        bgFrame.y = 0;
        bgFrame.setScale(2, 2);
        bgFrame.setDepth(height + 200);


        //set anims
        this.loadAnims();

        //set score
        const style = { font: "bold 32px maneater", fill: "#fff" };
        this.score = 0;
        this.scoreText = this.add.text(30, height - 65, `Score: ${this.score}`, style);
        this.scoreText.setDepth(height + 500);
    }

    createPlayer() {
        const screenCenterX = this.cameras.main.worldView.x + this.cameras.main.width / 2;
        const screenCenterY = this.cameras.main.worldView.y + this.cameras.main.height / 2;

        this.player = this.physics.add.sprite(screenCenterX, screenCenterY, 'alex');
        this.player.setImmovable(true);
        this.player.setScale(3, 3);
        this.player.setDepth(screenCenterY);
        this.player.play("alexScared");
        this.player.body.setSize(2, 2)
    }


    createInitialZombies() {
        for (let i = 0; i < 10; i++) {
            this.spawnEnemy('zombie-1', 'walk', 3, 50, 1, 10);
        }

        this.enemies.forEach(enemy => {
            enemy.follow = Phaser.Math.Between(0, this.enemies.length - 1);
        });

    }

    particleBurst(pointer) {
        this.emitter.setPosition(pointer.x, pointer.y);
        this.emitter.explode(50); // Emit 50 particles at once
        this.time.delayedCall(150, () => this.emitter.stop());
    }

    candyBurst(pointer) {
        this.candyEmitter.setPosition(pointer.x, pointer.y);
        this.candyEmitter.explode(50); // Emit 50 particles at once
        this.time.delayedCall(150, () => this.candyEmitter.stop());
    }


    create() {

        //partciles
        this.particles = this.add.particles('blood');
        this.particles.setDepth(5000)
        this.emitter = this.add.particles(0, 0, 'blood', {
            speed: 250,
            lifespan: 200,
            gravityY: 1000,
            depth: 5000
        });
        this.emitter.stop();

        this.candyEmitter = this.add.particles(0, 0, 'shine', {
            speed: 250,
            lifespan: 200,
            depth: 5000
        });
        this.candyEmitter.stop();

        // create player
        this.createPlayer();

        //set cursor
        this.input.setDefaultCursor('url(assets/cursor.cur), pointer');

        //create arrays
        this.enemies = [];
        this.collectables = [];

        // Check to see if player clicked on zombie if so update the score and remove from zombie array
        this.input.on('gameobjectdown', (pointer, gameObject) => {

            //click on enemy
            var index = -1;
            var value = 0;
            var enHeatlh = 0;
            this.enemies.forEach((obj, i) => {
                if (obj.enemy == gameObject) {
                    index = i;
                    value = obj.enemyValue;
                    enHeatlh = obj.health - 1;
                    obj.health = enHeatlh;
                    this.particleBurst(pointer)
                }
            });
            if (index != -1 && enHeatlh < 1) {
                this.enemies.splice(index, 1);
                this.score += value;
                this.scoreText.setText("Score: " + this.score);
                gameObject.destroy();
                return;
            }

            //click on collectable
            var index = -1;
            var val = 0;
            var currentHealth = 0;
            this.collectables.forEach((obj, i) => {
                if (obj.collectable == gameObject) {
                    index = i;
                    val = obj.value;
                    currentHealth = obj.health - 1;
                    obj.health = currentHealth;
                    this.candyBurst(pointer)
                }
            });
            if (index != -1 && currentHealth < 1) {
                this.collectables.splice(index, 1);
                this.score += val;
                this.scoreText.setText("Score: " + this.score);
                gameObject.destroy();
                return;
            }
        });

        // create first zombie wave
        this.createInitialZombies();

    }

    spawnEnemies() {
        //Spawn enemies
        if (Math.random() <= (this.zombie_Probability / this.level)) {
            this.spawnEnemy('zombie-1', 'walk', 3, 40, 1, 10);
        }
        if (Math.random() <= (this.rat_Probability / this.level)) {
            this.spawnEnemy('rat-sprite', 'ratwalk', 3, 40, 1, 5);
        }
        if (Math.random() <= (this.ufo_Probability)) {
            this.spawnEnemy('ufo-sprite', 'ufowalk', 3, 40, 5, 400);
        }

        //level 1
        if (this.score > 500) {
            this.level = 2;

            if (Math.random() <= (this.ghost_Probability + (this.score / this.difficulty)) / (this.level - 1)) {
                this.spawnEnemy('ghost-sprite', 'ghostwalk', 3, 55, 1, 15);
            }
            if (Math.random() <= (this.pumpkin_Probability + (this.score / this.difficulty)) / (this.level - 1)) {
                this.spawnEnemy('pumpkin-sprite', 'pumpkinwalk', 3, 75, 1, 20);
            }
        }

        //level 2
        if (this.score > 1500) {
            this.level = 3;

            if (Math.random() <= (this.werewolf_Probability + (this.score / this.difficulty) / (this.level - 2))) {
                this.spawnEnemy('werewolf-sprite', 'werewolfWalk', 3.5, 100, 1, 20);
            }
            if (Math.random() <= (this.scarecrow_Probability + (this.score / this.difficulty) / (this.level - 2))) {
                this.spawnEnemy('scarecrow-sprite', 'scarecrowwalk', 2.5, 60, 2, 100);
            }
        }

        //level 3
        if (this.score > 3000) {
            this.level = 4;

            if (Math.random() <= (this.shadowbeast_Probability + (this.score / this.difficulty) / (this.level - 3))) {
                this.spawnEnemy('shadowbeast-sprite', 'shadowbeastwalk', 3.5, 35, 3, 50);
            }
            if (Math.random() <= (this.candle_Probability + (this.score / this.difficulty) / (this.level - 3))) {
                this.spawnEnemy('candle-sprite', 'candlewalk', 2, 40, 2, 30);
            }
        }

        //level 4
        if (this.score > 5000) {
            this.level = 5;

            if (Math.random() <= (this.skull_Probability + (this.score / this.difficulty) / (this.level - 4))) {
                this.spawnEnemy('eyeball-sprite', 'skullWalk', 2.5, 90, 1, 25);
            }
            if (Math.random() <= (this.swampthing_Probability + (this.score / this.difficulty) / (this.level - 4))) {
                this.spawnEnemy('swampthing-sprite', 'swampthingwalk', 2.5, 30, 5, 100);
            }

        }

        //level 5
        if (this.score > 7000) {
            this.level = 6;
            if (Math.random() <= (this.imp_Probability + (this.score / this.difficulty) / (this.level - 5))) {
                this.spawnEnemy('imp-sprite', 'impwalk', 2.5, 110, 1, 30);
            }
        }
    }

    update(time, delta) {

        this.timecount += delta;

        while (this.timecount > 1000) {
            this.timecount -= 1000;

            this.score += 1;
            this.scoreText.setText("Score: " + this.score);

            if (this.enemies.length < 150) {
                for (var i = 0; i < this.EnemySpawnAmount; i++) {
                    this.spawnEnemies();
                }
            }

            //Spawn collectables
            if (this.collectables.length < 5) {
                if (Math.random() <= this.candycorn_prob) {
                    this.spawnCollecatble('candycorn-sprite', 'float_candycorn', 2, 1, 50)
                }
                if (Math.random() <= this.bubblegum_prob) {
                    this.spawnCollecatble('bubblegum-sprite', 'float_bubblegum', 2, 2, 100)
                }
                if (Math.random() <= this.chocolatebar_prob) {
                    this.spawnCollecatble('chocolatebar-sprite', 'float_chocolatebar', 2, 5, 250)
                }
            }
        }

        this.enemies.forEach(({ enemy, follow, speed, health, imageScale }) => {

            //this.physics.world.wrap(zombie);
            if (enemy === null) return;
            if (enemy.body.velocity.x < 0) {
                enemy.flipX = true;
            } else {
                enemy.flipX = false;
            }

            enemy.setDepth(enemy.y);

            // BLACK MAGIC DO NOT TOUCH
            if (!enemy.body.touching.none) {
                window.customFunctions.triggerLeaderBoardModal(this.score, () => this.scene.start('game'));
                this.scene.stop();
            }

            //this.physics.moveTo(zombie, this.zombies[follow]["zombie"].x, this.zombies[follow]["zombie"].y, zomspeed)
            //this.physics.moveTo(zombie, this.input.mousePointer.x, this.input.mousePointer.y, Phaser.Math.Between(50,100))
        });

    }

}