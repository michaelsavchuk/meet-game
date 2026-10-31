// Gameplay tuning in one place.
export const WIDTH = 1280;
export const HEIGHT = 720;
// Default for all game text (main.js). Noto Color Emoji only covers emoji code points, so other text falls through
// to Balsamiq Sans (Google Fonts, linked in index.html).
export const FONT_FAMILY = "'Noto Color Emoji', 'Balsamiq Sans', Helvetica, Arial, sans-serif";
// For big headline text: the flash banners and the winner title. Luckiest Guy has one (already heavy) weight.
export const DISPLAY_FONT = "'Noto Color Emoji', 'Luckiest Guy', Impact, sans-serif";
// Phaser sizes a text's canvas from this string's ascent/descent. Its default ('|MÉqgy') is shorter than Noto
// emoji, which clipped their tops; 🏀 and 🤯 reach the font's highest and lowest points.
export const TEST_STRING = '|MÉqgy🏀🤯';

// The floor of assets/arena.png (rendered from art/arena.blend), in screen px, where characters' feet stay.
// Perspective makes it a trapezoid: `back` and `front` are its left/right edges at y = top and y = bottom
// (bottom is where the front wall starts hiding the floor). Re-measure if the Blender camera moves.
export const ARENA = { top: 117, bottom: 636, back: { left: 187, right: 1094 }, front: { left: 117, right: 1163 } };

// The floor's left/right edges at screen y.
export function arenaEdges(y) {
  const t = (y - ARENA.top) / (ARENA.bottom - ARENA.top);
  return {
    left: ARENA.back.left + (ARENA.front.left - ARENA.back.left) * t,
    right: ARENA.back.right + (ARENA.front.right - ARENA.back.right) * t,
  };
}
// The staircases in assets/arena.png that characters run in by, in screen px at feet level. `foot` is the bottom step's
// two ends where it meets the floor; `off` is the same line of the stairs carried on off screen. Measured like ARENA
// (project the stairs' bottom edge and a point 2 m further out and up); re-measure if the stairs or camera move.
export const STAIRS = [
  { foot: [[612, 117], [668, 117]], off: [[618, -76], [662, -76]] },      // back
  { foot: [[608, 660], [672, 660]], off: [[613, 790], [667, 790]] },       // front
  { foot: [[145, 430], [161, 309]], off: [[-63, 363], [-41, 249]] },       // left
  { foot: [[1135, 430], [1119, 309]], off: [[1343, 363], [1321, 249]] },   // right
];
// Characters closer than this get nudged apart so names and bubbles stay readable. Wider than tall
// because word bubbles are.
export const PERSONAL_SPACE = { x: 140, y: 110 };

export const MAX_HP = 3;
export const DAMAGE = 1;

export const WANDER_SPEED = 70;     // px/s while bouncing around
export const ENTER_SPEED = 280;     // px/s while running in from the stairs (in the lobby; battle times it to the countdown)
export const CHASE_SPEED = 380;     // px/s while running at a target
export const FLEE_SPEED = 160;      // px/s while "typing" and steering away from others (chasers still catch up)
export const CHASED_FLEE_SPEED = 120; // px/s while being chased (and not typing)
export const FLEE_RADIUS = 320;     // others closer than this are steered away from while fleeing
export const ATTACK_RANGE = 55;     // how close an attacker gets before swinging
export const CHASE_TIMEOUT = 5000;  // ms; land the hit anyway if a chase drags on
export const WORD_DELAY = 2500;     // ms after a hit before the victim's new word appears (they "type" until then)
export const CLASH_KNOCKBACK = 550; // px/s both fighters bounce apart when a counter parries a hit
// A round starts with fighters running in from the stairs while the banner counts COUNTDOWN, …, 1, one number every
// COUNTDOWN_STEP ms, then "Type to Fight!"; words appear (and attacks count) only then.
export const COUNTDOWN = 3;
export const COUNTDOWN_STEP = 1000;

// Sudden death: after SUDDEN_DEATH_AFTER ms without a hit, chases get SUDDEN_DEATH_BOOST × CHASE_SPEED
// faster every SUDDEN_DEATH_STEP ms (up to SUDDEN_DEATH_MAX ×), so counters eventually can't keep up.
export const SUDDEN_DEATH_AFTER = 15000;
export const SUDDEN_DEATH_STEP = 4000;
export const SUDDEN_DEATH_BOOST = 0.5;
export const SUDDEN_DEATH_MAX = 5;

// Heart pickups: one at a time drops in every HEART_EVERY ms (random within) while someone is hurt, landing near
// a hurt player (more likely the more HP they're missing). Typing its word sends you to grab it for +HEART_HEAL HP;
// if nobody does within HEART_LIFETIME ms (counted from landing) it fades away. None drop during sudden death.
export const HEART_EVERY = { min: 10000, max: 18000 };
export const HEART_LIFETIME = 12000;
export const HEART_HEAL = 1;
export const HEART_NEAR = { min: 90, max: 220 };   // px from the hurt player it drops by
export const HEART_ANYWHERE = 0.25;                // chance it lands anywhere on the floor instead

export const CHAT_BUBBLE_MS = 4000; // how long lobby chat stays above a character

// Dev fake events: the game page's dev keys and the control page's "fake events" buttons (see the scenes' `commands`).
// CPU players don't depend on this.
export const DEV_EVENTS = false;
