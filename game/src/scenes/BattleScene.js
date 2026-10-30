import * as Phaser from 'phaser';
import { listen, simulateChat, simulateReaction, FAKE_EMOJI } from '../bridge.js';
import { roster } from '../roster.js';
import { pickWord, tokenize, nearMiss } from '../words.js';
import { Character, separate } from '../objects/Character.js';
import {
  WIDTH, HEIGHT, MAX_HP, DAMAGE, WORD_DELAY, FLEE_SPEED, CHASED_FLEE_SPEED, CHASE_SPEED, CLASH_KNOCKBACK,
  DISPLAY_FONT, SUDDEN_DEATH_AFTER, SUDDEN_DEATH_STEP, SUDDEN_DEATH_BOOST, SUDDEN_DEATH_MAX,
} from '../config.js';

const LOG_LINES = 30;   // shown on the control page
const KO_FRAMES = { frameWidth: 128, frameHeight: 256 };   // assets/ko.png: a strip of 6 flame-burst frames
const MISS_COLORS = { 'so close!': '#ffd84d', '❌': '#ffffff' };

// Phase 2: everyone gets a word. Typing another player's word sends your character to attack them.
// Last one standing wins (phase 3: the winner banner, then back to the lobby).
export class BattleScene extends Phaser.Scene {
  constructor() {
    super('battle');
  }

  preload() {
    this.load.spritesheet('ko', '/assets/ko.png', KO_FRAMES);
    if (!this.textures.exists('arena')) this.load.image('arena', '/assets/arena.png');
  }

  create() {
    // The burst where a knocked-out character leaves the screen (Character.blast): a few rapid loops, then gone.
    if (!this.anims.exists('ko')) this.anims.create({ key: 'ko', frames: this.anims.generateFrameNumbers('ko'), frameRate: 30, repeat: 2 });
    this.add.image(0, 0, 'arena').setOrigin(0).setDepth(-1000);   // rendered from art/arena.blend
    this.over = false;
    this.winner = null;
    this.log = [];
    // name -> { name, character, hp, word, lastWord, out, revealTimer, parries }. After a hit, word is null
    // while they "type" a new one (lastWord keeps the old one), and revealTimer brings a new one.
    // parries holds the chasers this fighter has countered (typed their word back); see land().
    this.fighters = new Map();
    this.lastHitAt = this.time.now;   // for sudden death
    this.suddenDeath = 0;             // 0 = off, then 1, 2, ... as chases speed up

    // Everyone in the roster when the round starts plays; anyone who joins later waits for the next round.
    const taken = new Set();
    for (const player of roster.all()) {
      const word = pickWord(taken);
      taken.add(word);
      const character = new Character(this, player).setSword(true).setHp(MAX_HP, MAX_HP).setBubble(word, { highlight: true });
      this.fighters.set(player.name, { name: player.name, character, hp: MAX_HP, word, lastWord: null, out: false, revealTimer: null, parries: new Set() });
    }

    this.banner('Fight! ⚔️');

    listen(this, { chat: this.onChat, reaction: this.onReaction });

    // Commands from the control page (see remote.js). Dev: C = a random fighter attacks someone, X = a random
    // fighter chats a non-word, T = a typo of someone's word, P = a chased fighter counters their chaser,
    // R = a random fighter reacts.
    this.commands = {
      end: () => this.backToLobby(),
      C: () => {
        const alive = this.alive();
        const victim = Phaser.Utils.Array.GetRandom(alive.filter((f) => f.word));
        const attacker = Phaser.Utils.Array.GetRandom(alive.filter((f) => f !== victim));
        if (victim && attacker) simulateChat(attacker.name, `${victim.word}!`);
      },
      X: () => {
        const alive = this.alive();
        if (alive.length) simulateChat(Phaser.Utils.Array.GetRandom(alive).name, 'where is everyone');
      },
      T: () => {
        const alive = this.alive();
        const victim = Phaser.Utils.Array.GetRandom(alive.filter((f) => f.word));
        const sender = Phaser.Utils.Array.GetRandom(alive.filter((f) => f !== victim));
        if (victim && sender) simulateChat(sender.name, victim.word + victim.word.at(-1));   // doubled last letter
      },
      P: () => {
        const chaser = Phaser.Utils.Array.GetRandom(this.alive().filter((f) => f.word && this.fighterOf(f.character.target)));
        if (chaser) simulateChat(this.fighterOf(chaser.character.target).name, chaser.word);
      },
      R: () => {
        if (this.fighters.size) simulateReaction(Phaser.Utils.Array.GetRandom([...this.fighters.keys()]), Phaser.Utils.Array.GetRandom(FAKE_EMOJI));
      },
    };
    this.input.keyboard.on('keydown-ENTER', () => this.over && this.backToLobby());
    for (const key of ['C', 'X', 'T', 'P', 'R']) this.input.keyboard.on(`keydown-${key}`, this.commands[key]);
  }

  // What the control page shows (see remote.js).
  snapshot() {
    return {
      phase: 'battle',
      over: this.over,
      winner: this.winner?.name ?? null,
      boost: this.suddenDeath ? 1 + this.suddenDeath * SUDDEN_DEATH_BOOST : 0,
      maxHp: MAX_HP,
      fighters: [...this.fighters.values()].map((f) => ({
        name: f.name,
        emoji: roster.get(f.name)?.emoji,
        hp: f.hp,
        word: f.word,
        out: f.out,
        chasing: this.fighterOf(f.character.target)?.name ?? null,
        parrying: [...f.parries].map((p) => p.name),
      })),
      waiting: roster.all().filter((p) => !this.fighters.has(p.name)),   // joined mid-round
      log: this.log,
    };
  }

  update(time, delta) {
    this.updateSuddenDeath(time);
    const fighters = [...this.fighters.values()];
    const characters = fighters.map((f) => f.character);
    const alive = characters.filter((c) => !c.out);
    separate(characters, delta);
    const chasers = new Map();   // target character -> number of characters chasing it
    for (const character of alive) {
      if (character.target) chasers.set(character.target, (chasers.get(character.target) ?? 0) + 1);
    }
    // Players run away while typing a new word (word === null) and, a bit slower, while being chased.
    for (const { character, word, out, parries } of fighters) {
      if (out) continue;
      // Forget counters against chasers who stopped coming (knocked out, or their chase ended elsewhere).
      for (const chaser of parries) if (chaser.out || chaser.character.target !== character) parries.delete(chaser);
      character.setShield(parries.size > 0);
      character.chaseSpeed = CHASE_SPEED * (1 + this.suddenDeath * SUDDEN_DEATH_BOOST);
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
    if (this.over || attacker.out) return;

    const words = tokenize(text);
    // Counter: typing the word of someone chasing you readies a parry instead of chasing them back.
    const chaser = this.alive().find((f) => f.character.target === attacker.character && words.has(f.word));
    if (chaser) {
      if (!attacker.parries.has(chaser)) { attacker.parries.add(chaser); this.addLog(`🛡️ ${attacker.name} braces for ${chaser.name}`); }
      return;
    }
    const victim = this.alive().find((f) => f !== attacker && words.has(f.word));
    if (victim && !attacker.character.chasing) { this.attack(attacker, victim); return; }   // one attack at a time

    const reason = this.missReason(attacker, words, victim);
    if (!reason) return;
    attacker.character.shakeHead();
    // Replace this fighter's previous label so quick messages don't pile up.
    if (attacker.missText) { this.tweens.killTweensOf(attacker.missText); attacker.missText.destroy(); }
    attacker.missText = this.floatText(attacker.character.x, attacker.character.y - 125, reason, MISS_COLORS[reason] ?? '#aab0c8');
  }

  // What to show over a fighter whose message didn't attack anyone, or null to show nothing.
  missReason(attacker, words, victim) {
    if (attacker.character.chasing) return victim ? 'busy!' : null;   // plain chatter mid-chase is fine
    if (words.has(attacker.word)) return "that's you!";
    // An old word: someone who was just hit (now "typing"), or a knocked-out player.
    const others = [...this.fighters.values()].filter((f) => f !== attacker);
    if (others.some((f) => words.has(f.lastWord) || (f.out && words.has(f.word)))) return 'too late!';
    const live = others.filter((f) => !f.out && f.word).map((f) => f.word);
    if ([...words].some((t) => live.some((w) => nearMiss(t, w)))) return 'so close!';
    return '❌';
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
    if (victim.parries.delete(attacker)) { this.clash(attacker, victim); return; }

    this.lastHitAt = this.time.now;
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
      victim.lastWord = victim.word;   // typing it now says "too late!"
      victim.word = null;
      victim.character.setTyping();
    }
    this.revealWordLater(victim);
  }

  // A countered hit: swords clang, both bounce apart, nobody takes damage, and both get new words right
  // away (no "…" delay), so nobody can pre-type the other's word and parry on reflex.
  clash(attacker, defender) {
    const a = attacker.character;
    const d = defender.character;
    a.swing();
    d.swing();
    a.knockback(d.x, d.y, CLASH_KNOCKBACK);
    d.knockback(a.x, a.y, CLASH_KNOCKBACK);
    this.cameras.main.shake(100, 0.003);
    this.floatText((a.x + d.x) / 2, (a.y + d.y) / 2 - 40, '💥', '#ffffff');
    this.floatText(d.x, d.y - 125, 'parry!', '#7fd4ff');
    this.addLog(`🛡️ ${defender.name} parried ${attacker.name}`);
    const taken = new Set([attacker.word, attacker.lastWord, defender.word, defender.lastWord]);   // make sure the words change
    for (const f of [attacker, defender]) {
      f.revealTimer?.remove();
      f.revealTimer = null;
      if (f.word) f.lastWord = f.word;   // typing it now says "too late!"
      this.newWord(f, taken);
    }
  }

  // After SUDDEN_DEATH_AFTER ms without a hit, chases speed up a step every SUDDEN_DEATH_STEP ms.
  // Counters don't reset it, so endless parrying can't stall the game. Hits do (see land()).
  updateSuddenDeath(time) {
    const idle = time - this.lastHitAt;
    const max = (SUDDEN_DEATH_MAX - 1) / SUDDEN_DEATH_BOOST;
    const level = this.over || idle < SUDDEN_DEATH_AFTER ? 0 : Math.min(max, 1 + Math.floor((idle - SUDDEN_DEATH_AFTER) / SUDDEN_DEATH_STEP));
    if (level === this.suddenDeath) return;
    if (level === 1 && this.suddenDeath === 0) this.banner('⚡ Sudden death!');
    this.suddenDeath = level;
  }

  // After WORD_DELAY, give the fighter a fresh word (they're attackable again).
  revealWordLater(fighter) {
    fighter.revealTimer?.remove();
    fighter.revealTimer = this.time.delayedCall(WORD_DELAY, () => {
      fighter.revealTimer = null;
      if (this.over || fighter.out) return;
      this.newWord(fighter);
    });
  }

  // Give a fighter a word nobody else has (nor any in `avoid`) and pop it into their bubble.
  newWord(fighter, avoid = []) {
    fighter.word = pickWord(new Set([...this.fighters.values()].map((f) => f.word).concat(...avoid)));
    fighter.character.setBubble(fighter.word, { highlight: true, pop: true });
  }

  knockOut(victim, by) {
    victim.out = true;
    victim.revealTimer?.remove();
    // A big shake when they blast off the screen edge.
    victim.character.knockOut(by.character.x, by.character.y, () => this.cameras.main.shake(450, 0.025));
    this.cameras.main.shake(300, 0.015);
    this.addLog(`💀 ${by.name} knocked out ${victim.name}`);
    for (const f of this.fighters.values()) {
      if (f.character.target === victim.character) f.character.cancelChase();
    }

    const alive = this.alive();
    if (alive.length === 1) this.win(alive[0]);
  }

  win(winner) {
    this.over = true;
    this.winner = winner;
    this.addLog(`👑 ${winner.name} wins`);
    for (const f of this.fighters.values()) f.character.cancelChase();
    winner.character.setBubble('🏆 Winner!', { highlight: true });
    this.tweens.add({ targets: winner.character, scale: 1.6, duration: 500, ease: 'Back.easeOut' });

    const shade = this.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, 200, 0x000000, 0.55).setDepth(20000);
    const title = this.add.text(WIDTH / 2, HEIGHT / 2, `👑 ${winner.name} wins! 👑`, { fontFamily: DISPLAY_FONT, fontSize: '64px', color: '#ffd84d' }).setOrigin(0.5).setDepth(20001);
    this.tweens.add({ targets: [shade, title], alpha: { from: 0, to: 1 }, duration: 400 });
    this.confetti();
  }

  // ---- Helpers ----

  alive() {
    return [...this.fighters.values()].filter((f) => !f.out);
  }

  fighterOf(character) {
    return character && [...this.fighters.values()].find((f) => f.character === character);
  }

  addLog(line) {
    this.log.push(line);
    if (this.log.length > LOG_LINES) this.log.shift();
  }

  banner(text) {
    const t = this.add.text(WIDTH / 2, HEIGHT / 2, text, { fontFamily: DISPLAY_FONT, fontSize: '96px', color: '#ffffff' }).setOrigin(0.5).setDepth(20000);
    this.tweens.add({ targets: t, scale: { from: 0.5, to: 1.2 }, alpha: { from: 1, to: 0 }, duration: 1200, ease: 'Cubic.easeOut', onComplete: () => t.destroy() });
  }

  floatText(x, y, text, color) {
    const t = this.add.text(x, y, text, { fontSize: '28px', fontStyle: 'bold', color }).setOrigin(0.5).setDepth(20000);
    this.tweens.add({ targets: t, y: y - 50, alpha: 0, duration: 800, onComplete: () => t.destroy() });
    return t;
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
