import * as Phaser from 'phaser';
import { listen, simulateChat, simulateReaction, FAKE_NAMES, FAKE_EMOJI } from '../bridge.js';
import { roster } from '../roster.js';
import { Character, separate } from '../objects/Character.js';
import { FloorText } from '../objects/FloorText.js';
import { CHAT_BUBBLE_MS } from '../config.js';

const MIN_PLAYERS = 2;
const ENTER_STAGGER = 800;   // ms; on returning to the lobby, everyone starts running in within this

// Phase 1: anyone who chats joins and gets a random emoji; reacting changes it. The host starts the game from
// the control page (or presses Enter).
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
    this.floorText = new FloorText(this);
    this.updateFloorText();

    for (const player of roster.all()) this.addCharacter(player, { delay: Phaser.Math.Between(0, ENTER_STAGGER) });

    listen(this, { chat: this.onChat, reaction: this.onReaction });

    // Commands from the control page (see remote.js). Dev: C = a fake player joins, R = a random player reacts.
    this.commands = {
      start: () => this.startGame(),
      clear: () => this.clearPlayers(),
      C: () => {
        const free = FAKE_NAMES.filter((n) => !roster.has(n));
        simulateChat(Phaser.Utils.Array.GetRandom(free.length ? free : FAKE_NAMES), Phaser.Utils.Array.GetRandom(['hi!', 'hello', 'let me in', 'ready 🙌']));
      },
      R: () => {
        if (roster.size) simulateReaction(Phaser.Utils.Array.GetRandom(roster.all()).name, Phaser.Utils.Array.GetRandom(FAKE_EMOJI));
      },
    };
    this.input.keyboard.on('keydown-ENTER', this.commands.start);
    for (const key of ['C', 'R']) this.input.keyboard.on(`keydown-${key}`, this.commands[key]);
  }

  // What the control page shows (see remote.js).
  snapshot() {
    return { phase: 'lobby', canStart: roster.size >= MIN_PLAYERS, players: roster.all() };
  }

  update(time, delta) {
    const characters = [...this.characters.values()];
    separate(characters, delta);
    for (const character of characters) character.update(time, delta);
  }

  // ---- Bridge events ----

  onChat({ player: { name }, text }) {
    const character = this.characters.get(name) ?? this.addCharacter(roster.join(name));
    this.say(character, text);
  }

  onReaction({ player: { name }, emoji }) {
    const player = roster.setEmoji(name, emoji);
    if (!player) return;                      // only people who've chatted are in the game
    const character = this.characters.get(name);
    character.setEmoji(emoji);
    this.tweens.add({ targets: character.figure, scale: 1.4, duration: 120, yoyo: true });
  }

  // ---- Helpers ----

  // Everyone runs in from a random staircase.
  addCharacter(player, { delay = 0 } = {}) {
    const character = new Character(this, player).enter({ delay });
    this.characters.set(player.name, character);
    this.updateFloorText();
    return character;
  }

  updateFloorText() {
    const n = this.characters.size;
    this.floorText.set('Chat to join!', `${n} player${n === 1 ? '' : 's'}`);
  }

  say(character, text) {
    character.setBubble(text.length > 40 ? text.slice(0, 39) + '…' : text);
    character.bubbleTimer?.remove();
    character.bubbleTimer = this.time.delayedCall(CHAT_BUBBLE_MS, () => character.setBubble(null));
  }

  // Take one player out (CPU players removed from the control page; see bots.js).
  removePlayer(name) {
    roster.remove(name);
    this.characters.get(name)?.destroy();
    this.characters.delete(name);
    this.updateFloorText();
  }

  clearPlayers() {
    roster.clear();
    for (const character of this.characters.values()) character.destroy();
    this.characters.clear();
    this.updateFloorText();
  }

  startGame() {
    if (roster.size >= MIN_PLAYERS) this.scene.start('battle');
  }
}
