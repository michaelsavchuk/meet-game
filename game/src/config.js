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

// The floor of the backgrounds (assets/bg-*.png, rendered from art/arena.blend; they all share it), in screen px, where
// characters' feet stay.
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
// The entrances characters run in by (the dungeon's staircases; hallways and trails in the other backgrounds), in screen
// px at feet level. `foot` is the bottom step's two ends where it meets the floor; `off` is the same line of the stairs
// carried on off screen. Measured like ARENA
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

// Co-op survival (SurvivalScene): players have no words and fight waves of enemies together. Enemies run in from the
// stairs one by one during a wave and attack players on their own, timed like CPU players (bots.js LEVELS) at their level.
export const ENEMY_EMOJI = ['💀', '🐍', '👹', '👺', '👿', '😈', '🦇', '🕷️', '🦂', '🐀', '☠️', '🧟', '👾'];
export const ENEMY_TINT = { easy: 0xcfaaff, normal: 0xb88aff, hard: 0x9d62ff };   // purple, deeper the tougher
// The purple glow behind every enemy (Character.setAura): alpha, and scale of its full size. Their level shows as a
// name tag.
export const ENEMY_AURA = { alpha: 0.75, scale: 0.85 };
export const ENEMY_MAX_HP = 5;
export const ENEMY_REST = 1.5;          // × a CPU player's pause between attacks, so players get a breather
export const ENEMY_RUSH = 800;          // ms until the next enemy while too few are on the floor (ENEMIES_PER_PLAYER)
export const ENEMY_ENTER_SPEED = 420;   // px/s running in (players run in at ENTER_SPEED)
export const ENEMIES_PER_PLAYER = 0.5;  // keep at least this many enemies per player on the floor (rounded up) mid-wave
export const ROAM_AVOID_RADIUS = 220;   // roaming players and enemies steer away from each other within this
export const WAVE_BREAK = 2500;         // ms between clearing a wave and the next one starting
export const WAVE_HEAL = 1;             // HP every survivor gets back between waves

// The host's co-op difficulty setting (the control page's slider; index into this, NORMAL by default). It applies from
// the next wave: × enemies per wave, + toughness (see waveSpec), + enemy HP, and × how long enemies rest between attacks.
export const DIFFICULTIES = [
  { label: 'Very easy', count: 0.6, toughness: -0.75, hp: -1, rest: 1.7 },
  { label: 'Easy', count: 0.8, toughness: -0.35, hp: 0, rest: 1.3 },
  { label: 'Normal', count: 1, toughness: 0, hp: 0, rest: 1 },
  { label: 'Hard', count: 1.25, toughness: 0.5, hp: 0, rest: 0.8 },
  { label: 'Very hard', count: 1.5, toughness: 1, hp: 1, rest: 0.6 },
];
export const NORMAL = 2;

// Wave n (from 1) for `players` players at `setting` (DIFFICULTIES): how many enemies, their HP range, how tough they
// are (0 or less = all easy, 1 = all normal, 2+ = all hard, in between a mix), ms between enemies running in, and the
// multiplier on ENEMY_REST. Things ramp up at different waves so they don't all spike at once: toughness climbs
// steadily (all normal by wave 7, all hard by 13), and extra HP only starts later (some 2-HP enemies from wave 6,
// all of them from 11, and the max goes up 1 every 4 waves).
export function waveSpec(n, players, setting = DIFFICULTIES[NORMAL]) {
  // Early waves' few, weak enemies come quickly so nobody stands around; from wave 5 the gap shrinks again as it gets harder.
  const pace = n < 5 ? 0.3 + n * 0.1 : Math.max(0.5, 1 - n * 0.04);
  return {
    count: Math.max(1, Math.round((2 + Math.floor(n * 0.75) + Math.floor(players / 2)) * setting.count)),
    hp: [1 + Math.floor((n - 1) / 10), 1 + Math.floor(Math.max(0, n - 2) / 4)].map((hp) => Math.min(ENEMY_MAX_HP, Math.max(1, hp + setting.hp))),
    difficulty: (n - 1) / 6 + setting.toughness,
    spawnEvery: [3000 * pace, 6000 * pace],
    rest: setting.rest,
  };
}

export const CHAT_BUBBLE_MS = 4000; // how long lobby chat stays above a character

export { DEV_EVENTS } from './dev.js'; // on only under `npm run dev`
