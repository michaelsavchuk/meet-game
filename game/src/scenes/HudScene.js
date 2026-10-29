import * as Phaser from 'phaser';
import { isConnected } from '../bridge.js';
import { WIDTH, HEIGHT } from '../config.js';

// Always-on overlay above the other scenes: server connection status and dev key hints.
export class HudScene extends Phaser.Scene {
  constructor() {
    super({ key: 'hud', active: true });
  }

  create() {
    this.status = this.add.text(WIDTH - 20, 20, '', { fontSize: '16px' }).setOrigin(1, 0);
    this.add.text(WIDTH - 12, HEIGHT - 6, 'dev: C fake chat/attack · X fake non-word chat · R fake reaction', { fontSize: '12px', color: '#5c6070' }).setOrigin(1, 1);
    this.setStatus(isConnected());

    this.game.events.on('bridge-status', this.setStatus, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.game.events.off('bridge-status', this.setStatus, this));
  }

  setStatus(connected) {
    this.status.setText(connected ? '● connected' : '○ disconnected').setColor(connected ? '#6c6' : '#c66');
  }
}
