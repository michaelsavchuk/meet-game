import * as Phaser from 'phaser';
import { WIDTH, ARENA, DISPLAY_FONT } from '../config.js';

const TITLE_SIZE = 96;      // px
const SUBTITLE_SIZE = 44;   // px
const COLOR = '#1f2f8a';    // dark blue, like the arena's AO tint
const ALPHA = 0.35;
const SQUASH = 0.8;         // vertical scale, so it lies flat on the tilted floor

// Faint text painted on the middle of the arena floor, under every character: a title with an optional smaller
// line below. "Chat to join!" in the lobby, "Only N remain" in battle.
export class FloorText extends Phaser.GameObjects.Container {
  constructor(scene) {
    super(scene, WIDTH / 2, (ARENA.top + ARENA.bottom) / 2);
    const style = (size) => ({ fontFamily: DISPLAY_FONT, fontSize: `${size}px`, color: COLOR });
    this.title = scene.add.text(0, 0, '', style(TITLE_SIZE)).setOrigin(0.5);
    this.subtitle = scene.add.text(0, 0, '', style(SUBTITLE_SIZE)).setOrigin(0.5);
    this.add([this.title, this.subtitle]);
    this.setAlpha(ALPHA).setScale(1, SQUASH).setDepth(-999);   // just above the arena image
    scene.add.existing(this);
  }

  // Empty or null hides that line; the pair stays centered.
  set(title, subtitle = null) {
    this.title.setText(title ?? '');
    this.subtitle.setText(subtitle ?? '').setVisible(!!subtitle);
    const gap = subtitle ? this.subtitle.height / 2 : 0;
    this.title.setY(-gap);
    this.subtitle.setY(this.title.height / 2);
    return this;
  }
}
