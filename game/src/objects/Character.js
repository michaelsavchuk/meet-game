import * as Phaser from 'phaser';
import { ARENA, WANDER_SPEED, CHASE_SPEED, FLEE_RADIUS, ATTACK_RANGE, CHASE_TIMEOUT, PERSONAL_SPACE } from '../config.js';

const WALL_MARGIN = 120;   // while fleeing, walls closer than this push back so nobody gets cornered
const PUFF_EVERY = 0.06;   // seconds between 💨 puffs while charging

const SWORD = '🗡️';

// Nudge wandering characters apart so they don't stack. Chasers and knocked-out characters are left alone.
export function separate(characters, delta) {
  const free = characters.filter((c) => !c.out && !c.chasing);
  const push = Math.min(1, (delta / 1000) * 4);
  for (let i = 0; i < free.length; i++) {
    for (let j = i + 1; j < free.length; j++) {
      const a = free[i];
      const b = free[j];
      // Distance in "personal space" units: 1 is the edge of the ellipse.
      const nx = (b.x - a.x) / PERSONAL_SPACE.x;
      const ny = (b.y - a.y) / PERSONAL_SPACE.y;
      const dist = Math.hypot(nx, ny) || 0.01;
      if (dist >= 1) continue;
      const shove = ((1 - dist) / 2) * push;
      a.x -= (nx / dist) * shove * PERSONAL_SPACE.x; a.y -= (ny / dist) * shove * PERSONAL_SPACE.y;
      b.x += (nx / dist) * shove * PERSONAL_SPACE.x; b.y += (ny / dist) * shove * PERSONAL_SPACE.y;
    }
  }
}

// A player on screen: a bouncing emoji with a sword, name tag, optional hearts, and a speech bubble.
// Scenes call update() every frame. Movement is either wandering (bouncing off the arena walls)
// or chasing a target set with chase().
export class Character extends Phaser.GameObjects.Container {
  constructor(scene, player, { x, y } = {}) {
    super(scene, x ?? Phaser.Math.Between(ARENA.x, ARENA.x + ARENA.width), y ?? Phaser.Math.Between(ARENA.y, ARENA.y + ARENA.height));
    this.name = player.name;
    this.phase = Math.random() * Math.PI * 2;   // so characters don't hop in sync
    this.out = false;
    this.target = null;
    this.fleeSpeed = 0;     // set by the scene; when > 0, moves at this speed and steers away (see steerAway)

    const angle = Math.random() * Math.PI * 2;
    this.vx = Math.cos(angle) * WANDER_SPEED;
    this.vy = Math.sin(angle) * WANDER_SPEED;

    // The figure (emoji + sword) hops; the labels under it stay put.
    this.emoji = scene.add.text(0, 0, player.emoji, { fontSize: '52px' }).setOrigin(0.5);
    this.sword = scene.add.text(30, 6, SWORD, { fontSize: '30px' }).setOrigin(0.5).setVisible(false);
    this.figure = scene.add.container(0, 0, [this.sword, this.emoji]);
    this.nameText = scene.add.text(0, 38, player.name, { fontSize: '16px', color: '#e8e8f0', fontStyle: 'bold' }).setOrigin(0.5, 0);
    this.hearts = scene.add.text(0, 58, '', { fontSize: '14px' }).setOrigin(0.5, 0).setVisible(false);
    this.add([this.figure, this.nameText, this.hearts]);

    // The bubble is its own object on a high depth so it's never hidden behind another character.
    this.bubbleBg = scene.add.graphics();
    this.bubbleText = scene.add.text(0, 0, '', { fontSize: '22px', color: '#1d1f27', fontStyle: 'bold' }).setOrigin(0.5);
    this.typingDots = [-14, 0, 14].map((dx) => scene.add.circle(dx, -26, 5, 0x8e8e93).setVisible(false));
    this.typingTweens = [];
    this.alert = scene.add.text(0, 0, '', { fontSize: '28px', fontStyle: 'bold', color: '#ff4d4d' }).setOrigin(0.5).setVisible(false);
    this.alertCount = 0;
    this.puffClock = 0;
    this.bubble = scene.add.container(0, 0, [this.bubbleBg, this.bubbleText, ...this.typingDots, this.alert]).setDepth(10000).setVisible(false);

    scene.add.existing(this);
  }

  // ---- Appearance ----

  setEmoji(emoji) {
    this.emoji.setText(emoji);
    return this;
  }

  setSword(visible) {
    this.sword.setVisible(visible);
    return this;
  }

  setHp(hp, max) {
    this.hearts.setVisible(true).setText('❤️'.repeat(hp) + '🖤'.repeat(Math.max(0, max - hp)));
    return this;
  }

  // Show text in the speech bubble. `highlight` styles it as a battle word; null hides the bubble.
  setBubble(text, { highlight = false, pop = false } = {}) {
    this.stopTyping();
    if (text == null) { this.bubble.setVisible(false); return this; }
    this.bubbleText.setVisible(true).setText(text).setFontSize(highlight ? 26 : 18).setColor(highlight ? '#1d1f27' : '#30323c');
    const h = this.bubbleText.height + 14;
    this.bubbleText.setY(-h / 2 - 8);
    this.drawBubble(this.bubbleText.width + 24, h, highlight ? 0xfff3a8 : 0xffffff);
    this.bubble.setVisible(true);
    if (pop) this.scene.tweens.add({ targets: this.bubble, scale: { from: 0.3, to: 1 }, duration: 250, ease: 'Back.easeOut' });
    return this;
  }

  // Show an SMS-style "…" typing indicator in the bubble until the next setBubble().
  setTyping() {
    this.stopTyping();
    this.bubbleText.setVisible(false);
    this.drawBubble(66, 36, 0xe5e5ea);
    this.typingTweens = this.typingDots.map((dot, i) => {
      dot.setVisible(true).setY(-26).setAlpha(0.4);
      return this.scene.tweens.add({ targets: dot, y: -32, alpha: 1, duration: 280, yoyo: true, repeat: -1, repeatDelay: 280, delay: i * 140, ease: 'Sine.easeInOut' });
    });
    this.bubble.setVisible(true);
    return this;
  }

  stopTyping() {
    for (const tween of this.typingTweens) tween.remove();
    this.typingTweens = [];
    for (const dot of this.typingDots) dot.setVisible(false);
  }

  // Show "‼️" above the bubble while others are chasing this character, with a count if there are several.
  setAlert(count) {
    if (count === this.alertCount) return this;
    const grew = count > this.alertCount;
    this.alertCount = count;
    this.alertWobble?.remove();
    if (!count) { this.alert.setVisible(false); return this; }

    this.alert.setText(count > 1 ? `‼️×${count}` : '‼️').setVisible(true).setScale(1).setAngle(0);
    if (grew) this.scene.tweens.add({ targets: this.alert, scale: { from: 1.8, to: 1 }, duration: 250, ease: 'Back.easeOut' });
    this.alertWobble = this.scene.tweens.add({ targets: this.alert, angle: { from: -10, to: 10 }, duration: 140, yoyo: true, repeat: -1 });
    return this;
  }

  drawBubble(w, h, fill) {
    this.alert.setY(-h - 30);   // sits just above whatever the bubble is showing
    this.bubbleBg.clear()
      .fillStyle(fill, 1)
      .fillRoundedRect(-w / 2, -h - 8, w, h, 12)
      .fillTriangle(-8, -9, 8, -9, 0, 0);
  }

  // ---- Movement ----

  update(time, delta) {
    const dt = delta / 1000;

    if (this.target) this.stepChase(time, dt);
    else if (!this.out) this.stepWander(dt);

    if (!this.out) this.figure.y = -Math.abs(Math.sin(time / 180 + this.phase)) * 12;  // hop
    this.setDepth(this.y);                                                             // lower on screen = in front
    this.bubble.setPosition(this.x, this.y - 40 + this.figure.y);
  }

  stepWander(dt) {
    // Ease toward cruising speed (e.g. after a knockback).
    const speed = Math.hypot(this.vx, this.vy) || 1;
    const scale = Phaser.Math.Linear(speed, this.fleeSpeed || WANDER_SPEED, Math.min(1, dt * 2)) / speed;
    this.vx *= scale;
    this.vy *= scale;

    this.x += this.vx * dt;
    this.y += this.vy * dt;
    const right = ARENA.x + ARENA.width;
    const bottom = ARENA.y + ARENA.height;
    if (this.x < ARENA.x || this.x > right) { this.vx = -this.vx; this.x = Phaser.Math.Clamp(this.x, ARENA.x, right); }
    if (this.y < ARENA.y || this.y > bottom) { this.vy = -this.vy; this.y = Phaser.Math.Clamp(this.y, ARENA.y, bottom); }
    this.face(this.vx);
  }

  stepChase(time, dt) {
    const { target } = this;
    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const dist = Math.hypot(dx, dy);
    this.face(dx);

    if (dist <= ATTACK_RANGE || time - this.chaseStart > CHASE_TIMEOUT) {
      const onArrive = this.onArrive;
      this.target = this.onArrive = null;
      this.vx = (dx / (dist || 1)) * WANDER_SPEED;
      this.vy = (dy / (dist || 1)) * WANDER_SPEED;
      onArrive();
      return;
    }
    const step = Math.min(dist, CHASE_SPEED * dt);
    this.x += (dx / dist) * step;
    this.y += (dy / dist) * step;

    this.puffClock -= dt;
    if (this.puffClock <= 0) {
      this.puffClock = PUFF_EVERY;
      this.puff(-dx / dist, -dy / dist);
    }
  }

  // Leave a 💨 behind (bx, by is the unit vector pointing backward); it drifts back and fades.
  puff(bx, by) {
    const puff = this.scene.add.text(this.x + bx * 34, this.y + by * 34 + 8, '💨', { fontSize: '26px' })
      .setOrigin(0.5).setDepth(this.y - 1).setFlipX(bx > 0).setScale(Phaser.Math.FloatBetween(0.6, 1));
    this.scene.tweens.add({
      targets: puff,
      x: puff.x + bx * 40,
      y: puff.y + by * 40,
      alpha: 0,
      scale: puff.scale * 0.4,
      duration: 400,
      onComplete: () => puff.destroy(),
    });
  }

  // Turn away from `others` within FLEE_RADIUS (closer ones count more) and from nearby walls.
  // Call before update() each frame while fleeSpeed > 0.
  steerAway(others, delta) {
    let ax = 0;
    let ay = 0;
    for (const other of others) {
      const dx = this.x - other.x;
      const dy = this.y - other.y;
      const dist = Math.hypot(dx, dy) || 1;
      if (dist >= FLEE_RADIUS) continue;
      const weight = (FLEE_RADIUS - dist) / FLEE_RADIUS;
      ax += (dx / dist) * weight;
      ay += (dy / dist) * weight;
    }
    const wall = (gap) => Math.max(0, (WALL_MARGIN - gap) / WALL_MARGIN);
    ax += wall(this.x - ARENA.x) - wall(ARENA.x + ARENA.width - this.x);
    ay += wall(this.y - ARENA.y) - wall(ARENA.y + ARENA.height - this.y);

    const len = Math.hypot(ax, ay);
    if (len < 0.01) return;
    const turn = Math.min(1, (delta / 1000) * 4);
    this.vx = Phaser.Math.Linear(this.vx, (ax / len) * this.fleeSpeed, turn);
    this.vy = Phaser.Math.Linear(this.vy, (ay / len) * this.fleeSpeed, turn);
  }

  // Point the sword the way we're moving.
  face(dx) {
    if (Math.abs(dx) < 1) return;
    const right = dx > 0;
    this.sword.setX(right ? 30 : -30).setScale(right ? -1 : 1, 1);
  }

  get chasing() { return this.target != null; }

  // Run at `target`; onArrive() fires once when in range (or after CHASE_TIMEOUT).
  chase(target, onArrive) {
    this.target = target;
    this.onArrive = onArrive;
    this.chaseStart = this.scene.time.now;
  }

  cancelChase() {
    this.target = this.onArrive = null;
  }

  // ---- Combat effects ----

  swing() {
    const dir = this.sword.scaleX < 0 ? 1 : -1;
    this.scene.tweens.add({ targets: this.sword, angle: dir * 100, duration: 90, yoyo: true, ease: 'Quad.easeOut' });
  }

  hurt(fromX, fromY) {
    const dx = this.x - fromX;
    const dy = this.y - fromY;
    const dist = Math.hypot(dx, dy) || 1;
    this.vx = (dx / dist) * 450;   // knockback; stepWander eases it back down
    this.vy = (dy / dist) * 450;
    this.scene.tweens.add({ targets: this.emoji, alpha: 0.2, duration: 70, yoyo: true, repeat: 2 });
  }

  // Fall over, fade out, and stop moving.
  knockOut() {
    this.out = true;
    this.cancelChase();
    this.setSword(false).setBubble(null);
    this.hearts.setVisible(false);
    this.figure.y = 0;
    this.scene.tweens.add({ targets: this.figure, angle: 90, duration: 300, ease: 'Bounce.easeOut' });
    this.scene.tweens.add({ targets: this, alpha: 0.35, duration: 600 });
  }

  destroy(fromScene) {
    this.bubble?.destroy();
    super.destroy(fromScene);
  }
}
