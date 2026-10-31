import * as Phaser from '/vendor/phaser.js';
import { connectBridge, isConnected, mode } from './bridge.js';
import { connectRemote } from './remote.js';
import { startBots, addBot, removeBots, botLevels } from './bots.js';
import { WIDTH, HEIGHT, FONT_FAMILY, DISPLAY_FONT, TEST_STRING, DEV_EVENTS, DIFFICULTIES } from './config.js';
import { LobbyScene } from './scenes/LobbyScene.js';
import { BattleScene } from './scenes/BattleScene.js';
import { SurvivalScene, coopDifficulty, setCoopDifficulty } from './scenes/SurvivalScene.js';
import { HowToScene } from './scenes/HowToScene.js';
import { HudScene } from './scenes/HudScene.js';
import { BATTLE, backgroundChoice, setBackgroundChoice, currentBackground, cycleBackground } from './backgrounds.js';

// Every scene.add.text() defaults to FONT_FAMILY, so emoji render with Noto Color Emoji (see index.html), and
// to TEST_STRING, so they aren't clipped.
const addText = Phaser.GameObjects.GameObjectFactory.prototype.text;
Phaser.GameObjects.GameObjectFactory.prototype.text = function (x, y, text, style) {
  return addText.call(this, x, y, text, { fontFamily: FONT_FAMILY, testString: TEST_STRING, ...style });
};
// Canvas text doesn't redraw when a web font arrives, so load them before any scene draws (the text picks
// which fonts in FONT_FAMILY get loaded: the emoji one and the letters one, regular and bold) and DISPLAY_FONT.
await Promise.all([`16px ${FONT_FAMILY}`, `bold 16px ${FONT_FAMILY}`, `16px ${DISPLAY_FONT}`].map((font) => document.fonts.load(font, '😀Aa')));

const game = new Phaser.Game({
  type: Phaser.AUTO,
  backgroundColor: '#1d1f27',
  // Fixed 16:9 canvas scaled to fit the window, so it looks the same in the Meet screen share.
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: WIDTH, height: HEIGHT },
  // Lobby starts first; How to play opens over it; the HUD runs on top of every scene.
  scene: [LobbyScene, BattleScene, SurvivalScene, HowToScene, HudScene],
});

connectBridge(game);
connectRemote(game, () => ({
  mode, devEvents: DEV_EVENTS, connected: isConnected(), cpus: botLevels(),
  difficulty: coopDifficulty(), difficulties: DIFFICULTIES.map((d) => d.label),
  background: backgroundChoice(), backgrounds: BATTLE, currentBackground: currentBackground(),
}), {
  addCpu: (level) => addBot(level),
  setDifficulty: (value) => setCoopDifficulty(value),
  setBackground: (id) => setBackgroundChoice(id),
  removeCpus: () => removeBots(game),
  B: () => nextBackground(),
});
// Dev: B swaps the showing scene's backdrop (works in every scene, so it's here rather than in the scenes' commands).
function nextBackground() {
  const scene = game.scene.getScenes(true).find((s) => s.background);
  if (DEV_EVENTS && scene) cycleBackground(scene);
}
if (DEV_EVENTS) window.addEventListener('keydown', (e) => { if (e.code === 'KeyB' && !e.repeat) nextBackground(); });
startBots(game);
window.game = game;   // for poking at state from the dev console
