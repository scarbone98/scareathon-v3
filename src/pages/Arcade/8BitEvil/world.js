import Phaser from 'phaser'

// The game was drawn for a 1280x800 field and a mouse. With a mouse it still plays there.
// On a touch screen the field takes the shape of the screen instead (upright or sideways)
// and is cut smaller, so everything on it is drawn bigger and can be hit with a finger.
export const DESKTOP_WORLD = { width: 1280, height: 800 };

// The smallest thing a finger is asked to hit, in field pixels
const MIN_TAP = 72;

export function isTouchDevice() {
    return window.matchMedia('(pointer: coarse)').matches;
}

export function worldSizeFor(container, touch) {
    const boxWidth = container?.clientWidth || window.innerWidth;
    const boxHeight = container?.clientHeight || window.innerHeight;
    if (!touch || !boxWidth || !boxHeight) return DESKTOP_WORLD;

    const boxShort = Math.min(boxWidth, boxHeight);
    const short = Phaser.Math.Clamp(boxShort * 1.25, 480, DESKTOP_WORLD.height);
    const scale = short / boxShort;
    // No longer than the art is wide; a longer screen than that is letterboxed
    return {
        width: Math.min(Math.round(boxWidth * scale), DESKTOP_WORLD.width),
        height: Math.min(Math.round(boxHeight * scale), DESKTOP_WORLD.width),
    };
}

// Takes the shape of the screen as it is now (the phone may have been turned). Call it
// before starting a scene, not during one: a scene lays itself out once.
export function fitWorld(scene) {
    const { width, height } = worldSizeFor(scene.scale.parent, scene.registry.get('touch'));
    if (width !== scene.scale.width || height !== scene.scale.height) {
        scene.scale.setGameSize(width, height);
    }
}

function isDesktopWorld(scene) {
    return scene.scale.width === DESKTOP_WORLD.width && scene.scale.height === DESKTOP_WORLD.height;
}

// Enemies walk in from the edges. On a smaller field they slow down by as much as the
// nearest edge is closer, so the first of them takes as long to arrive as on the big one.
export function speedScale(scene) {
    const offset = 30;
    const { width, height } = scene.scale;
    return (Math.min(width, height) / 2 + offset) / (DESKTOP_WORLD.height / 2 + offset);
}

export function addBackground(scene) {
    const { width, height } = scene.scale;
    const bg = scene.add.image(0, 0, 'background').setOrigin(0, 0).setScale(2, 2);
    // The ground is 1280x800: an upright field taller than that gets it turned on its side
    if (height > DESKTOP_WORLD.height) {
        bg.setOrigin(0.5, 0.5).setPosition(width / 2, height / 2).setAngle(90);
    }
    return bg;
}

// The frame art is one 1280x800 picture: a border all round, the graveyard along the
// bottom and the score box in its left corner. Any other field is framed with strips cut
// from it, each held to its own edge.
export function addFrame(scene, depth) {
    const { width, height } = scene.scale;
    const strip = (x, y, originX, originY, crop) => {
        const image = scene.add.image(x, y, 'framebg').setOrigin(originX, originY).setScale(2, 2).setDepth(depth);
        if (crop) image.setCrop(...crop);
        return image;
    };

    if (isDesktopWorld(scene)) {
        strip(0, 0, 0, 0);
        return;
    }

    const border = 11;
    const graveyardTop = 310;
    // top edge, then the graveyard and score box along the bottom
    strip(0, 0, 0, 0, [0, 0, 640, border]);
    strip(0, height, 0, 1, [0, graveyardTop, 640, 400 - graveyardTop]);
    // sides over where those are cut short: hung from the top and again from the bottom,
    // as an upright field is taller than the art
    // (each stops short of the art's far corners, which would show as a notch mid-side)
    const corner = 20;
    for (const [y, originY, cropY] of [[0, 0, 0], [height, 1, corner]]) {
        strip(0, y, 0, originY, [0, cropY, border, 400 - corner]);
        strip(width, y, 1, originY, [640 - border, cropY, border, 400 - corner]);
    }
}

// Makes a sprite something to click or tap. Under a finger the small ones (rats, imps,
// zombies) get a hit area wider than they're drawn.
export function makeTappable(scene, sprite) {
    const config = { cursor: 'url(assets/cursor2.cur), pointer' };
    if (scene.registry.get('touch')) {
        const padX = Math.max(0, (MIN_TAP / sprite.scaleX - sprite.width) / 2);
        const padY = Math.max(0, (MIN_TAP / sprite.scaleY - sprite.height) / 2);
        config.hitArea = new Phaser.Geom.Rectangle(-padX, -padY, sprite.width + padX * 2, sprite.height + padY * 2);
        config.hitAreaCallback = Phaser.Geom.Rectangle.Contains;
    }
    sprite.setInteractive(config);
}
