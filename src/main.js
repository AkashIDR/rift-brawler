import Phaser from 'phaser';
import BootScene from './scenes/BootScene.js';
import StartScene from './scenes/StartScene.js';
import ArenaScene from './scenes/ArenaScene.js';
import UIScene from './scenes/UIScene.js';
import GameOverScene from './scenes/GameOverScene.js';

const config = {
  type: Phaser.AUTO,
  width: 1920,
  height: 1080,
  backgroundColor: '#0a0a0f',
  parent: document.body,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: false
    }
  },
  scene: [BootScene, StartScene, ArenaScene, UIScene, GameOverScene]
};

const game = new Phaser.Game(config);

export default game;
