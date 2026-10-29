import * as Phaser from 'phaser';
import { listen, simulateChat, simulateReaction, FAKE_EMOJI } from '../bridge.js';
import { roster } from '../roster.js';
import { pickWord, tokenize } from '../words.js';
import { Character, separate } from '../objects/Character.js';
import { Button } from '../objects/Button.js';
import { WIDTH, HEIGHT, MAX_HP, DAMAGE, WORD_DELAY, FLEE_SPEED, CHASED_FLEE_SPEED } from '../config.js';

const LOG_LINES = 4;

// Phase 2: everyone gets a word. Typing another player's word sends your character to attack them.
// Last one standing wins (phase 3: the winner banner, then back to the lobby).
export class BattleScene extends Phaser.Scene {
  constructor() {
    super('battle');
  }

  create() {
    this.over = false;
    this.log = [];
    // name -> { name, character, hp, word, out, revealTimer }. After a hit, word is null while they
    // "type" a new one, and revealTimer brings it back.
    this.fighters = new Map();

    // Everyone in the roster when the round starts plays; anyone who joins later waits for the next round.
    const taken = new Set();
    for (const player of roster.all()) {
      const word = pickWord(taken);
      taken.add(word);
      const character = new Character(this, player).setSword(true).setHp(MAX_HP, MAX_HP).setBubble(word, { highlight: true });
      this.fighters.set(player.name, { name: player.name, character, hp: MAX_HP, word, out: false, revealTimer: null });
    }

    this.add.text(WIDTH / 2, 48, "Type someone's word to attack!", { fontSize: '36px', fontStyle: 'bold', color: '#ffffff' }).setOrigin(0.5);
    this.aliveText = this.add.text(WIDTH / 2, 92, '', { fontSize: '22px', color: '#aab0c8' }).setOrigin(0.5);
    this.logText = this.add.text(20, 20, '', { fontSize: '16px', color: '#c8cce0', lineSpacing: 4 }).setDepth(20000);
    this.endButton = new Button(this, WIDTH - 90, 76, 'End round', () => this.backToLobby(), { width: 150, height: 40, color: 0x6b6f80 }).setDepth(20000);
    this.endButton.label.setFontSize(18);
    this.refreshAlive();
    this.banner('Fight! ⚔️');

    listen(this, { chat: this.onChat, reaction: this.onReaction });

    this.input.keyboard.on('keydown-ENTER', () => this.over && this.backToLobby());
    // Dev: C = a random fighter attacks someone, X = a random fighter chats a non-word, R = a random fighter reacts.
    this.input.keyboard.on('keydown-C', () => {
      const alive = this.alive();
      const victim = Phaser.Utils.Array.GetRandom(alive.filter((f) => f.word));
      const attacker = Phaser.Utils.Array.GetRandom(alive.filter((f) => f !== victim));
      if (victim && attacker) simulateChat(attacker.name, `${victim.word}!`);
    });
    this.input.keyboard.on('keydown-X', () => {
      const alive = this.alive();
      if (alive.length) simulateChat(Phaser.Utils.Array.GetRandom(alive).name, 'where is everyone');
    });
    this.input.keyboard.on('keydown-R', () => {
      if (this.fighters.size) simulateReaction(Phaser.Utils.Array.GetRandom([...this.fighters.keys()]), Phaser.Utils.Array.GetRandom(FAKE_EMOJI));
    });
  }

  update(time, delta) {
    const fighters = [...this.fighters.values()];
    const characters = fighters.map((f) => f.character);
    const alive = characters.filter((c) => !c.out);
    separate(characters, delta);
    const chasers = new Map();   // target character -> number of characters chasing it
    for (const character of alive) {
      if (character.target) chasers.set(character.target, (chasers.get(character.target) ?? 0) + 1);
    }
    // Players run away while typing a new word (word === null) and, a bit slower, while being chased.
    for (const { character, word, out } of fighters) {
      if (out) continue;
      const chasedBy = chasers.get(character) ?? 0;
      character.setAlert(chasedBy);
      character.fleeSpeed = this.over ? 0 : Math.max(word === null ? FLEE_SPEED : 0, chasedBy ? CHASED_FLEE_SPEED : 0);
      if (character.fleeSpeed) character.steerAway(alive.filter((c) => c !== character), delta);
    }
    for (const character of characters) character.update(time, delta);
  }

  // ---- Bridge events ----

  onChat({ player: { name }, text }) {
    const attacker = this.fighters.get(name);
    if (!attacker) {
      if (!roster.has(name)) { roster.join(name); this.addLog(`👋 ${name} joins next round`); }
      return;
    }
    if (this.over || attacker.out || attacker.character.chasing) return;   // one attack at a time

    const words = tokenize(text);
    const victim = this.alive().find((f) => f !== attacker && words.has(f.word));
    if (victim) this.attack(attacker, victim);
  }

  onReaction({ player: { name }, emoji }) {
    roster.setEmoji(name, emoji);
    this.fighters.get(name)?.character.setEmoji(emoji);
  }

  // ---- Combat ----

  // The victim keeps their word during the chase, so others can pile on until the first hit lands.
  attack(attacker, victim) {
    this.addLog(`${attacker.name} ⚔️ ${victim.name}`);
    attacker.character.chase(victim.character, () => this.land(attacker, victim));
  }

  land(attacker, victim) {
    if (this.over || attacker.out || victim.out) return;

    // Two players chasing each other: whoever typed first gets the hit, and the other attack fizzles.
    const counter = victim.character;
    if (counter.target === attacker.character) {
      const counterFirst = counter.chaseStart < attacker.character.chaseStart;
      const counterHit = counter.onArrive;
      counter.cancelChase();
      const slow = (counterFirst ? attacker : victim).character;
      this.floatText(slow.x, slow.y - 110, 'too slow!', '#aab0c8');
      if (counterFirst) { counterHit(); return; }
    }

    attacker.character.swing();
    victim.hp = Math.max(0, victim.hp - DAMAGE);
    victim.character.setHp(victim.hp, MAX_HP).hurt(attacker.character.x, attacker.character.y);
    this.cameras.main.shake(120, 0.004);
    this.floatText(victim.character.x, victim.character.y - 70, `-${DAMAGE}`, '#ff6b6b');

    if (victim.hp === 0) { this.knockOut(victim, attacker); return; }

    // The victim loses their word and "types" a new one (running away from everyone meanwhile), so
    // nobody new can target them until it appears. Chasers already on their way still land their
    // hits; each hit restarts the delay.
    if (victim.word) {
      victim.word = null;
      victim.character.setTyping();
    }
    this.revealWordLater(victim);
  }

  // After WORD_DELAY, give the fighter a fresh word (they're attackable again).
  revealWordLater(fighter) {
    fighter.revealTimer?.remove();
    fighter.revealTimer = this.time.delayedCall(WORD_DELAY, () => {
      fighter.revealTimer = null;
      if (this.over || fighter.out) return;
      fighter.word = pickWord(new Set([...this.fighters.values()].map((f) => f.word)));
      fighter.character.setBubble(fighter.word, { highlight: true, pop: true });
    });
  }

  knockOut(victim, by) {
    victim.out = true;
    victim.revealTimer?.remove();
    victim.character.knockOut();
    this.addLog(`💀 ${by.name} knocked out ${victim.name}`);
    for (const f of this.fighters.values()) {
      if (f.character.target === victim.character) f.character.cancelChase();
    }
    this.refreshAlive();

    const alive = this.alive();
    if (alive.length === 1) this.win(alive[0]);
  }

  win(winner) {
    this.over = true;
    for (const f of this.fighters.values()) f.character.cancelChase();
    winner.character.setBubble('🏆 Winner!', { highlight: true });
    this.tweens.add({ targets: winner.character, scale: 1.6, duration: 500, ease: 'Back.easeOut' });

    const shade = this.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, 200, 0x000000, 0.55).setDepth(20000);
    const title = this.add.text(WIDTH / 2, HEIGHT / 2 - 30, `👑 ${winner.name} wins! 👑`, { fontSize: '56px', fontStyle: 'bold', color: '#ffd84d' }).setOrigin(0.5).setDepth(20001);
    new Button(this, WIDTH / 2, HEIGHT / 2 + 50, 'Back to lobby', () => this.backToLobby(), { width: 240 }).setDepth(20001);
    this.endButton.setVisible(false);
    this.tweens.add({ targets: [shade, title], alpha: { from: 0, to: 1 }, duration: 400 });
    this.confetti();
  }

  // ---- Helpers ----

  alive() {
    return [...this.fighters.values()].filter((f) => !f.out);
  }

  refreshAlive() {
    this.aliveText.setText(`${this.alive().length} of ${this.fighters.size} still standing`);
  }

  addLog(line) {
    this.log.push(line);
    if (this.log.length > LOG_LINES) this.log.shift();
    this.logText.setText(this.log);
  }

  banner(text) {
    const t = this.add.text(WIDTH / 2, HEIGHT / 2, text, { fontSize: '96px', fontStyle: 'bold', color: '#ffffff' }).setOrigin(0.5).setDepth(20000);
    this.tweens.add({ targets: t, scale: { from: 0.5, to: 1.2 }, alpha: { from: 1, to: 0 }, duration: 1200, ease: 'Cubic.easeOut', onComplete: () => t.destroy() });
  }

  floatText(x, y, text, color) {
    const t = this.add.text(x, y, text, { fontSize: '28px', fontStyle: 'bold', color }).setOrigin(0.5).setDepth(20000);
    this.tweens.add({ targets: t, y: y - 50, alpha: 0, duration: 800, onComplete: () => t.destroy() });
  }

  confetti() {
    for (let i = 0; i < 40; i++) {
      const t = this.add.text(Phaser.Math.Between(0, WIDTH), -40, Phaser.Utils.Array.GetRandom(['🎉', '✨', '🎊', '⭐']), { fontSize: '32px' }).setDepth(19999);
      this.tweens.add({
        targets: t,
        y: HEIGHT + 40,
        angle: Phaser.Math.Between(-360, 360),
        delay: Phaser.Math.Between(0, 1500),
        duration: Phaser.Math.Between(1800, 3000),
        onComplete: () => t.destroy(),
      });
    }
  }

  backToLobby() {
    this.scene.start('lobby');
  }
}
