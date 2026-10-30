import * as Phaser from 'phaser';
import { isConnected } from '../bridge.js';
import { WIDTH } from '../config.js';

// Always-on overlay above the other scenes. It only shows a warning while the server connection is down;
// everything else for the host is on the control page (control.html).
export class HudScene extends Phaser.Scene {
  constructor() {
    super({ key: 'hud', active: true });
  }

  create() {
    this.status = this.add.text(WIDTH - 20, 20, '○ disconnected', { fontSize: '16px', color: '#c66' }).setOrigin(1, 0);
    this.setStatus(isConnected());

    this.game.events.on('bridge-status', this.setStatus, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.game.events.off('bridge-status', this.setStatus, this));
  }

  setStatus(connected) {
    this.status.setVisible(!connected);
  }
}
