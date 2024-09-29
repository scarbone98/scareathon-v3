import Phaser from 'phaser';

export default class Preloader extends Phaser.Scene {
	constructor() {
		super('preloader');
	}

	preload() {
		//cursor
		this.load.image('crosshair', '/sprites/crosshair.png');

		//particles
		this.load.image('blood', '/sprites/blood.png');
		this.load.image('shine', '/sprites/shine.png');


		//load title sprites
		this.load.spritesheet('title-card', '/sprites/title.png', { frameWidth: 291, frameHeight: 177 });
		this.load.image('play-button-unpressed', '/sprites/playbutton-unpressed.png');
		this.load.image('play-button-pressed', '/sprites/playbutton-pressed.png');

		//misc
		this.load.image('background', '/sprites/gamebg.png');
		this.load.image('framebg', '/sprites/framebg.png');
		this.load.audio('theme', '/music/scareathon.wav');
		this.load.spritesheet('alex', '/sprites/alex.png', { frameWidth: 16, frameHeight: 36 });

		//load enemy sprites
		this.load.spritesheet('zombie-1', '/sprites/zombiesprite-1.png', { frameWidth: 16, frameHeight: 24 });
		this.load.spritesheet('eyeball-sprite', '/sprites/skullsprite.png', { frameWidth: 24, frameHeight: 18 });
		this.load.spritesheet('werewolf-sprite', '/sprites/werewolfsprite.png', { frameWidth: 30, frameHeight: 26 });
		this.load.spritesheet('shadowbeast-sprite', '/sprites/shadowbeast.png', { frameWidth: 32, frameHeight: 32 });
		this.load.spritesheet('rat-sprite', '/sprites/rat.png', { frameWidth: 16, frameHeight: 16 });
		this.load.spritesheet('pumpkin-sprite', '/sprites/pumpkin.png', { frameWidth: 16, frameHeight: 16 });
		this.load.spritesheet('ghost-sprite', '/sprites/ghost.png', { frameWidth: 16, frameHeight: 32 });
		this.load.spritesheet('swampthing-sprite', '/sprites/swampthing.png', { frameWidth: 34, frameHeight: 58 });
		this.load.spritesheet('ufo-sprite', '/sprites/ufo.png', { frameWidth: 32, frameHeight: 26 });
		this.load.spritesheet('scarecrow-sprite', '/sprites/scarecrow.png', { frameWidth: 24, frameHeight: 48 });
		this.load.spritesheet('imp-sprite', '/sprites/imp.png', { frameWidth: 16, frameHeight: 16 });
		this.load.spritesheet('candle-sprite', '/sprites/candle.png', { frameWidth: 32, frameHeight: 32});

		//load collectable sprites
		this.load.spritesheet('candycorn-sprite', '/sprites/candycornsprite.png', { frameWidth: 24, frameHeight: 24 });
		this.load.spritesheet('bubblegum-sprite', '/sprites/bubblegumsprite.png', { frameWidth: 24, frameHeight: 24 });
		this.load.spritesheet('chocolatebar-sprite', '/sprites/candybarsprite.png', { frameWidth: 24, frameHeight: 24 });
	}

	create() {
		// start music
		const music = this.sound.add('theme', {
			mute: false,
			volume: 0.25,
			rate: 1,
			detune: 0,
			seek: 0,
			loop: true,
			delay: 0
		});

		// IF THE SONG IS NOT MUTED THEN WE WILL PLAY IT
		const songState = localStorage.getItem('8BitEvilSongState');
		if (songState !== 'muted') {
			music.play();
		}

		if (!window.customFunctions) {
			window.customFunctions = {};
		}
		window.customFunctions.musicObject = music;
		this.scene.start('title');
	}
}