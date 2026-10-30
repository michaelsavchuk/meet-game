import * as Phaser from 'phaser';
import { listen, simulateChat, simulateReaction, FAKE_NAMES, FAKE_EMOJI } from '../bridge.js';
import { roster } from '../roster.js';
import { Character, separate } from '../objects/Character.js';
import { Button } from '../objects/Button.js';
import { WIDTH, HEIGHT, CHAT_BUBBLE_MS } from '../config.js';

const MIN_PLAYERS = 2;

// Phase 1: anyone who chats joins and gets a random emoji; reacting changes it. The host clicks Start.
export class LobbyScene extends Phaser.Scene {
  constructor() {
    super('lobby');
  }

  preload() {
    if (!this.textures.exists('arena')) this.load.image('arena', '/assets/arena.png');
  }

  create() {
    this.characters = new Map();   // name -> Character
    this.add.image(0, 0, 'arena').setOrigin(0).setDepth(-1000);   // rendered from art/arena.blend

    this.add.text(WIDTH / 2, 48, 'Type anything in chat to join!', { fontSize: '40px', fontStyle: 'bold', color: '#ffffff' }).setOrigin(0.5);
    this.add.text(WIDTH / 2, 96, 'React with any emoji to change your character', { fontSize: '22px', color: '#aab0c8' }).setOrigin(0.5);
    this.countText = this.add.text(40, HEIGHT - 52, '', { fontSize: '22px', color: '#aab0c8' }).setOrigin(0, 0.5);

    this.startButton = new Button(this, WIDTH / 2, HEIGHT - 52, 'Start game ⚔️', () => this.startGame(), { width: 260 }).setDepth(20000);
    this.clearButton = new Button(this, WIDTH - 140, HEIGHT - 52, 'Clear players', () => this.clearPlayers(), { width: 200, height: 46, color: 0x6b6f80 }).setDepth(20000);

    for (const player of roster.all()) this.addCharacter(player);
    this.refresh();

    listen(this, { chat: this.onChat, reaction: this.onReaction });

    this.input.keyboard.on('keydown-ENTER', () => this.startGame());
    // Dev: C = a fake player joins, R = a random player reacts.
    this.input.keyboard.on('keydown-C', () => {
      const free = FAKE_NAMES.filter((n) => !roster.has(n));
      simulateChat(Phaser.Utils.Array.GetRandom(free.length ? free : FAKE_NAMES), Phaser.Utils.Array.GetRandom(['hi!', 'hello', 'let me in', 'ready 🙌']));
    });
    this.input.keyboard.on('keydown-R', () => {
      if (roster.size) simulateReaction(Phaser.Utils.Array.GetRandom(roster.all()).name, Phaser.Utils.Array.GetRandom(FAKE_EMOJI));
    });
  }

  update(time, delta) {
    const characters = [...this.characters.values()];
    separate(characters, delta);
    for (const character of characters) character.update(time, delta);
  }

  // ---- Bridge events ----

  onChat({ player: { name }, text }) {
    const character = this.characters.get(name) ?? this.addCharacter(roster.join(name), { pop: true });
    this.say(character, text);
    this.refresh();
  }

  onReaction({ player: { name }, emoji }) {
    const player = roster.setEmoji(name, emoji);
    if (!player) return;                      // only people who've chatted are in the game
    const character = this.characters.get(name);
    character.setEmoji(emoji);
    this.tweens.add({ targets: character.figure, scale: 1.4, duration: 120, yoyo: true });
  }

  // ---- Helpers ----

  addCharacter(player, { pop = false } = {}) {
    const character = new Character(this, player);
    this.characters.set(player.name, character);
    if (pop) {
      character.setScale(0);
      this.tweens.add({ targets: character, scale: 1, duration: 350, ease: 'Back.easeOut' });
    }
    return character;
  }

  say(character, text) {
    character.setBubble(text.length > 40 ? text.slice(0, 39) + '…' : text);
    character.bubbleTimer?.remove();
    character.bubbleTimer = this.time.delayedCall(CHAT_BUBBLE_MS, () => character.setBubble(null));
  }

  refresh() {
    const n = roster.size;
    this.countText.setText(`${n} player${n === 1 ? '' : 's'}`);
    this.startButton.setEnabled(n >= MIN_PLAYERS);
  }

  clearPlayers() {
    roster.clear();
    for (const character of this.characters.values()) character.destroy();
    this.characters.clear();
    this.refresh();
  }

  startGame() {
    if (roster.size >= MIN_PLAYERS) this.scene.start('battle');
  }
}
