import Phaser from 'phaser';

export default class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload() {
    // All boss art is drawn procedurally in code (see Charger.js _buildBody).
    // Audio will be added in a future pass.
  }

  create() {
    this.scene.start('StartScene');
  }
}
