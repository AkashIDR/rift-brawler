import Phaser from 'phaser';

export default class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload() {
    // All art is drawn via Graphics API — nothing to load.
    // Audio will be added in a future pass.
  }

  create() {
    this.scene.start('StartScene');
  }
}
