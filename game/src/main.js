import * as Phaser from 'phaser';
import { connectBridge } from './bridge.js';
import { GameScene } from './scenes/GameScene.js';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  backgroundColor: '#1d1f27',
  // Fixed 16:9 canvas scaled to fit the window, so it looks the same in the Meet screen share.
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: 1280, height: 720 },
  scene: [GameScene],
});

connectBridge(game);
