import * as Phaser from 'phaser';
import { connectBridge } from './bridge.js';
import { WIDTH, HEIGHT } from './config.js';
import { LobbyScene } from './scenes/LobbyScene.js';
import { BattleScene } from './scenes/BattleScene.js';
import { HudScene } from './scenes/HudScene.js';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  backgroundColor: '#1d1f27',
  // Fixed 16:9 canvas scaled to fit the window, so it looks the same in the Meet screen share.
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: WIDTH, height: HEIGHT },
  // Lobby starts first; the HUD runs on top of every scene.
  scene: [LobbyScene, BattleScene, HudScene],
});

connectBridge(game);
window.game = game;   // for poking at state from the dev console
