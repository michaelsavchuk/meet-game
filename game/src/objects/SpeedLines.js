import * as Phaser from 'phaser';
import { WIDTH, HEIGHT } from '../config.js';

// Anime action lines in the screen corners (sudden death): thin yellow wedges whose wide ends sit past the screen
// edge and whose tips point at the center. They're redrawn at random every REDRAW_MS for a hand-drawn flicker.
const REDRAW_MS = 70;
const COLORS = [0xffe14d, 0xffe14d, 0xfff4a8];   // mostly yellow, some paler streaks
const ALPHA = 0.85;
const FADE_MS = 250;
const SPREAD = 0.3;                        // radians either side of each corner's diagonal
const WIDTH_ANGLE = { min: 0.006, max: 0.02 };   // radians of base width
// Per corner, and how far each line reaches in from the edge as a fraction of the edge's distance from the center,
// both at the weakest (level 0) and strongest (level 1) sudden death.
const COUNT = { weak: 7, strong: 14 };
const REACH = { weak: [0.08, 0.2], strong: [0.12, 0.3] };
const DEPTH = 9000;   // over the characters, under the word bubbles (10000) and banners

export class SpeedLines {
  constructor(scene) {
    this.scene = scene;
    this.level = 0;
    this.graphics = scene.add.graphics().setDepth(DEPTH).setAlpha(0);
    this.timer = scene.time.addEvent({ delay: REDRAW_MS, loop: true, paused: true, callback: () => this.draw() });
  }

  // 0 fades the lines out; anything above shows them, with more and longer lines up to 1.
  setLevel(level) {
    const wasOn = this.level > 0;
    this.level = level;
    if (level > 0 === wasOn) return;
    this.scene.tweens.killTweensOf(this.graphics);
    if (level > 0) {
      this.draw();
      this.timer.paused = false;
    }
    this.scene.tweens.add({
      targets: this.graphics, alpha: level > 0 ? 1 : 0, duration: FADE_MS,
      onComplete: () => { if (this.level === 0) this.timer.paused = true; },
    });
  }

  draw() {
    const g = this.graphics.clear();
    const t = Math.max(0, this.level);
    const lerp = (a, b) => a + (b - a) * t;
    const count = Math.round(lerp(COUNT.weak, COUNT.strong));
    const reach = [lerp(REACH.weak[0], REACH.strong[0]), lerp(REACH.weak[1], REACH.strong[1])];
    const cx = WIDTH / 2, cy = HEIGHT / 2;
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const diagonal = Math.atan2(sy * cy, sx * cx);
      for (let i = 0; i < count; i++) {
        const angle = diagonal + Phaser.Math.FloatBetween(-SPREAD, SPREAD);
        const cos = Math.cos(angle), sin = Math.sin(angle);
        const edge = Math.min(cx / Math.abs(cos), cy / Math.abs(sin));   // center to the screen edge along this angle
        const tip = edge * (1 - Phaser.Math.FloatBetween(reach[0], reach[1]));
        const base = edge + 80;   // past the edge, so the wide end is never seen
        const half = Phaser.Math.FloatBetween(WIDTH_ANGLE.min, WIDTH_ANGLE.max) / 2;
        g.fillStyle(Phaser.Utils.Array.GetRandom(COLORS), ALPHA).fillTriangle(
          cx + cos * tip, cy + sin * tip,
          cx + Math.cos(angle - half) * base, cy + Math.sin(angle - half) * base,
          cx + Math.cos(angle + half) * base, cy + Math.sin(angle + half) * base,
        );
      }
    }
  }
}
