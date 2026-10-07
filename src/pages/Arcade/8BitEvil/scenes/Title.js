import Phaser from 'phaser'
import { fitWorld, worldSizeFor } from '../world.js'

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

    init(data) {
        // set after a run, so the title can say how it went
        this.lastScore = data?.score;
    }

    // Where the card, the story and the play button go. With a mouse: as it always was.
    // On a touch screen the field is the shape of the screen, so upright they stack with
    // the story wrapped between card and button, and on a phone held sideways the story
    // goes beside them, as there's no height to stack in.
    layout() {
        const { width, height } = this.scale;
        const card = { width: 291, height: 177 };
        const fontFamily = 'maneater, "Goudy Bookletter 1911", Times, serif';

        if (!this.registry.get('touch')) {
            return {
                card: { x: width / 2, y: card.height / 2, scale: 1 },
                text: { x: width / 2, y: card.height + 210, story: this.introText, style: { fontFamily } },
                button: { x: width / 2, y: height - 110, scale: 5 },
            };
        }

        // centred and wrapped, so the line that was spaced out to the middle is trimmed
        const story = this.introText.split('\n').map(line => line.trim()).join('\n').trim();
        const style = { fontFamily, fontSize: '17px', align: 'center' };
        const margin = 20;
        const buttonScale = 4;
        const buttonHeight = 16 * buttonScale;
        const scoreRoom = this.lastScore === undefined ? 0 : 36;

        if (width > height && height < 700) {
            const left = width * 0.27;
            const column = width * 0.54;
            return {
                card: { x: left, y: margin + card.height / 2, scale: 1 },
                text: {
                    x: column + (width - column) / 2, y: height / 2, story,
                    style: { ...style, wordWrap: { width: width - column - margin * 2 } },
                    room: height - margin * 2,
                },
                button: { x: left, y: height - margin - buttonHeight / 2 - 16, scale: buttonScale },
            };
        }

        // a short screen keeps the card small and gives the room to the story
        const cardScale = Math.min(height < 800 ? 1 : 1.5, (width - margin * 2) / card.width);
        const cardBottom = margin / 2 + card.height * cardScale;
        const buttonY = height - margin - buttonHeight / 2 - 24;
        const storyBottom = buttonY - buttonHeight / 2 - scoreRoom;
        return {
            card: { x: width / 2, y: margin / 2 + card.height * cardScale / 2, scale: cardScale },
            text: {
                x: width / 2, y: (cardBottom + storyBottom) / 2, story,
                style: { ...style, wordWrap: { width: width - margin * 2 } },
                room: storyBottom - cardBottom - margin,
            },
            button: { x: width / 2, y: buttonY, scale: buttonScale },
        };
    }

    // The phone was turned (or the window changed shape) on the title: lay it out again.
    // A run in progress is left alone and takes the new shape when it ends.
    refit() {
        const { width, height } = worldSizeFor(this.scale.parent, this.registry.get('touch'));
        if (width === this.scale.width && height === this.scale.height) return;
        fitWorld(this);
        this.scene.restart({ score: this.lastScore });
    }

    // After a run, the score it ended on, over the play button
    addLastScore(layout) {
        if (this.lastScore === undefined) return null;
        const { x, y, scale } = layout.button;
        const score = this.add.text(x, y - 8 * scale - 20, `Score: ${this.lastScore}`, { font: 'bold 24px maneater', fill: '#fff' });
        score.setOrigin(0.5, 0.5);
        score.alpha = 0;
        return score;
    }

    create() {
        // LOAD ANIMS
        this.loadAnims();

        const layout = this.layout();
        const screenCenterY = this.scale.height / 2;

        this.titleScreen = this.add.sprite(layout.card.x, screenCenterY, 'title-card');
        this.titleScreen.setDepth(this.scale.height);
        this.titleScreen.setScale(layout.card.scale);
        this.titleScreen.play('title-card-shiny');

        this.titleScreen.setOrigin(0.5, 0.5);

        this.tweens.add({
            targets: this.titleScreen,
            y: layout.card.y,
            ease: 'Power1',
            duration: 3000,
            yoyo: false,
            repeat: 0,
            onStart: () => {
                this.time.delayedCall(1500, () => {
                    // START TEXT ANIMATION
                    const text = this.add.text(
                        layout.text.x,
                        layout.text.y,
                        layout.text.story,
                        layout.text.style
                    );
                    text.alpha = 0;
                    this.tweens.add({
                        targets: text,
                        alpha: 1,
                        duration: 1500,
                        ease: 'Power2',
                    });
                    text.setOrigin(0.5, 0.5);
                    // a short screen: the story shrinks to the room it has
                    if (layout.text.room && text.height > layout.text.room) {
                        text.setScale(layout.text.room / text.height);
                    }

                    // PLAY BUTTON ANIMATION
                    this.playButton = this.add.image(
                        layout.button.x,
                        layout.button.y,
                        'play-button-unpressed',
                    );

                    this.playButton.alpha = 0;
                    this.tweens.add({
                        targets: [this.playButton, this.addLastScore(layout)].filter(Boolean),
                        alpha: 1,
                        duration: 1500,
                        ease: 'Power2',
                    });
                    this.playButton.setScale(layout.button.scale, layout.button.scale);
                    this.playButton.setOrigin(0.5, 0.5);
                    this.playButton.setInteractive()
                        .on('pointerdown', () => this.playButton.setTexture('play-button-pressed'))
                        .on('pointerout', () => this.playButton.setTexture('play-button-unpressed'))
                        .on('pointerup',
                            () => {
                                this.playButton.setTexture('play-button-unpressed');
                                fitWorld(this);
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