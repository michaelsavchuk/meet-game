import * as Phaser from 'phaser';

// Clickable rounded button for the host. setEnabled(false) greys it out and ignores clicks.
export class Button extends Phaser.GameObjects.Container {
  constructor(scene, x, y, label, onClick, { width = 220, height = 56, color = 0x4f7cff } = {}) {
    super(scene, x, y);
    this.color = color;
    this.w = width;
    this.h = height;
    this.enabled = true;

    this.bg = scene.add.graphics();
    this.label = scene.add.text(0, 0, label, { fontSize: '24px', fontStyle: 'bold', color: '#ffffff' }).setOrigin(0.5);
    this.add([this.bg, this.label]);
    this.draw(color);

    this.setSize(width, height);
    this.setInteractive({ useHandCursor: true });
    this.on('pointerover', () => this.enabled && this.draw(Phaser.Display.Color.ValueToColor(color).lighten(12).color));
    this.on('pointerout', () => this.draw(this.enabled ? color : 0x555a66));
    this.on('pointerdown', () => this.enabled && onClick());

    scene.add.existing(this);
  }

  draw(fill) {
    this.bg.clear().fillStyle(fill, 1).fillRoundedRect(-this.w / 2, -this.h / 2, this.w, this.h, 14);
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    this.draw(enabled ? this.color : 0x555a66);
    this.label.setAlpha(enabled ? 1 : 0.6);
    return this;
  }
}
