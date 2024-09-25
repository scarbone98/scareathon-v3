import Phaser from 'phaser';

export class UIManager {
  private uiContainer: Phaser.GameObjects.Container;
  private goldText!: Phaser.GameObjects.Text;
  private gold: number = 0;

  constructor(scene: Phaser.Scene) {
    this.uiContainer = scene.add.container(0, 0);
    this.uiContainer.setScrollFactor(0);

    this.createTitle(scene);
    this.createGoldCounter(scene);
    this.createSpawnButton(scene);
  }

  private createTitle(scene: Phaser.Scene) {
    this.uiContainer.add(
      scene.add.text(400, 50, 'Age of Ween', { fontSize: '32px', color: '#ff8800' }).setOrigin(0.5)
    );
  }

  private createGoldCounter(scene: Phaser.Scene) {
    this.goldText = scene.add.text(10, 10, 'Gold: 0', { fontSize: '24px', color: '#FFD700' });
    this.uiContainer.add(this.goldText);
  }

  private createSpawnButton(scene: Phaser.Scene) {
    const spawnButton = scene.add
      .text(50, 100, 'Spawn Friendly Minion', { fontSize: '20px', color: '#ffffff' })
      .setInteractive()
      .on('pointerdown', () => this.onSpawnButtonClick());
    this.uiContainer.add(spawnButton);
  }

  private onSpawnButtonClick() {
    if (this.gold >= 50) {
      this.gold -= 50;
      this.updateGoldText();
      return true;
    }
    return false;
  }

  public updateGold(amount: number) {
    this.gold += amount;
    this.updateGoldText();
  }

  private updateGoldText() {
    this.goldText.setText(`Gold: ${this.gold}`);
  }

  public getGold(): number {
    return this.gold;
  }
}