import * as Phaser from '/vendor/phaser.js';
import { Character } from '../objects/Character.js';
import { WIDTH, HEIGHT, DISPLAY_FONT, MAX_HP, CLASH_KNOCKBACK } from '../config.js';

const RULES = [
  'Players/enemies get a random word assigned to them',
  "Type someone's word to attack!",
  "Type an attacker's word to parry!",
];
const PANEL = { w: 920, h: 600, color: 0x1d1f27, alpha: 0.96, border: 0x4f7cff };
const RULE_SIZE = 30;                 // px
const RULE_DIM = '#6b6f80';
const DEMO_Y = 470;                   // where the demo characters stand
const HOME = { ada: WIDTH / 2 - 190, ben: WIDTH / 2 + 190 };
const CHAT_Y = 600;                   // the pretend chat line under the demo
const TYPE_MS = 110;                  // per letter typed in the chat line
const HOME_FOLLOW = 3;                // how quickly demo characters drift back to their spots
const DEMO_CHASE_SPEED = 180;         // px/s; slower than a real chase so the parry can be typed in time

// "How to play": a panel over the lobby with the rules, one highlighted at a time, and a looping demo of two
// players acting each one out. The host toggles it from the control page (or H on the game); starting a game closes it.
export class HowToScene extends Phaser.Scene {
  constructor() {
    super('howto');
  }

  create() {
    const cx = WIDTH / 2;
    const top = (HEIGHT - PANEL.h) / 2;
    this.add.rectangle(0, 0, WIDTH, HEIGHT, 0x000000, 0.55).setOrigin(0).setDepth(-2);
    this.add.graphics().setDepth(-1)
      .fillStyle(PANEL.color, PANEL.alpha).fillRoundedRect(cx - PANEL.w / 2, top, PANEL.w, PANEL.h, 24)
      .lineStyle(4, PANEL.border, 1).strokeRoundedRect(cx - PANEL.w / 2, top, PANEL.w, PANEL.h, 24);
    this.add.text(cx, top + 50, 'How to play', { fontFamily: DISPLAY_FONT, fontSize: '64px', color: '#ffd84d' }).setOrigin(0.5);
    this.rules = RULES.map((rule, i) => this.add.text(cx - PANEL.w / 2 + 60, top + 112 + i * 46, `${i + 1}. ${rule}`, {
      fontSize: `${RULE_SIZE}px`, fontStyle: 'bold', color: RULE_DIM,
    }).setOrigin(0, 0.5));

    // The pretend chat line: who's typing and what, with a caret.
    this.chat = this.add.text(cx, CHAT_Y, '', {
      fontSize: '26px', color: '#e8e8f0', backgroundColor: '#272a35', padding: { x: 18, y: 8 },
    }).setOrigin(0.5).setVisible(false);

    this.ada = this.addCharacter('Ada', '🐸', HOME.ada);
    this.ben = this.addCharacter('Ben', '🦊', HOME.ben);
    this.loop();
  }

  addCharacter(name, emoji, x) {
    const character = new Character(this, { name, emoji }, { x, y: DEMO_Y }).setSword(true).setHp(MAX_HP, MAX_HP);
    character.home = x;
    character.vx = character.vy = 0;   // they stand still (and hop) instead of wandering
    return character;
  }

  update(time, delta) {
    const dt = delta / 1000;
    for (const c of [this.ada, this.ben]) {
      // Drift back home after a chase or knockback, instead of wandering off.
      if (!c.chasing && !c.airborne) {
        c.vx = c.vy = 0;
        c.x = Phaser.Math.Linear(c.x, c.home, Math.min(1, dt * HOME_FOLLOW));
        c.y = Phaser.Math.Linear(c.y, DEMO_Y, Math.min(1, dt * HOME_FOLLOW));
        c.face(c === this.ada ? 1 : -1);
      }
      c.update(time, delta);
    }
  }

  // The demo, over and over: words appear, Ada attacks Ben, then Ben attacks Ada and she parries.
  async loop() {
    const { ada, ben } = this;
    for (;;) {
      this.highlight(0);
      this.chat.setVisible(false);
      for (const c of [ada, ben]) c.setBubble(null).setHp(MAX_HP, MAX_HP).setShield(false).setAlert(0);
      await this.wait(700);
      ada.setBubble('rocket', { highlight: true, pop: true });
      await this.wait(400);
      ben.setBubble('pizza', { highlight: true, pop: true });
      await this.wait(2600);

      this.highlight(1);
      await this.type(ada, 'pizza');
      ben.setAlert(1);
      await this.chase(ada, ben);
      ben.setAlert(0);
      this.hit(ada, ben);
      await this.wait(1600);
      ben.setBubble('taco', { highlight: true, pop: true });
      await this.wait(1800);

      this.highlight(2);
      await this.type(ben, 'rocket');
      ada.setAlert(1);
      const arrived = this.chase(ben, ada);
      await this.wait(300);
      await this.type(ada, 'taco');
      ada.setShield(true);
      await arrived;
      ada.setAlert(0);
      this.clash(ben, ada);
      await this.wait(3200);
    }
  }

  highlight(n) {
    this.rules.forEach((rule, i) => rule.setColor(i === n ? '#ffffff' : RULE_DIM).setScale(i === n ? 1.04 : 1));
  }

  // Type `word` into the chat line as `who`, letter by letter, then "send" it.
  async type(who, word) {
    this.chat.setVisible(true);
    for (let i = 0; i <= word.length; i++) {
      this.chat.setText(`💬 ${who.name}: ${word.slice(0, i)}▌`);
      await this.wait(TYPE_MS);
    }
    await this.wait(250);
    this.chat.setText(`💬 ${who.name}: ${word} ⏎`);
    this.tweens.add({ targets: this.chat, scale: { from: 1.12, to: 1 }, duration: 200, ease: 'Back.easeOut' });
  }

  // Run `attacker` at `victim`; resolves on arrival.
  chase(attacker, victim) {
    attacker.chaseSpeed = DEMO_CHASE_SPEED;
    return new Promise((resolve) => attacker.chase(victim, resolve));
  }

  hit(attacker, victim) {
    attacker.swing();
    victim.setHp(MAX_HP - 1, MAX_HP).setTyping().hurt(attacker.x, attacker.y);
    this.cameras.main.shake(120, 0.004);
    this.floatText(victim.x, victim.y - 70, '-1', '#ff6b6b');
  }

  clash(attacker, defender) {
    attacker.swing();
    defender.swing();
    attacker.knockback(defender.x, defender.y, CLASH_KNOCKBACK);
    defender.knockback(attacker.x, attacker.y, CLASH_KNOCKBACK);
    defender.setShield(false);
    this.cameras.main.shake(100, 0.003);
    this.floatText((attacker.x + defender.x) / 2, (attacker.y + defender.y) / 2 - 40, '💥', '#ffffff');
    this.floatText(defender.x, defender.y - 125, 'parry!', '#7fd4ff');
    attacker.setBubble('moon', { highlight: true, pop: true });
    defender.setBubble('lemon', { highlight: true, pop: true });
  }

  floatText(x, y, text, color) {
    const t = this.add.text(x, y, text, { fontSize: '28px', fontStyle: 'bold', color }).setOrigin(0.5).setDepth(20000);
    this.tweens.add({ targets: t, y: y - 50, alpha: 0, duration: 800, onComplete: () => t.destroy() });
  }

  // Never resolves once the scene has stopped, so the demo loop just ends there.
  wait(ms) {
    return new Promise((resolve) => this.time.delayedCall(ms, resolve));
  }
}
