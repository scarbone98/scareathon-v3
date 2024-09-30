import Enemy from './Enemy';

class Werewolf extends Enemy {
    constructor(config) {
        super(config.scene, config.x, config.y, config.sprite);
    }

    onClick() {
        
    }
}