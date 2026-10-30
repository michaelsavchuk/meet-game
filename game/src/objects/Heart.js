import * as Phaser from 'phaser';
import { HEIGHT } from '../config.js';

// A heart pickup (BattleScene): drops from the top of the screen onto a spot on the floor, its shadow growing there
// as it falls, and lands with a bounce and a ring. Then it floats, beating, in a rotating sunburst with a pulsing glow
// and orbiting sparkles, its word in a pink bubble. A character that reaches it collect()s it; after `lifetime` ms on
// the ground (blinking near the end) it expire()s by itself.
const SIZE = 56;               // px font size of the 💖
const FALL_MS = 900;
const TRAIL_EVERY = 45;        // ms between ✨ left behind while falling
const FLOAT = { height: 8, ms: 900 };   // bob while waiting
const BEAT_MS = 700;           // one heartbeat (two quick pulses)
const RAYS = { count: 12, radius: 90, spinMs: 6000, alpha: 0.55 };
const GLOW = { radius: 70, alpha: { min: 0.45, max: 0.9 }, ms: 600 };
const SPARKLES = { count: 3, radius: { x: 52, y: 22 }, spinMs: 2400 };
const RING = { radius: 90, ms: 450 };
const BLINK_FOR = 3000;        // ms before expiring that it starts blinking
const SHADOW = { w: 50, h: 15, alpha: 0.55 };
const PINK = 0xff5c8a;
const GOLD = 0xffd84d;
const BUBBLE_FILL = 0xffc6d9;
const LIFT = 34;               // the heart floats this far above its spot (where its shadow is)
const BUBBLE_ABOVE = 44;       // the bubble's tail tip is this far above the heart's center
const SCREEN_MARGIN = 8;       // px the bubble keeps from the top of the screen

// Canvas textures drawn once per game: a soft radial glow and a sunburst whose rays fade outward.
function textures(scene) {
  if (!scene.textures.exists('heartGlow')) {
    const size = GLOW.radius * 2;
    const t = scene.textures.createCanvas('heartGlow', size, size);
    const g = t.context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(255, 230, 240, 1)');
    g.addColorStop(0.35, 'rgba(255, 110, 160, 0.8)');
    g.addColorStop(1, 'rgba(255, 92, 138, 0)');
    t.context.fillStyle = g;
    t.context.fillRect(0, 0, size, size);
    t.refresh();
  }
  if (!scene.textures.exists('heartRays')) {
    const size = RAYS.radius * 2;
    const t = scene.textures.createCanvas('heartRays', size, size);
    const ctx = t.context;
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(255, 240, 180, 1)');
    g.addColorStop(1, 'rgba(255, 216, 77, 0)');
    ctx.fillStyle = g;
    const step = (Math.PI * 2) / RAYS.count;
    for (let i = 0; i < RAYS.count; i++) {
      ctx.beginPath();
      ctx.moveTo(size / 2, size / 2);
      ctx.arc(size / 2, size / 2, size / 2, i * step, i * step + step * 0.45);
      ctx.closePath();
      ctx.fill();
    }
    t.refresh();
  }
}

export class Heart extends Phaser.GameObjects.Container {
  // Falls onto (x, y), a character position on the floor. onLanded() fires when it can be grabbed, onExpire() if
  // nobody grabs it in time.
  constructor(scene, x, y, word, { lifetime, onLanded, onExpire }) {
    super(scene, x, y);
    textures(scene);
    this.word = word;
    this.landed = false;
    this.gone = false;

    // The word bubble, like a character's but pink, on a high depth so it's never hidden.
    this.bubbleBg = scene.add.graphics();
    this.bubbleText = scene.add.text(0, 0, word, { fontSize: '26px', color: '#5a0f2c', fontStyle: 'bold', testString: '|MÉqgy🌞' }).setOrigin(0.5);
    const w = this.bubbleText.width + 24;
    const h = this.bubbleText.height + 14;
    this.bubbleText.setY(-h / 2 - 8);
    this.bubbleBg.fillStyle(BUBBLE_FILL, 1).lineStyle(3, PINK, 1)
      .fillRoundedRect(-w / 2, -h - 8, w, h, 12).strokeRoundedRect(-w / 2, -h - 8, w, h, 12)
      .fillTriangle(-8, -9, 8, -9, 0, 0);
    // Land low enough that the bubble clears the top of the screen even at the top of the float.
    this.y = y = Math.max(y, LIFT + FLOAT.height + BUBBLE_ABOVE + h + 8 + SCREEN_MARGIN);
    this.bubble = scene.add.container(x, y - LIFT - BUBBLE_ABOVE, [this.bubbleBg, this.bubbleText]).setDepth(10000).setVisible(false);

    this.shadow = scene.add.ellipse(0, 22, SHADOW.w, SHADOW.h, 0x141e6e, SHADOW.alpha).setScale(0.2).setAlpha(0);
    this.rays = scene.add.image(0, 0, 'heartRays').setBlendMode(Phaser.BlendModes.ADD).setAlpha(0).setScale(0.3);
    this.glow = scene.add.image(0, 0, 'heartGlow').setBlendMode(Phaser.BlendModes.ADD);
    this.emoji = scene.add.text(0, 0, '💖', { fontSize: `${SIZE}px` }).setOrigin(0.5);
    this.sparkles = Array.from({ length: SPARKLES.count }, () => scene.add.text(0, 0, '✨', { fontSize: '22px' }).setOrigin(0.5).setVisible(false));
    this.figure = scene.add.container(0, -(y + 100), [this.rays, this.glow, this.emoji, ...this.sparkles]);
    this.add([this.shadow, this.figure]);
    this.setDepth(y);   // in front of characters behind it

    scene.add.existing(this);
    this.fall(() => {
      onLanded?.();
      this.timers = [
        scene.time.delayedCall(lifetime - BLINK_FOR, () => !this.gone && this.blink()),
        scene.time.delayedCall(lifetime, () => { if (!this.gone) { this.expire(); onExpire?.(); } }),
      ];
    });
  }

  // Drop in with a bounce, the shadow growing under the landing spot and ✨ streaming behind.
  fall(onLanded) {
    const { scene } = this;
    scene.tweens.add({ targets: this.shadow, scale: 1, alpha: SHADOW.alpha, duration: FALL_MS, ease: 'Quad.easeIn' });
    this.trail = scene.time.addEvent({ delay: TRAIL_EVERY, loop: true, callback: () => this.sparkleAt(this.x, this.y + this.figure.y, 400) });
    scene.tweens.add({
      targets: this.figure, y: -LIFT, duration: FALL_MS, ease: 'Bounce.easeOut',
      onUpdate: () => { if (this.figure.y > -LIFT - 30) this.trail.paused = true; },
      onComplete: () => this.land(onLanded),
    });
  }

  land(onLanded) {
    const { scene } = this;
    this.trail.remove();
    this.landed = true;
    scene.cameras.main.shake(120, 0.004);
    const ring = scene.add.ellipse(this.x, this.y + 22, 20, 8).setStrokeStyle(4, PINK).setDepth(this.depth - 1);
    scene.tweens.add({ targets: ring, scaleX: RING.radius / 10, scaleY: RING.radius / 10, alpha: 0, duration: RING.ms, onComplete: () => ring.destroy() });

    // The standout effect: a spinning sunburst, a pulsing glow, a heartbeat, a float, and sparkles in orbit.
    scene.tweens.add({ targets: this.rays, alpha: RAYS.alpha, scale: 1, duration: 300, ease: 'Back.easeOut' });
    scene.tweens.add({ targets: this.rays, angle: 360, duration: RAYS.spinMs, repeat: -1 });
    scene.tweens.add({ targets: this.glow, alpha: { from: GLOW.alpha.max, to: GLOW.alpha.min }, scale: { from: 1.1, to: 0.85 }, duration: GLOW.ms, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    scene.tweens.chain({
      targets: this.emoji, loop: -1,
      tweens: [
        { scale: 1.2, duration: BEAT_MS * 0.12, ease: 'Quad.easeOut' }, { scale: 1, duration: BEAT_MS * 0.12 },
        { scale: 1.12, duration: BEAT_MS * 0.12, ease: 'Quad.easeOut' }, { scale: 1, duration: BEAT_MS * 0.64 },
      ],
    });
    this.floatTween = scene.tweens.add({ targets: this.figure, y: -LIFT - FLOAT.height, duration: FLOAT.ms, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.orbit = 0;
    for (const s of this.sparkles) s.setVisible(true);

    this.bubble.setVisible(true);
    scene.tweens.add({ targets: this.bubble, scale: { from: 0.3, to: 1 }, duration: 250, ease: 'Back.easeOut' });
    onLanded?.();
  }

  // Scenes call this every frame: sparkles circle the heart (in front on the near side) and twinkle.
  update(time, delta) {
    if (!this.landed || this.gone) return;
    this.orbit += (delta / SPARKLES.spinMs) * Math.PI * 2;
    this.sparkles.forEach((s, i) => {
      const a = this.orbit + (i / this.sparkles.length) * Math.PI * 2;
      s.setPosition(Math.cos(a) * SPARKLES.radius.x, Math.sin(a) * SPARKLES.radius.y + 6);
      s.setScale(0.6 + 0.4 * Math.abs(Math.sin(time / 250 + i)));
      this.figure.moveTo(s, Math.sin(a) > 0 ? this.figure.length - 1 : 0);   // behind the rays when on the far side
    });
    this.bubble.setY(this.y + this.figure.y - BUBBLE_ABOVE);
  }

  // Blink for the last BLINK_FOR ms before it runs out, so players see it's about to go.
  blink() {
    this.scene.tweens.add({ targets: this.figure, alpha: 0.25, duration: 150, yoyo: true, repeat: Math.floor(BLINK_FOR / 300) - 1 });
  }

  // `character` grabbed it: it shrinks into them in a burst of hearts and sparkles.
  collect(character) {
    if (this.gone) return;
    this.gone = true;
    this.bubble.setVisible(false);
    this.shadow.setVisible(false);
    this.scene.tweens.killTweensOf(this.figure);
    this.figure.setAlpha(1);
    for (let i = 0; i < 10; i++) this.sparkleAt(this.x, this.y - LIFT, 600, i % 2 ? '💖' : '✨', 90);
    this.scene.tweens.add({
      targets: this, x: character.x, y: character.y - 10, scale: 0.3, duration: 220, ease: 'Quad.easeIn',
      onComplete: () => this.destroy(),
    });
  }

  // Ran out: shrink and fade where it is.
  expire() {
    if (this.gone) return;
    this.gone = true;
    this.bubble.setVisible(false);
    this.scene.tweens.killTweensOf(this.figure);
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
    this.trail?.remove();
    for (const timer of this.timers ?? []) timer.remove();
    this.scene?.tweens.killTweensOf([this.shadow, this.figure, this.emoji, this.rays, this.glow]);
    this.bubble?.destroy();
    super.destroy(fromScene);
  }
}
