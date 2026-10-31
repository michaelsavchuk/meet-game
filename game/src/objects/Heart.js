import * as Phaser from '/vendor/phaser.js';
import { WIDTH, HEIGHT, ENTER_SPEED } from '../config.js';
import { shadowTexture, shadowAt, glowTexture, exitPath } from './Character.js';

// A heart pickup (BattleScene): thrown in from the side of the screen, flipping through the air like a knocked-back
// character, onto a spot on the floor. Then it hops in place like a character walking, only higher, in a rotating
// sunburst with a pulsing glow, its word in a pink bubble. A character that reaches it collect()s it; after
// `lifetime` ms on the ground (its bubble wiggling near the end) it expire()s and runs off up the nearest stairs.
const SIZE = 56;               // px font size of the 💖
// The throw: from off screen at `from` px up, an arc `height` px high (on top of that) over `ms`, flipping `flips` times.
const THROW = { ms: 1000, from: 60, height: 150, flips: 2 };
const TRAIL_EVERY = 45;        // ms between ✨ left behind while thrown
// Hops like Character's (see hop there), but higher and leaning further. `rate` is hops per second waiting in place,
// `runRate` while running off.
const HOP = { height: 24, rate: 1.8, runRate: 7, tilt: { min: 8, max: 14 } };
const RAYS = { count: 12, radius: 90, inner: 'rgba(255, 240, 180, 1)', outer: 'rgba(255, 216, 77, 0)', spinMs: 6000, alpha: 0.55 };
const GLOW = {
  radius: 70, stops: [[0, 'rgba(255, 230, 240, 1)'], [0.35, 'rgba(255, 110, 160, 0.8)'], [1, 'rgba(255, 92, 138, 0)']],
  alpha: { min: 0.45, max: 0.9 }, ms: 600,
};
// The bubble starts wiggling WARN.for ms before it expires, WARN.every.max ms apart at first, down to
// WARN.every.min at the end.
const WARN = { for: 4000, every: { max: 1400, min: 450 } };
const SHADOW = { w: 50, h: 15 };    // the characters' soft blue shadow, a little wider
const BUBBLE_FILL = 0xffc6d9;
const BUBBLE_ABOVE = 44;       // the bubble's tail tip is this far above the heart's center at the top of a hop
const SCREEN_MARGIN = 8;       // px the bubble keeps from the top of the screen

// A sunburst texture of `count` rays fading from `inner` to `outer` (CSS colors) at `radius` px, drawn once per key.
function sunburstTexture(scene, key, { count, radius, inner, outer }) {
  if (!scene.textures.exists(key)) {
    const size = radius * 2;
    const t = scene.textures.createCanvas(key, size, size);
    const ctx = t.context;
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, inner);
    g.addColorStop(1, outer);
    ctx.fillStyle = g;
    const step = (Math.PI * 2) / count;
    for (let i = 0; i < count; i++) {
      ctx.beginPath();
      ctx.moveTo(size / 2, size / 2);
      ctx.arc(size / 2, size / 2, size / 2, i * step, i * step + step * 0.45);
      ctx.closePath();
      ctx.fill();
    }
    t.refresh();
  }
  return key;
}

export class Heart extends Phaser.GameObjects.Container {
  // Is thrown onto (x, y), a character position on the floor. onLanded() fires when it can be grabbed, onExpire() if
  // nobody grabs it in time.
  constructor(scene, x, y, word, { lifetime, onLanded, onExpire }) {
    super(scene, x, y);
    this.word = word;
    this.landed = false;
    this.gone = false;
    this.path = null;   // points left to run through on the way out (see expire)
    this.hopPhase = 0;
    this.hopSide = Math.random() < 0.5 ? -1 : 1;
    this.hopTilt = Phaser.Math.FloatBetween(HOP.tilt.min, HOP.tilt.max);

    // The word bubble, like a character's but pink, on a high depth so it's never hidden.
    this.bubbleBg = scene.add.graphics();
    this.bubbleText = scene.add.text(0, 0, word, { fontSize: '26px', color: '#5a0f2c', fontStyle: 'bold', testString: '|MÉqgy🌞' }).setOrigin(0.5);
    const w = this.bubbleText.width + 24;
    const h = this.bubbleText.height + 14;
    this.bubbleText.setY(-h / 2 - 8);
    this.bubbleBg.fillStyle(BUBBLE_FILL, 1)
      .fillRoundedRect(-w / 2, -h - 8, w, h, 12)
      .fillTriangle(-8, -9, 8, -9, 0, 0);
    // Land low enough that the bubble clears the top of the screen.
    y = Math.max(y, HOP.height + BUBBLE_ABOVE + h + 8 + SCREEN_MARGIN);
    this.bubble = scene.add.container(x, y - HOP.height - BUBBLE_ABOVE, [this.bubbleBg, this.bubbleText]).setDepth(10000).setVisible(false);

    this.shadow = scene.add.image(0, 22, shadowTexture(scene)).setDisplaySize(SHADOW.w, SHADOW.h);
    this.shadowScale = { x: this.shadow.scaleX, y: this.shadow.scaleY };
    this.rays = scene.add.image(0, 0, sunburstTexture(scene, 'heartRays', RAYS)).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0).setScale(0.3);
    this.glow = scene.add.image(0, 0, glowTexture(scene, 'heartGlow', GLOW)).setBlendMode(Phaser.BlendModes.ADD);
    this.emoji = scene.add.text(0, 0, '💖', { fontSize: `${SIZE}px` }).setOrigin(0.5);
    this.figure = scene.add.container(0, 0, [this.rays, this.glow, this.emoji]);
    this.add([this.shadow, this.figure]);

    // Thrown from off screen on the side nearer the spot.
    const side = x < WIDTH / 2 ? -1 : 1;
    this.throw = { t: 0, from: { x: side < 0 ? -SIZE : WIDTH + SIZE, y }, to: { x, y }, spin: -side };
    this.setPosition(this.throw.from.x, y);
    this.stepThrow(0);
    this.trail = scene.time.addEvent({ delay: TRAIL_EVERY, loop: true, callback: () => this.sparkleAt(this.x, this.y + this.figure.y, 400) });

    scene.add.existing(this);
    scene.events.on('update', this.update, this);   // it keeps moving after the scene lets go of it (see expire)
    this.onLanded = () => {
      onLanded?.();
      this.timers = [
        scene.time.delayedCall(lifetime - WARN.for, () => !this.gone && this.warn()),
        scene.time.delayedCall(lifetime, () => { if (!this.gone) { this.expire(); onExpire?.(); } }),
      ];
    };
  }

  update(_time, delta) {
    const dt = delta / 1000;
    if (this.throw) this.stepThrow(dt);
    else if (this.path) { if (!this.stepPath(dt)) return; }
    else if (this.gone) return;
    else this.hop(HOP.rate, dt);
    this.setDepth(this.y);   // in front of characters behind it
    this.updateShadow();
  }

  // Fly in like a knockback (Character's stepAir): arcing up and flipping while it slows down across the floor.
  stepThrow(dt) {
    const { from, to, spin } = this.throw;
    const t = this.throw.t = Math.min(1, this.throw.t + (dt * 1000) / THROW.ms);
    const ground = 1 - (1 - t) ** 2;
    this.setPosition(Phaser.Math.Linear(from.x, to.x, ground), Phaser.Math.Linear(from.y, to.y, ground));
    this.figure.y = -(THROW.from * (1 - t) + 4 * THROW.height * t * (1 - t));
    this.figure.angle = spin * 360 * THROW.flips * t;
    if (t >= 1) this.land();
  }

  // Touch down with a squash (like a character after a knockback), then light up and start hopping.
  land() {
    const { scene } = this;
    this.throw = null;
    this.trail.remove();
    this.landed = true;
    this.figure.setAngle(0).setY(0);
    scene.tweens.add({ targets: this.figure, scaleX: { from: 1.3, to: 1 }, scaleY: { from: 0.7, to: 1 }, duration: 180, ease: 'Back.easeOut' });

    // The standout effect: a spinning sunburst and a pulsing glow.
    scene.tweens.add({ targets: this.rays, alpha: RAYS.alpha, scale: 1, duration: 300, ease: 'Back.easeOut' });
    scene.tweens.add({ targets: this.rays, angle: 360, duration: RAYS.spinMs, repeat: -1 });
    scene.tweens.add({ targets: this.glow, alpha: { from: GLOW.alpha.max, to: GLOW.alpha.min }, scale: { from: 1.1, to: 0.85 }, duration: GLOW.ms, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    this.bubble.setVisible(true);
    scene.tweens.add({ targets: this.bubble, scale: { from: 0.3, to: 1 }, duration: 250, ease: 'Back.easeOut' });
    this.onLanded();
  }

  // Bob the figure `rate` times a second, leaning the emoji to alternating sides, like Character's hop().
  hop(rate, dt) {
    const phase = this.hopPhase + Math.PI * rate * dt;
    if (phase >= Math.PI) {
      this.hopSide = -this.hopSide;
      this.hopTilt = Phaser.Math.FloatBetween(HOP.tilt.min, HOP.tilt.max);
    }
    this.hopPhase = phase % Math.PI;
    const lift = Math.sin(this.hopPhase);
    this.figure.y = -lift * HOP.height;
    this.emoji.angle = this.hopSide * this.hopTilt * lift;
  }

  // Run along the way out at a character's entering pace, hopping fast. Once off screen it's destroyed, and this
  // returns false.
  stepPath(dt) {
    let step = ENTER_SPEED * dt;
    while (this.path.length && step > 0) {
      const { x, y } = this.path[0];
      const dist = Math.hypot(x - this.x, y - this.y);
      if (dist > step) {
        this.x += ((x - this.x) / dist) * step;
        this.y += ((y - this.y) / dist) * step;
        break;
      }
      this.setPosition(x, y);
      step -= dist;
      this.path.shift();
    }
    if (!this.path.length) { this.destroy(); return false; }
    this.hop(HOP.runRate, dt);
    return true;
  }

  // Like a character's shadow: shrinks and fades the higher the heart is off the ground.
  updateShadow() {
    const { scale, alpha } = shadowAt(-this.figure.y);
    this.shadow.setScale(this.shadowScale.x * scale, this.shadowScale.y * scale).setAlpha(alpha);
  }

  // Wiggle the bubble on its tail with a little pop (like a character shaking its head) for the last WARN.for ms before
  // it runs out, more and more often, so players see it's about to go.
  warn() {
    const wiggle = () => {
      this.bubble.setAngle(0);
      this.scene.tweens.add({ targets: this.bubble, angle: { from: -10, to: 10 }, duration: 70, yoyo: true, repeat: 2, onComplete: () => this.bubble.setAngle(0) });
      this.scene.tweens.add({ targets: this.bubble, scale: { from: 1.15, to: 1 }, duration: 400, ease: 'Quad.easeOut' });
    };
    const end = this.scene.time.now + WARN.for;
    const next = () => {
      if (this.gone) return;
      wiggle();
      const left = Phaser.Math.Clamp((end - this.scene.time.now) / WARN.for, 0, 1);
      this.timers.push(this.scene.time.delayedCall(Phaser.Math.Linear(WARN.every.min, WARN.every.max, left), next));
    };
    next();
  }

  // `character` grabbed it: it shrinks into them in a burst of hearts and sparkles.
  collect(character) {
    if (this.gone) return;
    this.gone = true;
    this.bubble.setVisible(false);
    this.shadow.setVisible(false);
    this.scene.tweens.killTweensOf(this.figure);
    for (let i = 0; i < 10; i++) this.sparkleAt(this.x, this.y + this.figure.y, 600, i % 2 ? '💖' : '✨', 90);
    this.scene.tweens.add({
      targets: this, x: character.x, y: character.y - 10, scale: 0.3, duration: 220, ease: 'Quad.easeIn',
      onComplete: () => this.destroy(),
    });
  }

  // Ran out: run off up the nearest stairs, like a character running in backwards. One still in the air (e.g. the
  // round ended) just shrinks and fades.
  expire() {
    if (this.gone) return;
    this.gone = true;
    this.bubble.setVisible(false);
    this.scene.tweens.killTweensOf(this.figure);
    if (this.landed) { this.path = exitPath(this); return; }
    this.throw = null;
    this.trail.remove();
    this.scene.tweens.add({ targets: this, scale: 0, alpha: 0, duration: 300, ease: 'Back.easeIn', onComplete: () => this.destroy() });
  }

  // A ✨ (or `text`) at (x, y) that drifts off by up to `spread` px and fades.
  sparkleAt(x, y, ms, text = '✨', spread = 25) {
    if (y > HEIGHT + 50) return;
    const s = this.scene.add.text(x + Phaser.Math.Between(-12, 12), y, text, { fontSize: '20px' }).setOrigin(0.5).setDepth(this.depth + 1);
    this.scene.tweens.add({
      targets: s, x: s.x + Phaser.Math.Between(-spread, spread), y: s.y + Phaser.Math.Between(-spread, spread / 2),
      alpha: 0, scale: 0.3, duration: ms, onComplete: () => s.destroy(),
    });
  }

  destroy(fromScene) {
    this.scene?.events.off('update', this.update, this);
    this.trail?.remove();
    for (const timer of this.timers ?? []) timer.remove();
    this.scene?.tweens.killTweensOf([this.shadow, this.figure, this.emoji, this.rays, this.glow, this.bubble]);
    this.bubble?.destroy();
    super.destroy(fromScene);
  }
}
