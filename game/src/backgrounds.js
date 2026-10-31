import * as Phaser from '/vendor/phaser.js';

// The arena backdrops (rendered from art/arena.blend, one scene each). They all share one camera and floor, so ARENA
// and STAIRS in config.js fit every one; they're purely visual. The lobby is always the arcade; battles and co-op use
// the host's choice from the control page, or a random one each round.
export const LOBBY = 'arcade';
export const BATTLE = [
  { id: 'dungeon', label: 'Dungeon' },
  { id: 'arena', label: 'Arena' },
  { id: 'forest', label: 'Forest' },
];
export const RANDOM = 'random';
const CHOICE_KEY = 'battle-background';   // localStorage, so the host's choice survives reloading the game page

let choice = RANDOM;
try { choice = localStorage.getItem(CHOICE_KEY) ?? RANDOM; } catch {}
if (!valid(choice)) choice = RANDOM;
let current = null;   // the one the last round used

function valid(id) {
  return id === RANDOM || BATTLE.some((b) => b.id === id);
}

export function backgroundChoice() {
  return choice;
}

export function setBackgroundChoice(id) {
  if (!valid(id)) return;
  choice = id;
  try { localStorage.setItem(CHOICE_KEY, id); } catch {}
}

// The battle background in use (or last used), for the control page.
export function currentBackground() {
  return current;
}

// Loads every background (each once per game), so switching is instant.
export function preloadBackgrounds(scene) {
  for (const id of [LOBBY, ...BATTLE.map((b) => b.id)]) {
    if (!scene.textures.exists(key(id))) scene.load.image(key(id), `/assets/bg-${id}.png`);
  }
}

// The lobby's backdrop.
export function addLobbyBackground(scene) {
  return add(scene, LOBBY);
}

// A battle's backdrop: the chosen one, or for "random" a different one from last round's.
export function addBattleBackground(scene) {
  if (choice !== RANDOM) current = choice;
  else current = Phaser.Utils.Array.GetRandom(BATTLE.filter((b) => b.id !== current)).id;
  return add(scene, current);
}

// Dev: swaps the scene's backdrop for the next one (lobby's included), to compare them quickly. Doesn't change the
// host's pick.
export function cycleBackground(scene) {
  const ids = [LOBBY, ...BATTLE.map((b) => b.id)];
  const id = ids[(ids.indexOf(scene.background.texture.key.slice(3)) + 1) % ids.length];
  scene.background.setTexture(key(id));
  if (scene.scene.key !== 'lobby') current = id;   // so the control page names what's showing
}

function add(scene, id) {
  scene.background = scene.add.image(0, 0, key(id)).setOrigin(0).setDepth(-1000);
  return scene.background;
}

function key(id) {
  return `bg-${id}`;
}
