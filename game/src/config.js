// Gameplay tuning in one place.
export const WIDTH = 1280;
export const HEIGHT = 720;
// Default for all game text (main.js). Noto Color Emoji only covers emoji code points, so other text stays Courier.
export const FONT_FAMILY = "'Noto Color Emoji', Courier";
// Phaser sizes a text's canvas from this string's ascent/descent. Its default ('|MÉqgy') is shorter than Noto
// emoji, which clipped their tops; 🏀 and 🤯 reach the font's highest and lowest points.
export const TEST_STRING = '|MÉqgy🏀🤯';

// Area characters roam in, by character position. Leaves room for bubbles under the title
// (~100px above a character) and the name/hearts and lobby buttons below (~75px under one).
export const ARENA = { x: 60, y: 200, width: WIDTH - 120, height: HEIGHT - 355 };
// Characters closer than this get nudged apart so names and bubbles stay readable. Wider than tall
// because word bubbles are.
export const PERSONAL_SPACE = { x: 140, y: 110 };

export const MAX_HP = 3;
export const DAMAGE = 1;

export const WANDER_SPEED = 70;     // px/s while bouncing around
export const CHASE_SPEED = 380;     // px/s while running at a target
export const FLEE_SPEED = 160;      // px/s while "typing" and steering away from others (chasers still catch up)
export const CHASED_FLEE_SPEED = 120; // px/s while being chased (and not typing)
export const FLEE_RADIUS = 320;     // others closer than this are steered away from while fleeing
export const ATTACK_RANGE = 55;     // how close an attacker gets before swinging
export const CHASE_TIMEOUT = 5000;  // ms; land the hit anyway if a chase drags on
export const WORD_DELAY = 2500;     // ms after a hit before the victim's new word appears (they "type" until then)
export const CLASH_KNOCKBACK = 550; // px/s both fighters bounce apart when a counter parries a hit

// Sudden death: after SUDDEN_DEATH_AFTER ms without a hit, chases get SUDDEN_DEATH_BOOST × CHASE_SPEED
// faster every SUDDEN_DEATH_STEP ms (up to SUDDEN_DEATH_MAX ×), so counters eventually can't keep up.
export const SUDDEN_DEATH_AFTER = 15000;
export const SUDDEN_DEATH_STEP = 4000;
export const SUDDEN_DEATH_BOOST = 0.5;
export const SUDDEN_DEATH_MAX = 5;

export const CHAT_BUBBLE_MS = 4000; // how long lobby chat stays above a character
