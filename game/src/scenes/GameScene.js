import * as Phaser from 'phaser';
import { simulateChat, simulateReaction } from '../bridge.js';

const LOG_LINES = 12;

// Starter scene: tracks players, shows a chat log, and floats reactions up the screen.
// Replace the on* handlers with real game logic.
export class GameScene extends Phaser.Scene {
  constructor() {
    super('game');
    this.players = new Map();   // name -> { name, chats, reactions }
    this.log = [];
  }

  create() {
    const { width, height } = this.scale;

    this.add.text(width / 2, 40, 'Meet Game', { fontSize: '40px', color: '#ffffff' }).setOrigin(0.5);
    this.statusText = this.add.text(width - 20, 20, '', { fontSize: '16px' }).setOrigin(1, 0);
    this.playersText = this.add.text(20, 20, '', { fontSize: '16px', color: '#aab' });
    this.logText = this.add.text(20, height - 20, '', { fontSize: '20px', color: '#dde', lineSpacing: 6 }).setOrigin(0, 1);
    this.add.text(width - 20, height - 20, 'dev: C = fake chat, R = fake reaction', { fontSize: '14px', color: '#667' }).setOrigin(1, 1);

    this.setStatus(false);
    this.renderPlayers();

    // Listen to the bridge; unsubscribe when the scene shuts down so restarts don't double up.
    const bus = this.game.events;
    bus.on('chat', this.onChat, this);
    bus.on('reaction', this.onReaction, this);
    bus.on('bridge-status', this.setStatus, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      bus.off('chat', this.onChat, this);
      bus.off('reaction', this.onReaction, this);
      bus.off('bridge-status', this.setStatus, this);
    });

    this.input.keyboard.on('keydown-C', () => simulateChat());
    this.input.keyboard.on('keydown-R', () => simulateReaction());
  }

  // ---- Bridge events ----

  onChat(event) {
    this.player(event.player).chats++;
    this.addLog(`${event.player.name}: ${event.text}`);
    this.renderPlayers();
  }

  onReaction(event) {
    this.player(event.player).reactions++;
    this.floatEmoji(event.emoji, event.player.name);
    this.renderPlayers();
  }

  // ---- Helpers ----

  player({ name }) {
    if (!this.players.has(name)) this.players.set(name, { name, chats: 0, reactions: 0 });
    return this.players.get(name);
  }

  setStatus(connected) {
    this.statusText.setText(connected ? '● connected' : '○ disconnected');
    this.statusText.setColor(connected ? '#6c6' : '#c66');
  }

  renderPlayers() {
    const rows = [...this.players.values()].map((p) => `${p.name}  💬${p.chats}  ✨${p.reactions}`);
    this.playersText.setText([`Players: ${this.players.size}`, ...rows]);
  }

  addLog(line) {
    this.log.push(line);
    if (this.log.length > LOG_LINES) this.log.shift();
    this.logText.setText(this.log);
  }

  floatEmoji(emoji, name) {
    const { width, height } = this.scale;
    const x = Phaser.Math.Between(width * 0.3, width * 0.9);
    const label = this.add.container(x, height - 60, [
      this.add.text(0, 0, emoji, { fontSize: '56px' }).setOrigin(0.5),
      this.add.text(0, 44, name, { fontSize: '16px', color: '#ccd' }).setOrigin(0.5),
    ]);
    this.tweens.add({
      targets: label,
      y: height * 0.25,
      alpha: 0,
      duration: 2500,
      ease: 'Sine.easeOut',
      onComplete: () => label.destroy(),
    });
  }
}
