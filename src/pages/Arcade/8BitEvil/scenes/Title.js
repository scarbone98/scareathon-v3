import Phaser from 'phaser'

export default class Title extends Phaser.Scene {

    constructor() {
        super('title');
        this.introText = `\n\nYour name is Alex Day.\nYou are a bonified movie lover.\nIn fact, you won Scareathon last year.\n`
        this.introText += `As a reward for your efforts, you got a shining trophy.\n`
        this.introText += `A shining trophy that was definitely delivered on time.\n`
        this.introText += `And not like, say, a year late.\n\n`
        this.introText += `There is a chill in the air.\nIt's that time of year again.\n\n`
        this.introText += `The time for Scareathon approaches...\n\n`
        this.introText += `The stress of being reigning Scareathon Champion is a lot.\nYou need to take your mind off things.\n`
        this.introText += `You decide to go on a stroll through the local Cemetary with your trophy.\n\n`
        this.introText += `The ground quakes.\n`
        this.introText += `You suddenly realize that it's October!\n`
        this.introText += `The most dangerous time to bring out a prized Scareathon trophy!\n\n`
        this.introText += `All around you the macabre forces of Evil assemble!\nThe jealous horde is intent on claiming the trophy for themeselves!\n\n`
        this.introText += `                                   SURVIVE AS LONG AS YOU CAN!\n`

    }

    loadAnims() {
        this.anims.create({
            key: 'title-card-shiny',
            frames: this.anims.generateFrameNumbers('title-card', { end: 20 }),
            frameRate: 12,
            repeat: -1
        });
    }

    create() {
        // LOAD ANIMS
        this.loadAnims();

        const screenCenterX = this.cameras.main.worldView.x + this.cameras.main.width / 2;
        const screenCenterY = this.cameras.main.worldView.y + this.cameras.main.height / 2;

        this.titleScreen = this.add.sprite(screenCenterX, screenCenterY, 'title-card');
        this.titleScreen.setDepth(this.cameras.main.height);
        this.titleScreen.play('title-card-shiny');

        this.titleScreen.setOrigin(0.5, 0.5);

        this.tweens.add({
            targets: this.titleScreen,
            y: this.titleScreen.height / 2,
            ease: 'Power1',
            duration: 3000,
            yoyo: false,
            repeat: 0,
            onStart: () => {
                this.time.delayedCall(1500, () => {
                    // START TEXT ANIMATION
                    const text = this.add.text(
                        screenCenterX,
                        this.titleScreen.height + 210,
                        this.introText,
                        { fontFamily: 'maneater, "Goudy Bookletter 1911", Times, serif' }
                    );
                    text.alpha = 0;
                    this.tweens.add({
                        targets: text,
                        alpha: 1,
                        duration: 1500,
                        ease: 'Power2',
                    });
                    text.setOrigin(0.5, 0.5);

                    // PLAY BUTTON ANIMATION
                    this.playButton = this.add.image(
                        screenCenterX,
                        this.cameras.main.height - 110,
                        'play-button-unpressed',
                    );

                    this.playButton.alpha = 0;
                    this.tweens.add({
                        targets: this.playButton,
                        alpha: 1,
                        duration: 1500,
                        ease: 'Power2',
                    });
                    this.playButton.setScale(5, 5);
                    this.playButton.setOrigin(0.5, 0.5);
                    this.playButton.setInteractive()
                        .on('pointerdown', () => this.playButton.setTexture('play-button-pressed'))
                        .on('pointerout', () => this.playButton.setTexture('play-button-unpressed'))
                        .on('pointerup',
                            () => {
                                this.playButton.setTexture('play-button-unpressed');
                                this.scene.start('game')
                            }
                        );
                });
            },
            onComplete: () => { },
            onYoyo: () => { },
            onRepeat: () => { },
        });

    }

}