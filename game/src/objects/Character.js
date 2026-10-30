import * as Phaser from 'phaser';
import { WIDTH, HEIGHT, ARENA, arenaEdges, WANDER_SPEED, CHASE_SPEED, FLEE_RADIUS, ATTACK_RANGE, CHASE_TIMEOUT, PERSONAL_SPACE } from '../config.js';

const WALL_MARGIN = 120;   // while fleeing, walls closer than this push back so nobody gets cornered
const FEET = 24;           // the emoji's bottom, below the character's position; feet stay on the ARENA floor
const HALF_WIDTH = 26;     // keeps the emoji's sides off the side walls
const PUFF_EVERY = 0.06;   // seconds between 💨 puffs while charging
// Hops speed up with movement: one per HOP_STRIDE px travelled (~1.8/s while wandering), kept within these rates.
const HOP_STRIDE = 40;
const HOP_RATE = { min: 1.2, max: 7 };   // hops per second
const HOP_HEIGHT = 12;
const HOP_TILT = { min: 3, max: 7 };     // degrees; each hop leans the other way by a random amount in this range
// Knockbacks launch the figure into a flip through the air; ground speed fades by AIR_DRAG per second meanwhile.
const AIR_TIME = 0.55;     // seconds
const AIR_HEIGHT = 70;     // px at the top of the arc
const AIR_DRAG = 3;
// A knockout flings the character off screen, spinning and growing as if flying at the camera.
const FLING_DELAY = 120;      // ms of hit-stop before the launch
const FLING_TIME = 1100;      // ms to cross FLING_DISTANCE at a steady speed (it's off screen well before)
const GROW_TIME = 500;        // ms to reach FLING_SCALE
const FLING_DISTANCE = 1600;  // px; far enough to leave the screen from anywhere
const FLING_SCALE = 2.5;
const FLING_SPINS = 3;
const BLAST_SCALE = 2;        // the KO burst frames are 128×256 at scale 1
const BLAST_INSET = 64 * BLAST_SCALE;   // keep the burst at least this far from a corner
// A soft blue blob under the feet, like the arena's blue AO; it shrinks and fades as the figure leaves the ground.
const SHADOW_COLOR = '20, 30, 110';   // r, g, b
const SHADOW_ALPHA = 0.55;
const SHADOW_SIZE = { w: 45, h: 14 };
const SHADOW_LIFT = 110;   // px of height at which the shadow would vanish

const SWORD = '🗡️';
const SHIELD = '🛡️';
const HAND_X = 32;          // sword in front of the emoji, shield behind
const SWORD_Y = 4;
const SHIELD_Y = 8;
const GRIP_FOLLOW = 18;     // how quickly the sword and shield catch up with the hop (higher = less lag)
// Noto draws 🗡️ blade down-left; this turns it mostly upright, tipped slightly forward (mirrored when facing right).
const SWORD_ANGLE = 120;

// The shadow texture, drawn once per game: a radial gradient squashed into an ellipse by the image's scale.
function shadowTexture(scene) {
  if (!scene.textures.exists('shadow')) {
    const size = 64;
    const texture = scene.textures.createCanvas('shadow', size, size);
    const ctx = texture.context;
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, `rgba(${SHADOW_COLOR}, 1)`);
    gradient.addColorStop(0.5, `rgba(${SHADOW_COLOR}, 0.8)`);
    gradient.addColorStop(1, `rgba(${SHADOW_COLOR}, 0)`);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    texture.refresh();
  }
  return 'shadow';
}

// Where a character's position can be so it stands on the floor: top/bottom, and left/right at height y.
function limits(y) {
  const { left, right } = arenaEdges(y + FEET);
  return { top: ARENA.top - FEET, bottom: ARENA.bottom - FEET, left: left + HALF_WIDTH, right: right - HALF_WIDTH };
}

// A random spot on the floor.
function randomSpot() {
  const { top, bottom } = limits(0);
  const y = Phaser.Math.Between(top, bottom);
  const { left, right } = limits(y);
  return { x: Phaser.Math.Between(left, right), y };
}

// Nudge wandering characters apart so they don't stack. Chasers, airborne and knocked-out characters are left alone.
export function separate(characters, delta) {
  const free = characters.filter((c) => !c.out && !c.chasing && !c.airborne);
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
    const spot = randomSpot();
    super(scene, x ?? spot.x, y ?? spot.y);
    this.name = player.name;
    this.hopPhase = Math.random() * Math.PI;   // so characters don't hop in sync; one hop per π
    this.hopSide = Math.random() < 0.5 ? -1 : 1;
    this.hopTilt = Phaser.Math.FloatBetween(HOP_TILT.min, HOP_TILT.max);
    this.speed = WANDER_SPEED;                 // smoothed px/s actually moved, drives the hop rate
    this.lastPos = { x: this.x, y: this.y };   // position at the end of the previous update()
    this.air = 0;                              // seconds left in a knockback flip (see knockback)
    this.out = false;
    this.target = null;
    this.fleeSpeed = 0;     // set by the scene; when > 0, moves at this speed and steers away (see steerAway)
    this.chaseSpeed = CHASE_SPEED;   // the scene raises it during sudden death

    const angle = Math.random() * Math.PI * 2;
    this.vx = Math.cos(angle) * WANDER_SPEED;
    this.vy = Math.sin(angle) * WANDER_SPEED;

    // The figure (emoji + sword) hops; the shadow and labels under it stay put.
    this.shadow = scene.add.image(0, FEET - 2, shadowTexture(scene)).setDisplaySize(SHADOW_SIZE.w, SHADOW_SIZE.h);
    this.shadowScale = { x: this.shadow.scaleX, y: this.shadow.scaleY };
    this.emoji = scene.add.text(0, 0, player.emoji, { fontSize: '52px' }).setOrigin(0.5);
    this.sword = scene.add.text(HAND_X, SWORD_Y, SWORD, { fontSize: '38px' }).setOrigin(0.5).setVisible(false);
    this.shield = scene.add.text(-HAND_X, SHIELD_Y, SHIELD, { fontSize: '34px' }).setOrigin(0.5).setVisible(false);
    this.figure = scene.add.container(0, 0, [this.emoji, this.sword, this.shield]);   // held items in front
    this.gripY = 0;   // where the sword and shield have caught up to in the hop (they trail it slightly)
    this.nameText = scene.add.text(0, 38, player.name, { fontSize: '16px', color: '#e8e8f0', fontStyle: 'bold' }).setOrigin(0.5, 0);
    this.hearts = scene.add.text(0, 58, '', { fontSize: '14px' }).setOrigin(0.5, 0).setVisible(false);
    this.add([this.shadow, this.figure, this.nameText, this.hearts]);

    // The bubble is its own object on a high depth so it's never hidden behind another character.
    this.bubbleBg = scene.add.graphics();
    // Bubbles are sized to their text, so they use a shorter test string than TEST_STRING: 🌞 is as tall as most emoji.
    this.bubbleText = scene.add.text(0, 0, '', { fontSize: '22px', color: '#1d1f27', fontStyle: 'bold', testString: '|MÉqgy🌞' }).setOrigin(0.5);
    this.typingDots = [-14, 0, 14].map((dx) => scene.add.circle(dx, -26, 5, 0x8e8e93).setVisible(false));
    this.typingTweens = [];
    this.alert = scene.add.text(0, 0, '', { fontSize: '28px', fontStyle: 'bold', color: '#ff4d4d' }).setOrigin(0.5).setVisible(false);
    this.alertCount = 0;
    this.puffClock = 0;
    this.bubble = scene.add.container(0, 0, [this.bubbleBg, this.bubbleText, ...this.typingDots, this.alert]).setDepth(10000).setVisible(false);

    this.face(this.vx < 0 ? -1 : 1);
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

  // Hold up a shield (on the side away from the sword) while a counter is ready.
  setShield(visible) {
    if (visible === this.shield.visible) return this;
    this.shield.setVisible(visible);
    if (visible) this.scene.tweens.add({ targets: this.shield, scale: { from: 1.8, to: 1 }, duration: 200, ease: 'Back.easeOut' });
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

    if (this.airborne) this.stepAir(dt);
    else if (this.target) this.stepChase(time, dt);
    else if (!this.out) this.stepWander(dt);

    // Measured since last frame so separate() shoves and knockbacks count too.
    if (!this.out && !this.airborne) this.hop(Math.hypot(this.x - this.lastPos.x, this.y - this.lastPos.y) / (dt || 1), dt);
    this.lastPos = { x: this.x, y: this.y };
    if (!this.out) this.setDepth(this.y);   // lower on screen = in front
    this.updateShadow();
    // Clear of the top of a hop; it ignores the hop but flies along with a knockback so it never covers the figure.
    this.bubble.setPosition(this.x, this.y - 40 - HOP_HEIGHT + (this.airborne ? this.figure.y : 0));
  }

  // Bob the figure (not the labels or bubble), faster the faster we're moving. `speed` is this frame's px/s.
  // Each hop also leans the emoji (not the sword and shield) a little, alternating sides, upright again at
  // take-off and landing.
  hop(speed, dt) {
    this.speed = Phaser.Math.Linear(this.speed, speed, Math.min(1, dt * 8));
    const rate = Phaser.Math.Clamp(this.speed / HOP_STRIDE, HOP_RATE.min, HOP_RATE.max);
    const phase = this.hopPhase + Math.PI * rate * dt;
    if (phase >= Math.PI) {
      this.hopSide = -this.hopSide;
      this.hopTilt = Phaser.Math.FloatBetween(HOP_TILT.min, HOP_TILT.max);
    }
    this.hopPhase = phase % Math.PI;
    const lift = Math.sin(this.hopPhase);
    this.figure.y = -lift * HOP_HEIGHT;
    this.gripY = Phaser.Math.Linear(this.gripY, this.figure.y, Math.min(1, dt * GRIP_FOLLOW));
    this.setGripLag(this.gripY - this.figure.y);
    this.emoji.angle = this.shakeTween?.isPlaying() ? 0 : this.hopSide * this.hopTilt * lift;
  }

  // Shrink and fade the shadow the higher the figure is off the ground.
  updateShadow() {
    const ground = Phaser.Math.Clamp(1 + this.figure.y / SHADOW_LIFT, 0, 1);
    const scale = 0.4 + 0.6 * ground;
    this.shadow.setScale(this.shadowScale.x * scale, this.shadowScale.y * scale).setAlpha(SHADOW_ALPHA * ground);
  }

  // Offset the sword and shield from their resting spots by `lag` px of hop they haven't caught up with yet.
  setGripLag(lag) {
    this.sword.y = SWORD_Y + lag;
    this.shield.y = SHIELD_Y + lag;
  }

  // Fly back from a knockback: the figure arcs up and flips while the character drifts and slows down.
  stepAir(dt) {
    this.air = Math.max(0, this.air - dt);
    const drag = Math.exp(-AIR_DRAG * dt);
    this.vx *= drag;
    this.vy *= drag;
    this.move(dt);

    const t = 1 - this.air / AIR_TIME;
    this.figure.y = -4 * AIR_HEIGHT * t * (1 - t);
    this.figure.angle = this.spin * 360 * t;
    if (!this.airborne) this.land();
  }

  // Touch down with a squash, then carry on at walking pace instead of sliding off fast.
  land() {
    this.figure.setAngle(0).setY(0);
    this.scene.tweens.add({ targets: this.figure, scaleX: { from: 1.3, to: 1 }, scaleY: { from: 0.7, to: 1 }, duration: 180, ease: 'Back.easeOut' });
    const speed = Math.hypot(this.vx, this.vy) || 1;
    const walk = this.fleeSpeed || WANDER_SPEED;
    this.vx *= walk / speed;
    this.vy *= walk / speed;
    this.speed = walk;
    this.hopPhase = 0;   // start the next hop from the ground
    this.gripY = 0;
  }

  get airborne() { return this.air > 0; }

  stepWander(dt) {
    // Ease toward cruising speed (e.g. after a knockback).
    const speed = Math.hypot(this.vx, this.vy) || 1;
    const scale = Phaser.Math.Linear(speed, this.fleeSpeed || WANDER_SPEED, Math.min(1, dt * 2)) / speed;
    this.vx *= scale;
    this.vy *= scale;

    this.move(dt);
    this.face(this.vx);
  }

  // Move by the velocity, bouncing off the arena walls.
  move(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    const { top, bottom } = limits(this.y);
    if (this.y < top || this.y > bottom) { this.vy = -this.vy; this.y = Phaser.Math.Clamp(this.y, top, bottom); }
    const { left, right } = limits(this.y);
    if (this.x < left || this.x > right) { this.vx = -this.vx; this.x = Phaser.Math.Clamp(this.x, left, right); }
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
    const step = Math.min(dist, this.chaseSpeed * dt);
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
    if (this.airborne) return;
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
    const { top, bottom, left, right } = limits(this.y);
    ax += wall(this.x - left) - wall(right - this.x);
    ay += wall(this.y - top) - wall(bottom - this.y);

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
    if (right === this.facingRight) return;   // only on turning, so a swing tween isn't overwritten
    this.facingRight = right;
    this.swingTween?.remove();
    this.sword.setX(right ? HAND_X : -HAND_X).setScale(right ? -1 : 1, 1).setAngle(right ? -SWORD_ANGLE : SWORD_ANGLE);
    this.shield.setX(right ? -HAND_X : HAND_X);
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

  // Chop forward from the raised sword and back.
  swing() {
    const rest = this.facingRight ? -SWORD_ANGLE : SWORD_ANGLE;
    this.swingTween?.remove();
    this.sword.setAngle(rest);
    this.swingTween = this.scene.tweens.add({ targets: this.sword, angle: rest + (this.facingRight ? 100 : -100), duration: 90, yoyo: true, ease: 'Quad.easeOut' });
  }

  // Get knocked away from (fromX, fromY), flipping through the air for AIR_TIME (see stepAir).
  knockback(fromX, fromY, force) {
    const dx = this.x - fromX;
    const dy = this.y - fromY;
    const dist = Math.hypot(dx, dy) || 1;
    this.vx = (dx / dist) * force;
    this.vy = (dy / dist) * force;
    this.shakeTween?.remove();
    this.emoji.setAngle(0);   // the whole figure flips instead
    this.setGripLag(0);   // held tight through the flip
    this.air = AIR_TIME;
    this.spin = dx < 0 ? -1 : 1;   // backflip away from the hit
    return this;
  }

  hurt(fromX, fromY) {
    this.knockback(fromX, fromY, 450);
    this.scene.tweens.add({ targets: this.emoji, alpha: 0.2, duration: 70, yoyo: true, repeat: 2 });
  }

  // A quick "nope" wobble, e.g. when a chat message didn't hit anyone.
  shakeHead() {
    if (this.airborne) return this;
    this.shakeTween?.remove();
    this.figure.setAngle(0);
    this.shakeTween = this.scene.tweens.add({ targets: this.figure, angle: { from: -14, to: 14 }, duration: 70, yoyo: true, repeat: 2, onComplete: () => this.figure.setAngle(0) });
    return this;
  }

  // Get flung off screen away from (fromX, fromY) and a bit upward, then blast out where we leave it.
  // onGone() fires at that moment, for the scene's own effects.
  knockOut(fromX, fromY, onGone) {
    this.out = true;
    this.cancelChase();
    this.shakeTween?.remove();
    this.air = 0;
    this.setSword(false).setShield(false).setBubble(null).setAlert(0);
    this.hearts.setVisible(false);
    this.nameText.setVisible(false);
    this.shadow.setVisible(false);   // nothing to cast it on once flying at the camera
    this.figure.setY(0).setAngle(0);
    this.emoji.setAngle(0);
    this.scene.tweens.killTweensOf(this.emoji);   // no hurt() flash: fly out solid
    this.emoji.setAlpha(1);
    this.setDepth(15000);   // over everyone else on the way out

    const dx = this.x - fromX;
    const dy = this.y - fromY;
    const dist = Math.hypot(dx, dy) || 1;
    const ux = dx / dist;
    const uy = dy / dist - 0.8;
    const len = Math.hypot(ux, uy) || 1;
    const spin = ux < 0 ? -1 : 1;
    this.scene.tweens.add({ targets: this.figure, angle: spin * 360 * FLING_SPINS, delay: FLING_DELAY, duration: FLING_TIME });
    this.scene.tweens.add({ targets: this, scale: FLING_SCALE, delay: FLING_DELAY, duration: GROW_TIME, ease: 'Cubic.easeOut' });
    this.scene.tweens.add({
      targets: this,
      x: this.x + (ux / len) * FLING_DISTANCE,
      y: this.y + (uy / len) * FLING_DISTANCE,
      delay: FLING_DELAY,
      duration: FLING_TIME,
      onUpdate: (tween) => {
        if (!this.visible || (this.x > 0 && this.x < WIDTH && this.y > 0 && this.y < HEIGHT)) return;
        this.setVisible(false);
        tween.stop();
        this.blast();
        onGone?.();
      },
    });
  }

  // The 'ko' flame burst (loaded by BattleScene) on the screen edge we just left, its base on the edge and its
  // tip pointing back into the arena.
  blast() {
    const x = Phaser.Math.Clamp(this.x, BLAST_INSET, WIDTH - BLAST_INSET);
    const y = Phaser.Math.Clamp(this.y, BLAST_INSET, HEIGHT - BLAST_INSET);
    const [bx, by, angle] =
      this.x <= 0 ? [0, y, 90]
      : this.x >= WIDTH ? [WIDTH, y, -90]
      : this.y <= 0 ? [x, 0, 180]
      : [x, HEIGHT, 0];
    this.scene.add.sprite(bx, by, 'ko').setOrigin(0.5, 1).setAngle(angle).setScale(BLAST_SCALE).setDepth(20000)
      .play('ko').once('animationcomplete', (_anim, _frame, sprite) => sprite.destroy());
  }

  destroy(fromScene) {
    this.bubble?.destroy();
    super.destroy(fromScene);
  }
}
